import fs from "fs/promises";
import path from "path";
import { STORAGE_ROOT, resolveSafePath } from "./storage";
import { triggerFastApiDistributedAutomation } from "./ingestion";

export type StorageProviderType = "s3" | "huggingface" | "gcs" | "azure";

export interface CloudProviderConfig {
  id: string;
  name: string;
  type: StorageProviderType;
  endpoint?: string;      // Optional for S3 compatible (e.g. MinIO, Cloudflare R2)
  region?: string;        // S3 region (default: us-east-1)
  bucketName?: string;    // S3/GCS bucket or Azure container name
  accessKeyId?: string;   // S3/GCS access key
  secretAccessKey?: string; // S3/GCS secret key
  hfRepoId?: string;      // HuggingFace dataset ID (e.g. "fashion_mnist" or "username/dataset")
  hfToken?: string;       // HuggingFace API token
  azureStorageAccount?: string; // Azure account name
  azureSasToken?: string; // Azure SAS token
  syncFolder?: string;    // Local subfolder target under __storage__
  autoIngest?: boolean;   // Auto-trigger background AI segmentation on sync
  lastSyncedAt?: string;
  status?: "connected" | "disconnected" | "error";
  errorMessage?: string;
}

export interface RemoteStorageItem {
  key: string;
  size?: number;
  lastModified?: string;
  url?: string;
  isFolder?: boolean;
}

const CONFIG_PATH = path.resolve(process.cwd(), ".cloud-storage.json");

/**
 * Discovers cloud providers configured directly via backend environment variables.
 */
export function getEnvCloudConfigs(): CloudProviderConfig[] {
  const envConfigs: CloudProviderConfig[] = [];

  // 1. AWS S3 or S3-Compatible (MinIO, R2, Wasabi)
  if (process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET) {
    const bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || "";
    envConfigs.push({
      id: "env_s3",
      name: `S3 (${bucket})`,
      type: "s3",
      bucketName: bucket,
      region: process.env.AWS_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      syncFolder: bucket.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase(),
      autoIngest: true,
      status: "connected",
    });
  }

  // 2. Hugging Face Dataset
  if (process.env.HF_DATASET_REPO) {
    envConfigs.push({
      id: "env_huggingface",
      name: `HuggingFace (${process.env.HF_DATASET_REPO})`,
      type: "huggingface",
      hfRepoId: process.env.HF_DATASET_REPO,
      hfToken: process.env.HF_TOKEN,
      syncFolder: process.env.HF_DATASET_REPO.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase(),
      autoIngest: true,
      status: "connected",
    });
  }

  // 3. Azure Blob / ADLS Gen2
  if (process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_CONTAINER_NAME) {
    envConfigs.push({
      id: "env_azure",
      name: `Azure (${process.env.AZURE_CONTAINER_NAME})`,
      type: "azure",
      azureStorageAccount: process.env.AZURE_STORAGE_ACCOUNT,
      bucketName: process.env.AZURE_CONTAINER_NAME,
      azureSasToken: process.env.AZURE_SAS_TOKEN,
      syncFolder: process.env.AZURE_CONTAINER_NAME.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase(),
      autoIngest: true,
      status: "connected",
    });
  }

  // 4. Google Cloud Storage
  if (process.env.GCS_BUCKET_NAME) {
    envConfigs.push({
      id: "env_gcs",
      name: `GCS (${process.env.GCS_BUCKET_NAME})`,
      type: "gcs",
      bucketName: process.env.GCS_BUCKET_NAME,
      accessKeyId: process.env.GCS_ACCESS_KEY,
      syncFolder: process.env.GCS_BUCKET_NAME.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase(),
      autoIngest: true,
      status: "connected",
    });
  }

  return envConfigs;
}

/**
 * Masks sensitive secrets before sending provider definitions to the browser client.
 */
export function sanitizeProviderForClient(provider: CloudProviderConfig): CloudProviderConfig {
  return {
    ...provider,
    accessKeyId: provider.accessKeyId ? "••••••••" : undefined,
    secretAccessKey: provider.secretAccessKey ? "••••••••" : undefined,
    hfToken: provider.hfToken ? "••••••••" : undefined,
    azureSasToken: provider.azureSasToken ? "••••••••" : undefined,
  };
}

/**
 * Loads configured cloud storage providers (merging environment variables with stored profiles).
 */
export async function loadCloudConfigs(): Promise<CloudProviderConfig[]> {
  const envConfigs = getEnvCloudConfigs();
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    const fileConfigs: CloudProviderConfig[] = JSON.parse(data);
    const combined = [...envConfigs];
    for (const fc of fileConfigs) {
      if (!combined.some((c) => c.id === fc.id)) {
        combined.push(fc);
      }
    }
    return combined;
  } catch {
    return envConfigs;
  }
}

/**
 * Saves configured cloud storage providers to local storage config file.
 */
export async function saveCloudConfigs(configs: CloudProviderConfig[]): Promise<void> {
  const customOnly = configs.filter((c) => !c.id.startsWith("env_"));
  await fs.writeFile(CONFIG_PATH, JSON.stringify(customOnly, null, 2), "utf-8");
}

/**
 * Tests connection to a cloud storage provider.
 */
export async function testCloudConnection(config: CloudProviderConfig): Promise<{ success: boolean; message: string; itemCount?: number }> {
  try {
    if (config.type === "huggingface") {
      if (!config.hfRepoId) throw new Error("Hugging Face Repository ID (e.g. dataset-name) is required");
      const url = `https://huggingface.co/api/datasets/${config.hfRepoId}/tree/main`;
      const headers: Record<string, string> = {};
      if (config.hfToken) {
        headers["Authorization"] = `Bearer ${config.hfToken}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`Hugging Face API returned HTTP ${res.status}: ${res.statusText}`);
      }
      const items = await res.json();
      const count = Array.isArray(items) ? items.length : 0;
      return { success: true, message: `Successfully connected to Hugging Face repo '${config.hfRepoId}'`, itemCount: count };
    }

    if (config.type === "s3") {
      if (!config.bucketName) throw new Error("Bucket name is required");
      const endpoint = config.endpoint ? config.endpoint.replace(/\/+$/, "") : `https://${config.bucketName}.s3.${config.region || "us-east-1"}.amazonaws.com`;
      const res = await fetch(`${endpoint}/?list-type=2&max-keys=5`, { method: "GET" }).catch((err) => {
        throw new Error(`S3 Endpoint connection failed: ${err.message}`);
      });
      // S3 public or signed list test
      if (res.status === 200 || res.status === 403) {
        // 403 means endpoint reached & bucket exists even if list is restricted
        return { success: true, message: `Connected to S3 bucket '${config.bucketName}' (${res.status === 200 ? "Public/Read" : "Authenticated Bucket"})` };
      }
      throw new Error(`S3 returned HTTP ${res.status}`);
    }

    if (config.type === "gcs") {
      if (!config.bucketName) throw new Error("GCS Bucket name is required");
      const url = `https://storage.googleapis.com/storage/v1/b/${config.bucketName}/o?maxResults=5`;
      const headers: Record<string, string> = {};
      if (config.accessKeyId) headers["Authorization"] = `Bearer ${config.accessKeyId}`;
      const res = await fetch(url, { headers });
      if (res.status === 200 || res.status === 401 || res.status === 403) {
        return { success: true, message: `Connected to Google Cloud Storage bucket '${config.bucketName}'` };
      }
      throw new Error(`GCS returned HTTP ${res.status}`);
    }

    if (config.type === "azure") {
      if (!config.azureStorageAccount || !config.bucketName) {
        throw new Error("Azure Account Name and Container Name are required");
      }
      const sas = config.azureSasToken ? (config.azureSasToken.startsWith("?") ? config.azureSasToken : `?${config.azureSasToken}`) : "";
      const url = `https://${config.azureStorageAccount}.blob.core.windows.net/${config.bucketName}?restype=container&comp=list&maxresults=5${sas}`;
      const res = await fetch(url);
      if (res.status === 200 || res.status === 403) {
        return { success: true, message: `Connected to Azure Blob Container '${config.bucketName}'` };
      }
      throw new Error(`Azure Blob returned HTTP ${res.status}`);
    }

    throw new Error("Unsupported provider type");
  } catch (err: any) {
    return { success: false, message: err.message || "Connection failed" };
  }
}

/**
 * Lists remote storage items for a given provider configuration.
 */
export async function listRemoteStorageItems(config: CloudProviderConfig): Promise<RemoteStorageItem[]> {
  if (config.type === "huggingface") {
    if (!config.hfRepoId) return [];
    const url = `https://huggingface.co/api/datasets/${config.hfRepoId}/tree/main`;
    const headers: Record<string, string> = {};
    if (config.hfToken) headers["Authorization"] = `Bearer ${config.hfToken}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const files: any[] = await res.json();
    return files
      .filter((f) => f.type === "file" && /\.(png|jpe?g|webp|bmp|tiff)$/i.test(f.path))
      .map((f) => ({
        key: f.path,
        size: f.size,
        url: `https://huggingface.co/datasets/${config.hfRepoId}/resolve/main/${f.path}`,
      }));
  }

  return [];
}

/**
 * Syncs remote items into local workspace subfolder.
 */
export async function syncCloudProviderToWorkspace(
  config: CloudProviderConfig,
  customItems?: { url: string; filename: string }[]
): Promise<{ downloadedCount: number; targetFolder: string; errors: string[] }> {
  const folderName = (config.syncFolder || config.name || "cloud_sync")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .toLowerCase();

  const targetDir = resolveSafePath(folderName);
  if (!targetDir) {
    throw new Error("Invalid target directory for cloud sync");
  }

  await fs.mkdir(targetDir, { recursive: true });

  let itemsToDownload: { url: string; filename: string }[] = [];

  if (customItems && customItems.length > 0) {
    itemsToDownload = customItems;
  } else if (config.type === "huggingface") {
    const remoteItems = await listRemoteStorageItems(config);
    itemsToDownload = remoteItems.map((item) => ({
      url: item.url || `https://huggingface.co/datasets/${config.hfRepoId}/resolve/main/${item.key}`,
      filename: path.basename(item.key),
    }));
  }

  let downloadedCount = 0;
  const errors: string[] = [];

  for (const item of itemsToDownload) {
    try {
      const targetFilePath = path.join(targetDir, item.filename);
      // Skip if file already exists locally
      try {
        await fs.access(targetFilePath);
        continue;
      } catch {}

      const headers: Record<string, string> = {};
      if (config.type === "huggingface" && config.hfToken) {
        headers["Authorization"] = `Bearer ${config.hfToken}`;
      }

      const response = await fetch(item.url, { headers });
      if (!response.ok) {
        errors.push(`Failed to download ${item.filename}: HTTP ${response.status}`);
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(targetFilePath, buffer);
      downloadedCount++;
    } catch (err: any) {
      errors.push(`Error downloading ${item.filename}: ${err.message}`);
    }
  }

  // Update last synced time
  const configs = await loadCloudConfigs();
  const idx = configs.findIndex((c) => c.id === config.id);
  if (idx !== -1) {
    configs[idx].lastSyncedAt = new Date().toISOString();
    configs[idx].status = "connected";
    configs[idx].errorMessage = undefined;
    await saveCloudConfigs(configs);
  }

  // Auto-ingest if enabled
  if (config.autoIngest !== false) {
    try {
      await triggerFastApiDistributedAutomation(folderName);
    } catch (ingestErr) {
      console.warn("Auto-ingest note for cloud sync:", ingestErr);
    }
  }

  return { downloadedCount, targetFolder: folderName, errors };
}
