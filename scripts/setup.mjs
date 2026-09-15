import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, platform } from "node:process";
import { spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(root);
const pocketBaseVersion = process.env.POCKETBASE_VERSION || "0.22.18";

function commandFor(name) {
    if (platform === "win32") {
        if (name === "python") return "py";
        return `${name}.cmd`;
    }
    return name;
}

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: projectRoot,
            stdio: "inherit",
            shell: platform === "win32" && command.endsWith(".cmd"),
            ...options,
        });

        child.on("error", reject);
        child.on("exit", (code, signal) => {
            if (code === 0) return resolve();
            reject(new Error(`${command} exited with ${signal || `code ${code}`}`));
        });
    });
}

async function commandExists(command, args = ["--version"]) {
    try {
        await run(command, args, { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

function assertNodeVersion() {
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 20) {
        throw new Error(`Node.js 20 or newer is required. Found ${process.versions.node}.`);
    }
}

async function resolvePython() {
    const candidates = platform === "win32" ? ["py", "python"] : ["python3", "python"];
    for (const candidate of candidates) {
        if (await commandExists(candidate, candidate === "py" ? ["-3", "--version"] : ["--version"])) {
            return candidate;
        }
    }
    throw new Error("Python 3.10 or newer was not found. Install Python and run setup again.");
}

async function ensurePocketBase() {
    const extension = platform === "win32" ? ".exe" : "";
    const executable = join(projectRoot, `pocketbase${extension}`);
    if (existsSync(executable)) {
        console.log("PocketBase executable already exists.");
        return;
    }

    const osName = platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : "linux";
    const cpu = arch === "arm64" ? "arm64" : "amd64";
    const archiveName = `pocketbase_${pocketBaseVersion}_${osName}_${cpu}.zip`;
    const url = `https://github.com/pocketbase/pocketbase/releases/download/v${pocketBaseVersion}/${archiveName}`;
    const archivePath = join(projectRoot, archiveName);

    console.log(`Downloading PocketBase ${pocketBaseVersion} for ${osName}/${cpu}...`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`PocketBase download failed: ${response.status} ${response.statusText}`);
    }
    await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

    try {
        if (platform === "win32") {
            await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${projectRoot}' -Force`]);
        } else if (await commandExists("unzip", ["-v"])) {
            await run("unzip", ["-o", archivePath, "-d", projectRoot]);
        } else {
            throw new Error("The unzip command is required on macOS and Linux.");
        }
    } finally {
        await import("node:fs/promises").then(({ unlink }) => unlink(archivePath).catch(() => undefined));
    }

    if (!existsSync(executable)) {
        throw new Error(`PocketBase archive did not contain ${basename(executable)}.`);
    }
    if (platform !== "win32") {
        await run("chmod", ["+x", executable]);
    }
}

async function main() {
    assertNodeVersion();
    if (!(await commandExists(commandFor("npm")))) {
        throw new Error("npm was not found. Install Node.js 20 or newer and run setup again.");
    }

    const python = await resolvePython();
    const pythonArgs = python === "py" ? ["-3"] : [];
    const venvPython = platform === "win32"
        ? join(projectRoot, ".venv", "Scripts", "python.exe")
        : join(projectRoot, ".venv", "bin", "python");

    console.log("Installing Node.js dependencies...");
    await run(commandFor("npm"), ["ci"]);

    if (!existsSync(venvPython)) {
        console.log("Creating Python virtual environment...");
        await run(python, [...pythonArgs, "-m", "venv", ".venv"]);
    }

    console.log("Installing Python dependencies...");
    await run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
    await run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"]);
    await ensurePocketBase();

    await mkdir(join(projectRoot, "logs"), { recursive: true });
    console.log("Setup complete. Start the app with: npm run app");
}

main().catch((error) => {
    console.error(`Setup failed: ${error.message}`);
    process.exitCode = 1;
});