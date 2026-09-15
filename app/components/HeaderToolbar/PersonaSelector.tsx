import React, { useRef, useCallback, useEffect } from "react";
import { PERSONA, PersonaDefinition } from "../../types";
import UserProfileBadge from "./UserProfileBadge";

interface PersonaSelectorProps {
  activePersona: PERSONA;
  personaList: PersonaDefinition[];
  onPersonaChange: (persona: PERSONA) => void;
  onWidthMeasured?: (width: number) => void;
}

export default function PersonaSelector({
  activePersona,
  personaList,
  onPersonaChange,
  onWidthMeasured,
}: PersonaSelectorProps) {
  const tabRefs = useRef<Map<PERSONA, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamically measure actual DOM width of PersonaSelector and notify parent
  useEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && onWidthMeasured) {
          onWidthMeasured(Math.round(rect.width));
        }
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onWidthMeasured, personaList.length]);

  const handleKeyDownTablist = useCallback(
    (e: React.KeyboardEvent, currentPersona: PERSONA) => {
      const currentIndex = personaList.findIndex((p) => p.id === currentPersona);
      if (currentIndex === -1) return;

      let nextIndex = -1;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          nextIndex = (currentIndex + 1) % personaList.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          nextIndex = (currentIndex - 1 + personaList.length) % personaList.length;
          break;
        case "Home":
          e.preventDefault();
          nextIndex = 0;
          break;
        case "End":
          e.preventDefault();
          nextIndex = personaList.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex !== -1) {
        const nextPersona = personaList[nextIndex].id;
        onPersonaChange(nextPersona);
        tabRefs.current.get(nextPersona)?.focus();
      }
    },
    [personaList, onPersonaChange]
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-stretch bg-[#222222] border-r border-[#2b2b2b] overflow-visible select-none h-full shrink-0"
    >
      {/* User Profile Badge segment */}
      <div className="bg-[#080808] h-full flex items-center border-b border-[#2b2b2b] px-1 py-2">
        <UserProfileBadge />
      </div>

      {/* Buttons segment */}
      <nav
        role="tablist"
        aria-label="Canvas Workspace Persona Selector"
        className="flex items-stretch h-full divide-x divide-[#2b2b2b]"
      >
        {personaList.map((item) => {
          const Icon = item.icon;
          const isActive = activePersona === item.id;

          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) {
                  tabRefs.current.set(item.id, el);
                } else {
                  tabRefs.current.delete(item.id);
                }
              }}
              role="tab"
              type="button"
              id={`persona-tab-${item.id}`}
              aria-controls={`persona-panel-${item.id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onPersonaChange(item.id)}
              onKeyDown={(e) => handleKeyDownTablist(e, item.id)}
              className={`group relative h-full p-4 flex items-center justify-center transition-all cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white ${
                isActive
                  ? "bg-[#050505] text-white"
                  : "text-[#808080] hover:text-white hover:bg-[#202020]"
              }`}
              title={`${item.label} — ${item.description}`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  isActive ? "text-white" : "text-[#808080] group-hover:text-white"
                }`}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}