// ============================================================
// 预约确认邮件模板（中英双语）
// ============================================================
import { formatGBP } from '@/lib/payment/depositConfig'

export interface ConfirmationEmailData {
  customerName:    string
  bookingDate:     string   // "YYYY-MM-DD"
  startTime:       string   // "HH:MM"
  endTime:         string   // "HH:MM"
  tableDisplay:    string
  partySize:       number
  depositAmount:   number   // 便士
  cancelUrl:       string
  studioName:      string
  studioAddress:   string
  studioEmail:     string
  studioMapUrl?:   string
  lang?:           'zh' | 'en'
}

export function buildConfirmationEmail(data: ConfirmationEmailData): {
  subject: string
  html: string
} {
  const {
    customerName, bookingDate, startTime, endTime,
    tableDisplay, partySize, depositAmount, cancelUrl,
    studioName, studioAddress, studioEmail,
    studioMapUrl = 'https://maps.google.com/?q=糖豆人手作',
    lang = 'zh',
  } = data

  const locationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tangdouren.co.uk'}/location`
  const isEn = lang === 'en'

  const subject = isEn
    ? `🎉 Booking Confirmed! ${bookingDate} ${startTime} — ${studioName}`
    : `🎉 预约成功！${bookingDate} ${startTime} — ${studioName}`

  const greeting = isEn
    ? `Hi ${customerName}!<br />Your bead art session is confirmed — we can't wait to see you ✨`
    : `你好，${customerName}！<br />你的拼豆体验名额已确认，期待与你相见 ✨`

  const labelDate    = isEn ? '📅 Date'          : '📅 日期'
  const labelTime    = isEn ? '⏰ Time'          : '⏰时间'
  const labelTable   = isEn ? '🪑 Table'         : '🪑 桌位'
  const labelParty   = isEn ? '👥 Group Size'    : '👥 人数'
  const labelAddress = isEn ? '📍 Address'       : '📍 地址'
  const partySizeStr = isEn ? `${partySize} ${partySize === 1 ? 'person' : 'people'}` : `${partySize} 人`
  const mapLinkText  = isEn ? '📍 View on Google Maps →' : '📍 在 Google Maps 查看 →'

  const depositBadge = depositAmount > 0
    ? (isEn
        ? `✅ Deposit paid: <strong>${formatGBP(depositAmount)}</strong>. Remaining balance due on arrival.`
        : `✅ 已支付定金 <strong>${formatGBP(depositAmount)}</strong>，余款到店结清`)
    : (isEn
        ? `✅ Booking confirmed — no deposit required. Pay in full on arrival.`
        : `✅ 预约已确认，无需预付定金，到店结清即可`)

  const locationBlock = isEn
    ? `Before heading over, check out our <a href="${locationUrl}" style="display:inline-block;background:#D97059;color:#ffffff;text-decoration:none;font-weight:600;padding:3px 10px;border-radius:6px;font-size:13px;margin:0 4px;">Location Guide</a> to find us easily!`
    : `在出发前请详细查看 <a href="${locationUrl}" style="display:inline-block;background:#D97059;color:#ffffff;text-decoration:none;font-weight:600;padding:3px 10px;border-radius:6px;font-size:13px;margin:0 4px;">地点指引</a> 找到我们！`

  const policyTitle  = isEn ? 'Cancellation Policy'  : '取消政策'
  const policyBody   = isEn
    ? `Cancellations made 12+ hours before your session are fully refunded.<br />
       Cancellations within 12 hours are non-refundable.<br />
       Refunds are processed within 5–10 business days.`
    : `距预约开始 12 小时以上取消，定金全额退还。<br />
       不足 12 小时取消，定金不予退还。<br />
       退款将在 5–10 个工作日内原路返回。`

  const cancelBtnText   = isEn ? 'Need to cancel? Click here' : '需要取消预约？点击此处'
  const cancelExpiry    = isEn
    ? 'This cancellation link expires in 15 days. After that, please contact the studio directly.'
    : '此取消链接将在 15 天后失效。超期请联系工作室。'

  const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isEn ? 'Booking Confirmation' : '预约确认'}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #faf8f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #D97059 0%, #C4573A 100%); padding: 32px 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0 0 6px; }
    .header p  { color: rgba(255,255,255,0.85); font-size: 14px; margin: 0; }
    .body { padding: 28px 32px; }
    .greeting { font-size: 16px; color: #3d2f2a; margin-bottom: 20px; }
    .detail-box { background: #fdf6f0; border: 1px solid #f0e0d0; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .detail-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid #f5ede5; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #8a7060; }
    .detail-value { color: #3d2f2a; font-weight: 600; text-align: right; }
    .deposit-badge { background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; font-size: 14px; color: #2e7d32; text-align: center; }
    .policy-box { background: #fff8f0; border-left: 3px solid #D97059; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px; font-size: 13px; color: #6b4c3b; line-height: 1.6; }
    .cancel-btn { display: block; text-align: center; background: #f5f0eb; border: 1px solid #ddd0c8; border-radius: 10px; padding: 13px; color: #8a7060; font-size: 13px; text-decoration: none; margin-bottom: 24px; }
    .footer { padding: 20px 32px 28px; border-top: 1px solid #f0e8e0; font-size: 12px; color: #b09080; text-align: center; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${isEn ? '🎉 Booking Confirmed!' : '🎉 预约成功！'}</h1>
      <p>${studioName}</p>
    </div>
    <div class="body">
      <p class="greeting">${greeting}</p>

      <div class="detail-box">
        <div class="detail-row">
          <span class="detail-label">${labelDate}</span>
          <span class="detail-value">${bookingDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${labelTime}</span>
          <span class="detail-value">${startTime} – ${endTime}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${labelTable}</span>
          <span class="detail-value">${tableDisplay}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${labelParty}</span>
          <span class="detail-value">${partySizeStr}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${labelAddress}</span>
          <span class="detail-value">
            ${studioAddress}<br />
            <a href="${studioMapUrl}" style="font-size:12px;color:#D97059;font-weight:400;text-decoration:none;">${mapLinkText}</a>
          </span>
        </div>
      </div>

      <div class="deposit-badge">${depositBadge}</div>

      <div style="background:#fff8f0;border:1px solid #f0d8c8;border-radius:10px;padding:14px 16px;margin-bottom:24px;font-size:14px;color:#3d2f2a;text-align:center;line-height:1.8;">
        ${locationBlock}
      </div>

      <div class="policy-box">
        <strong>${policyTitle}</strong><br />
        ${policyBody}
      </div>

      <a href="${cancelUrl}" class="cancel-btn">${cancelBtnText}</a>

      <p style="font-size:12px;color:#b09080;text-align:center;margin:0;">
        ${cancelExpiry}
      </p>
    </div>
    <div class="footer">
      ${studioName}<br />
      ${studioAddress}<br />
      📧 ${studioEmail}
    </div>
  </div>
</body>
</html>
  `.trim()

  return { subject, html }
}
