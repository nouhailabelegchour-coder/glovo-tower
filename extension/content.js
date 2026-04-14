/* =============================================================
 * Glovo Portal Content Script
 *
 * Runs on https://portal.glovoapp.com/dashboard*.
 * 1. Scans the store table for rows marked with a "red X"
 *    (closed) indicator.
 * 2. Reads each row's "horaire d'ouverture" (opening hours)
 *    column and determines whether the store is currently
 *    expected to be OPEN.
 * 3. POSTs a KpiPayload per anomalous store to the Control
 *    Tower API.
 *
 * NOTE: DOM selectors are placeholders — adjust to match the
 * actual Glovo portal markup. The algorithm is stable; only the
 * selectors need tuning.
 * ============================================================= */

(() => {
  // Config — change to your deployed API URL.
  const API_URL =
    localStorage.getItem("ct.apiUrl") || "http://localhost:3000/api/kpi";
  const SCAN_INTERVAL_MS = 60_000;

  /** Parse an "opening hours" cell like "09:00 - 23:00" into minutes. */
  function parseHours(text) {
    if (!text) return null;
    // Supports "9h-23h", "09:00-23:00", "09:00 — 23:00", etc.
    const m = text.match(/(\d{1,2})[:h](\d{0,2}).*?(\d{1,2})[:h](\d{0,2})/);
    if (!m) return null;
    const [, h1, m1, h2, m2] = m;
    return {
      openMin: +h1 * 60 + (+m1 || 0),
      closeMin: +h2 * 60 + (+m2 || 0),
    };
  }

  /** Is "now" within [open, close]? Handles ranges that don't wrap. */
  function isExpectedOpen(hours, now = new Date()) {
    if (!hours) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= hours.openMin && cur <= hours.closeMin;
  }

  /** Detect "red X / closed" badge on a row. */
  function isRowClosed(row) {
    // Glovo uses various class names; check a few likely patterns.
    const indicator = row.querySelector(
      '[data-status="closed"], .status-closed, .icon-red-x, svg[aria-label*="closed" i]'
    );
    if (indicator) return true;
    // Fallback: look for an element whose text is "X" + red color.
    const badge = row.querySelector(".status, .store-status, .badge");
    if (badge) {
      const style = window.getComputedStyle(badge);
      const red =
        style.color.includes("rgb(2") || // rough red detection
        style.backgroundColor.includes("rgb(2");
      if (red && /x|closed|fermé/i.test(badge.textContent || "")) return true;
    }
    return false;
  }

  /** Extract one store's signal from a row. */
  function scrapeRow(row) {
    const nameEl = row.querySelector(
      '[data-col="store"], .store-name, td:first-child'
    );
    const hoursEl = row.querySelector(
      '[data-col="hours"], .opening-hours, [class*="horaire"]'
    );
    if (!nameEl) return null;

    const name = nameEl.textContent.trim();
    const hours = parseHours(hoursEl?.textContent || "");
    const expectedOpen = isExpectedOpen(hours);
    const closed = isRowClosed(row);

    return {
      store: name,
      timestamp: new Date().toISOString(),
      schedule_status: expectedOpen ? "EXPECTED_OPEN" : "EXPECTED_CLOSED",
      actual_status: closed ? "CLOSED" : "OPEN",
      // KPI fields from portal (if present); defaults otherwise.
      gmv: num(row, '[data-col="gmv"]') ?? 0,
      aov: num(row, '[data-col="aov"]') ?? 0,
      cvr: num(row, '[data-col="cvr"]', true) ?? 0,
      uptime: num(row, '[data-col="uptime"]', true) ?? (closed ? 0 : 1),
      cdtp: num(row, '[data-col="cdtp"]') ?? 0,
      pna: num(row, '[data-col="pna"]', true) ?? 0,
    };
  }

  /** Numeric cell helper; `pct=true` treats "12%" as 0.12. */
  function num(row, sel, pct = false) {
    const el = row.querySelector(sel);
    if (!el) return null;
    const n = parseFloat((el.textContent || "").replace(",", "."));
    if (Number.isNaN(n)) return null;
    return pct ? n / 100 : n;
  }

  /** POST one payload to the Control Tower. */
  async function send(payload) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) console.warn("[CT] POST failed", res.status);
    } catch (e) {
      console.warn("[CT] network error", e);
    }
  }

  /** Main scan pass. */
  async function scan() {
    // Selector for the store list — adjust for actual portal.
    const rows = document.querySelectorAll(
      'table.stores tbody tr, [data-testid="store-row"], .store-list .row'
    );
    let anomalies = 0;
    for (const row of rows) {
      const payload = scrapeRow(row);
      if (!payload) continue;

      // We always send when store is anomalous. Uncomment next line
      // to always stream every store.
      const anomalous =
        payload.schedule_status === "EXPECTED_OPEN" &&
        payload.actual_status === "CLOSED";
      if (!anomalous) continue;

      anomalies++;
      await send(payload);
    }
    console.info(`[CT] scan complete — ${rows.length} rows, ${anomalies} anomalies`);
  }

  // Kick off immediately, then every minute.
  scan();
  setInterval(scan, SCAN_INTERVAL_MS);

  // Also expose a manual trigger on window for dev.
  window.__ctScan = scan;
})();
