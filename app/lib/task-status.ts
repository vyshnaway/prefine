import { MetaFile, TaskStatus } from "../types";

/** 
 * Dynamically derives task status from asset metadata:
 * 1. If it has issues -> "progressing" (in progress)
 * 2. If it has comment but no issues -> "commented"
 * 3. Otherwise if exported / completed -> "completed"
 * 4. Otherwise if assigned to someone -> "assigned"
 * 5. Otherwise -> "unassigned"
 */
export function deriveTaskStatus(meta?: Partial<MetaFile>): TaskStatus {
  if (!meta) return "unassigned";

  const hasIssues = Boolean(meta.issues && meta.issues.length > 0);
  const hasComment = Boolean(meta.comment && meta.comment.trim().length > 0);

  if (hasIssues) return "progressing";
  if (hasComment) return "commented";
  if (meta.status === "completed" || meta.exportedAt) return "completed";
  if (meta.assignedTo || meta.status === "assigned") return "assigned";

  return "unassigned";
}

export const STATUS_RANK: Record<string, number> = {
  unassigned: 0,
  assigned: 1,
  progressing: 2,
  commented: 3,
  completed: 4,
};

export const RANK_TO_STATUS: TaskStatus[] = [
  "unassigned",
  "assigned",
  "progressing",
  "commented",
  "completed",
];

/**
 * Computes the lowest status rank among a list of metafiles.
 */
export function deriveLowestAggregateStatus(items: Array<Partial<MetaFile>>): TaskStatus {
  if (!items || items.length === 0) return "unassigned";
  let minRank = 4;
  for (const item of items) {
    const status = deriveTaskStatus(item);
    const rank = STATUS_RANK[status] ?? 0;
    if (rank < minRank) minRank = rank;
  }
  return RANK_TO_STATUS[minRank] || "unassigned";
}
