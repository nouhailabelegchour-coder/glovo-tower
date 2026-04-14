"use client";

/**
 * Live Operations Control Tower — main dashboard page.
 *
 * HYDRATION-SAFE:
 *   • All browser-only reads (Date.now, localStorage, random ids) happen
 *     inside useEffect and are gated by an `isMounted` flag.
 *   • Recharts is imported via `next/dynamic({ ssr: false })` so it never
 *     executes on the server (fixes React error #425 / #418).
 *   • The first server-rendered markup is a minimal skeleton identical to
 *     what React will hydrate on the client.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Alert, KpiPayload } from "@/lib/types";
import { KpiCard } from "./components/KpiCard";
import { AlertFeed } from "./components/AlertFeed";
import { ManualUpload } from "./components/ManualUpload";

// ── Dynamic import: Recharts is client-only ─────────────────────────────
const LiveChart = dynamic(
  () => import("./components/LiveChart").then((m) => m.LiveChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-500">
        Loading chart…
      </div>
    ),
  }
);

const LS_KEY = "ct.snapshot.v1";

export default function ControlTowerPage() {
  // ── State ──
  const [isMounted, setIsMounted] = useState(false);
  const [clock, setClock] = useState<string>("");
  const [payloads, setPayloads] = useState<KpiPayload[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [diagnosis, setDiagnosis] = useState<string[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("ALL");

  // ── Mount gate ── marks the component as client-side ready.
  useEffect(() => {
    setIsMounted(true);
    // hydrate from localStorage once
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const snap = JSON.parse(raw);
        setPayloads(snap.payloads ?? []);
        setAlerts(snap.alerts ?? []);
      }
    } catch {}
  }, []);

  // ── Live clock (client-only) ──
  useEffect(() => {
    if (!isMounted) return;
    const tick = () => setClock(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isMounted]);

  // ── Persist snapshot ──
  useEffect(() => {
    if (!isMounted) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ payloads, alerts }));
    } catch {}
  }, [isMounted, payloads, alerts]);

  // ── Poll the API every 5s ──
  const fetchAll = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/kpi?limit=500", { cache: "no-store" }),
        fetch("/api/alerts?limit=50", { cache: "no-store" }),
      ]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      if (Array.isArray(j1.payloads) && j1.payloads.length) {
        setPayloads(j1.payloads);
      }
      if (Array.isArray(j2.alerts)) setAlerts(j2.alerts);
    } catch (e) {
      console.warn("poll failed", e);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    fetchAll();
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, [isMounted, fetchAll]);

  // ── Simulate realistic payload ──
  async function simulate() {
    const stores = ["Casablanca 1", "Rabat Agdal", "Marrakech Gueliz"];
    const store = stores[Math.floor(Math.random() * stores.length)];
    const offline = Math.random() < 0.15;
    const body: KpiPayload = {
      store,
      timestamp: new Date().toISOString(),
      schedule_status: "EXPECTED_OPEN",
      actual_status: offline ? "CLOSED" : "OPEN",
      gmv: Math.round(8000 + Math.random() * 8000),
      aov: Math.round(70 + Math.random() * 40),
      cvr: +(0.08 + Math.random() * 0.15).toFixed(3),
      uptime: +(0.85 + Math.random() * 0.15).toFixed(3),
      cdtp: Math.round(10 + Math.random() * 18),
      pna: +(Math.random() * 0.18).toFixed(3),
    };
    const res = await fetch("/api/kpi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (j.diagnosis) setDiagnosis(j.diagnosis);
    // Optimistic client-state update — chart moves even if Redis is slow.
    setPayloads((p) => [...p, body].slice(-500));
    fetchAll();
  }

  /** Inject a guaranteed-anomalous payload so the UI lights up. */
  async function testAlert() {
    const body: KpiPayload = {
      store: "TEST · Store Offline",
      timestamp: new Date().toISOString(),
      schedule_status: "EXPECTED_OPEN",
      actual_status: "CLOSED",        // ⇒ triggers STORE_OFFLINE
      gmv: 1200,                       // ⇒ big drop
      aov: 45,
      cvr: 0.04,                       // ⇒ LOW_CVR
      uptime: 0.42,                    // ⇒ LOW_UPTIME critical
      cdtp: 35,                        // ⇒ HIGH_CDTP
      pna: 0.28,                       // ⇒ PNA_SPIKE critical
    };
    const res = await fetch("/api/kpi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (j.diagnosis) setDiagnosis(j.diagnosis);
    if (Array.isArray(j.alerts)) {
      setAlerts((prev) => [...j.alerts, ...prev].slice(0, 50));
    }
    setPayloads((p) => [...p, body].slice(-500));
  }

  /** Manual-upload callback: merge rows into client state instantly. */
  function handleManualIngest(rows: KpiPayload[]) {
    if (!rows.length) return;
    setPayloads((p) => [...p, ...rows].slice(-1000));
  }

  // ── derived values ──
  const filtered = useMemo(
    () =>
      selectedStore === "ALL"
        ? payloads
        : payloads.filter((p) => p.store === selectedStore),
    [payloads, selectedStore]
  );
  const latest = filtered[filtered.length - 1];
  const stores = useMemo(
    () => Array.from(new Set(payloads.map((p) => p.store))),
    [payloads]
  );
  const storeOffline = useMemo(
    () =>
      payloads
        .slice(-Math.max(stores.length * 3, 30))
        .filter(
          (p) =>
            p.schedule_status === "EXPECTED_OPEN" && p.actual_status === "CLOSED"
        ).length,
    [payloads, stores.length]
  );

  // ── Server render: minimal shell that exactly matches first client render ──
  if (!isMounted) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-3">
          <h1 className="text-sm font-bold tracking-[0.2em] text-slate-200">
            GLOVO · LIVE OPS CONTROL TOWER
          </h1>
          <span className="text-xs text-slate-500">booting…</span>
        </header>
        <div className="p-6 text-xs text-slate-500">Initializing control tower…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* ─── Top bar ─── */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <h1 className="text-sm font-bold tracking-[0.2em] text-slate-200">
            GLOVO · LIVE OPS CONTROL TOWER
          </h1>
          <span
            suppressHydrationWarning
            className="ml-3 rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400"
          >
            {clock}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          >
            <option value="ALL">All stores</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={simulate}
            className="rounded bg-cyan-500/90 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
          >
            ⚡ Simulate payload
          </button>
          <button
            onClick={testAlert}
            className="rounded bg-red-500/90 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-red-400"
          >
            🧪 Test Alert
          </button>
        </div>
      </header>

      {/* ─── KPI strip ─── */}
      <section className="grid grid-cols-2 gap-3 p-6 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="GMV"
          value={latest ? `€${latest.gmv.toLocaleString()}` : "—"}
          tone="neutral"
          sub="Gross Merchandise Value"
        />
        <KpiCard
          label="AOV"
          value={latest ? `€${latest.aov}` : "—"}
          tone="neutral"
          sub="Avg Order Value"
        />
        <KpiCard
          label="CVR"
          value={latest ? `${(latest.cvr * 100).toFixed(1)}%` : "—"}
          tone={latest && latest.cvr < 0.12 ? "warn" : "ok"}
          sub="Conversion Rate"
        />
        <KpiCard
          label="Uptime"
          value={latest ? `${(latest.uptime * 100).toFixed(1)}%` : "—"}
          tone={latest && latest.uptime < 0.95 ? "crit" : "ok"}
          sub="Availability"
        />
        <KpiCard
          label="CDTP"
          value={latest ? `${latest.cdtp} min` : "—"}
          tone={latest && latest.cdtp > 20 ? "warn" : "ok"}
          sub="Delivery + Prep + Dispatch"
        />
        <KpiCard
          label="PNA"
          value={latest ? `${(latest.pna * 100).toFixed(1)}%` : "—"}
          tone={latest && latest.pna > 0.1 ? "crit" : "ok"}
          sub="Product Not Available"
        />
      </section>

      {diagnosis.length > 0 && (
        <section className="mx-6 mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 text-sm text-cyan-200">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-cyan-400">
            Automated Diagnosis
          </div>
          {diagnosis.map((d, i) => (
            <div key={i}>• {d}</div>
          ))}
        </section>
      )}

      {/* ─── Main grid: charts + sidebar ─── */}
      <section className="grid grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <LiveChart data={filtered} metric="gmv" title="GMV — real-time" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LiveChart data={filtered} metric="cvr" title="Conversion Rate" />
            <LiveChart data={filtered} metric="pna" title="PNA Rate" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LiveChart data={filtered} metric="uptime" title="Uptime" />
            <LiveChart data={filtered} metric="cdtp" title="Delivery/Prep time" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="text-[10px] uppercase tracking-widest text-red-400">
              Stores Offline (expected open)
            </div>
            <div className="mt-1 font-mono text-4xl font-bold text-red-300">
              {storeOffline}
            </div>
          </div>
          <ManualUpload onIngest={handleManualIngest} />
          <AlertFeed alerts={alerts} />
        </div>
      </section>
    </main>
  );
}