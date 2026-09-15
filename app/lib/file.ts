import sharp from "sharp";
import path from "path";
import { promises as fs } from "fs";
import { resolveSafePath } from "./storage";
import { PathData } from "../types";



export function getMimeType(extension: string): string {
    switch (extension.toLowerCase()) {
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".png":
            return "image/png";
        case ".gif":
            return "image/gif";
        case ".bmp":
            return "image/bmp";
        case ".webp":
            return "image/webp";
        case ".svg":
            return "image/svg+xml";
        default:
            return "application/octet-stream";
    }
}

export async function convertAndSaveSiblingFormats(buffer: Buffer, basePath: string, maxDimention = 0): Promise<void> {

    let image = sharp(buffer);
    const meta = await image.metadata();

    const w = meta.width || 0;
    const h = meta.height || 0;

    // Resize rule:
    //  - If BOTH dimensions exceed 1440px → scale so the SHORTEST side = 1440px
    //    (preserves aspect ratio; the longer side will remain > 1440px)
    //  - If only ONE dimension exceeds 1440px → fit within a 1440×1440 box
    if (maxDimention > 0) {
        if (w > maxDimention && h > maxDimention) {
            if (w <= h) {
                image = image.resize({ width: maxDimention });
            } else {
                image = image.resize({ height: maxDimention });
            }
        } else if (w > maxDimention || h > maxDimention) {
            image = image.resize({
                width: maxDimention,
                height: maxDimention,
                fit: "inside"
            });
        }
    }

    const pngPath = `${basePath}.png`;
    const webpPath = `${basePath}.webp`;
    const jpegPath = `${basePath}.jpg`;

    const processedBuffer = await image.toBuffer();

    await Promise.all([
        sharp(processedBuffer).png().toFile(pngPath),
        sharp(processedBuffer).webp({ quality: 60 }).toFile(webpPath),
        sharp(processedBuffer).jpeg({ quality: 80 }).toFile(jpegPath),
    ]);
}

/**
 * Extracts width and height directly from image binary headers without external native binaries.
 */
export function getImageDimensions(buffer: Buffer, extension?: string): { width: number; height: number } {
    try {
        let ext = extension ? extension.toLowerCase() : "";
        if (ext && !ext.startsWith(".")) {
            ext = `.${ext}`;
        }

        // Auto-detect format from magic bytes if extension not provided
        if (!ext && buffer.length >= 4) {
            if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) ext = ".png";
            else if (buffer[0] === 0xff && buffer[1] === 0xd8) ext = ".jpg";
            else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) ext = ".gif";
            else if (buffer[0] === 0x42 && buffer[1] === 0x4d) ext = ".bmp";
            else if (buffer.length >= 12 && buffer.toString("utf8", 0, 4) === "RIFF" && buffer.toString("utf8", 8, 12) === "WEBP") ext = ".webp";
            else if (buffer.toString("utf8", 0, 100).includes("<svg")) ext = ".svg";
        }

        // PNG
        if (ext === ".png" && buffer.length >= 24) {
            return {
                width: buffer.readUInt32BE(16),
                height: buffer.readUInt32BE(20),
            };
        }

        // GIF
        if (ext === ".gif" && buffer.length >= 10) {
            return {
                width: buffer.readUInt16LE(6),
                height: buffer.readUInt16LE(8),
            };
        }

        // BMP
        if (ext === ".bmp" && buffer.length >= 26) {
            return {
                width: buffer.readInt32LE(18),
                height: Math.abs(buffer.readInt32LE(22)),
            };
        }

        // JPEG
        if ((ext === ".jpg" || ext === ".jpeg") && buffer.length >= 2) {
            let offset = 2;
            while (offset < buffer.length - 8) {
                if (buffer[offset] !== 0xff) {
                    offset++;
                    continue;
                }
                const marker = buffer[offset + 1];
                // Standalone markers without length
                if (marker === 0xd8 || marker === 0xd9 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
                    offset += 2;
                    continue;
                }
                if (
                    (marker >= 0xc0 && marker <= 0xc3) ||
                    (marker >= 0xc5 && marker <= 0xc7) ||
                    (marker >= 0xc9 && marker <= 0xcb) ||
                    (marker >= 0xcd && marker <= 0xcf)
                ) {
                    return {
                        height: buffer.readUInt16BE(offset + 5),
                        width: buffer.readUInt16BE(offset + 7),
                    };
                }
                if (offset + 4 > buffer.length) break;
                const length = buffer.readUInt16BE(offset + 2);
                offset += 2 + length;
            }
        }

        // WebP
        if (ext === ".webp" && buffer.length >= 30) {
            const tag = buffer.toString("utf8", 12, 16);
            if (tag === "VP8 " && buffer.length >= 30) {
                return {
                    width: buffer.readUInt16LE(26) & 0x3fff,
                    height: buffer.readUInt16LE(28) & 0x3fff,
                };
            }
            if (tag === "VP8L" && buffer.length >= 25) {
                const b0 = buffer[21], b1 = buffer[22], b2 = buffer[23], b3 = buffer[24];
                return {
                    width: 1 + (((b0 | (b1 << 8)) & 0x3fff)),
                    height: 1 + ((((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) & 0x3fff)),
                };
            }
            if (tag === "VP8X" && buffer.length >= 30) {
                return {
                    width: 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)),
                    height: 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)),
                };
            }
        }

        // SVG
        if (ext === ".svg") {
            const content = buffer.toString("utf-8");
            const widthMatch = content.match(/width=["']([0-9.]+)(px)?["']/i);
            const heightMatch = content.match(/height=["']([0-9.]+)(px)?["']/i);
            if (widthMatch && heightMatch) {
                return {
                    width: Math.round(parseFloat(widthMatch[1])),
                    height: Math.round(parseFloat(heightMatch[1])),
                };
            }
            const viewBoxMatch = content.match(/viewBox=["']\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s*["']/i);
            if (viewBoxMatch) {
                return {
                    width: Math.round(parseFloat(viewBoxMatch[3])),
                    height: Math.round(parseFloat(viewBoxMatch[4])),
                };
            }
        }
    } catch {
        // Return standard fallback if header parsing fails
    }

    return { width: 0, height: 0 };
}

/**
 * Robust async helper to resolve image dimensions: first tries fast header decoding,
 * and falls back to Sharp decoding for maximum accuracy on non-standard formats.
 */
export async function resolveImageDimensions(buffer: Buffer, extension?: string): Promise<{ width: number; height: number }> {
    const headerDims = getImageDimensions(buffer, extension);
    if (headerDims.width > 0 && headerDims.height > 0) {
        return headerDims;
    }

    try {
        const meta = await sharp(buffer).metadata();
        if (meta.width && meta.height) {
            return { width: meta.width, height: meta.height };
        }
    } catch { }

    return { width: 0, height: 0 };
}

/**
 * Loads the collective .json data file from targetDir.
 * Automatically performs directory migration if the old .json directory exists.
 */
export async function loadFolderSidecar(targetDir: string): Promise<any> {
    const jsonFilePath = path.join(targetDir, ".json");

    // 1. Delete legacy directories (.json or .thumbnails folder) if present
    try {
        const stat = await fs.stat(jsonFilePath);
        if (stat.isDirectory()) {
            await fs.rm(jsonFilePath, { recursive: true, force: true });
        }
    } catch { }

    // 2. Read the .json file
    try {
        const content = await fs.readFile(jsonFilePath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object") {
            if (parsed.metafiles && typeof parsed.metafiles === "object") {
                for (const key of Object.keys(parsed.metafiles)) {
                    if (key.startsWith(".")) delete parsed.metafiles[key];
                }
            }
            if (parsed.metafolders && typeof parsed.metafolders === "object") {
                for (const key of Object.keys(parsed.metafolders)) {
                    if (key.startsWith(".")) delete parsed.metafolders[key];
                }
            }
        }
        return parsed;
    } catch {
        return {};
    }
}

/**
 * Deprecated: Global index data is now managed directly in PocketBase database collections.
 */
export async function loadGlobalMetaSidecar(storageRoot: string): Promise<any> {
    return null;
}

/**
 * Saves the collective .json sidecar file to targetDir.
 */
export async function saveFolderSidecar(targetDir: string, data: any): Promise<void> {
    const jsonFilePath = path.join(targetDir, ".json");
    try {
        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(jsonFilePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
        console.warn("Failed to write folder sidecar to disk:", err);
    }
}

export function toPosixPath(value: string): string { return value.split(path.sep).join("/"); }

export async function getSubfolders(relativePath: string): Promise<Array<PathData>> {
    const targetDir = resolveSafePath(relativePath);
    if (!targetDir) return [];

    try {
        const entries = await fs.readdir(targetDir, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        const currentPosixPath = toPosixPath(relativePath).replace(/^\/+|\/+$/g, "");

        const folders: Array<PathData> = [];
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (entry.name.startsWith(".")) continue; // Ignore hidden folders
                folders.push({
                    basename: entry.name,
                    parent: currentPosixPath ? `${currentPosixPath}/${entry.name}` : entry.name,
                });
            }
        }
        return folders;
    } catch {
        return [];
    }
}


export async function getFileSizes(targetDir: string, nameWithoutExt: string): Promise<{
    raw?: number;
    png?: number;
    webp?: number;
    jpeg?: number;
}> {
    const sizes: { raw?: number; png?: number; webp?: number; jpeg?: number } = {
        raw: 0,
        png: 0,
        webp: 0,
        jpeg: 0
    };

    const siblingBase = path.join(targetDir, nameWithoutExt);

    try {
        const pngStat = await fs.stat(siblingBase + ".png");
        sizes.png = pngStat.size;
    } catch { }

    try {
        const webpStat = await fs.stat(siblingBase + ".webp");
        sizes.webp = webpStat.size;
    } catch { }

    try {
        const jpgStat = await fs.stat(siblingBase + ".jpg").catch(() => fs.stat(siblingBase + ".jpeg"));
        sizes.jpeg = jpgStat.size;
    } catch { }

    return sizes;
}
