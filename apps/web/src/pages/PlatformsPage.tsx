import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  Activity,
  Layers,
  Power,
  RotateCcw,
  ZapOff,
} from "lucide-react";
import { apiClient } from "../services/apiClient.js";
import { PlatformHealthStatus, PLATFORM_METADATA, PlatformId } from "@groqai/shared";

export const PlatformsPage: React.FC = () => {
  const [platforms, setPlatforms] = useState<PlatformHealthStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    apiClient.getPlatforms().then((data) => {
      setPlatforms(data);
      setLoading(false);
    });

    const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";
    if (API_BASE_URL) {
      fetch(`${API_BASE_URL}/api/connectors/health`)
        .then((res) => res.json())
        .then((h) => setHealthData(h))
        .catch(() => {});
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleKillSwitch = async (platformId: PlatformId, currentlyEnabled: boolean) => {
    const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";
    if (!API_BASE_URL) return;

    try {
      if (currentlyEnabled) {
        // Activate kill switch
        await fetch(`${API_BASE_URL}/api/admin/platforms/${platformId}/kill-switch`, {
          method: "POST",
        });
        setActionMessage(`Kill switch ACTIVATED for ${PLATFORM_METADATA[platformId].name}. Connector disabled.`);
      } else {
        // Deactivate kill switch
        await fetch(`${API_BASE_URL}/api/admin/platforms/${platformId}/kill-switch`, {
          method: "DELETE",
        });
        setActionMessage(`Connector for ${PLATFORM_METADATA[platformId].name} re-enabled.`);
      }
      loadData();
    } catch (err: any) {
      setActionMessage(`Action failed: ${err.message}`);
    }
  };

  const changeMode = async (platformId: PlatformId, newMode: string) => {
    const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";
    if (!API_BASE_URL) return;

    try {
      await fetch(`${API_BASE_URL}/api/admin/platforms/${platformId}/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      setActionMessage(`Mode for ${PLATFORM_METADATA[platformId].name} updated to ${newMode.toUpperCase()}`);
      loadData();
    } catch (err: any) {
      setActionMessage(`Mode change failed: ${err.message}`);
    }
  };

  const hasDisabledPlatform = platforms.some((p) => !p.enabled || p.status === "disabled");

  return (
    <div className="max-w-container mx-auto px-4 py-8">
      {/* Degraded Mode Global Alert if any platform connector is killed or failing */}
      {hasDisabledPlatform && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3 shadow-sm">
          <ZapOff className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm text-red-800">Degraded Connector Operating State</h4>
            <p className="text-xs text-red-700 mt-0.5">
              One or more platform connectors are currently deactivated via emergency kill switch. GroqAI continues optimizing baskets from remaining healthy platforms with explicit coverage warnings.
            </p>
          </div>
        </div>
      )}

      {/* Action Notification Message */}
      {actionMessage && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold text-emerald-600 hover:text-emerald-900">
            ×
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green-light text-brand-green text-xs font-bold mb-2">
          <Activity className="w-3.5 h-3.5" />
          <span>Real-time Connector Health & Capability Matrix</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-brand-navy">
          Platform Connectors & Governance
        </h1>
        <p className="text-xs md:text-sm text-brand-grey mt-1">
          GroqAI enforces honest capabilities. Connectors report true capabilities without simulating unauthorized cart actions.
        </p>
      </div>

      {loading ? (
        <div className="p-16 text-center text-sm text-gray-400">Loading platform health status...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {platforms.map((plat) => {
            const meta = PLATFORM_METADATA[plat.id];
            const isKillSwitchActive = !plat.enabled || plat.status === "disabled";

            return (
              <div
                key={plat.id}
                className={`bg-white rounded-2xl border p-6 shadow-sm flex flex-col justify-between transition-all ${
                  isKillSwitchActive ? "border-red-200 bg-red-50/20" : "border-brand-border"
                }`}
              >
                <div>
                  {/* Platform Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: meta.brandColor }}
                      />
                      <div>
                        <h3 className="font-bold text-brand-navy text-base">{plat.name}</h3>
                        <span className="text-[11px] text-gray-400 font-mono">
                          ID: {plat.id} • Mode: <span className="font-bold text-gray-700">{plat.mode.toUpperCase()}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isKillSwitchActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-800 bg-red-100 px-2.5 py-1 rounded-full border border-red-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          <span>Disabled (Killed)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
                          <span>Healthy</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Capabilities Checklist */}
                  <div className="mt-5 space-y-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                      Verified Capabilities:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.searchProducts && !isKillSwitchActive ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span className="font-semibold text-brand-navy">Search Products</span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.getPrices && !isKillSwitchActive ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span className="font-semibold text-brand-navy">Read Prices</span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.getAvailability && !isKillSwitchActive ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span className="font-semibold text-brand-navy">Stock Availability</span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.getFees && !isKillSwitchActive ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span className="font-semibold text-brand-navy">Delivery Fees</span>
                      </div>

                      {/* createCart is FALSE across all */}
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50/50 border border-red-100">
                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        <span className="font-semibold text-red-900">
                          Create Cart (Unsupported)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.supportsDeepLinks ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                        <span className="font-semibold text-gray-600">Deep Links</span>
                      </div>
                    </div>
                  </div>

                  {/* Fallback Hierarchy & Notes */}
                  <div className="mt-5 p-3.5 bg-gray-50 rounded-xl text-xs space-y-1.5 border border-gray-100">
                    <span className="font-bold text-brand-navy block text-[11px]">
                      Fallback Resolution Hierarchy:
                    </span>
                    <p className="text-gray-500 text-[11px]">
                      1. Authorized API / Feed → 2. Permitted Catalog → 3. Mock Data → 4. Search Links + Checklist
                    </p>
                    {plat.notes.map((n, idx) => (
                      <p key={idx} className="text-[11px] text-gray-600 font-medium">
                        • {n}
                      </p>
                    ))}
                  </div>

                  {/* Live Controls: Kill Switch & Mode Switching */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 font-medium">Mode:</span>
                      <select
                        value={plat.mode}
                        onChange={(e) => changeMode(plat.id, e.target.value)}
                        className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-brand-navy font-semibold focus:outline-none focus:border-brand-green"
                      >
                        <option value="mock">mock</option>
                        <option value="manual">manual</option>
                        <option value="links_only">links_only</option>
                        <option value="authorized_api">authorized_api</option>
                        <option value="partner_feed">partner_feed</option>
                        <option value="permitted_page">permitted_page</option>
                      </select>
                    </div>

                    <button
                      onClick={() => toggleKillSwitch(plat.id, !isKillSwitchActive)}
                      className={`text-xs px-3 py-1 rounded-full font-bold transition-all flex items-center gap-1 ${
                        isKillSwitchActive
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-red-100 text-red-700 hover:bg-red-200"
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{isKillSwitchActive ? "Re-enable" : "Emergency Kill"}</span>
                    </button>
                  </div>
                </div>

                {/* Footer Metrics */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-mono">
                  <span>Latency: {plat.latencyMs}ms</span>
                  <span>Error Rate: {plat.errorRate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Background Observability & Maintenance Telemetry */}
      {healthData && healthData.backgroundJobs && (
        <div className="mt-8 bg-gray-50 rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-brand-navy" />
            <h3 className="font-bold text-sm text-brand-navy">Connector Background Service & Maintenance Telemetry</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="bg-white p-3 rounded-xl border border-gray-100">
              <span className="text-gray-400 block">Stale Items Monitored:</span>
              <span className="font-bold text-brand-navy text-sm">{healthData.backgroundJobs.staleCount}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-100">
              <span className="text-gray-400 block">Listings Auto-Refreshed:</span>
              <span className="font-bold text-brand-navy text-sm">{healthData.backgroundJobs.refreshedCount}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-100">
              <span className="text-gray-400 block">Last Cycle Timestamp:</span>
              <span className="font-mono text-gray-600 text-[11px]">
                {healthData.backgroundJobs.lastRunTimestamp ? new Date(healthData.backgroundJobs.lastRunTimestamp).toLocaleTimeString() : "Just now"}
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-100">
              <span className="text-gray-400 block">Active Alerts:</span>
              <span className="font-bold text-emerald-600 text-sm">
                {healthData.backgroundJobs.alerts.length === 0 ? "All Systems Normal" : `${healthData.backgroundJobs.alerts.length} Alerts`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
