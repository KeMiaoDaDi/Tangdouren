// ============================================================
// 新预约通知：发送给管理员邮箱
// ============================================================
import { sendEmail } from '@/lib/email/sender'

const ADMIN_EMAIL = 'guwenhao2001@gmail.com'

export interface AdminNotifyData {
  bookingId:    string
  customerName: string
  email:        string
  bookingDate:  string
  startTime:    string
  endTime:      string
  tableCode:    string
  tableType:    string
  partySize:    number
  remark?:      string | null
  source:       '顾客在线预约' | 'Stripe支付完成' | '管理员手动创建'
}

const TABLE_TYPE_ZH: Record<string, string> = {
  single: '单人桌', double: '双人桌', four: '四人桌',
}

export async function notifyAdminNewBooking(data: AdminNotifyData): Promise<void> {
  const {
    bookingId, customerName, email, bookingDate, startTime, endTime,
    tableCode, tableType, partySize, remark, source,
  } = data

  const tableDisplay = `${TABLE_TYPE_ZH[tableType] ?? tableType} · ${tableCode}`
  const studioName   = process.env.NEXT_PUBLIC_STUDIO_NAME ?? '糖豆人手工工作室'
  const subject      = `📋 新预约通知 — ${customerName} · ${bookingDate} ${startTime} | ${studioName}`

  const html = `
<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0;}
  .c{max-width:520px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1);}
  .h{background:linear-gradient(135deg,#2c3e50,#3d5166);padding:24px 28px 18px;color:#fff;}
  .h h1{margin:0 0 4px;font-size:18px;font-weight:700;}
  .h p{margin:0;font-size:12px;opacity:.7;}
  .b{padding:22px 28px;}
  .badge{display:inline-block;background:#e8f4fd;color:#1a6fa3;font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;margin-bottom:16px;}
  .box{background:#f8f9fa;border:1px solid #e9ecef;border-radius:10px;padding:16px;margin-bottom:16px;}
  .row{display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #eee;}
  .row:last-child{border-bottom:none;}
  .lbl{color:#6c757d;}.val{color:#212529;font-weight:600;text-align:right;max-width:60%;}
  .remark{background:#fff3cd;border-left:3px solid #ffc107;padding:10px 12px;border-radius:0 6px 6px 0;font-size:13px;color:#856404;margin-bottom:16px;}
  .ft{padding:14px 28px 20px;border-top:1px solid #eee;font-size:11px;color:#adb5bd;text-align:center;}
  .id{font-family:monospace;font-size:11px;color:#6c757d;background:#f8f9fa;padding:2px 6px;border-radius:4px;}
</style></head><body>
<div class="c">
  <div class="h">
    <h1>📋 新预约通知</h1>
    <p>${studioName} · 后台管理系统</p>
  </div>
  <div class="b">
    <span class="badge">来源：${source}</span>
    <div class="box">
      <div class="row"><span class="lbl">👤 客户姓名</span><span class="val">${customerName}</span></div>
      <div class="row"><span class="lbl">✉️ 客户邮箱</span><span class="val">${email || '—'}</span></div>
      <div class="row"><span class="lbl">📅 预约日期</span><span class="val">${bookingDate}</span></div>
      <div class="row"><span class="lbl">⏰ 时间段</span><span class="val">${startTime} – ${endTime}</span></div>
      <div class="row"><span class="lbl">🪑 桌位</span><span class="val">${tableDisplay}</span></div>
      <div class="row"><span class="lbl">👥 人数</span><span class="val">${partySize} 人</span></div>
    </div>
    ${remark ? `<div class="remark">📝 备注：${remark}</div>` : ''}
    <p style="font-size:12px;color:#6c757d;margin:0;">
      订单编号：<span class="id">${bookingId}</span>
    </p>
  </div>
  <div class="ft">${studioName} · 此邮件由系统自动发送</div>
</div>
</body></html>`.trim()

  try {
    await sendEmail({ to: ADMIN_EMAIL, subject, html })
  } catch (e) {
    console.error('[notifyAdmin] 管理员通知邮件发送失败:', e)
  }
}
