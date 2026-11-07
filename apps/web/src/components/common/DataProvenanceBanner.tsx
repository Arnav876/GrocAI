import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { apiClient } from "../../services/apiClient.js";
import { useBasket } from "../../context/BasketContext.js";
import {
  ProvenanceTone,
  describeProvenance,
} from "../../services/provenancePresentation.js";

type BannerTone = ProvenanceTone | "checking" | "unknown";

interface ToneStyle {
  wrapper: string;
  badge: string;
  icon: string;
}

const TONE_STYLES: Record<BannerTone, ToneStyle> = {
  live: {
    wrapper: "bg-emerald-50 border-emerald-200 text-emerald-900",
    badge: "bg-emerald-200 text-emerald-800",
    icon: "text-emerald-600",
  },
  mixed: {
    wrapper: "bg-amber-50 border-amber-200 text-amber-900",
    badge: "bg-amber-200 text-amber-800",
    icon: "text-amber-600",
  },
  mock: {
    wrapper: "bg-amber-50 border-amber-200 text-amber-900",
    badge: "bg-amber-200 text-amber-800",
    icon: "text-amber-600",
  },
  empty: {
    wrapper: "bg-slate-50 border-slate-200 text-slate-800",
    badge: "bg-slate-200 text-slate-700",
    icon: "text-slate-500",
  },
  checking: {
    wrapper: "bg-slate-50 border-slate-200 text-slate-700",
    badge: "bg-slate-200 text-slate-600",
    icon: "text-slate-400",
  },
  unknown: {
    wrapper: "bg-rose-50 border-rose-200 text-rose-900",
    badge: "bg-rose-200 text-rose-800",
    icon: "text-rose-600",
  },
};

/**
 * Honest global data-status banner. It reads the actual provenance aggregate
 * for the selected pincode and never claims LIVE when data is simulated,
 * manually entered, stale, or unavailable to verify.
 */
export const DataProvenanceBanner: React.FC = () => {
  const { pincode } = useBasket();

  const { data, isPending, isError } = useQuery({
    queryKey: ["data-provenance", pincode],
    queryFn: () => apiClient.getDataProvenance(pincode),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  let tone: BannerTone;
  let badge: string;
  let message: string;
  let detail: string;

  if (isPending) {
    tone = "checking";
    badge = "CHECKING DATA";
    message = "Verifying whether displayed prices are live, manual, or simulated…";
    detail = "";
  } else if (isError || !data) {
    tone = "unknown";
    badge = "DATA STATUS UNKNOWN";
    message = "Unable to verify whether displayed prices are live, manual, or simulated.";
    detail = "Check API connectivity before trusting any price shown below.";
  } else {
    const presentation = describeProvenance(data);
    tone = presentation.tone;
    badge = presentation.badge;
    message = presentation.message;
    detail = presentation.detail;
  }

  const style = TONE_STYLES[tone];
  const Icon =
    tone === "live"
      ? CheckCircle2
      : tone === "checking"
      ? RefreshCw
      : tone === "empty"
      ? Database
      : AlertCircle;

  return (
    <div
      className={`border-b px-4 py-1.5 text-xs flex items-center justify-between z-50 ${style.wrapper}`}
      title={detail ? `${message} ${detail}` : message}
      data-provenance-status={tone}
    >
      <div className="max-w-container mx-auto w-full flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${style.badge}`}
          >
            {badge}
          </span>
          <span className="flex items-center gap-1 font-medium">
            <Icon
              className={`w-3.5 h-3.5 ${style.icon} ${
                tone === "checking" ? "animate-spin" : ""
              }`}
            />
            <span>{message}</span>
          </span>
          {detail && (
            <span className="hidden md:inline opacity-75">{detail}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-medium text-amber-800">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-green" /> Zero credential storage
          </span>
          <span className="hidden sm:inline">|</span>
          <span className="flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Never processes payments
          </span>
        </div>
      </div>
    </div>
  );
};
