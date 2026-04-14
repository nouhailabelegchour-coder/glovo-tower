/**
 * GET /api/alerts?severity=CRITICAL&store=Casablanca%201
 *   Returns the most recent alerts, newest first.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { AlertSeverity } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const severity = sp.get("severity") as AlertSeverity | null;
  const store = sp.get("store");
  const limit = Number(sp.get("limit") ?? 100);

  let alerts = [...db.alerts].reverse();
  if (severity) alerts = alerts.filter((a) => a.severity === severity);
  if (store) alerts = alerts.filter((a) => a.store === store);

  return NextResponse.json({ alerts: alerts.slice(0, limit) });
}
