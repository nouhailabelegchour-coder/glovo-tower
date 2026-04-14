/**
 * Anomaly Detection & Automated Insights.
 *
 * Pure functions — no I/O — so they are trivially unit-testable.
 *
 * Thresholds are intentionally conservative defaults. Tune per market.
 */

import { Alert, InsightResult, KpiPayload } from "./types";

/** KPI thresholds for a healthy store. */
export const THRESHOLDS = {
  UPTIME_MIN: 0.95,
  PNA_MAX: 0.10,
  CVR_MIN: 0.12,
  CDTP_MAX: 20,          // minutes
  GMV_DROP_WARN: 0.10,   // 10% drop vs. baseline
  GMV_DROP_CRIT: 0.20,   // 20% drop vs. baseline
} as const;

/** Build a deterministic-ish alert id for React keys & idempotency. */
function alertId(store: string, code: string, ts: string): string {
  return `${store}:${code}:${ts}`;
}

/**
 * Core rule engine. Receives the current payload plus an optional `baseline`
 * (e.g. rolling 7-day average GMV for the same hour) and returns alerts
 * + a human-readable diagnosis list.
 */
export function analyzePayload(
  payload: KpiPayload,
  baseline?: { gmv?: number; cvr?: number; pna?: number }
): InsightResult {
  const alerts: Alert[] = [];
  const diagnosis: string[] = [];
  const ts = payload.timestamp;

  // ---------- 1. Glovo Uptime Anomaly (Store Offline) ----------
  if (
    payload.schedule_status === "EXPECTED_OPEN" &&
    payload.actual_status === "CLOSED"
  ) {
    alerts.push({
      id: alertId(payload.store, "STORE_OFFLINE", ts),
      store: payload.store,
      severity: "CRITICAL",
      code: "STORE_OFFLINE",
      timestamp: ts,
      message: `🚨 ${payload.store} is CLOSED but scheduled OPEN. Failed to open on time.`,
      payloadRef: {
        schedule_status: payload.schedule_status,
        actual_status: payload.actual_status,
      },
    });
    diagnosis.push(
      `Store ${payload.store} did not open per schedule — investigate staffing / tablet connection.`
    );
  }

  // ---------- 2. Uptime degradation ----------
  if (payload.uptime < THRESHOLDS.UPTIME_MIN) {
    alerts.push({
      id: alertId(payload.store, "LOW_UPTIME", ts),
      store: payload.store,
      severity: payload.uptime < 0.85 ? "CRITICAL" : "WARN",
      code: "LOW_UPTIME",
      timestamp: ts,
      message: `Uptime at ${(payload.uptime * 100).toFixed(1)}% (target ≥ ${(
        THRESHOLDS.UPTIME_MIN * 100
      ).toFixed(0)}%).`,
    });
  }

  // ---------- 3. PNA spike ----------
  if (payload.pna > THRESHOLDS.PNA_MAX) {
    alerts.push({
      id: alertId(payload.store, "PNA_SPIKE", ts),
      store: payload.store,
      severity: payload.pna > 0.2 ? "CRITICAL" : "WARN",
      code: "PNA_SPIKE",
      timestamp: ts,
      message: `Product-Not-Available at ${(payload.pna * 100).toFixed(
        1
      )}% — catalog accuracy degraded.`,
    });
  }

  // ---------- 4. Conversion drop ----------
  if (payload.cvr < THRESHOLDS.CVR_MIN) {
    alerts.push({
      id: alertId(payload.store, "LOW_CVR", ts),
      store: payload.store,
      severity: "WARN",
      code: "LOW_CVR",
      timestamp: ts,
      message: `CVR at ${(payload.cvr * 100).toFixed(1)}% — funnel issue suspected.`,
    });
  }

  // ---------- 5. Prep/Delivery time ----------
  if (payload.cdtp > THRESHOLDS.CDTP_MAX) {
    alerts.push({
      id: alertId(payload.store, "HIGH_CDTP", ts),
      store: payload.store,
      severity: "WARN",
      code: "HIGH_CDTP",
      timestamp: ts,
      message: `Delivery/Prep time ${payload.cdtp}min — above ${THRESHOLDS.CDTP_MAX}min target.`,
    });
  }

  // ---------- 6. Automated GMV diagnosis ----------
  if (baseline?.gmv && baseline.gmv > 0) {
    const drop = (baseline.gmv - payload.gmv) / baseline.gmv;
    if (drop >= THRESHOLDS.GMV_DROP_WARN) {
      // Compose a multi-factor explanation
      const reasons: string[] = [];
      if (baseline.cvr && payload.cvr < baseline.cvr) {
        const cvrDrop = (baseline.cvr - payload.cvr) * 100;
        reasons.push(`CVR dropped by ${cvrDrop.toFixed(1)}pp`);
      }
      if (baseline.pna && payload.pna > baseline.pna) {
        reasons.push(`PNA spiked to ${(payload.pna * 100).toFixed(1)}%`);
      }
      if (payload.actual_status === "CLOSED") {
        reasons.push(`store is currently CLOSED`);
      }
      const reasonStr = reasons.length ? ` because ${reasons.join(" and ")}` : "";
      diagnosis.push(
        `GMV is down ${(drop * 100).toFixed(1)}%${reasonStr}.`
      );
      alerts.push({
        id: alertId(payload.store, "GMV_DROP", ts),
        store: payload.store,
        severity: drop >= THRESHOLDS.GMV_DROP_CRIT ? "CRITICAL" : "WARN",
        code: "GMV_DROP",
        timestamp: ts,
        message: `GMV down ${(drop * 100).toFixed(1)}% vs baseline.`,
      });
    }
  }

  if (alerts.length === 0) {
    diagnosis.push(`${payload.store} nominal — all KPIs within target.`);
  }

  return { alerts, diagnosis };
}
