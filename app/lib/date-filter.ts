/**
 * Shared utility for evaluating if an ISO date string falls within
 * an inclusive start date (00:00:00.000) and end date (23:59:59.999).
 */
export function isDateWithinRange(
  dateStr: string | null | undefined,
  startDate: string | number | null | undefined,
  endDate: string | number | null | undefined,
  includeNullDates: boolean = true
): boolean {
  if (!startDate && !endDate) return true;

  if (!dateStr) {
    return includeNullDates;
  }

  const itemTime = new Date(dateStr).getTime();
  if (isNaN(itemTime)) {
    return includeNullDates;
  }

  let startTimestamp: number | null = null;
  if (startDate) {
    if (typeof startDate === "number") {
      startTimestamp = startDate;
    } else {
      const parsed = new Date(`${startDate}T00:00:00.000`).getTime();
      startTimestamp = !isNaN(parsed) ? parsed : new Date(startDate).setHours(0, 0, 0, 0);
    }
  }

  let endTimestamp: number | null = null;
  if (endDate) {
    if (typeof endDate === "number") {
      endTimestamp = endDate;
    } else {
      const parsed = new Date(`${endDate}T23:59:59.999`).getTime();
      endTimestamp = !isNaN(parsed) ? parsed : new Date(endDate).setHours(23, 59, 59, 999);
    }
  }

  if (startTimestamp !== null && !isNaN(startTimestamp) && itemTime < startTimestamp) {
    return false;
  }
  if (endTimestamp !== null && !isNaN(endTimestamp) && itemTime > endTimestamp) {
    return false;
  }

  return true;
}
