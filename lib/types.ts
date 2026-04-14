/**
 * Core domain types for the Live Operations Control Tower.
 * Keep this file as the single source of truth for KPI & alert shapes.
 */

export type ScheduleStatus = "EXPECTED_OPEN" | "EXPECTED_CLOSED";
export type ActualStatus = "OPEN" | "CLOSED" | "UNKNOWN";

/** Raw payload accepted by /api/kpi (from extension or simulator). */
export interface KpiPayload {
  store: string;
  timestamp: string;              // ISO-8601
  schedule_status: ScheduleStatus;
  actual_status: ActualStatus;
  gmv: number;                    // Gross Merchandise Value (currency units)
  aov: number;                    // Average Order Value
  cvr: number;                    // Conversion rate (0..1)
  uptime: number;                 // Uptime fraction (0..1)
  cdtp: number;                   // Combined Delivery/Prep/Dispatch time (min)
  pna: number;                    // Product-Not-Available rate (0..1)
}

export type AlertSeverity = "INFO" | "WARN" | "CRITICAL";

export interface Alert {
  id: string;
  store: string;
  severity: AlertSeverity;
  code: string;                   // e.g. "STORE_OFFLINE", "PNA_SPIKE"
  message: string;
  timestamp: string;
  payloadRef?: Partial<KpiPayload>;
}

export interface InsightResult {
  alerts: Alert[];
  diagnosis: string[];            // human-readable algorithmic findings
}
