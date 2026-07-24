import { sql as databaseSql } from "@yummy/db"
import type { UserId } from "@yummy/shared"
import { env } from "../env.js"
import {
  enqueueHistoryBackfill,
  processExtractionJob,
  processHistoryIndexJob,
  purgeHistory,
} from "./service.js"

interface ClaimedJob {
  readonly id: string
  readonly user_id: string | null
  readonly type: "extract" | "index_history" | "backfill" | "purge_history" | "cleanup"
  readonly payload: Record<string, unknown>
  readonly attempts: number
  readonly max_attempts: number
}

let workerTimer: ReturnType<typeof setInterval> | null = null
let workerRunning = false
let lastMaintenanceAt = 0
const MAINTENANCE_INTERVAL_MS = 15 * 60 * 1_000

async function runMaintenance(): Promise<void> {
  await databaseSql`
    UPDATE memory_job
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
      locked_at = NULL,
      run_after = now(),
      last_error = COALESCE(last_error, 'Recovered stale worker lock'),
      updated_at = now()
    WHERE status = 'processing' AND locked_at < now() - interval '15 minutes'
  `
  await databaseSql`DELETE FROM conversation WHERE mode = 'temporary' AND expires_at <= now()`
  await databaseSql`
    UPDATE memory_pending_action
    SET status = 'expired', updated_at = now()
    WHERE status = 'pending' AND expires_at <= now()
  `
  await databaseSql`DELETE FROM memory_event WHERE created_at < now() - interval '90 days'`
  await databaseSql`
    DELETE FROM memory_job
    WHERE (status = 'completed' AND updated_at < now() - interval '7 days')
      OR (status = 'failed' AND updated_at < now() - interval '30 days')
  `
}

async function claimJob(): Promise<ClaimedJob | null> {
  const rows = await databaseSql<ClaimedJob[]>`
    UPDATE memory_job
    SET status = 'processing', attempts = attempts + 1, locked_at = now(), updated_at = now()
    WHERE id = (
      SELECT id FROM memory_job
      WHERE status = 'pending' AND run_after <= now()
      ORDER BY run_after ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, user_id, type, payload, attempts, max_attempts
  `
  return rows[0] ?? null
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === "string" ? value : null
}

async function executeJob(job: ClaimedJob): Promise<void> {
  if (job.type === "cleanup") {
    await runMaintenance()
    return
  }

  if (!job.user_id) return
  const userId = job.user_id as UserId
  if (job.type === "backfill") {
    await enqueueHistoryBackfill(userId)
    return
  }
  if (job.type === "purge_history") {
    await purgeHistory(userId)
    return
  }

  const userMessageId = payloadString(job.payload, "userMessageId")
  const assistantMessageId = payloadString(job.payload, "assistantMessageId")
  if (!userMessageId || !assistantMessageId) throw new Error("Memory job has invalid message IDs")

  if (job.type === "extract") {
    await processExtractionJob(userId, userMessageId, assistantMessageId)
  } else {
    await processHistoryIndexJob(userId, userMessageId, assistantMessageId)
  }
}

async function finishJob(job: ClaimedJob): Promise<void> {
  await databaseSql`
    UPDATE memory_job
    SET status = 'completed', locked_at = NULL, last_error = NULL, updated_at = now()
    WHERE id = ${job.id}
  `
}

async function failJob(job: ClaimedJob, error: unknown): Promise<void> {
  const message =
    error instanceof Error ? error.message.slice(0, 1_000) : "Unknown memory job error"
  const terminal = job.attempts >= job.max_attempts
  const delaySeconds = Math.min(900, 30 * 2 ** Math.max(0, job.attempts - 1))
  await databaseSql`
    UPDATE memory_job
    SET status = ${terminal ? "failed" : "pending"},
      locked_at = NULL,
      last_error = ${message},
      run_after = now() + (${delaySeconds} * interval '1 second'),
      updated_at = now()
    WHERE id = ${job.id}
  `
}

export async function runMemoryWorkerOnce(): Promise<boolean> {
  const job = await claimJob()
  if (!job) return false
  try {
    await executeJob(job)
    await finishJob(job)
  } catch (error) {
    await failJob(job, error)
  }
  return true
}

async function workerTick(): Promise<void> {
  if (workerRunning) return
  workerRunning = true
  try {
    if (Date.now() - lastMaintenanceAt >= MAINTENANCE_INTERVAL_MS) {
      await runMaintenance().catch(() => undefined)
      lastMaintenanceAt = Date.now()
    }
    for (let index = 0; index < 10; index += 1) {
      if (!(await runMemoryWorkerOnce())) break
    }
  } finally {
    workerRunning = false
  }
}

export function startMemoryWorker(): () => void {
  if (!env.memoryV2Enabled || workerTimer) return () => undefined
  void workerTick()
  workerTimer = setInterval(() => void workerTick(), 2_000)
  workerTimer.unref()
  return () => {
    if (workerTimer) clearInterval(workerTimer)
    workerTimer = null
  }
}
