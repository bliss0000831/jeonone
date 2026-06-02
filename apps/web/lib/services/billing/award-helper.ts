/**
 * 활동 → 포인트 적립 헬퍼.
 *
 * API 라우트에서 호출 시 fire-and-forget 방식.
 * 적립 실패해도 원래 요청은 정상 진행하지만 — 에러는 Sentry 로 보낸다.
 *
 * 사용 예:
 *   const post = await supabase.from('board_posts').insert(...).select().single()
 *   awardPoints({
 *     userId: user.id, plazaId: plaza, ruleId: 'post.create',
 *     sourceId: post.id,
 *     qualityData: { length: content.length, has_image: !!images?.length },
 *   })
 */
import * as Sentry from '@sentry/nextjs'
import { earn, type EarnInput, type EarnResult } from './points'

/**
 * 비동기 적립 (응답 안 기다림).
 * 실패는 Sentry 로 캡처 — 운영 중 누락을 무시하지 않음.
 */
export function awardPoints(input: EarnInput): void {
  earn(input)
    .then((result) => {
      // 적립이 거부된 경우(rule_not_found / tx_insert_failed 등) 도 추적
      if (!result.ok && result.error) {
        Sentry.captureMessage('[awardPoints] earn failed', {
          level: 'warning',
          tags: { ruleId: input.ruleId },
          extra: { input, result },
        })
      }
    })
    .catch((e) => {
      console.error('[awardPoints] exception', input.ruleId, e?.message)
      Sentry.captureException(e, {
        tags: { feature: 'points', ruleId: input.ruleId },
        extra: { input },
      })
    })
}

/** 동기 호출이 필요한 경우 (테스트 / 검증). */
export async function awardPointsSync(input: EarnInput): Promise<EarnResult> {
  try {
    return await earn(input)
  } catch (e: any) {
    Sentry.captureException(e, {
      tags: { feature: 'points', ruleId: input.ruleId },
      extra: { input },
    })
    return { ok: false, reason: 'exception', error: e?.message }
  }
}
