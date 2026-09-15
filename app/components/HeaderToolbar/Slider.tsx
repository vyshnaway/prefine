import React from "react";

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  title?: string;
  widthClass?: string;
  hasCheckbox?: boolean;
  checkboxChecked?: boolean;
  disabled?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
}

export default function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  title,
  widthClass = "w-40",
  hasCheckbox = false,
  checkboxChecked = false,
  disabled = false,
  onCheckboxChange,
}: SliderProps) {
  const isPercent = max <= 1.0;
  const isSliderDisabled = disabled || (hasCheckbox && !checkboxChecked);

  // Calculate percentage of value within min-max range
  const pct = ((value - min) / (max - min)) * 100;
  const fillColor = isSliderDisabled ? "#444444" : "#0096ff";
  const trackColor = isSliderDisabled ? "#161616" : "#2d2d2d";

  return (
    <div title={title} className="flex flex-col gap-2 select-none py-1">
      <style dangerouslySetInnerHTML={{__html: `
        input[type=range].custom-slider-input {
          -webkit-appearance: none;
          height: 3px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }
        
        /* Webkit Thumb */
        input[type=range].custom-slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 8px;
          width: 8px;
          border-radius: 9999px;
          background: #0096ff;
          border: 1px solid #111111;
          box-shadow: 0 1px 2px rgba(0,0,0,0.5);
          transition: transform 0.1s ease, background 0.1s ease;
        }
        
        input[type=range].custom-slider-input:hover::-webkit-slider-thumb {
          background: #ffffff;
          transform: scale(1.3);
        }
        
        input[type=range].custom-slider-input:active::-webkit-slider-thumb {
          background: #0096ff;
          transform: scale(1.4);
        }

        input[type=range].custom-slider-input:disabled::-webkit-slider-thumb {
          background: #444444;
          border-color: #222222;
          cursor: not-allowed;
          transform: none;
        }

        /* Firefox Thumb */
        input[type=range].custom-slider-input::-moz-range-thumb {
          height: 8px;
          width: 8px;
          border-radius: 9999px;
          background: #0096ff;
          border: 1px solid #111111;
          box-shadow: 0 1px 2px rgba(0,0,0,0.5);
          transition: transform 0.1s ease, background 0.1s ease;
        }
        
        input[type=range].custom-slider-input:hover::-moz-range-thumb {
          background: #ffffff;
          transform: scale(1.3);
        }
        
        input[type=range].custom-slider-input:active::-moz-range-thumb {
          background: #0096ff;
          transform: scale(1.4);
        }

        input[type=range].custom-slider-input:disabled::-moz-range-thumb {
          background: #444444;
          border-color: #222222;
          cursor: not-allowed;
          transform: none;
        }
      `}} />

      <div className="flex items-center justify-between text-[9px] font-bold leading-tight">
        <div className="flex items-center gap-1">
          {hasCheckbox && (
            <label className={`flex items-center shrink-0 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={checkboxChecked}
                onChange={(e) => onCheckboxChange?.(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-3 h-3 rounded-xs border transition-all flex items-center justify-center shrink-0 ${
                checkboxChecked
                  ? "bg-[#0096ff] border-[#0082e6] text-white"
                  : "bg-[#111111] border-[#353535] text-transparent hover:border-[#555]"
              }`}>
                {checkboxChecked && (
                  <svg className="w-2 h-2 stroke-current stroke-3" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
            </label>
          )}
          <span className="text-[#808080] select-none">{label}</span>
        </div>
        <div className={`flex items-center gap-0.5 px-1 py-0.5 h-4 transition-opacity text-[9px] ${
          isSliderDisabled ? "opacity-30 pointer-events-none" : ""
        }`}>
          <input
            type="number"
            disabled={isSliderDisabled}
            min={isPercent ? min * 100 : min}
            max={isPercent ? max * 100 : max}
            step={isPercent ? (step ? step * 100 : 5) : step || 1}
            value={isPercent ? Math.round(value * 100) : value}
            onChange={(e) => {
              let val = parseFloat(e.target.value);
              if (isNaN(val)) return;
              if (isPercent) {
                val = val / 100;
              }
              // Clamp to min/max
              val = Math.max(min, Math.min(max, val));
              onChange(val);
            }}
            className="bg-transparent text-gray-300 font-mono w-6 focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-gray-500 font-mono select-none">
            {isPercent ? "%" : ["Size", "Area", "WM Size", "WM", "Margin", "Width"].includes(label) ? "px" : ""}
          </span>
        </div>
      </div>
      <input
        type="range"
        disabled={isSliderDisabled}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`custom-slider-input transition-opacity ${widthClass} ${
          isSliderDisabled ? "opacity-30 pointer-events-none" : ""
        }`}
        style={{
          background: `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, ${trackColor} ${pct}%, ${trackColor} 100%)`
        }}
      />
    </div>
  );
}
