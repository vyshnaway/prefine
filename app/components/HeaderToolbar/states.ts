import { PERSONA, FileToolbarSettings, BrushMode } from "@/app/types";

export type { BrushMode, FileToolbarSettings };

export interface LayoutSettings {
  isAutoplay: boolean;
  autoplayInterval: number;
  isCatalogCollapsed: boolean;
  isInspectorCollapsed: boolean;
  sidebarWidth: number;
  inspectorWidth: number;
  persona: PERSONA;
}

export type PersistedToolbarSettings = FileToolbarSettings & LayoutSettings;

export const FILE_TOOLBAR_DEFAULTS: FileToolbarSettings = {
  imageVisibility: true,
  maskVisibility: true,
  brushMode: "brush",
  brushSize: 20,
  brushHardness: 1,
  brushOpacity: 1,
  brushColor: "#ffffffff",
  swapMouseClicks: false,
  thresholdValue: 64,
  thresholdValueEnabled: true,
  traceMinBlobPixels: 32,
  traceMinBlobPixelsEnabled: true,
  simplifyEpsilon: .6,
  simplifyEpsilonEnabled: true,
  smoothIterations: 1,
  smoothIterationsEnabled: true,
  contourOffset: 0,
  contourOffsetEnabled: true,
  feather: .5,
  featherEnabled: true,
  maskOpacity: 0.8,
  imageOpacity: 0.8,
  splineCurviness: 0.5,
};

export const LAYOUT_DEFAULTS: LayoutSettings = {
  isAutoplay: false,
  autoplayInterval: 500,
  isCatalogCollapsed: false,
  isInspectorCollapsed: false,
  sidebarWidth: 240,
  inspectorWidth: 335,
  persona: PERSONA.IMAGE,
};

export const TOOLBAR_DEFAULTS: PersistedToolbarSettings = {
  ...FILE_TOOLBAR_DEFAULTS,
  ...LAYOUT_DEFAULTS,
};

let dynamicFileToolbarDefaults: FileToolbarSettings = { ...FILE_TOOLBAR_DEFAULTS };

export function getActiveFileToolbarDefaults(): FileToolbarSettings {
  return { ...dynamicFileToolbarDefaults };
}

export function setActiveFileToolbarDefaults(defaults: Partial<FileToolbarSettings>) {
  dynamicFileToolbarDefaults = {
    ...dynamicFileToolbarDefaults,
    ...defaults,
  };
}

export function resolveFileToolbarSettings(
  raw?: Partial<FileToolbarSettings> | null,
  fallback: FileToolbarSettings = dynamicFileToolbarDefaults
): FileToolbarSettings {
  const base = fallback || dynamicFileToolbarDefaults || FILE_TOOLBAR_DEFAULTS;
  if (!raw) return { ...base };

  const validModes: BrushMode[] = ["brush", "lasso", "polygon", "spline"];

  return {
    brushMode:
      raw.brushMode && validModes.includes(raw.brushMode)
        ? raw.brushMode
        : base.brushMode,
    brushSize:
      typeof raw.brushSize === "number" ? raw.brushSize : base.brushSize,
    brushHardness:
      typeof raw.brushHardness === "number" ? raw.brushHardness : base.brushHardness,
    brushOpacity:
      typeof raw.brushOpacity === "number" ? raw.brushOpacity : base.brushOpacity,
    brushColor: typeof raw.brushColor === "string" ? raw.brushColor : base.brushColor,
    swapMouseClicks:
      typeof raw.swapMouseClicks === "boolean" ? raw.swapMouseClicks : base.swapMouseClicks,
    thresholdValue:
      typeof raw.thresholdValue === "number" ? raw.thresholdValue : base.thresholdValue,
    thresholdValueEnabled:
      typeof raw.thresholdValueEnabled === "boolean"
        ? raw.thresholdValueEnabled
        : base.thresholdValueEnabled,
    traceMinBlobPixels:
      typeof raw.traceMinBlobPixels === "number" ? raw.traceMinBlobPixels : base.traceMinBlobPixels,
    traceMinBlobPixelsEnabled:
      typeof raw.traceMinBlobPixelsEnabled === "boolean"
        ? raw.traceMinBlobPixelsEnabled
        : base.traceMinBlobPixelsEnabled,
    simplifyEpsilon:
      typeof raw.simplifyEpsilon === "number" ? raw.simplifyEpsilon : base.simplifyEpsilon,
    simplifyEpsilonEnabled:
      typeof raw.simplifyEpsilonEnabled === "boolean"
        ? raw.simplifyEpsilonEnabled
        : base.simplifyEpsilonEnabled,
    smoothIterations:
      typeof raw.smoothIterations === "number" ? raw.smoothIterations : base.smoothIterations,
    smoothIterationsEnabled:
      typeof raw.smoothIterationsEnabled === "boolean"
        ? raw.smoothIterationsEnabled
        : base.smoothIterationsEnabled,
    contourOffset:
      typeof raw.contourOffset === "number" ? raw.contourOffset : base.contourOffset,
    contourOffsetEnabled:
      typeof raw.contourOffsetEnabled === "boolean"
        ? raw.contourOffsetEnabled
        : base.contourOffsetEnabled,
    feather:
      typeof raw.feather === "number" ? raw.feather : base.feather,
    featherEnabled:
      typeof raw.featherEnabled === "boolean"
        ? raw.featherEnabled
        : base.featherEnabled,
    maskOpacity:
      typeof raw.maskOpacity === "number" ? raw.maskOpacity : base.maskOpacity,
    imageOpacity:
      typeof raw.imageOpacity === "number" ? raw.imageOpacity : base.imageOpacity,
    imageVisibility:
      typeof raw.imageVisibility === "boolean" ? raw.imageVisibility : base.imageVisibility,
    maskVisibility:
      typeof raw.maskVisibility === "boolean" ? raw.maskVisibility : base.maskVisibility,
    splineCurviness:
      typeof raw.splineCurviness === "number" ? raw.splineCurviness : base.splineCurviness,
  };
}

