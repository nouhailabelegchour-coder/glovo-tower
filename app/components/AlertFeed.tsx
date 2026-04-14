"use client";

import React from "react";
import { Alert } from "@/lib/types";

const sevColor: Record<Alert["severity"], string> = {
  CRITICAL: "bg-red-500/10 border-red-500/40 text-red-300",
  WARN: "bg-amber-500/10 border-amber-500/40 text-amber-300",
  INFO: "bg-sky-500/10 border-sky-500/40 text-sky-300",
};

export function AlertFeed({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200">
          ▣ Alert Feed
        </h3>
        <span className="text-xs text-slate-500">{alerts.length} active</span>
      </div>
      <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
        {alerts.length === 0 && (
          <li className="py-8 text-center text-sm text-slate-500">
            ✓ No anomalies detected
          </li>
        )}
        {alerts.map((a) => (
          <li
            key={a.id}
            className={`rounded-lg border px-3 py-2 text-xs ${sevColor[a.severity]}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold">{a.code}</span>
              <span className="opacity-70">
                {new Date(a.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="mt-1 text-slate-200">{a.message}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide opacity-60">
              {a.store}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
