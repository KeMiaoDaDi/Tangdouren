// ============================================================
// 拼豆计时计价规则
// 单价：£12.99/h 首小时，续时 £10.99/h（按 30 分钟计）
// 套餐：2.5h = £25.99，4h = £39.99
// 到达套餐时长自动使用套餐价，超出部分按续时收费
// 精度：保留小数点后两位
// ============================================================

export const TIMER_PRICING = {
  firstHourGbp:          12.99,
  continuationPerHourGbp: 10.99,
  package250hGbp:         25.99,
  package400hGbp:         39.99,
  package250hMin:         150,   // 2.5h = 150 min
  package400hMin:         240,   // 4h   = 240 min
} as const

// ── 计费时长计算（含 15 分钟容差规则）──────────────────────────────────────

/**
 * 将实际用时（分钟）转换为计费时长
 * 规则：
 *   - 最低计费 60 分钟（1 小时）
 *   - 以 30 分钟为单位向上/下取整
 *   - 超出 30 分钟单位 < 15 分钟：舍去（向下取整）
 *   - 超出 30 分钟单位 >= 15 分钟：算作 30 分钟（向上取整）
 */
export function calcBillingMinutes(elapsedMinutes: number): number {
  const base      = Math.floor(elapsedMinutes / 30) * 30
  const remainder = elapsedMinutes - base
  const rounded   = remainder >= 15 ? base + 30 : base
  return Math.max(rounded, 60)
}

// ── 计费明细 ────────────────────────────────────────────────────────────────

export interface BillLine {
  label:  string
  amount: number
}

export interface BillBreakdown {
  billingMinutes: number
  lines:          BillLine[]
  totalGbp:       number
}

/**
 * 根据计费时长生成完整账单
 */
export function calcBill(billingMinutes: number): BillBreakdown {
  const p   = TIMER_PRICING
  const per = p.continuationPerHourGbp / 2   // £5.495 per 30-min block (续时)
  const fmt = (n: number) => parseFloat(n.toFixed(2))

  let lines: BillLine[] = []
  let total = 0

  if (billingMinutes <= 60) {
    // 恰好1小时或以内
    lines = [{ label: '1小时体验', amount: p.firstHourGbp }]
    total = p.firstHourGbp

  } else if (billingMinutes < p.package250hMin) {
    // 1h < t < 2.5h
    const extraBlocks = (billingMinutes - 60) / 30
    const extraAmt    = fmt(extraBlocks * per)
    lines = [
      { label: '首小时',                      amount: p.firstHourGbp },
      { label: `续时 ${extraBlocks}×30分钟`, amount: extraAmt },
    ]
    total = fmt(p.firstHourGbp + extraBlocks * per)

  } else if (billingMinutes === p.package250hMin) {
    // 恰好2.5h套餐
    lines = [{ label: '2.5小时套餐', amount: p.package250hGbp }]
    total = p.package250hGbp

  } else if (billingMinutes < p.package400hMin) {
    // 2.5h < t < 4h
    const extraBlocks = (billingMinutes - p.package250hMin) / 30
    const extraAmt    = fmt(extraBlocks * per)
    lines = [
      { label: '2.5小时套餐',                  amount: p.package250hGbp },
      { label: `续时 ${extraBlocks}×30分钟`, amount: extraAmt },
    ]
    total = fmt(p.package250hGbp + extraBlocks * per)

  } else if (billingMinutes === p.package400hMin) {
    // 恰好4h套餐
    lines = [{ label: '4小时套餐', amount: p.package400hGbp }]
    total = p.package400hGbp

  } else {
    // > 4h
    const extraBlocks = (billingMinutes - p.package400hMin) / 30
    const extraAmt    = fmt(extraBlocks * per)
    lines = [
      { label: '4小时套餐',                    amount: p.package400hGbp },
      { label: `续时 ${extraBlocks}×30分钟`, amount: extraAmt },
    ]
    total = fmt(p.package400hGbp + extraBlocks * per)
  }

  return { billingMinutes, lines, totalGbp: total }
}

// ── 里程碑提示（顾客实时页面） ───────────────────────────────────────────────

export interface Milestone {
  label:            string     // 套餐名
  targetMinutes:    number     // 套餐时长（分钟）
  packagePrice:     number     // 套餐价格
  remainingSeconds: number     // 距离套餐还差多少秒
}

/**
 * 根据当前已用秒数，返回尚未到达的套餐里程碑
 */
export function getMilestones(elapsedSeconds: number): Milestone[] {
  const p = TIMER_PRICING
  const milestones: Milestone[] = []

  const targets = [
    { label: '2.5小时套餐', targetMinutes: p.package250hMin, price: p.package250hGbp },
    { label: '4小时套餐',   targetMinutes: p.package400hMin, price: p.package400hGbp },
  ]

  for (const t of targets) {
    const targetSeconds = t.targetMinutes * 60
    if (elapsedSeconds < targetSeconds) {
      milestones.push({
        label:            t.label,
        targetMinutes:    t.targetMinutes,
        packagePrice:     t.price,
        remainingSeconds: targetSeconds - elapsedSeconds,
      })
    }
  }

  return milestones
}

// ── 格式化工具 ───────────────────────────────────────────────────────────────

/** 将秒数格式化为 HH:MM:SS */
export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** 将秒数格式化为中文自然语言，如「1小时46分钟」 */
export function formatChineseDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0 && m > 0) return `${h}小时${m}分钟`
  if (h > 0)          return `${h}小时`
  return `${m}分钟`
}
