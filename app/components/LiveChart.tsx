"use client";

import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiPayload } from "@/lib/types";

interface Props {
  data: KpiPayload[];
  metric: keyof Pick<KpiPayload, "gmv" | "aov" | "cvr" | "uptime" | "cdtp" | "pna">;
  title: string;
}

export function LiveChart({ data, metric, title }: Props) {
  const series = data.map((p) => ({
    t: new Date(p.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    [metric]: p[metric],
  }));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200">
          {title}
        </h3>
        <span className="text-[10px] uppercase text-slate-500">live</span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <AreaChart data={series}>
            <defs>
              <linearGradient id={`g-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="t" stroke="#64748b" fontSize={11} />
            <YAxis stroke="#64748b" fontSize={11} />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <Area
              type="monotone"
              dataKey={metric}
              stroke="#22d3ee"
              fill={`url(#g-${metric})`}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
