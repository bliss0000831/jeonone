/**
 * Cron 실행 추적 헬퍼.
 *
 * 사용법:
 *   const log = await trackCronStart('tour-events')
 *   try {
 *     const result = await doWork()
 *     await trackCronFinish(log.id, { status: 'success', result })
 *   } catch (e) {
 *     await trackCronFinish(log.id, { status: 'failed', error: String(e) })
 *     throw e
 *   }
 */
import { createAdminClient } from '@/lib/supabase/admin'

export async function trackCronStart(jobName: string): Promise<{ id: string | null; startedAt: number }> {
  const startedAt = Date.now()
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('cron_run_log')
      .insert({ job_name: jobName, status: 'running' })
      .select('id')
      .single()
    if (error) {
      console.warn('[cron-tracker] start log failed:', error.message)
      return { id: null, startedAt }
    }
    return { id: data.id, startedAt }
  } catch (err) {
    console.warn('[cron-tracker] start exception:', err)
    return { id: null, startedAt }
  }
}

export async function trackCronFinish(
  log: { id: string | null; startedAt: number },
  payload: {
    status: 'success' | 'failed'
    result?: unknown
    error?: string
  },
): Promise<void> {
  if (!log.id) return
  try {
    const admin = createAdminClient()
    await admin
      .from('cron_run_log')
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - log.startedAt,
        status: payload.status,
        result: payload.result ? JSON.parse(JSON.stringify(payload.result)) : null,
        error: payload.error ?? null,
      })
      .eq('id', log.id)
  } catch (err) {
    console.warn('[cron-tracker] finish exception:', err)
  }
}
