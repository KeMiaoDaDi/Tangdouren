// ============================================================
// 取消确认邮件模板
// ============================================================
import { formatGBP } from '@/lib/payment/depositConfig'

export interface CancellationEmailData {
  customerName:  string
  bookingDate:   string
  startTime:     string
  refundAmount:  number   // 便士，0 表示不退款
  depositAmount: number   // 便士，原始定金
  studioName:    string
  studioEmail:   string
}

export function buildCancellationEmail(data: CancellationEmailData): {
  subject: string
  html: string
} {
  const {
    customerName, bookingDate, startTime,
    refundAmount, depositAmount, studioName, studioEmail,
  } = data

  const subject = `预约取消确认 — ${bookingDate} ${startTime}`

  const refundSection = refundAmount > 0
    ? `<div class="refund-box refund-yes">
        ✅ 退款 <strong>${formatGBP(refundAmount)}</strong> 已发起<br />
        <span style="font-size:12px;">通常在 5–10 个工作日内原路退回您的支付方式。</span>
       </div>`
    : `<div class="refund-box refund-no">
        ℹ️ 根据取消政策，本次取消不予退还定金（${formatGBP(depositAmount)}）。<br />
        <span style="font-size:12px;">如有疑问，请联系工作室。</span>
       </div>`

  const html = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>取消确认</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #faf8f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: #6b7280; padding: 28px 32px 20px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 20px; margin: 0 0 6px; }
    .header p  { color: rgba(255,255,255,0.8); font-size: 13px; margin: 0; }
    .body { padding: 28px 32px; }
    .greeting { font-size: 15px; color: #3d2f2a; margin-bottom: 20px; }
    .detail-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; font-size: 14px; color: #4b5563; line-height: 2; }
    .refund-box { border-radius: 10px; padding: 14px 16px; margin-bottom: 24px; font-size: 14px; line-height: 1.7; }
    .refund-yes { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    .refund-no  { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .footer { padding: 16px 32px 24px; border-top: 1px solid #f0e8e0; font-size: 12px; color: #b09080; text-align: center; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>预约已取消</h1>
      <p>${studioName}</p>
    </div>
    <div class="body">
      <p class="greeting">你好，${customerName}，<br />您的以下预约已成功取消。</p>

      <div class="detail-box">
        📅 日期：${bookingDate}<br />
        ⏰ 时间：${startTime}
      </div>

      ${refundSection}

      <p style="font-size:13px;color:#6b7280;text-align:center;">
        希望下次还能和你一起拼豆 🫘<br />
        如有任何疑问，请联系我们。
      </p>
    </div>
    <div class="footer">
      ${studioName}<br />
      📧 ${studioEmail}
    </div>
  </div>
</body>
</html>
  `.trim()

  return { subject, html }
}
