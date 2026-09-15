import path from "path"
import { STORAGE_PATH } from "../types";

export const STORAGE_ROOT = path.resolve(process.cwd(), STORAGE_PATH);

export function resolveSafePath(relativePath: string, name?: string | null): string | null {
  const sanitizedRelative = relativePath.replace(/^[\/\\]+/, "");
  const resolved = name ? path.resolve(STORAGE_ROOT, sanitizedRelative, name) : path.resolve(STORAGE_ROOT, sanitizedRelative);
  const normalizedBase = path.resolve(STORAGE_ROOT);

  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    return null;
  }
  return resolved;
}