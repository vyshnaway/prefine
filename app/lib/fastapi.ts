import { spawn } from "child_process";
import path from "path";
import net from "net";
import { promises as fs, existsSync } from "fs";
import { FASTAPI_PATH, FASTAPI_PORT, FASTAPI_WORKER_URLS } from "../types";

export interface SegmentResponse {
  status: string;
  duration?: number;
  object_raw__bg_white?: string;
  object_raw__bg_black?: string;
  object_raw__bg_transparent?: string;
  object_white__bg_raw?: string;
  object_white__bg_black?: string;
  object_white__bg_transparent?: string;
  object_black__bg_raw?: string;
  object_black__bg_white?: string;
  object_black__bg_transparent?: string;
  object_transparent__bg_raw?: string;
  object_transparent__bg_white?: string;
  object_transparent__bg_black?: string;
}

export interface SegmentOptions {
  priority?: "high" | "low";
  width?: number;
  height?: number;
  object_raw__bg_white?: boolean;
  object_raw__bg_black?: boolean;
  object_raw__bg_transparent?: boolean;
  object_white__bg_raw?: boolean;
  object_white__bg_black?: boolean;
  object_white__bg_transparent?: boolean;
  object_black__bg_raw?: boolean;
  object_black__bg_white?: boolean;
  object_black__bg_transparent?: boolean;
  object_transparent__bg_raw?: boolean;
  object_transparent__bg_white?: boolean;
  object_transparent__bg_black?: boolean;
}

// Configuration
const DEFAULT_PORT = parseInt(FASTAPI_PORT, 10);
const HEALTH_CHECK_TIMEOUT_MS = 120000; // 2 minutes max for PyTorch model loading
const POLL_INTERVAL_MS = 2000;

export class LocalFastApiServer {
  private serverProcess: any = null;
  private activePort = DEFAULT_PORT;
  private serverUrl = `http://127.0.0.1:${DEFAULT_PORT}`;

  public getPort(): number {
    return this.activePort;
  }

  public getUrl(): string {
    return this.serverUrl;
  }

  public isRunning(): boolean {
    return Boolean(this.serverProcess && !this.serverProcess.killed && this.serverProcess.exitCode === null);
  }

  public getProcess(): any {
    return this.serverProcess;
  }

  public getState() {
    return {
      port: this.activePort,
      url: this.serverUrl,
      isRunning: this.isRunning(),
    };
  }

  public kill() {
    if (this.serverProcess && !this.serverProcess.killed) {
      console.log("🧹 Stopping FastAPI server process...");
      this.serverProcess.kill("SIGTERM");
    }
  }

  private async findAvailablePort(startPort = 8000): Promise<number> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();

      server.once("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          resolve(this.findAvailablePort(startPort + 1));
        } else {
          resolve(startPort);
        }
      });

      server.once("listening", () => {
        server.close(() => {
          resolve(startPort);
        });
      });

      server.listen(startPort, "127.0.0.1");
    });
  }

  public async start() {
    console.log("No healthy workers available. Starting local FastAPI instance...");
    this.activePort = await this.findAvailablePort(DEFAULT_PORT);
    console.log(`🔍 Discovered available port: ${this.activePort}`);
    this.serverUrl = `http://127.0.0.1:${this.activePort}`;
    console.log(`Starting FastAPI server process on port ${this.activePort}...`);

    const isWin = process.platform === "win32";
    const venvPythonWin = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
    const venvPythonNix = path.join(process.cwd(), ".venv", "bin", "python");
    let pythonBin = isWin ? "python" : "python3";
    if (isWin && existsSync(venvPythonWin)) {
      pythonBin = venvPythonWin;
    } else if (!isWin && existsSync(venvPythonNix)) {
      pythonBin = venvPythonNix;
    }

    const mainScript = path.join(process.cwd(), FASTAPI_PATH);

    this.serverProcess = spawn(pythonBin, [mainScript, "--port", this.activePort.toString()], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: this.activePort.toString() },
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    const parsePort = (data: Buffer | string) => {
      const text = data.toString();
      const match = text.match(/Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/i);
      if (match) {
        const boundPort = parseInt(match[1], 10);
        if (boundPort && boundPort !== this.activePort) {
          this.activePort = boundPort;
          this.serverUrl = `http://127.0.0.1:${boundPort}`;
          console.log(`⚡ FastAPI bound to port: ${this.activePort}`);
        }
      }
    };

    if (this.serverProcess.stdout) {
      this.serverProcess.stdout.on("data", (data: Buffer) => {
        console.log(`[FastAPI stdout]: ${data.toString().trim()}`);
        parsePort(data);
      });
    }

    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.on("data", (data: Buffer) => {
        console.error(`[FastAPI stderr]: ${data.toString().trim()}`);
        parsePort(data);
      });
    }

    this.serverProcess.on("exit", (code: number | null) => {
      if (code !== null && code !== 0) {
        console.error(`⚠️ FastAPI server exited unexpectedly with code ${code}`);
      }
    });
  }

  public async waitForReady() {
    console.log(`⏳ Waiting for local FastAPI server to initialize models on port ${this.activePort}...`);
    const startTime = Date.now();

    while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT_MS) {
      if (this.serverProcess && this.serverProcess.exitCode !== null) {
        throw new Error(`FastAPI server process exited prematurely with code ${this.serverProcess.exitCode}`);
      }
      try {
        const res = await fetch(`${this.serverUrl}/health`);
        if (res.ok) {
          console.log(`✅ Local FastAPI server is online and ready on port ${this.activePort}!`);
          return true;
        }
      } catch (e) {
        // Server not accepting connections yet
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error("Timed out waiting for FastAPI server to start.");
  }
}

export const localServer = new LocalFastApiServer();

// Clean shutdown hooks to avoid zombie Python processes
if (typeof process !== "undefined") {
  const exitHandler = () => {
    localServer.kill();
  };
  process.on("exit", exitHandler);
  process.on("SIGINT", exitHandler);
  process.on("SIGTERM", exitHandler);
}

/**
 * Checks if a specific worker/base URL is online and responding.
 */
export async function checkFastApiHealth(baseUrl?: string): Promise<boolean> {
  const urlToCheck = baseUrl || localServer.getUrl();
  try {
    const res = await fetch(`${urlToCheck.replace(/\/+$/, "")}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getLocalServerState() {
  return localServer.getState();
}

export async function getActiveWorkerUrl(): Promise<string | null> {
  const candidateUrls: string[] = [...FASTAPI_WORKER_URLS];

  try {
    const { getPocketBaseWorkers } = await import("./pocketbase");
    const list = await getPocketBaseWorkers();
    if (Array.isArray(list)) {
      for (const w of list) {
        if (w.id !== "local_default" && w.enabled && w.url && !candidateUrls.includes(w.url)) {
          candidateUrls.push(w.url);
        }
      }
    }
  } catch { }

  if (candidateUrls.length === 0) {
    return null;
  }

  for (const url of candidateUrls) {
    const isHealthy = await checkFastApiHealth(url);
    if (isHealthy) {
      return url;
    }
  }

  return null;
}

const WAIT_FOR_EXISTING_SERVER_MS = 30000;

export async function waitForExistingServer(url: string, timeoutMs = WAIT_FOR_EXISTING_SERVER_MS): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        return true;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

/**
 * Returns an active endpoint URL:
 * 1. Checks and returns an active worker from FASTAPI_WORKER_URLS.
 * 2. If no workers are healthy or configured, falls back to the local FASTAPI_PORT instance (launching it if needed).
 */
async function resolveActiveFastApiUrl(): Promise<string> {
  // Step 1: Try FASTAPI_WORKER_URLS first
  const activeWorker = await getActiveWorkerUrl();
  if (activeWorker) {
    return activeWorker;
  }

  // Step 2: Fallback to local serverUrl on FASTAPI_PORT
  let isLocalHealthy = await checkFastApiHealth(localServer.getUrl());
  if (!isLocalHealthy) {
    console.log(`No remote workers responding. Checking local FastAPI on port ${localServer.getPort()}...`);
    isLocalHealthy = await waitForExistingServer(localServer.getUrl(), 2000);
  }

  if (!isLocalHealthy) {
    if (!localServer.isRunning()) {
      await localServer.start();
    } else {
      console.log("FastAPI server process exists but not healthy yet. Waiting...");
    }
    await localServer.waitForReady();
  }

  return localServer.getUrl();
}

export type RequestPriority = "high" | "low";

interface QueuedSegmentTask {
  priority: RequestPriority;
  imageBuffer: Buffer;
  options: SegmentOptions;
  resolve: (value: SegmentResponse | PromiseLike<SegmentResponse>) => void;
  reject: (reason?: any) => void;
}

const highPriorityQueue: QueuedSegmentTask[] = [];
const lowPriorityQueue: QueuedSegmentTask[] = [];
let activeSegmentRequests = 0;
const MAX_CONCURRENT_SEGMENT_REQUESTS = 1;

function processNextSegmentInQueue() {
  if (activeSegmentRequests >= MAX_CONCURRENT_SEGMENT_REQUESTS) {
    return;
  }

  let nextTask: QueuedSegmentTask | undefined;

  // Always yield to High Priority (Object API) queue first
  if (highPriorityQueue.length > 0) {
    nextTask = highPriorityQueue.shift();
  } else if (lowPriorityQueue.length > 0) {
    // Continue with Low Priority (Ingestion operation) queue only when High Priority queue is empty
    nextTask = lowPriorityQueue.shift();
  }

  if (!nextTask) {
    return;
  }

  activeSegmentRequests++;

  _executeFastApiSegment(nextTask.imageBuffer, nextTask.options)
    .then((res) => nextTask!.resolve(res))
    .catch((err) => nextTask!.reject(err))
    .finally(() => {
      activeSegmentRequests--;
      processNextSegmentInQueue();
    });
}

async function _executeFastApiSegment(
  imageBuffer: Buffer,
  options: SegmentOptions = {},
): Promise<SegmentResponse> {
  const targetBaseUrl = await resolveActiveFastApiUrl();

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/png" });
  formData.append("image", blob);

  const url = new URL(`${targetBaseUrl}/api/segment`);

  if (options.width !== undefined) url.searchParams.set("width", String(options.width));
  if (options.height !== undefined) url.searchParams.set("height", String(options.height));

  const modes = [
    "object_raw__bg_white",
    "object_raw__bg_black",
    "object_raw__bg_transparent",
    "object_white__bg_raw",
    "object_white__bg_black",
    "object_white__bg_transparent",
    "object_black__bg_raw",
    "object_black__bg_white",
    "object_black__bg_transparent",
    "object_transparent__bg_raw",
    "object_transparent__bg_white",
    "object_transparent__bg_black",
  ] as const;

  modes.forEach((mode) => {
    if (options[mode] !== undefined) {
      url.searchParams.set(mode, String(options[mode]));
    }
  });

  const res = await fetch(url.toString(), {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `FastAPI returned ${res.status}`);
  }

  const data = (await res.json()) as SegmentResponse;
  return data;
}

export async function processImageWithFastApi(
  imageBuffer: Buffer,
  options: SegmentOptions = {},
): Promise<SegmentResponse> {
  const priority: RequestPriority = options.priority || "high";

  return new Promise<SegmentResponse>((resolve, reject) => {
    const task: QueuedSegmentTask = {
      priority,
      imageBuffer,
      options,
      resolve,
      reject,
    };

    if (priority === "high") {
      highPriorityQueue.push(task);
    } else {
      lowPriorityQueue.push(task);
    }

    processNextSegmentInQueue();
  });
}
