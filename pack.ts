/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// 1. Read name & version from package.json
const pkgPath = path.resolve(process.cwd(), "package.json");
if (!fs.existsSync(pkgPath)) {
  console.error("Error: package.json not found in working directory.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const name = pkg.name || "app";
const version = pkg.version || "1.0.0";

// 2. Define parent sibling output zip file path: ../{name}@{version}.zip
const zipFileName = `${name}@${version}.zip`;
const outputZipPath = path.resolve(process.cwd(), "..", zipFileName);

console.log(`[Pack] Packing workspace into sibling file: ${zipFileName}...`);

// 3. Get non-ignored files (respecting .gitignore and excluding .git)
let files: string[] = [];
try {
  const gitOutput = execSync("git ls-files -co --exclude-standard", { encoding: "utf-8" });
  files = gitOutput
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && !f.startsWith(".git") && !f.startsWith(".."));
} catch (err: any) {
  console.error("Error fetching git files:", err.message);
  process.exit(1);
}

if (files.length === 0) {
  console.error("Error: No files found to pack.");
  process.exit(1);
}

// 4. Create temporary manifest list for tar
const tmpListPath = path.resolve(process.cwd(), ".pack_filelist.tmp");
fs.writeFileSync(tmpListPath, files.join("\n"), "utf-8");

// Remove existing target zip if present
if (fs.existsSync(outputZipPath)) {
  fs.unlinkSync(outputZipPath);
}

try {
  // tar.exe is native on Windows 10/11, Linux & macOS (-a auto-selects zip format)
  execSync(`tar -a -c -f "${outputZipPath}" -T "${tmpListPath}"`, { stdio: "inherit" });
  console.log(`\n✅ Packed ${files.length} files successfully!`);
  console.log(`📁 Sibling Zip Saved To: ${outputZipPath}`);
} catch (err: any) {
  console.warn("[Pack] Tar command failed, trying PowerShell Compress-Archive fallback...", err.message);
  try {
    const psCmd = `powershell -NoProfile -Command "Get-Content '${tmpListPath}' | Compress-Archive -DestinationPath '${outputZipPath}' -Force"`;
    execSync(psCmd, { stdio: "inherit" });
    console.log(`\n✅ Packed ${files.length} files successfully!`);
    console.log(`📁 Sibling Zip Saved To: ${outputZipPath}`);
  } catch (psErr: any) {
    console.error("Failed to compress archive:", psErr.message);
  }
} finally {
  if (fs.existsSync(tmpListPath)) {
    fs.unlinkSync(tmpListPath);
  }
}
