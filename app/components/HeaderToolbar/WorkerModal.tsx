import React, { useState } from "react";
import { FastApiWorkerConfig } from "@/app/types";
import { Server, RefreshCw, CheckCircle2, XCircle, Activity, Plus, Trash2, Power } from "lucide-react";

interface WorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: FastApiWorkerConfig[];
  onAddWorker?: (name: string, url: string) => Promise<void>;
  onToggleWorker?: (worker: FastApiWorkerConfig) => Promise<void>;
  onDeleteWorker?: (id: string) => Promise<void>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function WorkerModal({
  isOpen,
  onClose,
  workers,
  onAddWorker,
  onToggleWorker,
  onDeleteWorker,
  onRefresh,
  isRefreshing = false,
}: WorkerModalProps) {
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerUrl, setNewWorkerUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const onlineWorkersCount = workers.filter((w) => w.status === "online").length;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!newWorkerName.trim() || !newWorkerUrl.trim() || !onAddWorker) return;

    setIsSubmitting(true);
    try {
      await onAddWorker(newWorkerName.trim(), newWorkerUrl.trim());
      setNewWorkerName("");
      setNewWorkerUrl("");
    } catch (err: any) {
      console.error("Failed to add worker:", err);
      setErrorMessage(err?.message || "Failed to add worker. Please check the endpoint URL.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-[#181818] border border-[#333] rounded-lg w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#262626] flex items-center justify-between shrink-0 bg-[#151515]">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-yellow-200" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              FastAPI Processing Workers
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs cursor-pointer p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          {/* Cluster Summary Header */}
          <div className="flex items-center justify-between bg-[#131313] p-3 rounded border border-[#262626]">
            <div className="flex items-center gap-2.5">
              <Activity className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="text-xs font-bold text-white font-mono">
                  {onlineWorkersCount} / {workers.length} Workers Active
                </div>
                <div className="text-[10px] text-gray-500">
                  Automated distributed task scheduling & segmentation
                </div>
              </div>
            </div>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="px-2.5 py-1 text-[11px] font-mono bg-[#222] hover:bg-[#2c2c2c] text-gray-300 border border-[#3a3a3a] rounded flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Checking..." : "Refresh"}
              </button>
            )}
          </div>

          {/* Add Worker Form - Always Present */}
          {onAddWorker && (
            <form
              onSubmit={handleFormSubmit}
              className="flex flex-col gap-3 bg-[#111] p-3.5 border border-[#2e2e2e] rounded"
            >
              <div className="flex items-center gap-1.5 text-gray-300">
                <Plus className="h-3.5 w-3.5 text-yellow-200" />
                <span className="text-[10px] font-bold uppercase tracking-wider font-mono">
                  Add New Worker Endpoint
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 font-mono">
                    Worker Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    placeholder="GPU Worker 1"
                    className="w-full bg-[#181818] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-yellow-200/60 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 font-mono">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    required
                    value={newWorkerUrl}
                    onChange={(e) => setNewWorkerUrl(e.target.value)}
                    placeholder="http://192.168.1.50:5678"
                    className="w-full bg-[#181818] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-yellow-200/60 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end items-center gap-3 pt-1">
                {errorMessage && (
                  <span className="text-[11px] text-rose-400 font-mono flex-1 truncate">
                    {errorMessage}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting || !newWorkerName.trim() || !newWorkerUrl.trim()}
                  className="px-3.5 py-1.5 bg-yellow-200/90 hover:bg-yellow-200 text-[#141414] text-xs font-bold font-mono rounded transition-colors cursor-pointer disabled:opacity-40"
                >
                  {isSubmitting ? "Adding..." : "Add Worker"}
                </button>
              </div>
            </form>
          )}

          {/* Configured Workers List */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Discovered Worker Nodes ({workers.length})
            </span>

            {workers.map((worker) => {
              const isOnline = worker.status === "online";
              const isLocal = worker.id === "local_default";

              return (
                <div
                  key={worker.id}
                  className={`p-3 rounded border flex items-center justify-between transition-all ${
                    isOnline
                      ? "bg-[#141814] border-emerald-900/40 hover:border-emerald-800/60"
                      : "bg-[#181414] border-rose-900/40 hover:border-rose-800/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative" title={isOnline ? "Worker Online" : "Worker Offline"}>
                      {isOnline ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono">{worker.name}</span>
                        {isLocal && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-yellow-950/50 border border-yellow-800/40 text-yellow-300 font-mono">
                            PRIMARY LOCAL
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-gray-400 truncate max-w-[280px]">
                        {worker.url}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Toggle worker enabled state */}
                    {!isLocal && onToggleWorker && (
                      <button
                        type="button"
                        onClick={() => onToggleWorker(worker)}
                        className={`p-1.5 rounded cursor-pointer transition-colors ${
                          worker.enabled
                            ? "text-emerald-400 hover:bg-emerald-950/50"
                            : "text-gray-500 hover:bg-gray-800"
                        }`}
                        title={worker.enabled ? "Disable Worker" : "Enable Worker"}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Delete worker */}
                    {!isLocal && onDeleteWorker && (
                      <button
                        type="button"
                        onClick={() => onDeleteWorker(worker.id)}
                        className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-950/30 rounded cursor-pointer transition-colors"
                        title="Delete Worker"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#262626] bg-[#151515] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-[#2a2a2a] hover:bg-[#353535] text-white rounded cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
