/**
 * Tiny in-memory "database" used by API routes.
 *
 * In production swap this for Redis / Postgres / Upstash. The shape of the
 * exported API is intentionally DB-agnostic so the swap is one file.
 */

import { Alert, KpiPayload } from "./types";

// Use globalThis so Next.js dev hot-reload doesn't wipe state.
const g = globalThis as unknown as {
  __kpiStore?: {
    payloads: KpiPayload[];
    alerts: Alert[];
    baselines: Map<string, { gmv: number; cvr: number; pna: number }>;
  };
};

if (!g.__kpiStore) {
  g.__kpiStore = {
    payloads: [],
    alerts: [],
    baselines: new Map(),
  };
}

export const db = g.__kpiStore;

/** Rolling baseline: simple exponential moving average per store. */
export function updateBaseline(p: KpiPayload) {
  const prev = db.baselines.get(p.store);
  const alpha = 0.2;
  if (!prev) {
    db.baselines.set(p.store, { gmv: p.gmv, cvr: p.cvr, pna: p.pna });
  } else {
    db.baselines.set(p.store, {
      gmv: prev.gmv * (1 - alpha) + p.gmv * alpha,
      cvr: prev.cvr * (1 - alpha) + p.cvr * alpha,
      pna: prev.pna * (1 - alpha) + p.pna * alpha,
    });
  }
}
