"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { CircleIcon, FastForward, Calendar, RefreshCw, TrendingUp, AlertTriangle, UserCheck, Clock } from "lucide-react";
import { ApiResponse_folder, GlobalMetaJson } from "@/app/types";
import { deriveTaskStatus } from "@/app/lib/task-status";
import { isDateWithinRange } from "@/app/lib/date-filter";

import { Server } from "lucide-react";
import { FastApiWorkerConfig } from "@/app/types";
import WorkerModal from "./WorkerModal";

interface PersonaSettings_AdminProps {
  folderData: ApiResponse_folder;
  onOpenAddUser?: () => void;
  onTriggerBatchAutomation?: () => Promise<void> | void;
  isBatchProcessing?: boolean;
  isDateFilterEnabled?: boolean;
  setIsDateFilterEnabled?: React.Dispatch<React.SetStateAction<boolean>>;
  includeNullDates?: boolean;
  setIncludeNullDates?: React.Dispatch<React.SetStateAction<boolean>>;
  startDate?: string;
  setStartDate?: (date: string) => void;
  endDate?: string;
  setEndDate?: (date: string) => void;
}

export default function PersonaSettings_Admin({
  folderData,
  onTriggerBatchAutomation,
  isBatchProcessing = false,
  isDateFilterEnabled: propIsDateFilterEnabled,
  setIsDateFilterEnabled: propSetIsDateFilterEnabled,
  includeNullDates: propIncludeNullDates,
  setIncludeNullDates: propSetIncludeNullDates,
  startDate: propStartDate,
  setStartDate: propSetStartDate,
  endDate: propEndDate,
  setEndDate: propSetEndDate,
}: PersonaSettings_AdminProps) {
  const [globalMeta, setGlobalMeta] = useState<GlobalMetaJson | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [workers, setWorkers] = useState<FastApiWorkerConfig[]>([]);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState(false);

  // Fetch latest global .index.json metrics
  const [isRebuildingMeta, setIsRebuildingMeta] = useState(false);

  const loadGlobalMeta = async () => {
    try {
      const res = await fetch("/api/reindex");
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data?.meta) {
          setGlobalMeta(data.meta);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch /api/reindex:", err);
    }
  };

  const handleRebuildMeta = async () => {
    setIsRebuildingMeta(true);
    try {
      const res = await fetch("/api/reindex", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data?.meta) {
          setGlobalMeta(data.meta);
        }
      }
    } catch (err) {
      console.error("Failed to rebuild /api/reindex:", err);
    } finally {
      setIsRebuildingMeta(false);
    }
  };

  useEffect(() => {
    loadGlobalMeta();
  }, [folderData, isBatchProcessing]);

  // Date Range Filter State (use props if passed, otherwise local fallback)
  const [localIsDateFilterEnabled, setLocalIsDateFilterEnabled] = useState(true);
  const [localIncludeNullDates, setLocalIncludeNullDates] = useState(true);
  const [localStartDate, setLocalStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [localEndDate, setLocalEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const isDateFilterEnabled = propIsDateFilterEnabled ?? localIsDateFilterEnabled;
  const setIsDateFilterEnabled = propSetIsDateFilterEnabled ?? setLocalIsDateFilterEnabled;
  const includeNullDates = propIncludeNullDates ?? localIncludeNullDates;
  const setIncludeNullDates = propSetIncludeNullDates ?? setLocalIncludeNullDates;
  const startDate = propStartDate ?? localStartDate;
  const setStartDate = propSetStartDate ?? setLocalStartDate;
  const endDate = propEndDate ?? localEndDate;
  const setEndDate = propSetEndDate ?? setLocalEndDate;

  const setDatePreset = (preset: "7d" | "14d" | "30d") => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    if (preset === "7d") {
      const past7 = new Date();
      past7.setDate(past7.getDate() - 7);
      setStartDate(past7.toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else if (preset === "14d") {
      const past14 = new Date();
      past14.setDate(past14.getDate() - 14);
      setStartDate(past14.toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else if (preset === "30d") {
      const past30 = new Date();
      past30.setDate(past30.getDate() - 30);
      setStartDate(past30.toISOString().split("T")[0]);
      setEndDate(todayStr);
    }
  };

  // Source of truth for Admin metrics: Accumulated .index.json (globalMeta), falling back to current folder metafiles
  const sourceMetafiles = globalMeta?.metafiles || folderData?.metafiles || {};

  const {
    totalCount,
    unassignedCount,
    assignedCount,
    progressingCount,
    commentedCount,
    completedCount,
    completedPercent,
  } = useMemo(() => {
    let entries = Object.entries(sourceMetafiles);

    // Apply Date Range Filter if enabled (using exportedAt timestamp, falling back to updatedAt / createdAt)
    if (isDateFilterEnabled) {
      entries = entries.filter(([_, m]) => {
        const itemDateStr = m.exportedAt || m.updatedAt || m.createdAt;
        return isDateWithinRange(itemDateStr, startDate, endDate, includeNullDates);
      });
    }

    let unassigned = 0;
    let assigned = 0;
    let progressing = 0;
    let commented = 0;
    let completed = 0;

    for (let i = 0; i < entries.length; i++) {
      const status = deriveTaskStatus(entries[i][1]);
      if (status === "completed") completed++;
      else if (status === "commented") commented++;
      else if (status === "progressing") progressing++;
      else if (status === "assigned") assigned++;
      else unassigned++;
    }

    const total = entries.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      totalCount: total,
      unassignedCount: unassigned,
      assignedCount: assigned,
      progressingCount: progressing,
      commentedCount: commented,
      completedCount: completed,
      completedPercent: percent,
    };
  }, [sourceMetafiles, isDateFilterEnabled, includeNullDates, startDate, endDate]);



  const loadWorkers = async () => {
    setIsLoadingWorkers(true);
    try {
      const res = await fetch("/api/workers");
      const data = await res.json();
      if (data.ok && Array.isArray(data.workers)) {
        setWorkers(data.workers);
      }
    } catch (err) {
      console.error("Failed to load workers:", err);
    } finally {
      setIsLoadingWorkers(false);
    }
  };

  useEffect(() => {
    loadWorkers();
    const interval = setInterval(loadWorkers, 120000);
    return () => clearInterval(interval);
  }, []);

  const handleAddWorker = async (name: string, url: string) => {
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, enabled: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `HTTP error ${res.status}`);
      }
      if (Array.isArray(data.workers)) {
        setWorkers(data.workers);
      }
    } catch (err) {
      console.error("Failed to add worker:", err);
      throw err;
    }
  };

  const handleToggleWorker = async (worker: FastApiWorkerConfig) => {
    try {
      const updated = !worker.enabled;
      setWorkers((prev) =>
        prev.map((w) => (w.id === worker.id ? { ...w, enabled: updated } : w))
      );
      const res = await fetch("/api/workers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: worker.id, enabled: updated }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.workers)) {
        setWorkers(data.workers);
      }
    } catch (err) {
      console.error("Failed to toggle worker:", err);
    }
  };

  const handleDeleteWorker = async (workerId: string) => {
    try {
      setWorkers((prev) => prev.filter((w) => w.id !== workerId));
      const res = await fetch(`/api/workers?id=${encodeURIComponent(workerId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.workers)) {
        setWorkers(data.workers);
      }
    } catch (err) {
      console.error("Failed to delete worker:", err);
    }
  };

  const activeWorkersCount = useMemo(
    () => workers.filter((w) => w.enabled && w.id !== "local_default").length,
    [workers]
  );

  const hasUnhealthyWorkers = useMemo(
    () => workers.some((w) => w.enabled && w.id !== "local_default" && w.status !== "online"),
    [workers]
  );
  return (
    <>
      <div className="flex gap-2">
        {/* 1. Detached FastAPI Workers Config Control */}
        <button
          type="button"
          onClick={() => {
            loadWorkers();
            setIsWorkerModalOpen(true);
          }}
          className={`h-full px-2 flex flex-col items-center justify-center gap-1.5 w-20 border ${hasUnhealthyWorkers
            ? "border-rose-500/60 hover:border-rose-400 bg-[#1e1414] hover:bg-[#251818]"
            : "border-[#2e2e2e] hover:border-yellow-200/60 bg-[#191919] hover:bg-[#222222]"
            } text-gray-200 hover:text-white transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:pointer-events-none shrink-0 relative group`}
          title={hasUnhealthyWorkers ? "One or more active workers are unreachable / unhealthy" : "Configure FastAPI Worker Endpoints"}
        >
          <div className="relative inline-flex">
            <Server
              className={`h-5 w-5 ${hasUnhealthyWorkers ? "text-rose-400" : "text-yellow-200"
                } group-hover:scale-105 transition-transform`}
            />

            {activeWorkersCount > 0 && (
              <span
                className={`absolute -top-1 -right-1 ${hasUnhealthyWorkers ? "bg-rose-500" : "bg-yellow-200"
                  } text-white text-[10px] font-bold rounded outline-[#161616] outline-2 flex items-center justify-center w-3 h-3`}
              >
                {hasUnhealthyWorkers && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                )}
                <span className="relative text-[#1e1414] font-bold">{activeWorkersCount}</span>
              </span>
            )}
          </div>

          <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-gray-300 text-center leading-tight">
            Workers<br />Status
          </span>
        </button>

        {/* 2. Trigger Batch Ingestion Automation Button */}
        {onTriggerBatchAutomation && (
          <button
            type="button"
            onClick={() => onTriggerBatchAutomation()}
            disabled={isBatchProcessing}
            className="h-full px-2 flex flex-col items-center justify-center gap-1.5 w-20 border border-[#2e2e2e] hover:border-emerald-500/50 bg-[#191919] hover:bg-[#222222] text-gray-200 hover:text-white transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:pointer-events-none shrink-0"
            title="Trigger batch background segmentation for STORAGE_PATH"
          >
            {isBatchProcessing ? (
              <>
                <CircleIcon className="h-6 w-6 text-emerald-400/90 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300 font-mono">Ingestion<br />Progress</span>
              </>
            ) : (
              <>
                <FastForward className="h-6 w-6 text-emerald-400/90" />
                <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-gray-300">Trigger<br />Ingestion</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex flex-col h-full border border-[#2e2e2e] flex-1">
        {/* Detailed Status Metrics Grid */}
        <div className="grid grid-cols-4 border-b border-[#2b2b2b] w-full">
          {[
            {
              label: "Unassigned",
              count: unassignedCount,
              textColor: "text-gray-100",
              labelColor: "text-gray-400",
              icon: <Clock className="h-3 w-3 text-gray-500 shrink-0" />,
            },
            {
              label: "Assigned",
              count: assignedCount,
              textColor: "text-gray-100",
              labelColor: "text-gray-400",
              icon: <UserCheck className="h-3 w-3 text-gray-400 shrink-0" />,
            },
            {
              label: "Progress",
              count: progressingCount,
              textColor: "text-gray-100",
              labelColor: "text-gray-400",
              icon: <div className="h-3 w-3 rounded-full bg-gray-400 shrink-0" />,
            },
            {
              label: "Comment",
              count: commentedCount,
              textColor: "text-gray-100",
              labelColor: "text-gray-400",
              icon: <AlertTriangle className="h-3 w-3 text-gray-400 shrink-0" />,
            },
          ].map((item, idx) => (
            <div
              key={item.label}
              className={`flex items-center gap-2 bg-[#191919] hover:bg-[#202020] px-3.5 py-2.5 h-full transition-colors ${idx !== 5 ? "border-r border-[#262626]" : ""
                }`}
            >
              {item.icon}
              <div className="text-[10px] flex items-center gap-2 justify-between w-full min-w-0">
                <span className={`font-medium uppercase tracking-wider ${item.labelColor} leading-none truncate`}>
                  {item.label}
                </span>
                <span className={`${item.textColor} font-bold leading-none shrink-0`}>
                  {item.count}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Primary Batch Completion Meter */}
        <div className="flex">
          <div className="flex items-center gap-4 bg-[#191919] px-4 py-2 flex-1 min-w-0 w-full shadow-xs">
            <div className="flex flex-col flex-1 gap-1.5 min-w-0 justify-center">
              <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider">
                <span className="text-gray-400 flex items-center gap-1.5 truncate">
                  <TrendingUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  {isDateFilterEnabled ? "Filtered Progress" : "Global Progress"}
                </span>
                <span className="text-gray-200 font-mono text-xs font-semibold shrink-0">{completedPercent}%</span>
              </div>
              {/* Progress Bar Track */}
              <div className="w-full h-1.5 bg-[#121212] rounded-full overflow-hidden flex border border-[#262626]">
                <div
                  style={{ width: `${completedPercent}%` }}
                  className="bg-emerald-400/90 h-full transition-all duration-500 rounded-full"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 border-l border-[#262626] pl-4 shrink-0">
              <div className="flex flex-col items-end justify-center">
                <span className="text-sm font-bold text-gray-200 font-mono leading-none">
                  {completedCount}<span className="text-xs text-gray-500">/{totalCount}</span>
                </span>
                <span className="text-[9px] font-medium uppercase tracking-wider text-gray-400 mt-1 leading-none">
                  Completed
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRebuildMeta}
            disabled={isRebuildingMeta}
            className="py-2.5 px-3 hover:bg-[#282828] border-l border-[#262626] text-gray-300 hover:text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Reindex & Rebuild metrics"
          >
            <RefreshCw className={`h-5 w-5 text-[#d3d3d3] ${isRebuildingMeta ? "animate-spin" : ""}`} />
          </button>

        </div>
      </div>

      {/* Date Range Filter Selector (Clean 2-row layout) */}
      <div
        className={`flex flex-col justify-between h-full border px-3 py-2 transition-all shrink-0 self-stretch min-w-32 ${isDateFilterEnabled
          ? "bg-[#191919] border-[#383838] shadow-xs"
          : "bg-[#161616] border-[#262626] opacity-60 hover:opacity-100"
          }`}
      >
        {/* Top Row: Date Range Toggle Header + Preset Buttons */}
        <div className="flex items-center justify-between gap-2 border-b border-[#262626] pb-1.5">
          <div
            onClick={() => setIsDateFilterEnabled((prev) => !prev)}
            className="flex items-center gap-2 cursor-pointer select-none group"
            title={isDateFilterEnabled ? "Click to disable Date Filter" : "Click to enable Date Filter"}
          >
            <Calendar className={`h-3.5 w-3.5 transition-colors color ${isDateFilterEnabled ? "text-gray-200" : "text-gray-500 group-hover:text-gray-400"}`} />
            <span className="text-[9px] font-medium uppercase tracking-wider text-gray-400 group-hover:text-gray-300 transition-colors">
              Range
            </span>
            {/* Switch slider */}
            <div
              className={`w-6 h-3.5 flex items-center rounded-full p-0.5 transition-colors duration-200 ${isDateFilterEnabled ? "bg-gray-300" : "bg-[#2c2c2c] group-hover:bg-[#383838]"
                }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full shadow-md transform transition-transform duration-200 ${isDateFilterEnabled ? "translate-x-2.5 bg-[#161616]" : "translate-x-0 bg-gray-400"
                  }`}
              />
            </div>
          </div>

          {/* Quick Range Presets (7D, 14D) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!isDateFilterEnabled}
              onClick={() => setDatePreset("7d")}
              className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#252525] border border-[#2e2e2e] hover:border-gray-500 rounded text-[8px] font-bold text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              7D
            </button>
            <button
              type="button"
              disabled={!isDateFilterEnabled}
              onClick={() => setDatePreset("14d")}
              className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#252525] border border-[#2e2e2e] hover:border-gray-500 rounded text-[8px] font-bold text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              14D
            </button>
            <button
              type="button"
              disabled={!isDateFilterEnabled}
              onClick={() => setDatePreset("30d")}
              className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#252525] border border-[#2e2e2e] hover:border-gray-500 rounded text-[8px] font-bold text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              30D
            </button>
          </div>
        </div>

        {/* Bottom Row: Start Date & End Date Inputs + Include Unset / Null Date Toggle */}
        <div
          className={`flex items-center gap-1.5 transition-opacity ${!isDateFilterEnabled ? "opacity-40 pointer-events-none" : ""
            }`}
        >
          <div className="flex-1 min-w-0">
            <input
              type="date"
              disabled={!isDateFilterEnabled}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#111] border border-[#333] hover:border-[#444] focus:border-gray-400 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none font-mono transition-colors disabled:opacity-50 text-center color-scheme-dark [color-scheme:dark]"
              title="Start Date"
            />
          </div>
          <span className="text-gray-500 text-[10px] font-mono select-none">-</span>
          <div className="flex-1 min-w-0">
            <input
              type="date"
              disabled={!isDateFilterEnabled}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#111] border border-[#333] hover:border-[#444] focus:border-gray-400 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none font-mono transition-colors disabled:opacity-50 text-center color-scheme-dark [color-scheme:dark]"
              title="End Date"
            />
          </div>
          <button
            type="button"
            disabled={!isDateFilterEnabled}
            onClick={() => setIncludeNullDates((prev) => !prev)}
            className={`px-1.5 py-0.5 border rounded text-[8px] font-bold font-mono transition-colors cursor-pointer disabled:opacity-40 shrink-0 ${
              includeNullDates
                ? "bg-[#232323] text-gray-200 border-gray-500"
                : "bg-[#121212] text-gray-600 border-[#2b2b2b] hover:text-gray-400"
            }`}
            title={includeNullDates ? "Items with unset / null dates are INCLUDED in progress & counts" : "Items with unset / null dates are EXCLUDED"}
          >
            +UNSET
          </button>
        </div>
      </div>

      {/* Worker Health Modal Portal */}
      {isMounted && isWorkerModalOpen && createPortal(
        <WorkerModal
          isOpen={isWorkerModalOpen}
          onClose={() => setIsWorkerModalOpen(false)}
          workers={workers}
          onAddWorker={handleAddWorker}
          onToggleWorker={handleToggleWorker}
          onDeleteWorker={handleDeleteWorker}
          onRefresh={loadWorkers}
          isRefreshing={isLoadingWorkers}
        />,
        document.body
      )}
    </>
  );
}
