"use client";

import React from "react";

/**
 * Single KPI tile — dark, dense, status-colored.
 * Props drive both the numeric display and the accent color.
 */
interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;            // e.g. "-4.2%"
  tone?: "ok" | "warn" | "crit" | "neutral";
  sub?: string;              // small caption
}

const toneMap: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  ok: "border-emerald-500/40 text-emerald-300",
  warn: "border-amber-500/40 text-amber-300",
  crit: "border-red-500/50 text-red-300 animate-pulse",
  neutral: "border-slate-700/60 text-slate-200",
};

export function KpiCard({ label, value, delta, tone = "neutral", sub }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border bg-slate-900/70 backdrop-blur-sm px-5 py-4
                  shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${toneMap[tone]}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] tracking-widest uppercase text-slate-400">
          {label}
        </span>
        {delta && (
          <span className="text-xs font-mono opacity-80">{delta}</span>
        )}
      </div>
      <div className="mt-2 text-3xl font-bold font-mono tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
