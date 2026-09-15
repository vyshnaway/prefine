import path from "path";
import { promises as fs } from "fs";
import { FileToolbarSettings } from "@/app/types";
import {
  resolveFileToolbarSettings,
  getActiveFileToolbarDefaults,
  setActiveFileToolbarDefaults,
} from "@/app/components/HeaderToolbar/states";
import { STORAGE_ROOT } from "./storage";

import { pb } from "./pocketbase";

/**
 * Aggregates all completed metafiles from PocketBase database,
 * calculating the average of numeric toolbar fields and the mode (most common value)
 * for enum/boolean toolbar fields.
 */
export async function computePopularOrAverageToolbarDefaults(
  rootDir: string = STORAGE_ROOT
): Promise<FileToolbarSettings> {
  const numericSum: Record<string, number> = {};
  const numericCount: Record<string, number> = {};
  const categoricalFreq: Record<string, Record<string, number>> = {};
  let totalCompletedCount = 0;

  try {
    const res = await pb.collection("metafiles").getList(1, 10000, {
      filter: 'status = "completed" || exportedAt != null',
      sort: "-updated",
      fields: "prop_imageVisibility,prop_maskVisibility,prop_brushMode,prop_brushSize,prop_brushHardness,prop_brushOpacity,prop_brushColor,prop_swapMouseClicks,prop_maskOpacity,prop_thresholdValue,prop_thresholdValueEnabled,prop_traceMinBlobPixels,prop_traceMinBlobPixelsEnabled,prop_simplifyEpsilon,prop_simplifyEpsilonEnabled,prop_smoothIterations,prop_smoothIterationsEnabled,prop_contourOffset,prop_contourOffsetEnabled,prop_feather,prop_featherEnabled,prop_imageOpacity,prop_splineCurviness",
    }).catch(() => null);

    if (res && res.items) {
      for (const r of res.items) {
        totalCompletedCount++;
        const tb = resolveFileToolbarSettings({
          imageVisibility: r.prop_imageVisibility,
          maskVisibility: r.prop_maskVisibility,
          brushMode: r.prop_brushMode,
          brushSize: r.prop_brushSize,
          brushHardness: r.prop_brushHardness,
          brushOpacity: r.prop_brushOpacity,
          brushColor: r.prop_brushColor,
          swapMouseClicks: r.prop_swapMouseClicks,
          maskOpacity: r.prop_maskOpacity,
          thresholdValue: r.prop_thresholdValue,
          thresholdValueEnabled: r.prop_thresholdValueEnabled,
          traceMinBlobPixels: r.prop_traceMinBlobPixels,
          traceMinBlobPixelsEnabled: r.prop_traceMinBlobPixelsEnabled,
          simplifyEpsilon: r.prop_simplifyEpsilon,
          simplifyEpsilonEnabled: r.prop_simplifyEpsilonEnabled,
          smoothIterations: r.prop_smoothIterations,
          smoothIterationsEnabled: r.prop_smoothIterationsEnabled,
          contourOffset: r.prop_contourOffset,
          contourOffsetEnabled: r.prop_contourOffsetEnabled,
          feather: r.prop_feather,
          featherEnabled: r.prop_featherEnabled,
          imageOpacity: r.prop_imageOpacity,
          splineCurviness: r.prop_splineCurviness,
        });

        for (const [k, v] of Object.entries(tb)) {
          if (typeof v === "number" && !isNaN(v)) {
            numericSum[k] = (numericSum[k] || 0) + v;
            numericCount[k] = (numericCount[k] || 0) + 1;
          } else if (typeof v === "string" || typeof v === "boolean") {
            const strVal = String(v);
            if (!categoricalFreq[k]) categoricalFreq[k] = {};
            categoricalFreq[k][strVal] = (categoricalFreq[k][strVal] || 0) + 1;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Failed to fetch completed metafiles from PocketBase for toolbar defaults:", err);
  }

  if (totalCompletedCount === 0) {
    console.log("[Toolbar Defaults] No completed metafiles found; keeping current defaults.");
    return getActiveFileToolbarDefaults();
  }

  const baseDefaults = getActiveFileToolbarDefaults();
  const updatedDefaults: FileToolbarSettings = { ...baseDefaults };

  // Calculate averages
  for (const [k, sum] of Object.entries(numericSum)) {
    const count = numericCount[k] || 1;
    let avg = sum / count;

    if (
      k === "thresholdValue" ||
      k === "traceMinBlobPixels" ||
      k === "contourOffset" ||
      k === "brushSize"
    ) {
      // Round to integer (no decimal)
      avg = Math.round(avg);
    } else if (
      k === "feather" ||
      k === "simplifyEpsilon" ||
      k === "smoothIterations"
    ) {
      // Round to 1 decimal place
      avg = Math.round(avg * 10) / 10;
    } else {
      // Default to 2 decimal places for opacities/hardness
      avg = Math.round(avg * 100) / 100;
    }

    (updatedDefaults as any)[k] = avg;
  }

  // Calculate modes
  for (const [k, freqMap] of Object.entries(categoricalFreq)) {
    let topVal: string = "";
    let maxCount = -1;
    for (const [val, count] of Object.entries(freqMap)) {
      if (count > maxCount) {
        maxCount = count;
        topVal = val;
      }
    }
    if (topVal !== "") {
      if (typeof (baseDefaults as any)[k] === "boolean") {
        (updatedDefaults as any)[k] = topVal === "true";
      } else {
        (updatedDefaults as any)[k] = topVal;
      }
    }
  }

  setActiveFileToolbarDefaults(updatedDefaults);
  console.log(
    `[Toolbar Defaults] Updated dynamic toolbar defaults from ${totalCompletedCount} completed metafiles.`
  );

  return updatedDefaults;
}

computePopularOrAverageToolbarDefaults()