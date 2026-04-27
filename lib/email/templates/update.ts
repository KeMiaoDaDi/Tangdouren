// ============================================================
// 预约修改通知邮件模板
// ============================================================

export interface UpdateEmailData {
  customerName:  string
  bookingDate:   string   // 新日期 "YYYY-MM-DD"
  startTime:     string   // 新开始时间 "HH:MM"
  endTime:       string   // 新结束时间 "HH:MM"
  tableDisplay:  string   // 新桌位展示 "单人桌 · S1"
  partySize:     number
  studioName:    string
  studioEmail:   string
  studioMapUrl?: string
  changedFields: string[] // 发生变化的字段名，如 ['日期', '时间', '桌位']
}

export function buildUpdateEmail(data: UpdateEmailData): { subject: string; html: string } {
  const {
    customerName, bookingDate, startTime, endTime,
    tableDisplay, partySize, studioName, studioEmail,
    studioMapUrl = 'https://maps.google.com/?q=糖豆人手作',
    changedFields,
  } = data

  const subject = `📝 预约信息已更新 — ${bookingDate} ${startTime} | ${studioName}`

  const html = `
<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>预约更新通知</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#faf8f5;margin:0;padding:0;}
  .c{max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);}
  .h{background:linear-gradient(135deg,#D97059,#C4573A);padding:32px 32px 24px;text-align:center;}
  .h h1{color:#fff;font-size:22px;margin:0 0 6px;}
  .h p{color:rgba(255,255,255,.85);font-size:14px;margin:0;}
  .b{padding:28px 32px;}
  .greeting{font-size:16px;color:#3d2f2a;margin-bottom:20px;}
  .change-badge{background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:10px 14px;font-size:13px;color:#795548;margin-bottom:20px;}
  .detail-box{background:#fdf6f0;border:1px solid #f0e0d0;border-radius:12px;padding:20px;margin-bottom:24px;}
  .detail-row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;border-bottom:1px solid #f5ede5;}
  .detail-row:last-child{border-bottom:none;}
  .detail-label{color:#8a7060;}
  .detail-value{color:#3d2f2a;font-weight:600;text-align:right;}
  .note{background:#fff8f0;border-left:3px solid #D97059;padding:14px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#6b4c3b;line-height:1.6;margin-bottom:24px;}
  .ft{padding:20px 32px 28px;border-top:1px solid #f0e8e0;font-size:12px;color:#b09080;text-align:center;line-height:1.8;}
</style>
</head>
<body>
<div class="c">
  <div class="h">
    <h1>📝 预约信息已更新</h1>
    <p>${studioName}</p>
  </div>
  <div class="b">
    <p class="greeting">你好，${customerName}！<br/>你的预约信息已由工作室修改，请查看最新详情。</p>
    <div class="change-badge">
      ✏️ 本次修改内容：<strong>${changedFields.join('、')}</strong>
    </div>
    <div class="detail-box">
      <div class="detail-row">
        <span class="detail-label">📅 日期</span>
        <span class="detail-value">${bookingDate}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">⏰ 时间</span>
        <span class="detail-value">${startTime} – ${endTime}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">🪑 桌位</span>
        <span class="detail-value">${tableDisplay}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">👥 人数</span>
        <span class="detail-value">${partySize} 人</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">📍 地址</span>
        <span class="detail-value">
          Unit 226, 65-75 Whitechapel Road, London E1 1DU<br/>
          <a href="${studioMapUrl}" style="font-size:12px;color:#D97059;font-weight:400;text-decoration:none;">📍 在 Google Maps 查看 →</a>
        </span>
      </div>
    </div>
    <div class="note">
      如有疑问，请联系我们：<br/>
      📧 <a href="mailto:${studioEmail}" style="color:#D97059;">${studioEmail}</a>
    </div>
  </div>
  <div class="ft">
    ${studioName}<br/>
    Unit 226, 65-75 Whitechapel Road, London E1 1DU<br/>
    📧 ${studioEmail}
  </div>
</div>
</body></html>`.trim()

  return { subject, html }
}
