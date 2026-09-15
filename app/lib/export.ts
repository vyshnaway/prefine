
import sharp, { OverlayOptions } from "sharp";
import { createBlankPngBuffer, dataUrlToBuffer } from "./image";
import { FileToolbarSettings, ImgJsonBlob } from "../types";
import { convertAndSaveSiblingFormats } from "./file";

/**
 * Helper to ensure we get a valid Sharp instance of [width, height] RGBA,
 * or an empty transparent buffer if the dataUrl is missing or invalid.
 */
async function resolveLayerBuffer(
    dataUrl: string | undefined | null,
    width: number,
    height: number,
    fallbackColor: string = "#00000000"
): Promise<Buffer> {
    if (dataUrl) {
        const buf = dataUrlToBuffer(dataUrl);
        if (buf && buf.length > 0) {
            try {
                return await sharp(buf)
                    .resize(width, height, { fit: "fill" })
                    .ensureAlpha()
                    .raw()
                    .toBuffer();
            } catch { }
        }
    }
    const pngFallback = createBlankPngBuffer(width, height, fallbackColor);
    return await sharp(pngFallback)
        .resize(width, height, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer();
}

/**
 * Converts a raw RGBA/RGB buffer into a white luminance-to-alpha mask:
 * Output pixel: RGB = (255, 255, 255), Alpha = luminance(R, G, B)
 */
function rawBufferToLuminanceAlpha(rawBuffer: Buffer, width: number, height: number, invert: boolean = false): Buffer {
    const totalPixels = width * height;
    const outBuffer = Buffer.alloc(totalPixels * 4);

    for (let i = 0; i < totalPixels; i++) {
        const srcIdx = i * 4;
        const r = rawBuffer[srcIdx];
        const g = rawBuffer[srcIdx + 1];
        const b = rawBuffer[srcIdx + 2];

        // Fixed-point luminance: 0.2126*R + 0.7152*G + 0.0722*B
        let lum = ((r * 13932 + g * 46871 + b * 4733) >> 16) & 0xff;
        if (invert) lum = 255 - lum;

        outBuffer[srcIdx] = 255;
        outBuffer[srcIdx + 1] = 255;
        outBuffer[srcIdx + 2] = 255;
        outBuffer[srcIdx + 3] = lum;
    }

    return outBuffer;
}

import {
    traceRawBufferContours,
    simplifyPath,
    smoothPath,
    contoursToSvgMask,
    thresholdRawBuffer,
} from "./vectorize";

/**
 * Backend generation script for exporting composite image persona assets.
 * 
 * Pipeline:
 * base_image + convert_to_alpha_luminance(vectorize_with_params(input.object + input.repair)) + input.color
 * 
 * @param input ImgJsonBlob containing image, object, repair, color layers
 * @param options FileToolbarSettings options
 * @param writePath Base file path without extension to save exports
 * @param width Target width override
 * @param height Target height override
 * @returns Object containing the processed buffer, mimeType, and dimensions
 */
export async function generateExport(
    input: ImgJsonBlob,
    options: FileToolbarSettings,
    writePath: string,
    width: number = 0,
    height: number = 0,
): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number }> {
    const baseRaw = dataUrlToBuffer(input.image);
    if (!baseRaw || baseRaw.length === 0) {
        throw new Error("Invalid or empty base image buffer in sidecar JSON blob");
    }

    const baseSharp = sharp(baseRaw);
    const meta = await baseSharp.metadata();
    width = width || meta.width ||  1;
    height = height || meta.height ||  1;

    // 1. Build Base Image Layer (ensure RGBA)
    const baseLayerBuffer = await baseSharp
        .resize(width, height, { fit: "fill" })
        .ensureAlpha()
        .png()
        .toBuffer();

    // 2. Composite Object + Repair Layers for Mask
    const objectRaw = await resolveLayerBuffer(input.object, width, height, "#000000");
    const repairRaw = await resolveLayerBuffer(input.repair, width, height, "#00000000");

    // Composite repair over object using Sharp
    let combinedMaskRaw = await sharp(objectRaw, { raw: { width, height, channels: 4 } })
        .composite([{ input: repairRaw, raw: { width, height, channels: 4 }, blend: "over" }])
        .raw()
        .toBuffer();

    // 3. Vectorize / Threshold Stage
    const thresholdLevel = options?.thresholdValue ?? 64;
    const thresholdEnabled = options?.thresholdValueEnabled ?? true;
    const traceMinBlob = options?.traceMinBlobPixels ?? 32;
    const traceEnabled = options?.traceMinBlobPixelsEnabled ?? true;
    const simplifyEpsilon = options?.simplifyEpsilon ?? 0.75;
    const simplifyEnabled = options?.simplifyEpsilonEnabled ?? true;
    const smoothIterations = options?.smoothIterations ?? 1;
    const smoothEnabled = options?.smoothIterationsEnabled ?? true;
    const offsetDistance = options?.contourOffset ?? -0.5;
    const offsetEnabled = options?.contourOffsetEnabled ?? true;
    const featherDistance = options?.feather ?? .5;
    const featherEnabled = options?.featherEnabled ?? true;

    let maskAlphaBuffer: Buffer;

    if (thresholdEnabled && traceEnabled) {
        // Trace vector contours from luminance grid
        let contours = traceRawBufferContours(
            combinedMaskRaw,
            width,
            height,
            thresholdLevel,
            traceMinBlob
        );

        if (simplifyEnabled && simplifyEpsilon > 0) {
            contours = contours.map((c) => simplifyPath(c, simplifyEpsilon));
        }

        if (smoothEnabled && smoothIterations > 0) {
            contours = contours.map((c) => smoothPath(c, smoothIterations));
        }

        // Render vector mask contours to an SVG rasterized buffer
        let svgMask = contoursToSvgMask(contours, width, height, {
            fillInColor: "#000000",
            fillOutColor: "#ffffff",
            offsetDistance: offsetEnabled ? offsetDistance : 0,
        });

        const rasterizedMaskRaw = await sharp(Buffer.from(svgMask))
            .resize(width, height, { fit: "fill" })
            .ensureAlpha()
            .raw()
            .toBuffer();

        maskAlphaBuffer = rawBufferToLuminanceAlpha(
            rasterizedMaskRaw,
            width,
            height,
            options?.swapMouseClicks || false
        );
    } else if (thresholdEnabled) {
        const thresholded = thresholdRawBuffer(combinedMaskRaw, width, height, thresholdLevel);
        maskAlphaBuffer = rawBufferToLuminanceAlpha(
            thresholded,
            width,
            height,
            options?.swapMouseClicks || false
        );
    } else {
        maskAlphaBuffer = rawBufferToLuminanceAlpha(
            combinedMaskRaw,
            width,
            height,
            options?.swapMouseClicks || false
        );
    }

    let maskSharpPipeline = sharp(maskAlphaBuffer, {
        raw: { width, height, channels: 4 }
    });

    if (featherEnabled && featherDistance > 0) {
        maskSharpPipeline = maskSharpPipeline.blur(featherDistance);
    }

    const maskAlphaPng = await maskSharpPipeline.png().toBuffer();

    // 4. Color / Paint Layer
    const colorRaw = await resolveLayerBuffer(input.color, width, height, "#00000000");
    const colorPng = await sharp(colorRaw, {
        raw: { width, height, channels: 4 }
    }).png().toBuffer();

    // 5. Final Composite: Base Image + Mask Alpha + Color Layer
    const compositeLayers: OverlayOptions[] = [
        { input: maskAlphaPng, blend: "over" },
        { input: colorPng, blend: "over" }
    ];

    const outputBuffer = await sharp(baseLayerBuffer).composite(compositeLayers).png().toBuffer();

    // Save sibling formats (.png, .webp, .jpg) to the destination base path
    if (writePath) {
        await convertAndSaveSiblingFormats(outputBuffer, writePath);
    }

    return {
        buffer: outputBuffer,
        mimeType: "image/png",
        width,
        height,
    };
}


