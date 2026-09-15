import { MetaFolder } from "@/app/types";

/** Generate deterministic, harmonious background and text color based on user's name string */
export function getAssigneeColorStyle(name: string): { bg: string; text: string; border: string } {
  if (!name) return { bg: "#1e1e1e", text: "#888888", border: "#333333" };

  return {
    bg: "#222222",
    text: "#cccccc",
    border: "#3a3a3a",
  };
}

/**
 * Dynamically derives task status for a folder from its MetaFolder properties.
 */
export function deriveFolderTaskStatus(
  folderMeta?: Partial<MetaFolder>
): "unassigned" | "assigned" | "progressing" | "commented" | "completed" {
  if (!folderMeta) return "unassigned";
  if (folderMeta.status) return folderMeta.status as any;
  if (folderMeta.assignedTo) return "assigned";
  return "unassigned";
}
