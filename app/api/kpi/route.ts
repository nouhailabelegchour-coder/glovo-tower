/**
 * POST /api/kpi
 *   Accepts a KpiPayload JSON body, validates it, persists it, runs the
 *   anomaly engine, and returns freshly-generated alerts + diagnosis.
 *
 * GET  /api/kpi
 *   Returns the last N payloads (for dashboard hydration).
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzePayload } from "@/lib/anomaly";
import { db, updateBaseline } from "@/lib/store";
import { KpiPayload } from "@/lib/types";

// Ensure Node runtime (not Edge) for map-based in-memory store.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runtime payload validation (keeps the bundle dep-free). */
function validate(body: unknown): body is KpiPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.store === "string" &&
    typeof b.timestamp === "string" &&
    (b.schedule_status === "EXPECTED_OPEN" ||
      b.schedule_status === "EXPECTED_CLOSED") &&
    (b.actual_status === "OPEN" ||
      b.actual_status === "CLOSED" ||
      b.actual_status === "UNKNOWN") &&
    ["gmv", "aov", "cvr", "uptime", "cdtp", "pna"].every(
      (k) => typeof b[k] === "number"
    )
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!validate(body)) {
    return NextResponse.json(
      { ok: false, error: "Schema validation failed" },
      { status: 422 }
    );
  }

  const payload = body as KpiPayload;

  // Pull baseline *before* updating so we compare against history.
  const baseline = db.baselines.get(payload.store);
  const { alerts, diagnosis } = analyzePayload(payload, baseline);

  // Persist
  db.payloads.push(payload);
  db.alerts.push(...alerts);
  updateBaseline(payload);

  // Cap history size
  if (db.payloads.length > 5000) db.payloads.splice(0, db.payloads.length - 5000);
  if (db.alerts.length > 2000) db.alerts.splice(0, db.alerts.length - 2000);

  return NextResponse.json({ ok: true, alerts, diagnosis });
}

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 200);
  return NextResponse.json({
    payloads: db.payloads.slice(-limit),
    count: db.payloads.length,
  });
}
