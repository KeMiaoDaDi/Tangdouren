// ============================================================
// 邮件发送封装（Resend）
// 原则：
//   - 发送失败不抛出异常（不影响主流程）
//   - 失败时返回 { ok: false, error } 供调用方记录日志
//   - 不在此处打印敏感信息
// ============================================================
import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY 环境变量未配置')
    _resend = new Resend(key)
  }
  return _resend
}

export interface SendResult {
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<SendResult> {
  const from = process.env.RESEND_FROM_EMAIL ?? 'no-reply@pinbean.studio'
  try {
    const resend = getResend()
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true, messageId: data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}
