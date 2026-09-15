import zlib from "zlib";
import sharp from "sharp";
import path from "path";
import { promises as fs } from "fs";
import { getMimeType } from "./file";

function pngChunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type, "ascii");
    const chunkData = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(chunkData), 0);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
}

// Simple CRC-32 table for PNG
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
}

function crc32(buf: Buffer): number {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function hexToRgba(color: string): { r: number; g: number; b: number; a: number } {
    const hex = color.replace("#", "");
    if (hex.length === 6) {
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 255,
        };
    }
    if (hex.length === 8) {
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: parseInt(hex.slice(6, 8), 16),
        };
    }
    // Default to transparent black for invalid input
    return { r: 0, g: 0, b: 0, a: 0 };
}

export function createBlankPngBuffer(width: number = 1, height: number = 1, color: string = "#00000000"): Buffer {
    const w = Math.max(1, width || 1);
    const h = Math.max(1, height || 1);
    const { r, g, b, a } = hexToRgba(color);

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(w, 0);
    ihdrData.writeUInt32BE(h, 4);
    ihdrData[8] = 8;   // bit depth
    ihdrData[9] = 6;   // color type: RGBA
    ihdrData[10] = 0;  // compression
    ihdrData[11] = 0;  // filter
    ihdrData[12] = 0;  // interlace
    const ihdr = pngChunk("IHDR", ihdrData);

    // Each scanline: 1 filter byte (0 = None) + w * 4 bytes (RGBA)
    const rowBytes = 1 + w * 4;
    const raw = Buffer.alloc(rowBytes * h);

    for (let y = 0; y < h; y++) {
        const rowStart = y * rowBytes;
        raw[rowStart] = 0; // filter byte: None
        for (let x = 0; x < w; x++) {
            const px = rowStart + 1 + x * 4;
            raw[px] = r;
            raw[px + 1] = g;
            raw[px + 2] = b;
            raw[px + 3] = a;
        }
    }

    const idat = pngChunk("IDAT", zlib.deflateSync(raw));
    const iend = pngChunk("IEND", Buffer.alloc(0));

    return Buffer.concat([signature, ihdr, idat, iend]);
}

export function dataUrlToBuffer(dataUrl: string): Buffer | null {
    if (!dataUrl) return null;
    let base64Data = dataUrl;
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx !== -1) {
        base64Data = dataUrl.slice(commaIdx + 1);
    }
    // Clean up whitespace/newlines that can corrupt base64 decode
    base64Data = base64Data.replace(/\s/g, "");
    if (!base64Data) return null;
    return Buffer.from(base64Data, "base64");
}

export function bufferToDataUrl(buffer: Buffer, extension: string): string {
    const mimeType = getMimeType(extension);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function createBlankImageDataUrl(width: number = 1, height: number = 1, color: string = "#00000000"): string {
    const buffer = createBlankPngBuffer(width, height, color);
    return `data:image/png;base64,${buffer.toString("base64")}`;
}


/**
 * Generates and returns a 100x100 webp-50% thumbnail from an image buffer as a base64 Data URL string.
 */
export async function generateThumbnailDataUrl(imageBuffer: Buffer): Promise<string> {
    const thumbBuffer = await sharp(imageBuffer)
        .resize(100, 100, { fit: "contain" })
        .webp({ quality: 40 })
        .toBuffer();
    return `data:image/webp;base64,${thumbBuffer.toString("base64")}`;
}
