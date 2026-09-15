import React, { useState, useEffect } from "react";
import { Play } from "lucide-react"; // adjust import path as needed
import { ImgData } from "../../types"; // adjust path
import Slider from "./Slider"; // adjust path

interface PersonaSettings_Object__Props {
  activeImage: ImgData | null;
  onDetectingObject: () => Promise<void> | void;
  isDetectingObject: boolean;
  isBatchProcessing?: boolean;
  maskOpacity: number;
  onMaskOpacityChange: (value: number) => void;
  imageOpacity: number;
  onImageOpacityChange?: (value: number) => void;
  onMaskVisibilityChange: (checked: boolean) => void;
  onImageVisibilityChange: (checked: boolean) => void;
  maskVisibility: boolean;
  imageVisibility: boolean;
}

export default function PersonaSettings_Object({
  activeImage,
  onDetectingObject,
  isDetectingObject = false,
  isBatchProcessing = false,
  maskOpacity = 0.5,
  onMaskOpacityChange,
  imageOpacity = 0.5,
  onImageOpacityChange,
  onMaskVisibilityChange,
  onImageVisibilityChange,
  maskVisibility,
  imageVisibility,
}: PersonaSettings_Object__Props) {
  const [elapsed, setElapsed] = useState(0);
  const [batchElapsed, setBatchElapsed] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isDetectingObject) {
      setElapsed(0); // reset when detection starts
      timer = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsed(0); // reset when detection stops
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isDetectingObject]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isBatchProcessing) {
      setBatchElapsed(0);
      timer = setInterval(() => {
        setBatchElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setBatchElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isBatchProcessing]);

  return (
    <>
      {/* Single image detection button */}
      <button
        type="button"
        onClick={() => {
          onDetectingObject?.();
        }}
        disabled={isDetectingObject || isBatchProcessing || !activeImage}
        className="h-full px-4 flex flex-col items-center justify-center gap-1.5 w-24 border border-[#2e2e2e] hover:border-blue-500/50 bg-[#191919] hover:bg-[#222222] text-gray-200 hover:text-white transition-all cursor-pointer shadow-xs disabled:opacity-80 disabled:pointer-events-none shrink-0"
        title="Detect mask for active image"
      >
        {isDetectingObject ? (
          <>
            <span className="text-lg animate-pulse duration-1000 font-mono">{elapsed}s</span>
          </>
        ) : (
          <>
            <Play className="h-6 w-6 shrink-0 fill-current text-blue-500" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap text-gray-300">Segment<br />Object</span>
          </>
        )}
      </button>


      {/* Sliders Container */}
      <div className="flex flex-col justify-between h-full">
        <Slider
          label="Mask Opacity"
          title="Adjust mask layer visibility"
          min={0}
          max={1}
          step={0.01}
          value={maskOpacity}
          onChange={(val) => onMaskOpacityChange?.(val)}
          hasCheckbox
          onCheckboxChange={onMaskVisibilityChange}
          checkboxChecked={maskVisibility}
        />
        <Slider
          label="Image Opacity"
          title="Adjust image layer visibility"
          min={0}
          max={1}
          step={0.01}
          value={imageOpacity}
          onChange={(val) => onImageOpacityChange?.(val)}
          hasCheckbox
          onCheckboxChange={onImageVisibilityChange}
          checkboxChecked={imageVisibility}
        />
      </div>
    </>
  );
}
