"use client";

/**
 * Manual JSON / CSV upload component.
 *
 * Accepts either:
 *   • a JSON array of KpiPayload objects, OR
 *   • a CSV with a header row containing the KpiPayload field names.
 *
 * Client-side only: parses the file locally, updates React state via the
 * onIngest callback, AND forwards rows to /api/kpi so the server store
 * stays in sync. Works even when the browser is offline from the API —
 * charts will still update from state.
 */

import React, { useRef, useState } from "react";
import { KpiPayload } from "@/lib/types";

interface Props {
  onIngest: (rows: KpiPayload[]) => void;
}

export function ManualUpload({ onIngest }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setStatus("Parsing…");
    try {
      const file = files[0];
      const text = await file.text();
      const rows = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(text)
        : parseJson(text);
      const valid = rows.filter(isKpiPayload);
      onIngest(valid);
      setStatus(`Loaded ${valid.length} rows locally — syncing…`);

      // Also POST to the API so Redis persists it across tabs/sessions.
      const res = await fetch("/api/kpi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valid),
      });
      const j = await res.json();
      setStatus(
        `✓ ${j.accepted} accepted · ${j.rejected ?? 0} rejected` +
          (rows.length - valid.length
            ? ` · ${rows.length - valid.length} malformed`
            : "")
      );
    } catch (e) {
      setStatus(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function parseJson(text: string): unknown[] {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  function parseCsv(text: string): Record<string, unknown>[] {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const v = cells[i];
        // Coerce numeric columns
        if (["gmv", "aov", "cvr", "uptime", "cdtp", "pna"].includes(h)) {
          obj[h] = Number(v);
        } else {
          obj[h] = v;
        }
      });
      return obj;
    });
  }

  function isKpiPayload(x: unknown): x is KpiPayload {
    if (!x || typeof x !== "object") return false;
    const b = x as Record<string, unknown>;
    return (
      typeof b.store === "string" &&
      typeof b.timestamp === "string" &&
      ["gmv", "aov", "cvr", "uptime", "cdtp", "pna"].every(
        (k) => typeof b[k] === "number" && !Number.isNaN(b[k])
      )
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200">
          ⇪ Manual Upload
        </h3>
        <span className="text-[10px] uppercase text-slate-500">JSON · CSV</span>
      </div>
      <label
        htmlFor="ct-file"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-xs transition ${
          busy
            ? "border-slate-700 text-slate-500"
            : "border-slate-700 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300"
        }`}
      >
        <span className="text-2xl">⬆</span>
        <span className="mt-1">
          {busy ? "Processing…" : "Click to upload a metrics file"}
        </span>
        <span className="mt-0.5 text-[10px] text-slate-500">
          .json array or .csv with KpiPayload columns
        </span>
      </label>
      <input
        id="ct-file"
        ref={fileRef}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        onChange={(e) => handleFiles(e.target.files)}
        className="sr-only"
        disabled={busy}
      />
      {status && (
        <div className="mt-2 font-mono text-[11px] text-slate-400">{status}</div>
      )}
    </div>
  );
}
