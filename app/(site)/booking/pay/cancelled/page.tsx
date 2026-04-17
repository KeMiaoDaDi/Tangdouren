import Link from 'next/link'
import { XCircle } from 'lucide-react'

// 用户在 Stripe Checkout 页面点击返回/取消时跳转到此页
// 名额在支付超时（30分钟）后自动释放
export default function PayCancelledPage() {
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-br from-cream via-warm-50 to-white flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-10 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sand-100">
          <XCircle size={32} className="text-charcoal-light" />
        </div>
        <h1 className="font-display text-2xl font-bold text-charcoal mb-2">支付已取消</h1>
        <p className="text-charcoal-light text-sm mb-8">
          您的预约名额将在 30 分钟内自动释放。<br />
          如需重新预约，可以随时回来。
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/booking" className="btn-primary w-full justify-center">
            重新预约
          </Link>
          <Link href="/" className="btn-secondary w-full justify-center">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  )
}
