const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");

// Load .env if present
try {
    const dotenv = require("dotenv");
    dotenv.config();
} catch (e) {
    // fallback if dotenv not available
}

// Configuration
const DEFAULT_PORT = parseInt("6789", 10);
const HEALTH_CHECK_TIMEOUT_MS = 120000; // 2 minutes max for PyTorch model loading
const POLL_INTERVAL_MS = 2000;

// Get image path from command line arguments or default to 'sample.png'
const inputImagePath = process.argv[2] || path.join(__dirname, "__storage__", "test", "sample.png");

if (!fs.existsSync(inputImagePath)) {
    console.error(`Error: Input image file '${inputImagePath}' not found.`);
    process.exit(1);
}

// Compute output paths: e.g., 'sample.png' -> 'sample.obj.png' and 'sample.msk.png'
const parsedPath = path.parse(inputImagePath);

let serverProcess = null;
let activePort = DEFAULT_PORT;
let serverUrl = `http://127.0.0.1:${DEFAULT_PORT}`;

/**
 * Finds an available port on 127.0.0.1
 */
function findAvailablePort(defaultPort = 5678) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on("error", () => {
            const freeServer = net.createServer();
            freeServer.unref();
            freeServer.listen(0, "127.0.0.1", () => {
                const port = freeServer.address().port;
                freeServer.close(() => resolve(port));
            });
        });
        server.listen(defaultPort, "127.0.0.1", () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

/**
 * Checks if a FastAPI server is already responding on a given URL
 */
async function checkFastApiHealth(url) {
    try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Spawns the FastAPI server process on a given port
 */
function startFastApiServer(port) {
    activePort = port;
    serverUrl = `http://127.0.0.1:${port}`;
    console.log(`Starting FastAPI server process on port ${port}...`);

    const pythonBin = path.join(__dirname, ".venv", "Scripts", "python.exe");
    serverProcess = spawn(pythonBin, ["__main__.py", "--port", port.toString()], {
        cwd: __dirname,
        env: { ...process.env, FASTAPI_PORT: port.toString(), PORT: port.toString() },
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
    });

    const parsePort = (data) => {
        const text = data.toString();
        const match = text.match(/Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/i);
        if (match) {
            const boundPort = parseInt(match[1], 10);
            if (boundPort && boundPort !== activePort) {
                activePort = boundPort;
                serverUrl = `http://127.0.0.1:${boundPort}`;
                console.log(`⚡ FastAPI bound to port: ${activePort}`);
            }
        }
    };

    serverProcess.stdout.on("data", (data) => {
        console.log(`[FastAPI stdout]: ${data.toString().trim()}`);
        parsePort(data);
    });

    serverProcess.stderr.on("data", (data) => {
        console.error(`[FastAPI stderr]: ${data.toString().trim()}`);
        parsePort(data);
    });

    serverProcess.on("exit", (code) => {
        if (code !== null && code !== 0) {
            console.error(`⚠️ FastAPI server exited unexpectedly with code ${code}`);
        }
    });
}

/**
 * Polls the server until it responds to HTTP requests
 */
async function waitForServerReady() {
    console.log(`⏳ Waiting for FastAPI server to initialize models on port ${activePort}...`);
    const startTime = Date.now();

    while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT_MS) {
        if (serverProcess && serverProcess.exitCode !== null) {
            throw new Error(`FastAPI server process exited prematurely with code ${serverProcess.exitCode}`);
        }
        try {
            const res = await fetch(`${serverUrl}/health`);
            if (res.ok) {
                console.log(`✅ FastAPI server is online and ready on port ${activePort}!`);
                return true;
            }
        } catch (e) {
            // Server not accepting connections yet
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error("Timed out waiting for FastAPI server to start.");
}

/**
 * Clean shutdown handler
 */
function cleanupServer() {
    if (serverProcess && !serverProcess.killed) {
        console.log("🧹 Stopping FastAPI server process...");
        serverProcess.kill("SIGTERM");
    }
}

/**
 * Sends image file to the segmentation endpoint and saves extracted outputs
 */
async function processModelSegmentation() {
    console.log(`📸 Running segmentation on '${inputImagePath}'...`);

    const fileBuffer = fs.readFileSync(inputImagePath);
    const blob = new Blob([fileBuffer], { type: "image/png" });

    const formData = new FormData();
    formData.append("image", blob, path.basename(inputImagePath));

    const params = new URLSearchParams({
        width: "1024",
        height: "1024",
        object_raw__bg_transparent: "true",
        object_transparent__bg_white: "true",
        object_black__bg_white: "true",
    });

    const endpointUrl = `${serverUrl}/api/segment?${params.toString()}`;
    const response = await fetch(endpointUrl, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Decode Base64 string to Buffer
    function base64ToBuffer(b64Str) {
        const base64Data = b64Str.replace(/^data:image\/\w+;base64,/, "");
        return Buffer.from(base64Data, "base64");
    }

    const objPath = path.join(parsedPath.dir, `${parsedPath.name}.obj.png`);
    const mskPath = path.join(parsedPath.dir, `${parsedPath.name}.msk.png`);
    const bwPath = path.join(parsedPath.dir, `${parsedPath.name}.bw.png`);

    // 1. Save extracted object image (object_raw__bg_transparent or legacy only_object)
    const objectData = data.object_raw__bg_transparent || data.only_object;
    if (objectData) {
        fs.writeFileSync(objPath, base64ToBuffer(objectData));
        console.log(`🎉 Saved object cutout image to: '${objPath}'`);
    }

    // 2. Save cutout mask (object_transparent__bg_white or legacy mask_opaque)
    const maskData = data.object_transparent__bg_white || data.mask_opaque;
    if (maskData) {
        fs.writeFileSync(mskPath, base64ToBuffer(maskData));
        console.log(`🎉 Saved background mask canvas to: '${mskPath}'`);
    }

    console.log(`Total duration: ${data.duration}`);
    // 3. Save black/white mask if present
    if (data.object_black__bg_white) {
        fs.writeFileSync(bwPath, base64ToBuffer(data.object_black__bg_white));
        console.log(`🎉 Saved B&W object mask to: '${bwPath}'`);
    }
}

// Main execution flow
async function main() {
    try {
        const alreadyRunning = await checkFastApiHealth(serverUrl);
        if (alreadyRunning) {
            console.log(`✅ FastAPI server is already active on ${serverUrl}`);
        } else {
            const freePort = await findAvailablePort(DEFAULT_PORT);
            console.log(`🔍 Discovered available port: ${freePort}`);
            startFastApiServer(freePort);
            await waitForServerReady();
        }

        await processModelSegmentation();

    } catch (err) {
        console.error("❌ Execution failed:", err.message);
    } finally {
        cleanupServer();
        setTimeout(() => { process.exit(0); }, 500);
    }
}

// Capture process signals to ensure no zombie python processes remain
process.on("SIGINT", () => { cleanupServer(); process.exit(1); });
process.on("SIGTERM", () => { cleanupServer(); process.exit(1); });

main();