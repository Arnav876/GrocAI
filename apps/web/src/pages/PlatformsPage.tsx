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
} from "lucide-react";
import { apiClient } from "../services/apiClient.js";
import { PlatformHealthStatus, PLATFORM_METADATA } from "@groqai/shared";

export const PlatformsPage: React.FC = () => {
  const [platforms, setPlatforms] = useState<PlatformHealthStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiClient.getPlatforms().then((data) => {
      if (mounted) {
        setPlatforms(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="max-w-container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green-light text-brand-green text-xs font-bold mb-2">
          <Activity className="w-3.5 h-3.5" />
          <span>Real-time Connector Health & Capability Matrix</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-brand-navy">
          Platform Connectors & Capabilities
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

            return (
              <div
                key={plat.id}
                className="bg-white rounded-2xl border border-brand-border p-6 shadow-sm flex flex-col justify-between"
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
                          ID: {plat.id} • Mode: {plat.mode.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
                        <span>Healthy</span>
                      </span>
                    </div>
                  </div>

                  {/* Capabilities Checklist */}
                  <div className="mt-5 space-y-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                      Verified Capabilities:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.searchProducts ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span className="font-semibold text-brand-navy">Search Products</span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.getPrices ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span className="font-semibold text-brand-navy">Read Prices</span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.getAvailability ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span className="font-semibold text-brand-navy">Stock Availability</span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                        {plat.capabilities.getFees ? (
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

                  {/* Notes & Fallback Hierarchy */}
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
                </div>

                {/* Footer Metrics */}
                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-mono">
                  <span>Latency: {plat.latencyMs}ms</span>
                  <span>Error Rate: {plat.errorRate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
