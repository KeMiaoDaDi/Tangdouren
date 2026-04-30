// ============================================================
// 定金配置 — 修改定金金额只改这里
// 金额单位：便士（pence）。£1 = 100p
// ============================================================

/**
 * 支付开关 — 设为 false 时跳过 Stripe，预约直接确认
 * 恢复收取定金时改回 true 即可
 */
export const PAYMENT_ENABLED = false

export const DEPOSIT_CONFIG = {
  currency: 'gbp',

  // 按人数（partySize）对应的定金金额（便士）
  // partySize 1 → £5，2 → £10，3/4 → £15
  amountByPartySize: {
    1: 500,   // £5
    2: 1000,  // £10
    3: 1500,  // £15
    4: 1500,  // £15（3-4人同价）
  } as Record<number, number>,

  // 支付超时（分钟），超时后 payment_pending 占位视为无效
  paymentTimeoutMinutes: parseInt(
    process.env.BOOKING_PAYMENT_TIMEOUT_MINUTES ?? '30',
    10,
  ),
} as const

/**
 * 根据人数获取定金金额（便士）
 * partySize 超出范围时取 4 人档
 */
export function getDepositAmount(partySize: number): number {
  return DEPOSIT_CONFIG.amountByPartySize[partySize]
    ?? DEPOSIT_CONFIG.amountByPartySize[4]
}

/**
 * 便士 → 英镑展示字符串，如 500 → "£5.00"
 */
export function formatGBP(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}
