// ============================================================
// 取消与退款规则 — 修改退款政策只改这里
// 不在代码里硬编码法律条款，所有规则可由此处调整
// ============================================================

export const CANCEL_POLICY = {
  // 距预约开始时间多少小时以上可全额退款
  fullRefundHoursBeforeStart: 12,

  // 不满足全额退款条件时的退款比例（0 = 不退，50 = 退50%）
  lateRefundPercent: 0,

  // 取消 token 有效天数
  cancelTokenExpiryDays: parseInt(
    process.env.CANCEL_TOKEN_EXPIRY_DAYS ?? '15',
    10,
  ),
} as const

export interface RefundDecision {
  refundAmount: number   // 便士，0 表示不退款
  reason: 'full_refund' | 'partial_refund' | 'no_refund'
  policyText: string     // 面向用户的说明文字
}

/**
 * 根据取消时间和预约开始时间计算退款金额
 * @param depositAmount   定金金额（便士）
 * @param bookingStart    预约开始时间（伦敦本地 "YYYY-MM-DD HH:MM" 字符串）
 * @param cancelledAt     取消时刻（UTC Date，默认 now）
 */
export function calcRefund(
  depositAmount: number,
  bookingStart: string,     // "YYYY-MM-DD HH:MM"（伦敦本地时间）
  cancelledAt: Date = new Date(),
): RefundDecision {
  // 把伦敦本地时间转为 UTC 毫秒
  // start_time 来自 Supabase time 列，格式可能是 "HH:MM" 或 "HH:MM:SS"
  // 统一截取前5位（HH:MM），再拼成合法 ISO 字符串
  const [datePart, timePart] = bookingStart.split(' ')
  const timeHHMM = timePart.substring(0, 5)  // "14:00:00" → "14:00"
  const startMs = new Date(`${datePart}T${timeHHMM}:00`).getTime()
  const cancelMs = cancelledAt.getTime()
  const hoursBeforeStart = (startMs - cancelMs) / (1000 * 60 * 60)

  if (hoursBeforeStart >= CANCEL_POLICY.fullRefundHoursBeforeStart) {
    return {
      refundAmount: depositAmount,
      reason: 'full_refund',
      policyText: `您在预约开始 ${CANCEL_POLICY.fullRefundHoursBeforeStart} 小时前取消，定金将全额退还。`,
    }
  }

  if (CANCEL_POLICY.lateRefundPercent > 0) {
    const partial = Math.round(depositAmount * CANCEL_POLICY.lateRefundPercent / 100)
    return {
      refundAmount: partial,
      reason: 'partial_refund',
      policyText: `距预约开始不足 ${CANCEL_POLICY.fullRefundHoursBeforeStart} 小时，将退还定金的 ${CANCEL_POLICY.lateRefundPercent}%。`,
    }
  }

  return {
    refundAmount: 0,
    reason: 'no_refund',
    policyText: `距预约开始不足 ${CANCEL_POLICY.fullRefundHoursBeforeStart} 小时，定金不予退还。`,
  }
}
