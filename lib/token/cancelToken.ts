// ============================================================
// 取消 Token 工具
// 安全原则：
//   - 使用 crypto.randomBytes(32) 生成 64 字符十六进制 token
//   - 数据库只存 SHA-256 hash，不存明文
//   - Token 与 booking 强绑定，有过期时间
//   - 使用一次后立即清除 hash（一次性）
// ============================================================
import { createHash, randomBytes } from 'crypto'
import { CANCEL_POLICY } from '@/lib/payment/cancelPolicy'

/**
 * 生成一个随机取消 token 及其 hash
 * @returns { token: 明文（发给用户）, hash: SHA-256（存数据库）, expiresAt: 过期时间 }
 */
export function generateCancelToken(): {
  token: string
  hash: string
  expiresAt: Date
} {
  const token = randomBytes(32).toString('hex')   // 64字符十六进制
  const hash  = hashToken(token)
  const expiresAt = new Date(
    Date.now() + CANCEL_POLICY.cancelTokenExpiryDays * 24 * 60 * 60 * 1000,
  )
  return { token, hash, expiresAt }
}

/**
 * 对 token 明文做 SHA-256，用于数据库查询
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * 构造取消链接 URL
 */
export function buildCancelUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/booking/cancel?token=${token}`
}
