import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { platform } from "node:process";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const logsRoot = join(projectRoot, "logs");
const services = [];

function executable(name) {
    return platform === "win32" ? `${name}.exe` : name;
}

function npmCommand() {
    return platform === "win32" ? "npm.cmd" : "npm";
}

function pythonCommand() {
    return platform === "win32"
        ? join(projectRoot, ".venv", "Scripts", "python.exe")
        : join(projectRoot, ".venv", "bin", "python");
}

function startService(name, command, args, environment = {}) {
    const logPath = join(logsRoot, `${name}.log`);
    const log = createWriteStream(logPath, { flags: "a" });
    const child = spawn(command, args, {
        cwd: projectRoot,
        env: { ...process.env, ...environment },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
    });

    const write = (stream, data) => {
        const text = data.toString();
        log.write(text);
        stream.write(`[${name}] ${text}`);
    };

    child.stdout.on("data", (data) => write(process.stdout, data));
    child.stderr.on("data", (data) => write(process.stderr, data));
    child.on("error", (error) => {
        console.error(`[${name}] failed to start: ${error.message}`);
    });
    child.on("exit", (code, signal) => {
        log.end();
        if (code !== 0 && signal !== "SIGTERM") {
            console.error(`[${name}] stopped unexpectedly with ${signal || `code ${code}`}. See ${logPath}`);
            process.exitCode = 1;
        }
    });

    services.push({ name, child, logPath });
    return child;
}

function stopAll() {
    for (const { child } of services) {
        if (!child.killed) child.kill("SIGTERM");
    }
}

async function main() {
    await mkdir(logsRoot, { recursive: true });
    startService("pocketbase", join(projectRoot, executable("pocketbase")), ["serve", "--http=127.0.0.1:8099"]);
    startService("fastapi", pythonCommand(), [join(projectRoot, "__main__.py"), "--host", "127.0.0.1", "--port", "8000"]);
    startService("next", npmCommand(), ["run", "dev:next"]);

    console.log("Services started. Logs are written to ./logs.");
    console.log("Press Ctrl+C to stop all services.");
}

process.on("SIGINT", () => {
    stopAll();
    setTimeout(() => process.exit(0), 250);
});
process.on("SIGTERM", () => {
    stopAll();
    setTimeout(() => process.exit(0), 250);
});

main().catch((error) => {
    console.error(`App failed to start: ${error.message}`);
    stopAll();
    process.exitCode = 1;
});