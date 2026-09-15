
// Assuming your types and Slider component live in their respective paths
import { ImgData } from "../../types"; // adjust path
import Slider from "./Slider"; // adjust path

interface PersonaSettings_Vector__Props {
  thresholdValue: number;
  thresholdValueEnabled: boolean;
  onThresholdValueChange: (value: number) => void;
  onThresholdValueEnabledChange: (enabled: boolean) => void;
  traceMinBlobPixels: number;
  traceMinBlobPixelsEnabled: boolean;
  onTraceMinBlobPixelsChange: (value: number) => void;
  onTraceMinBlobPixelsEnabledChange: (enabled: boolean) => void;
  simplifyEpsilon: number;
  simplifyEpsilonEnabled: boolean;
  onSimplifyEpsilonChange: (value: number) => void;
  onSimplifyEpsilonEnabledChange: (enabled: boolean) => void;
  smoothIterations: number;
  smoothIterationsEnabled: boolean;
  onSmoothIterationsChange: (value: number) => void;
  onSmoothIterationsEnabledChange: (enabled: boolean) => void;
  contourOffset: number;
  contourOffsetEnabled: boolean;
  onContourOffsetChange: (value: number) => void;
  onContourOffsetEnabledChange: (enabled: boolean) => void;
  feather: number;
  featherEnabled: boolean;
  onFeatherChange: (value: number) => void;
  onFeatherEnabledChange: (enabled: boolean) => void;
}

export default function PersonaSettings_Vector({
  thresholdValue = 128,
  thresholdValueEnabled = true,
  onThresholdValueChange,
  onThresholdValueEnabledChange,
  traceMinBlobPixels = 16,
  traceMinBlobPixelsEnabled = true,
  onTraceMinBlobPixelsChange,
  onTraceMinBlobPixelsEnabledChange,
  simplifyEpsilon = 1.5,
  simplifyEpsilonEnabled = true,
  onSimplifyEpsilonChange,
  onSimplifyEpsilonEnabledChange,
  smoothIterations = 2,
  smoothIterationsEnabled = true,
  onSmoothIterationsChange,
  onSmoothIterationsEnabledChange,
  contourOffset = 0,
  contourOffsetEnabled = false,
  onContourOffsetChange,
  onContourOffsetEnabledChange,
  feather = 0,
  featherEnabled = false,
  onFeatherChange,
  onFeatherEnabledChange,
}: PersonaSettings_Vector__Props) {
  return (
    <>
      <div className="flex flex-col justify-between h-full">
        {/* thresholdValue slider */}
        <Slider
          label="Trace Threshold"
          title="Adjust tracing binarization threshold"
          min={1}
          max={254}
          step={1}
          value={thresholdValue}
          onChange={(val) => onThresholdValueChange?.(val)}
          hasCheckbox={true}
          checkboxChecked={thresholdValueEnabled}
          onCheckboxChange={(checked) => onThresholdValueEnabledChange?.(checked)}
        />
        {/* traceMinBlobPixels slider */}
        <Slider
          label="Min Blob Pixels"
          title="Adjust tracing minimum blob pixels"
          min={0}
          max={2000}
          step={1}
          value={traceMinBlobPixels}
          onChange={(val) => onTraceMinBlobPixelsChange?.(val)}
          hasCheckbox={true}
          checkboxChecked={traceMinBlobPixelsEnabled}
          onCheckboxChange={(checked) => onTraceMinBlobPixelsEnabledChange?.(checked)}
        />
      </div>
      <div className="flex flex-col justify-between h-full">
        {/* simplifyEpsilon slider */}
        <Slider
          label="Simplify Epsilon"
          title="Adjust tracing simplification epsilon"
          min={0}
          max={10}
          step={0.1}
          value={simplifyEpsilon}
          onChange={(val) => onSimplifyEpsilonChange?.(val)}
          hasCheckbox={true}
          checkboxChecked={simplifyEpsilonEnabled}
          onCheckboxChange={(checked) => onSimplifyEpsilonEnabledChange?.(checked)}
        />
        {/* smoothIterations slider */}
        <Slider
          label="Smooth Iterations"
          title="Adjust tracing smooth iterations"
          min={0}
          max={5}
          step={1}
          value={smoothIterations}
          onChange={(val) => onSmoothIterationsChange?.(val)}
          hasCheckbox={true}
          checkboxChecked={smoothIterationsEnabled}
          onCheckboxChange={(checked) => onSmoothIterationsEnabledChange?.(checked)}
        />
      </div>
      <div className="flex flex-col justify-between h-full">
        {/* contourOffset slider */}
        <Slider
          label="Contour Offset"
          title="Expand (positive) or shrink (negative) the vector contour"
          min={-50}
          max={50}
          step={1}
          value={contourOffset}
          onChange={(val) => onContourOffsetChange?.(val)}
          hasCheckbox={true}
          checkboxChecked={contourOffsetEnabled}
          onCheckboxChange={(checked) => onContourOffsetEnabledChange?.(checked)}
        />
        {/* feather slider */}
        <Slider
          label="Edge Feather"
          title="Adjust mask edge blur/feather radius"
          min={0}
          max={20}
          step={0.5}
          value={feather}
          onChange={(val) => onFeatherChange?.(val)}
          hasCheckbox={true}
          checkboxChecked={featherEnabled}
          onCheckboxChange={(checked) => onFeatherEnabledChange?.(checked)}
        />
      </div>
    </>
  );
}