import { memo } from "react";
import { PERSONA, ImgData, PersonaDefinition, ApiResponse_folder } from "../../types";
import { useAuth } from "@/app/lib/auth-context";

import PersonaSelector from "./PersonaSelector";
import PersonaSettings_Brush from "./PersonaSettings_Paint";
import PersonaSettings_Object from "./PersonaSettings_Object";
import PersonaSettings_Vector from "./PersonaSettings_Vector";
import PersonaSettings_Admin from "./PersonaSettings_Admin";
import { BrushMode } from "./PersonaSettings_Paint";


export interface HeaderToolbarProps {
  activePersona: PERSONA;
  personaList: PersonaDefinition[];
  onPersonaChange: (persona: PERSONA) => void;
  activeImage: ImgData | null;
  onDetectingObject: () => Promise<void>;
  brushMode: BrushMode;
  onBrushModeChange: (mode: BrushMode) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  brushHardness: number;
  onBrushHardnessChange: (hardness: number) => void;
  brushColor: string;
  onBrushColorChange: (color: string) => void;
  brushOpacity: number;
  onBrushOpacityChange: (opacity: number) => void;
  swapMouseClicks: boolean;
  onSwapMouseClicksChange: (val: boolean) => void;
  isDetectingObject: boolean;
  maskOpacity: number;
  onMaskOpacityChange: (val: number) => void;
  imageOpacity: number;
  onImageOpacityChange: (val: number) => void;
  thresholdValue: number;
  thresholdValueEnabled: boolean;
  onThresholdValueChange: (val: number) => void;
  onThresholdValueEnabledChange: (val: boolean) => void;
  traceMinBlobPixels: number;
  traceMinBlobPixelsEnabled: boolean;
  onTraceMinBlobPixelsChange: (val: number) => void;
  onTraceMinBlobPixelsEnabledChange: (val: boolean) => void;
  simplifyEpsilon: number;
  simplifyEpsilonEnabled: boolean;
  onSimplifyEpsilonChange: (val: number) => void;
  onSimplifyEpsilonEnabledChange: (val: boolean) => void;
  smoothIterations: number;
  smoothIterationsEnabled: boolean;
  onSmoothIterationsChange: (val: number) => void;
  onSmoothIterationsEnabledChange: (val: boolean) => void;
  contourOffset: number;
  contourOffsetEnabled: boolean;
  onContourOffsetChange: (val: number) => void;
  onContourOffsetEnabledChange: (val: boolean) => void;
  feather: number;
  featherEnabled: boolean;
  onFeatherChange: (val: number) => void;
  onFeatherEnabledChange: (val: boolean) => void;
  maskVisibility: boolean;
  onMaskVisibilityChange: (val: boolean) => void;
  imageVisibility: boolean;
  onImageVisibilityChange: (val: boolean) => void;
  splineCurviness?: number;
  onSplineCurvinessChange?: (val: number) => void;
  onClearLayer?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  folderData?: ApiResponse_folder;
  currentFolder?: string;
  onTriggerBatchAutomation?: () => Promise<void> | void;
  isBatchProcessing?: boolean;
  onPersonaSelectorWidthMeasured?: (width: number) => void;
  isDateFilterEnabled?: boolean;
  setIsDateFilterEnabled?: React.Dispatch<React.SetStateAction<boolean>>;
  includeNullDates?: boolean;
  setIncludeNullDates?: React.Dispatch<React.SetStateAction<boolean>>;
  startDate?: string;
  setStartDate?: (date: string) => void;
  endDate?: string;
  setEndDate?: (date: string) => void;
}

function HeaderToolbarComponent({
  activePersona,
  personaList,
  onPersonaChange,
  onPersonaSelectorWidthMeasured,
  activeImage,
  onDetectingObject,
  isDetectingObject = false,
  onTriggerBatchAutomation,
  isBatchProcessing = false,
  brushMode = "brush",
  onBrushModeChange,
  brushSize = 20,
  onBrushSizeChange,
  brushHardness = 0.8,
  onBrushHardnessChange,
  brushOpacity = 0.7,
  onBrushOpacityChange,
  brushColor = "#ffffff",
  onBrushColorChange,
  swapMouseClicks = false,
  onSwapMouseClicksChange,
  maskOpacity = 0.7,
  onMaskOpacityChange,
  thresholdValue = 64,
  onThresholdValueChange,
  thresholdValueEnabled = true,
  onThresholdValueEnabledChange,
  traceMinBlobPixels = 32,
  onTraceMinBlobPixelsChange,
  traceMinBlobPixelsEnabled = true,
  onTraceMinBlobPixelsEnabledChange,
  simplifyEpsilon = 1,
  onSimplifyEpsilonChange,
  simplifyEpsilonEnabled = true,
  onSimplifyEpsilonEnabledChange,
  smoothIterations = 1,
  onSmoothIterationsChange,
  smoothIterationsEnabled = true,
  onSmoothIterationsEnabledChange,
  contourOffset = 0,
  onContourOffsetChange,
  contourOffsetEnabled = false,
  onContourOffsetEnabledChange,
  feather = 0,
  onFeatherChange,
  featherEnabled = false,
  onFeatherEnabledChange,
  imageOpacity = 1,
  onImageOpacityChange,
  imageVisibility = true,
  onImageVisibilityChange,
  maskVisibility = true,
  onMaskVisibilityChange,
  splineCurviness = 0.5,
  onSplineCurvinessChange,
  onClearLayer,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  folderData,
  currentFolder = "",
  isDateFilterEnabled,
  setIsDateFilterEnabled,
  includeNullDates,
  setIncludeNullDates,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: HeaderToolbarProps) {
  const { role } = useAuth();

  // Role-based persona filtering: Only admins can see/access the ADMIN persona
  const authorizedPersonas = personaList.filter((p) => {
    if (p.id === PERSONA.ADMIN) {
      return role === "admin";
    }
    return true;
  });

  return (
    <header className="sticky top-0 z-50 w-full h-24 bg-[#181818]/90 backdrop-blur-md border-b border-[#2b2b2b] flex items-stretch justify-between shadow-md select-none text-[#e0e0e0]">
      <PersonaSelector activePersona={activePersona} personaList={authorizedPersonas} onPersonaChange={onPersonaChange} onWidthMeasured={onPersonaSelectorWidthMeasured} />

      {/* Center Column: Specific Settings Controls */}
      <div className="px-6 flex-1 flex items-stretch overflow-x-auto overflow-y-hidden gap-6 py-2 select-none h-full">
        {/* Admin Dashboard Settings Controls */}
        {activePersona === PERSONA.ADMIN && folderData && (
          <PersonaSettings_Admin
            folderData={folderData}
            onTriggerBatchAutomation={onTriggerBatchAutomation}
            isBatchProcessing={isBatchProcessing}
            isDateFilterEnabled={isDateFilterEnabled}
            setIsDateFilterEnabled={setIsDateFilterEnabled}
            includeNullDates={includeNullDates}
            setIncludeNullDates={setIncludeNullDates}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
          />
        )}

        {/* Brush Controls context bar */}
        {(activePersona === PERSONA.REPAIR || activePersona === PERSONA.COLOR) && (
          <PersonaSettings_Brush
            grayscalemode={activePersona === PERSONA.REPAIR}
            brushMode={brushMode}
            onBrushModeChange={onBrushModeChange}
            brushSize={brushSize}
            onBrushSizeChange={onBrushSizeChange}
            brushHardness={brushHardness}
            onBrushHardnessChange={onBrushHardnessChange}
            brushOpacity={brushOpacity}
            onBrushOpacityChange={onBrushOpacityChange}
            brushColor={brushColor}
            onBrushColorChange={onBrushColorChange}
            swapMouseClicks={swapMouseClicks}
            onSwapMouseClicksChange={onSwapMouseClicksChange}
            onClearLayer={onClearLayer}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            splineCurviness={splineCurviness}
            onSplineCurvinessChange={onSplineCurvinessChange}
          />
        )}

        {/* Centered Persona Specific Controls: Object Generator */}
        {activePersona === PERSONA.OBJECT && onDetectingObject && (
          <PersonaSettings_Object
            activeImage={activeImage}
            onDetectingObject={onDetectingObject}
            isDetectingObject={isDetectingObject}
            isBatchProcessing={isBatchProcessing}
            maskOpacity={maskOpacity}
            onMaskOpacityChange={onMaskOpacityChange}
            imageOpacity={imageOpacity}
            onImageOpacityChange={onImageOpacityChange}
            maskVisibility={maskVisibility}
            onMaskVisibilityChange={onMaskVisibilityChange}
            imageVisibility={imageVisibility}
            onImageVisibilityChange={onImageVisibilityChange}
          />
        )}

        {/* Centered Persona Specific Controls: Object Generator */}
        {activePersona === PERSONA.VECTOR && (
          <PersonaSettings_Vector
            thresholdValue={thresholdValue}
            thresholdValueEnabled={thresholdValueEnabled}
            onThresholdValueChange={onThresholdValueChange}
            onThresholdValueEnabledChange={onThresholdValueEnabledChange}
            traceMinBlobPixels={traceMinBlobPixels}
            traceMinBlobPixelsEnabled={traceMinBlobPixelsEnabled}
            onTraceMinBlobPixelsChange={onTraceMinBlobPixelsChange}
            onTraceMinBlobPixelsEnabledChange={onTraceMinBlobPixelsEnabledChange}
            simplifyEpsilon={simplifyEpsilon}
            simplifyEpsilonEnabled={simplifyEpsilonEnabled}
            onSimplifyEpsilonChange={onSimplifyEpsilonChange}
            onSimplifyEpsilonEnabledChange={onSimplifyEpsilonEnabledChange}
            smoothIterations={smoothIterations}
            smoothIterationsEnabled={smoothIterationsEnabled}
            onSmoothIterationsChange={onSmoothIterationsChange}
            onSmoothIterationsEnabledChange={onSmoothIterationsEnabledChange}
            contourOffset={contourOffset}
            contourOffsetEnabled={contourOffsetEnabled}
            onContourOffsetChange={onContourOffsetChange}
            onContourOffsetEnabledChange={onContourOffsetEnabledChange}
            feather={feather}
            featherEnabled={featherEnabled}
            onFeatherChange={onFeatherChange}
            onFeatherEnabledChange={onFeatherEnabledChange}
          />
        )}
      </div>
    </header>
  );
}

export default memo(HeaderToolbarComponent);