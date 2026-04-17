// 取消确认页（Server Component）
// 用户点击邮件中取消链接后到达此页
// 此页只展示退款预览，不执行取消
// 真正的取消通过 POST /api/bookings/cancel 完成

import { Suspense } from 'react'
import CancelPageContent from './CancelPageContent'

export default function CancelPage() {
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-br from-cream via-warm-50 to-white flex items-center justify-center px-4">
      <Suspense fallback={
        <div className="card w-full max-w-md p-10 text-center">
          <p className="text-charcoal-light animate-pulse">加载中…</p>
        </div>
      }>
        <CancelPageContent />
      </Suspense>
    </div>
  )
}
