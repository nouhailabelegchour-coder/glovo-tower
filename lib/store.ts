/**
 * Persistent store backed by Upstash Redis (serverless-friendly).
 *
 * Required Vercel environment variables:
 *   UPSTASH_REDIS_REST_URL    e.g. https://xxxxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN  the REST token (read/write)
 *
 * Create a free DB at https://console.upstash.com → "Create Database" →
 * Global → copy the REST URL + token into Vercel → Settings → Environment
 * Variables (scope: Production, Preview, Development).
 *
 * Data layout:
 *   LIST  ct:payloads       JSON-encoded KpiPayload (newest pushed to tail)
 *   LIST  ct:alerts         JSON-encoded Alert       (newest pushed to tail)
 *   HASH  ct:baseline:<store> → { gmv, cvr, pna }
 */
 
import { Redis } from "@upstash/redis";
import { Alert, KpiPayload } from "./types";
 
export const redis = Redis.fromEnv();
 
const K = {
  payloads: "ct:payloads",
  alerts: "ct:alerts",
  baseline: (store: string) => `ct:baseline:${store}`,
};
 
const MAX_PAYLOADS = 5000;
const MAX_ALERTS = 2000;
 
/** Append a payload and keep the list length bounded. */
export async function pushPayload(p: KpiPayload) {
  await redis.rpush(K.payloads, JSON.stringify(p));
  await redis.ltrim(K.payloads, -MAX_PAYLOADS, -1);
}
 
/** Append many alerts. */
export async function pushAlerts(alerts: Alert[]) {
  if (!alerts.length) return;
  await redis.rpush(K.alerts, ...alerts.map((a) => JSON.stringify(a)));
  await redis.ltrim(K.alerts, -MAX_ALERTS, -1);
}
 
/** Last N payloads, oldest→newest. */
export async function getPayloads(limit = 200): Promise<KpiPayload[]> {
  const raw = await redis.lrange<string>(K.payloads, -limit, -1);
  return raw.map(parse<KpiPayload>).filter(Boolean) as KpiPayload[];
}
 
/** Most-recent N alerts, newest→oldest. */
export async function getAlerts(limit = 100): Promise<Alert[]> {
  const raw = await redis.lrange<string>(K.alerts, -limit, -1);
  const parsed = raw.map(parse<Alert>).filter(Boolean) as Alert[];
  return parsed.reverse();
}
 
/** Fetch/update rolling baseline (EMA). */
export async function getBaseline(store: string) {
  const b = (await redis.hgetall<{
    gmv: string;
    cvr: string;
    pna: string;
  }>(K.baseline(store))) as Record<string, string> | null;
  if (!b) return undefined;
  return {
    gmv: Number(b.gmv),
    cvr: Number(b.cvr),
    pna: Number(b.pna),
  };
}
 
export async function updateBaseline(p: KpiPayload) {
  const prev = await getBaseline(p.store);
  const alpha = 0.2;
  const next = prev
    ? {
        gmv: prev.gmv * (1 - alpha) + p.gmv * alpha,
        cvr: prev.cvr * (1 - alpha) + p.cvr * alpha,
        pna: prev.pna * (1 - alpha) + p.pna * alpha,
      }
    : { gmv: p.gmv, cvr: p.cvr, pna: p.pna };
  await redis.hset(K.baseline(p.store), {
    gmv: String(next.gmv),
    cvr: String(next.cvr),
    pna: String(next.pna),
  });
}
 
/** Dev helper — wipe everything. */
export async function clearAll() {
  await redis.del(K.payloads, K.alerts);
}
 
function parse<T>(s: string | null): T | null {
  if (!s) return null;
  // Upstash SDK may already deserialize — handle both cases.
  if (typeof s === "object") return s as T;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
 