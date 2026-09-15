import React, { useRef, useState, useEffect } from "react";
import { MetaFile } from "../types";

interface InspectorProps {
  fileName: string,
  fileMetadata: MetaFile;
  onUpdateMetadata: (issues: string[], comment: string) => void;
  inspectorWidth: number;
  onWidthChange: (width: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
  defaultIssueTags: string[];
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes === 0) return "Not Final yet";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Inspector({
  fileName,
  fileMetadata,
  onUpdateMetadata,
  inspectorWidth,
  onWidthChange: onInspectorWidthChange,
  isCollapsed: propIsCollapsed,
  onToggleCollapse,
  defaultIssueTags,
}: InspectorProps) {
  const [issues, setIssues] = useState<string[]>([]);
  const [comment, setComment] = useState<string>("");
  const [localInspectorWidth, setLocalInspectorWidth] = useState<number>(335);
  const resolvedInspectorWidth = inspectorWidth ?? localInspectorWidth;
  const setInspectorWidth = onInspectorWidthChange ?? setLocalInspectorWidth;
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [localIsCollapsed, setLocalIsCollapsed] = useState<boolean>(false);
  const isInspectorCollapsed = propIsCollapsed ?? localIsCollapsed;
  const setIsInspectorCollapsed = onToggleCollapse ?? setLocalIsCollapsed;

  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(335);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartTimeRef = useRef<number>(0);

  const handleWidthResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = resolvedInspectorWidth;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragStartTimeRef.current = Date.now();
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = e.clientX - startXRef.current;
      const nextWidth = Math.max(220, Math.min(450, startWidthRef.current - deltaX));
      setInspectorWidth(nextWidth);
    };

    const stopResizing = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isResizing) return;
      stopResizing();

      const deltaX = Math.abs(e.clientX - dragStartPosRef.current.x);
      const deltaY = Math.abs(e.clientY - dragStartPosRef.current.y);
      const elapsedTime = Date.now() - dragStartTimeRef.current;

      if (deltaX < 4 && deltaY < 4 && elapsedTime < 300) {
        setIsInspectorCollapsed(true);
      }
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setIsInspectorCollapsed, setInspectorWidth]);

  const lastSavedCommentRef = useRef<string>("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fileMetadata) {
      setIssues(fileMetadata.issues || []);
      setComment(fileMetadata.comment || "");
      lastSavedCommentRef.current = fileMetadata.comment || "";
    } else {
      setIssues([]);
      setComment("");
      lastSavedCommentRef.current = "";
    }

    // Selecting a new file mid-debounce should not fire a save for the
    // previous file's stale timer.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [fileName, fileMetadata.issues, fileMetadata.comment]);

  // Debounced autosave: 1s after the comment stops changing, persist it —
  // but only if it actually differs from what's already saved.
  useEffect(() => {
    if (comment === lastSavedCommentRef.current) return;
    if (!fileMetadata || !onUpdateMetadata) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onUpdateMetadata(issues, comment);
      lastSavedCommentRef.current = comment;
      debounceTimerRef.current = null;
    }, 1000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment]);

  // Clean up any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || issues.includes(trimmed)) return;
    const nextIssues = [...issues, trimmed];
    setIssues(nextIssues);
    if (fileMetadata && onUpdateMetadata) {
      onUpdateMetadata(nextIssues, comment);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const nextIssues = issues.filter((t) => t !== tagToRemove);
    setIssues(nextIssues);
    if (fileMetadata && onUpdateMetadata) {
      onUpdateMetadata(nextIssues, comment);
    }
  };

  const handleCommentBlur = () => {
    // Immediate save on blur/manual save button — also cancels any
    // pending debounce so we don't double-fire a moment later.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (fileMetadata && onUpdateMetadata) {
      onUpdateMetadata(issues, comment);
      lastSavedCommentRef.current = comment;
    }
  };

  return (
    <>
      {isInspectorCollapsed ? (
        <div
          onClick={() => setIsInspectorCollapsed(false)}
          className="w-3 h-full bg-[#1b1b1b] hover:bg-[#252525] border-l border-[#2d2d2d] cursor-pointer flex items-center justify-center transition-colors group/expand shrink-0 self-stretch"
          title="Click to expand inspector"
        >
          <div
            className={`w-1 h-24 rounded-full transition-colors ${issues.length > 0 ? "bg-amber-500" : "bg-[#3a3a3a] group-hover/expand:bg-[#0096ff]"
              }`}
          />
        </div>
      ) : (
        <aside
          className="relative flex flex-col h-full bg-[#1c1c1c] border-l border-[#2d2d2d] overflow-hidden select-none text-[#e0e0e0] shrink-0"
          style={{ width: `${resolvedInspectorWidth}px` }}
        >
          {/* Width Resize Handle */}
          <div
            onMouseDown={handleWidthResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={resolvedInspectorWidth}
            aria-valuemin={240}
            aria-valuemax={450}
            tabIndex={0}
            className={`absolute top-0 left-0 bottom-0 w-1 hover:bg-gray-600/30 cursor-ew-resize flex items-center justify-center z-30 transition-colors group/resize ${isResizing ? "bg-[#0096ff]/80" : "bg-transparent hover:bg-gray-600/20"
              }`}
            title="Drag to resize inspector width"
          />

          {/* Collapse Tab — right edge, doubles as status indicator */}
          <button
            type="button"
            onClick={() => setIsInspectorCollapsed(true)}
            title="Collapse inspector"
            className="absolute top-0 right-0 bottom-0 w-3 hover:bg-[#252525]/50 cursor-pointer flex items-center justify-center transition-colors group/expand z-30"
          >
            <div
              className={`h-24 w-1 rounded-full transition-colors ${issues.length > 0 ? "bg-red-500" : "bg-[#3a3a3a] group-hover/expand:bg-[#0096ff]"
                }`}
            />
          </button>

          {/* Header */}
          <div className="py-2 px-4 border-b border-[#2d2d2d] flex items-center justify-between bg-[#1c1c1c] w-full">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Inspector</span>
          </div>

          {/* Inspector Content container */}
          <div className="flex-1 flex flex-col min-h-0 w-full bg-[#161616]">
            {/* Scrollable Contents */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[#141414] custom-scrollbar">
              {/* File Sizes Section */}
              {/* Comments Section */}
              <div className="flex-1 flex flex-col gap-2.5 min-h-30">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onBlur={handleCommentBlur}
                  placeholder="Describe issues, notes, or instructions..."
                  className="flex-1 w-full bg-[#111111] border border-[#2b2b2b] text-xs rounded p-2.5 focus:outline-none placeholder-gray-500 resize-none font-sans leading-relaxed"
                />
              </div>

              <div className="h-px bg-[#2d2d2d] shrink-0" />

              {/* Issues Tracker Section */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-300">Flag Issues</span>
                  <span className="text-[10px] text-red-300 font-mono">
                    {issues.length > 0 ? `${issues.length} active` : "no issues"}
                  </span>
                </div>

                {/* Unified Tags Area */}
                <div className="grid grid-cols-2 gap-1.5">
                  {Array.from(new Set([...defaultIssueTags, ...issues])).map((tag) => {
                    const isAdded = issues.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => (isAdded ? handleRemoveTag(tag) : handleAddTag(tag))}
                        className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer border text-center ${isAdded
                          ? "bg-red-500/20 border-red-500 text-red-300 hover:bg-amber-500/30"
                          : "bg-[#252525] border-[#333] text-gray-400 hover:text-white hover:border-gray-600"
                          }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-[#2d2d2d] shrink-0" />

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-gray-300">File Sizes</span>
                <div className="flex flex-col gap-2 bg-[#181818] p-2.5 rounded border border-[#2b2b2b]">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-400">Raw Base:</span>
                    <span className="font-mono text-gray-200">{formatBytes(fileMetadata?.filesizes?.raw ?? fileMetadata?.sizeRaw)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-400">Final PNG:</span>
                    <span className="font-mono text-gray-200">{formatBytes(fileMetadata?.filesizes?.png ?? fileMetadata?.sizePng)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-400">Final JPEG:</span>
                    <span className="font-mono text-gray-200">{formatBytes(fileMetadata?.filesizes?.jpeg ?? fileMetadata?.sizeJpeg)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-400">Final WebP:</span>
                    <span className="font-mono text-gray-200">{formatBytes(fileMetadata?.filesizes?.webp ?? fileMetadata?.sizeWebp)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
