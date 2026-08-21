import type { Env } from "../types";

// Aggregated, hourly-bucketed counters - one row per (metric, hour), upserted
// in place. This is deliberately NOT one row per event: at any real traffic
// volume that would multiply D1 writes far past what the free tier's write
// budget can absorb, for data nobody reads at that granularity anyway. See
// migration 0020 for the table (metric_name, bucket unique).
function hourBucket(date: Date): string {
  return date.toISOString().slice(0, 13); // "2026-08-15T14" - sorts correctly as a string
}

export async function incrementMetric(env: Env, metricName: string, amount = 1): Promise<void> {
  const bucket = hourBucket(new Date());
  await env.DB.prepare(
    `insert into operational_metrics (id, metric_name, bucket, value, created_at, updated_at)
     values (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     on conflict(metric_name, bucket) do update set value = value + excluded.value, updated_at = CURRENT_TIMESTAMP`
  )
    .bind(crypto.randomUUID(), metricName, bucket, amount)
    .run();
}

// Latency is tracked as two counters (a running sum and a sample count) per
// hourly bucket, not individual samples - the average is an approximation
// of typical latency, NOT a true p95 percentile (that needs individual
// samples, which costs one D1 row per sample - too expensive to justify on
// the free tier for what "is this route getting slower" needs). Sampled at
// a low rate so this stays cheap even under real traffic; errors and
// webhooks/payments failures are never sampled (see incrementMetric call
// sites), only this latency signal is.
export async function recordLatencySample(env: Env, routeClass: string, durationMs: number, sampleRate: number): Promise<void> {
  if (sampleRate <= 0 || Math.random() >= sampleRate) return;
  await incrementMetric(env, `latency_sum_ms:${routeClass}`, Math.round(durationMs));
  await incrementMetric(env, `latency_count:${routeClass}`, 1);
}

export async function sumMetric(env: Env, metricName: string, sinceHours: number): Promise<number> {
  const sinceBucket = hourBucket(new Date(Date.now() - sinceHours * 3600_000));
  const result = await env.DB.prepare("select coalesce(sum(value), 0) as total from operational_metrics where metric_name = ? and bucket >= ?")
    .bind(metricName, sinceBucket)
    .first<{ total: number }>();
  return result?.total ?? 0;
}

export async function averageLatencyMs(env: Env, routeClass: string, sinceHours: number): Promise<number | null> {
  const [sum, count] = await Promise.all([
    sumMetric(env, `latency_sum_ms:${routeClass}`, sinceHours),
    sumMetric(env, `latency_count:${routeClass}`, sinceHours)
  ]);
  return count > 0 ? sum / count : null;
}

export async function recordTaskRun(env: Env, taskName: string, status: "ok" | "failed", detail?: string): Promise<void> {
  await env.DB.prepare(
    `insert into task_runs (task_name, last_run_at, status, detail)
     values (?, CURRENT_TIMESTAMP, ?, ?)
     on conflict(task_name) do update set last_run_at = CURRENT_TIMESTAMP, status = excluded.status, detail = excluded.detail`
  )
    .bind(taskName, status, detail ?? null)
    .run();
}

export type TaskRunRow = { task_name: string; last_run_at: string; status: "ok" | "failed"; detail: string | null };

export async function getTaskRun(env: Env, taskName: string): Promise<TaskRunRow | null> {
  const row = await env.DB.prepare("select task_name, last_run_at, status, detail from task_runs where task_name = ?").bind(taskName).first<TaskRunRow>();
  return row ?? null;
}

// Retention for sampled/aggregated data only (Fase 18) - never touches
// audit_logs, which is kept indefinitely by design. Safe to call from a
// cron trigger; deletes buckets older than the retention window.
export async function cleanupOldMetrics(env: Env, retentionDays: number): Promise<number> {
  const cutoffBucket = hourBucket(new Date(Date.now() - retentionDays * 86_400_000));
  const result = await env.DB.prepare("delete from operational_metrics where bucket < ?").bind(cutoffBucket).run();
  return result.meta.changes ?? 0;
}
