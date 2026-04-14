/**
 * POST /api/kpi          — ingest a single KpiPayload (from extension / simulator)
 * POST /api/kpi (array)  — ingest many at once (from Manual Upload UI)
 * GET  /api/kpi          — return the last N payloads for dashboard hydration
 * DELETE /api/kpi        — wipe the store (useful while debugging)
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzePayload } from "@/lib/anomaly";
import {
  clearAll,
  getBaseline,
  getPayloads,
  pushAlerts,
  pushPayload,
  updateBaseline,
} from "@/lib/store";
import { Alert, KpiPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function ingest(payload: KpiPayload) {
  const baseline = await getBaseline(payload.store);
  const { alerts, diagnosis } = analyzePayload(payload, baseline);
  await pushPayload(payload);
  await pushAlerts(alerts);
  await updateBaseline(payload);
  return { alerts, diagnosis };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Accept a single object OR an array (bulk upload).
  const items = Array.isArray(body) ? body : [body];

  const allAlerts: Alert[] = [];
  const allDiag: string[] = [];
  let accepted = 0;
  const errors: string[] = [];

  for (const raw of items) {
    if (!validate(raw)) {
      errors.push(`Row rejected: ${JSON.stringify(raw).slice(0, 80)}`);
      continue;
    }
    const { alerts, diagnosis } = await ingest(raw);
    allAlerts.push(...alerts);
    allDiag.push(...diagnosis);
    accepted++;
  }

  return NextResponse.json({
    ok: true,
    accepted,
    rejected: errors.length,
    errors,
    alerts: allAlerts,
    diagnosis: allDiag,
  });
}

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 200);
  const payloads = await getPayloads(limit);
  return NextResponse.json({ payloads, count: payloads.length });
}

export async function DELETE() {
  await clearAll();
  return NextResponse.json({ ok: true });
}