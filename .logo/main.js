import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import * as MarchingSquares from "marchingsquares";
import simplifyPoints from "simplify-js";
import chaikinSmooth from "chaikin-smooth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_DIR = path.resolve(__dirname);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const GLOBALS_CSS = path.resolve(__dirname, "..", "app", "globals.css");

const VALID_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".bmp", ".tiff", ".gif", ".ico"];

function findFirstImage(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.startsWith("main.")) continue;
    const ext = path.extname(file).toLowerCase();
    if (VALID_EXTS.includes(ext)) {
      return path.join(dir, file);
    }
  }
  return null;
}

function createIcoBuffer(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + count * dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    const w = item.width >= 256 ? 0 : item.width;
    const h = item.height >= 256 ? 0 : item.height;
    entry.writeUInt8(w, 0);
    entry.writeUInt8(h, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((b) => b.buffer)]);
}

async function rasterToSvg(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const grid = new Array(height);

  for (let y = 0; y < height; y++) {
    const row = new Array(width);
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3] / 255;
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) * a;
      row[x] = lum;
    }
    grid[y] = row;
  }

  const isoContours = MarchingSquares.isoContours || MarchingSquares.default?.isoContours || MarchingSquares;
  const rawRings = typeof isoContours === "function" ? isoContours(grid, 128) : [];

  const simplifyFn = simplifyPoints.default || simplifyPoints;
  const chaikinFn = chaikinSmooth.default || chaikinSmooth;

  const paths = rawRings
    .filter((ring) => ring.length >= 3)
    .map((ring) => {
      let pts = ring.map(([x, y]) => ({ x, y }));
      if (typeof simplifyFn === "function") {
        pts = simplifyFn(pts, 0.8, true);
      }
      if (typeof chaikinFn === "function" && pts.length >= 3) {
        let smooth = pts.map((p) => [p.x, p.y]);
        smooth = chaikinFn(smooth);
        pts = smooth.map(([x, y]) => ({ x, y }));
      }

      if (pts.length < 3) return "";
      const d = pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ") + " Z";
      return `<path d="${d}" fill="#ffffff" fill-rule="evenodd" />`;
    })
    .filter(Boolean);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  ${paths.join("\n  ")}\n</svg>`;
}

// ============================================================================
// MATHEMATICAL COLOR HARMONY & PALETTE ENGINE
// ============================================================================

function hexToRgb(hex) {
  const num = parseInt(hex.replace("#", ""), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToHex(h, s, l) {
  h = (h % 360 + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (val) => Math.round((val + m) * 255).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

function computeMathematicalPalette(primaryHex) {
  const [r, g, b] = hexToRgb(primaryHex);
  const [h, s, l] = rgbToHsl(r, g, b);

  const shades = {
    50:  hslToHex(h, s * 0.35, 0.96),
    100: hslToHex(h, s * 0.50, 0.90),
    200: hslToHex(h, s * 0.65, 0.80),
    300: hslToHex(h, s * 0.80, 0.68),
    400: hslToHex(h, s * 0.90, 0.56),
    500: primaryHex,
    600: hslToHex(h, s * 0.95, l * 0.85),
    700: hslToHex(h, s * 0.90, l * 0.68),
    800: hslToHex(h, s * 0.85, l * 0.52),
    900: hslToHex(h, s * 0.80, l * 0.38),
    950: hslToHex(h, s * 0.85, l * 0.22),
  };

  const harmonies = {
    comp: hslToHex((h + 180) % 360, s, l),          // 180° Complementary
    analog1: hslToHex((h + 30) % 360, s, l),        // +30° Warm Analogous
    analog2: hslToHex((h - 30 + 360) % 360, s, l),  // -30° Cool Analogous
    surface: hslToHex(h, Math.min(s, 0.18), 0.08),  // Hue-tinted dark surface
    surfaceBorder: hslToHex(h, Math.min(s, 0.25), 0.18), // Hue-tinted border
  };

  return { shades, harmonies };
}

async function extractPrimaryColor(imageBuffer) {
  try {
    const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const map = {};
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 50) continue;
      if ((r > 240 && g > 240 && b > 240) || (r < 25 && g < 25 && b < 25)) continue;
      const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      map[hex] = (map[hex] || 0) + 1;
    }
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || "#fa4600";
  } catch {
    return "#fa4600";
  }
}

async function updateTailwindThemePalette(imageBuffer) {
  const primaryHex = await extractPrimaryColor(imageBuffer);
  const { shades, harmonies } = computeMathematicalPalette(primaryHex);

  console.log(`[logo-sync] Sampled logo primary accent color: ${primaryHex}`);
  console.log(`[logo-sync] Computed complementary accent: ${harmonies.comp}`);
  console.log(`[logo-sync] Computed analogous accents: ${harmonies.analog1}, ${harmonies.analog2}`);

  const paletteCSS = `
/* Auto-generated Mathematically Derived Tailwind CSS v4 Theme Palette from .logo/logo.png */
@theme inline {
  --color-logo-50: ${shades[50]};
  --color-logo-100: ${shades[100]};
  --color-logo-200: ${shades[200]};
  --color-logo-300: ${shades[300]};
  --color-logo-400: ${shades[400]};
  --color-logo-500: ${shades[500]};
  --color-logo-600: ${shades[600]};
  --color-logo-700: ${shades[700]};
  --color-logo-800: ${shades[800]};
  --color-logo-900: ${shades[900]};
  --color-logo-950: ${shades[950]};
  --color-logo: ${primaryHex};

  /* Mathematical Harmonies */
  --color-logo-comp: ${harmonies.comp};
  --color-logo-analog-warm: ${harmonies.analog1};
  --color-logo-analog-cool: ${harmonies.analog2};
  --color-logo-surface: ${harmonies.surface};
  --color-logo-surface-border: ${harmonies.surfaceBorder};
}
`;

  if (fs.existsSync(GLOBALS_CSS)) {
    let cssContent = fs.readFileSync(GLOBALS_CSS, "utf-8");
    if (cssContent.includes("/* Auto-generated")) {
      cssContent = cssContent.replace(/\/\* Auto-generated[\s\S]*?@theme inline \{[\s\S]*?\}\n/g, paletteCSS.trim() + "\n");
    } else {
      cssContent += "\n" + paletteCSS;
    }
    fs.writeFileSync(GLOBALS_CSS, cssContent, "utf-8");
    console.log(`[logo-sync] Updated Tailwind CSS palette in app/globals.css`);
  }
}

async function processLogo() {
  const imagePath = findFirstImage(LOGO_DIR);
  if (!imagePath) {
    console.log("[logo-sync] No logo image found in .logo directory. Skipping.");
    return;
  }

  console.log(`[logo-sync] Found logo source: ${path.basename(imagePath)}`);
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  const ext = path.extname(imagePath).toLowerCase();
  const inputBuffer = fs.readFileSync(imagePath);

  // Generate mathematical HSL Tailwind CSS color palette
  await updateTailwindThemePalette(inputBuffer);

  if (ext === ".svg") {
    // 1. Save SVG directly
    const svgDest = path.join(PUBLIC_DIR, "icon.svg");
    fs.writeFileSync(svgDest, inputBuffer);
    console.log("[logo-sync] Saved public/icon.svg");

    // 2. Rasterize to 512x512 PNG
    const png512 = await sharp(inputBuffer).resize(512, 512).png().toBuffer();
    fs.writeFileSync(path.join(PUBLIC_DIR, "icon-512x512.png"), png512);
    console.log("[logo-sync] Generated public/icon-512x512.png");

    // 3. Rasterize to 192x192 PNG
    const png192 = await sharp(inputBuffer).resize(192, 192).png().toBuffer();
    fs.writeFileSync(path.join(PUBLIC_DIR, "icon-192x192.png"), png192);
    console.log("[logo-sync] Generated public/icon-192x192.png");

    // 4. Generate favicon.ico
    const icoSizes = [16, 32, 48];
    const icoFrames = await Promise.all(
      icoSizes.map(async (size) => {
        const buffer = await sharp(inputBuffer).resize(size, size).png().toBuffer();
        return { width: size, height: size, buffer };
      })
    );
    const icoBuffer = createIcoBuffer(icoFrames);
    fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.ico"), icoBuffer);
    console.log("[logo-sync] Generated public/favicon.ico");
  } else {
    // 1. Vectorize to SVG
    try {
      const svgOutput = await rasterToSvg(inputBuffer);
      if (svgOutput) {
        fs.writeFileSync(path.join(PUBLIC_DIR, "icon.svg"), svgOutput);
        console.log("[logo-sync] Vectorized and saved public/icon.svg");
      }
    } catch (err) {
      console.warn("[logo-sync] Vectorization warning:", err.message);
    }

    // 2. Generate 512x512 PNG
    const png512 = await sharp(inputBuffer)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(PUBLIC_DIR, "icon-512x512.png"), png512);
    console.log("[logo-sync] Generated public/icon-512x512.png");

    // 3. Generate 192x192 PNG
    const png192 = await sharp(inputBuffer)
      .resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(PUBLIC_DIR, "icon-192x192.png"), png192);
    console.log("[logo-sync] Generated public/icon-192x192.png");

    // 4. Generate favicon.ico
    const icoSizes = [16, 32, 48];
    const icoFrames = await Promise.all(
      icoSizes.map(async (size) => {
        const buffer = await sharp(inputBuffer)
          .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        return { width: size, height: size, buffer };
      })
    );
    const icoBuffer = createIcoBuffer(icoFrames);
    fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.ico"), icoBuffer);
    console.log("[logo-sync] Generated public/favicon.ico");
  }

  console.log("[logo-sync] All logo assets & mathematical Tailwind CSS theme palette created successfully!");
}

processLogo().catch((err) => {
  console.error("[logo-sync] Error processing logo:", err);
  process.exit(1);
});
