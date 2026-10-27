// ============================================================
// 会员服务端辅助：身份识别与加入、会员页数据、后台动作
// 说明：
//   1) 所有写入都走 service role 客户端（会员表只开 RLS、不建策略）。
//   2) 涉及多表的动作（挂订单、结算）走数据库函数，不在应用层拼事务。
//   3) 这里只做数据库读写与组装；进度、折扣的口径一律来自 lib/member/member.ts。
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildVisitDays,
  londonDateOf,
  maskEmail,
  nextReward,
  normalizeMemberEmail,
  progressBarCells,
  cycleProgress,
  countLifetimeVisits,
  countRewardProgress,
  isValidMemberEmail,
  rewardTypeFromDiscountValue,
  thresholdDiscountForSettlement,
  type ProgressCell,
  type NextReward,
  type RewardType,
  type VisitSessionRow,
} from './member.ts'

type AdminClient = SupabaseClient

export interface MemberRow {
  member_id:      string
  email:          string
  display_name:   string | null
  joined_at:      string
  is_active:      boolean
}

export type ConsentSource = 'booking' | 'in_store'

// ── 身份：识别与加入 ────────────────────────────────────────────────────────

/** 按 email_key 找会员。查不到返回 null，不报错（重复邮箱不报错的同一套思路） */
export async function findMemberByEmail(admin: AdminClient, email: string): Promise<MemberRow | null> {
  const emailKey = normalizeMemberEmail(email)
  if (!emailKey) return null

  const { data, error } = await admin
    .from('members')
    .select('member_id, email, display_name, joined_at, is_active')
    .eq('email_key', emailKey)
    .maybeSingle()

  if (error) throw new Error('MEMBER_LOOKUP_FAILED')
  return (data as MemberRow | null) ?? null
}

export async function findMemberById(admin: AdminClient, memberId: string): Promise<MemberRow | null> {
  const { data, error } = await admin
    .from('members')
    .select('member_id, email, display_name, joined_at, is_active')
    .eq('member_id', memberId)
    .maybeSingle()

  if (error) throw new Error('MEMBER_LOOKUP_FAILED')
  return (data as MemberRow | null) ?? null
}

export interface EnsureMemberInput {
  email:         string
  displayName?:  string | null
  consentSource: ConsentSource
}

/**
 * 加入会员或识别已有会员。
 * 邮箱已存在时不报错、不改姓名，直接返回现有会员；并发同时加入时靠唯一索引兜住，回读现有记录。
 */
export async function ensureMember(
  admin: AdminClient,
  input: EnsureMemberInput,
): Promise<{ member: MemberRow; created: boolean }> {
  const email = typeof input.email === 'string' ? input.email.trim() : ''
  if (!isValidMemberEmail(email)) throw new Error('INVALID_EMAIL')

  const existing = await findMemberByEmail(admin, email)
  if (existing) {
    // 只在原本没有姓名时补上，不覆盖会员自己改过的名字
    if (!existing.display_name && input.displayName?.trim()) {
      const name = input.displayName.trim().slice(0, 50)
      await admin.from('members').update({ display_name: name }).eq('member_id', existing.member_id)
      existing.display_name = name
    }
    return { member: existing, created: false }
  }

  const { data, error } = await admin
    .from('members')
    .insert({
      email,
      email_key:      normalizeMemberEmail(email),
      display_name:   input.displayName?.trim().slice(0, 50) || null,
      consent_source: input.consentSource,
    })
    .select('member_id, email, display_name, joined_at, is_active')
    .single()

  if (error) {
    // 23505 = 唯一索引冲突：并发下另一个请求刚建好，回读即可
    if ((error as { code?: string }).code === '23505') {
      const raced = await findMemberByEmail(admin, email)
      if (raced) return { member: raced, created: false }
    }
    throw new Error('MEMBER_CREATE_FAILED')
  }

  return { member: data as MemberRow, created: true }
}

// ── 会员页数据 ──────────────────────────────────────────────────────────────

export interface MemberVisitEntry {
  session_id:            string
  visit_date:            string
  started_at:            string
  counted_for_progress:  boolean
  progress_paused:       boolean          // false = 后台补挂，只计 Lifetime，不计进度
  used_reward:           RewardType | null // 这一单享的会员折扣（无则 null）
}

export interface MemberDashboard {
  member: {
    member_id:    string
    display_name: string | null
    email_masked: string
    joined_at:    string
    is_active:    boolean
  }
  lifetime_visits: number
  reward_progress: number
  cycle_progress:  number
  next_reward:     NextReward | null
  progress_cells:  ProgressCell[]
  visit_history:   MemberVisitEntry[]
}

/** Visit History 与 Reward Progress 的原始数据，能解释两个数为什么不同 */
async function loadMemberSessions(admin: AdminClient, memberId: string, limit: number) {
  const { data, error } = await admin
    .from('timer_sessions')
    .select('session_id, member_id, started_at, is_settled, reward_eligible, amount_gbp, actual_amount_gbp, discount_amount_gbp, coupon_code_snapshot, discount_source_snapshot, discount_value_snapshot')
    .eq('member_id', memberId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error('MEMBER_SESSIONS_FAILED')
  return (data ?? []) as (VisitSessionRow & { amount_gbp: number | null })[]
}

export async function getMemberDashboard(
  admin: AdminClient,
  memberId: string,
  options: { visitLimit?: number; londonToday: string },
): Promise<MemberDashboard | null> {
  const member = await findMemberById(admin, memberId)
  if (!member) return null

  const sessions = await loadMemberSessions(admin, memberId, 500)

  const visits   = buildVisitDays(sessions)
  const progress = countRewardProgress(visits)

  const limit = options.visitLimit ?? 10
  const visitHistory: MemberVisitEntry[] = sessions
    .filter(s => s.is_settled)
    .slice(0, limit)
    .map(s => ({
      session_id:           s.session_id,
      visit_date:           londonDateOf(s.started_at),
      started_at:           s.started_at,
      counted_for_progress: Boolean(s.reward_eligible),
      progress_paused:      s.reward_eligible === false,
      used_reward:          s.discount_source_snapshot === 'member'
        ? rewardTypeFromDiscountValue(s.discount_value_snapshot)
        : null,
    }))

  return {
    member: {
      member_id:    member.member_id,
      display_name: member.display_name,
      email_masked: maskEmail(member.email),
      joined_at:    member.joined_at,
      is_active:    member.is_active,
    },
    lifetime_visits: countLifetimeVisits(visits),
    reward_progress: progress,
    cycle_progress:  cycleProgress(progress),
    next_reward:     nextReward(progress),
    progress_cells:  progressBarCells(progress),
    visit_history: visitHistory,
  }
}


// ── 结算台需要的数据 ────────────────────────────────────────────────────────

export interface MemberThresholdDiscount {
  rewardType:     RewardType
  threshold:      number      // 累计 Progress，例如 3 / 13
  priorProgress:  number
  isNewVisitDay:  boolean
}

/**
 * 判断这一单要不要自动打折：查该会员已结算的订单，用 buildVisitDays 得到
 * 「这单之前」的进度与当天是否已有计入进度的消费。
 * 与 settle_timer_session 里的 SQL 口径一致（member_visit_days）。
 */
export async function getMemberThresholdDiscount(
  admin: AdminClient,
  memberId: string,
  session: { session_id: string; started_at: string },
): Promise<MemberThresholdDiscount | null> {
  const { data: rows, error } = await admin
    .from('timer_sessions')
    .select('member_id, started_at, is_settled, reward_eligible')
    .eq('member_id', memberId)
    .eq('is_settled', true)

  if (error) throw new Error('MEMBER_SESSIONS_FAILED')

  const visits        = buildVisitDays((rows ?? []) as VisitSessionRow[])
  const priorProgress = countRewardProgress(visits)
  const date          = londonDateOf(session.started_at)
  const isNewVisitDay = !visits.some(v => v.visit_date === date && v.reward_eligible)

  const d = thresholdDiscountForSettlement(priorProgress, isNewVisitDay)
  if (!d) return null
  return { ...d, priorProgress, isNewVisitDay }
}

// ── 错误文案 ────────────────────────────────────────────────────────────────

/** 把数据库函数与会员服务抛出的标记转成中文提示，不向前端暴露原始数据库错误 */
export function mapMemberError(message: string | undefined | null): string {
  const raw = message ?? ''
  const table: [string, string][] = [
    ['MEMBER_NOT_FOUND',                '找不到该会员'],
    ['MEMBER_INACTIVE',                 '该会员已被停用，请联系店员'],
    ['INVALID_EMAIL',                   '请输入有效的邮箱地址'],
    ['INVALID_NAME',                    '请填写姓名'],
    ['MEMBER_CREATE_FAILED',            '加入失败，请重试'],
    ['MEMBER_LOOKUP_FAILED',            '查询失败，请重试'],
    ['MEMBER_UPDATE_FAILED',            '更新失败，请重试'],
    ['MEMBER_SESSIONS_FAILED',          '读取到店记录失败，请重试'],
    ['MEMBER_LIST_FAILED',              '读取会员列表失败，请重试'],
    ['SESSION_NOT_FOUND',               '计时订单不存在'],
    ['SESSION_ALREADY_SETTLED',         '该订单已经结算过了'],
    ['SESSION_ALREADY_LINKED',          '该订单已经属于别的会员，不能改归属'],
    ['MEMBER_REQUIRED',                 '该订单没有关联会员'],
    ['MEMBER_SESSION_MISMATCH',         '会员折扣只能用于本人的订单，请先把订单关联到会员'],
    ['MEMBER_DISCOUNT_REQUIRED',        '本次到店达到会员折扣次数，需按会员折扣结算'],
    ['MEMBER_DISCOUNT_CONFLICTS_WITH_COUPON', '本次到店已享会员折扣，不能叠加优惠券'],
    ['MEMBER_THRESHOLD_NOT_MET',        '本次到店不满足会员折扣条件，请刷新后重试'],
    ['REWARD_TYPE_INVALID',             '折扣类型无效'],
    ['MULTIPLE_DISCOUNT_SOURCES',       '一个订单只能使用一种优惠'],
    ['DISCOUNT_SOURCE_INVALID',         '优惠类型无效'],
    ['DISCOUNT_AMOUNT_INVALID',         '优惠金额异常，请重新选择'],
    ['MEMBER_DISCOUNT_MISMATCH',        '会员优惠金额校验未通过，请刷新后重试'],
    ['MEMBER_DISCOUNT_MISSING',         '会员优惠金额缺失，请重新选择'],
    ['COUPON_NOT_FOUND',                '优惠码不存在'],
    ['COUPON_ALREADY_USED',             '该优惠券已被使用'],
  ]
  for (const [code, text] of table) {
    if (raw.includes(code)) return text
  }
  return '操作失败，请重试'
}


// ── 后台 ────────────────────────────────────────────────────────────────────

export interface MemberListItem extends MemberRow {
  lifetime_visits: number
  reward_progress: number
}

/** 后台会员列表，可按姓名或邮箱搜索 */
export async function listMembers(
  admin: AdminClient,
  options: { search?: string | null; limit?: number },
): Promise<MemberListItem[]> {
  let query = admin
    .from('members')
    .select('member_id, email, display_name, joined_at, is_active')
    .order('joined_at', { ascending: false })
    .limit(options.limit ?? 50)

  const search = options.search?.trim()
  if (search) {
    const escaped = search.replace(/[%,()]/g, '')
    query = query.or(`display_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
  }

  const { data, error } = await query
  if (error) throw new Error('MEMBER_LIST_FAILED')

  const members = (data ?? []) as MemberRow[]
  if (members.length === 0) return []

  const { data: sessionRows } = await admin
    .from('timer_sessions')
    .select('member_id, started_at, is_settled, reward_eligible')
    .in('member_id', members.map(m => m.member_id))

  const byMember = new Map<string, VisitSessionRow[]>()
  for (const row of (sessionRows ?? []) as VisitSessionRow[]) {
    const list = byMember.get(row.member_id as string) ?? []
    list.push(row)
    byMember.set(row.member_id as string, list)
  }

  return members.map(member => {
    const visits = buildVisitDays(byMember.get(member.member_id) ?? [])
    return {
      ...member,
      lifetime_visits: countLifetimeVisits(visits),
      reward_progress: countRewardProgress(visits),
    }
  })
}

/** 把散客订单挂到会员名下。走数据库函数，保证两个字段一起落 */
export async function linkSessionToMember(
  admin: AdminClient,
  sessionId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.rpc('link_timer_session_to_member', {
    p_session_id: sessionId,
    p_member_id:  memberId,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** 停用 / 恢复会员。后台唯一能改的会员状态字段 */
export async function setMemberActive(
  admin: AdminClient,
  memberId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('members')
    .update({ is_active: isActive })
    .eq('member_id', memberId)
    .select('member_id')

  if (error) return { ok: false, error: 'MEMBER_UPDATE_FAILED' }
  if (!data || data.length === 0) return { ok: false, error: 'MEMBER_NOT_FOUND' }
  return { ok: true }
}

/** 会员姓名可由会员自行修改，后台不提供改邮箱 */
export async function updateMemberName(
  admin: AdminClient,
  memberId: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = displayName.trim().slice(0, 50)
  if (!name) return { ok: false, error: 'INVALID_NAME' }

  const { data, error } = await admin
    .from('members')
    .update({ display_name: name })
    .eq('member_id', memberId)
    .select('member_id')

  if (error) return { ok: false, error: 'MEMBER_UPDATE_FAILED' }
  if (!data || data.length === 0) return { ok: false, error: 'MEMBER_NOT_FOUND' }
  return { ok: true }
}
