import Image from 'next/image'
import Link from 'next/link'
import { MapPin, MessageCircle } from 'lucide-react'

export const metadata = {
  title: '地点指引 | 糖豆人手工工作室',
  description: '详细图文指引，帮助您顺利找到糖豆人手工工作室',
}

const steps = [
  { num: 1, caption: '从 Aldgate East 地铁站出口出来，沿 Whitechapel Road 向西走' },
  { num: 2, caption: '沿街道继续前行，留意路边建筑' },
  { num: 3, caption: '找到 65–75 Whitechapel Road 大楼入口' },
  { num: 4, caption: '进入大楼后按指引前往 Unit 226' },
  { num: 5, caption: '到达工作室门口，欢迎进来！' },
]

export default function LocationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-warm-50">
      {/* ── Hero ── */}
      <div className="pt-24 pb-12 px-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-terracotta/10 px-3 py-1 text-xs font-medium text-terracotta mb-4">
          <MapPin size={12} /> 地点指引
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-charcoal mb-3">
          如何找到我们
        </h1>
        <p className="text-charcoal-light text-base max-w-md mx-auto leading-relaxed">
          Unit 226, 65-75 Whitechapel Road, London E1 1DU<br />
          <span className="text-sm">Aldgate East 地铁站步行约 3 分钟</span>
        </p>
        <a
          href="https://maps.google.com/?q=糖豆人手作"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-4 rounded-xl bg-terracotta text-white px-5 py-2.5 text-sm font-medium hover:bg-terracotta/90 transition-colors shadow-warm"
        >
          <MapPin size={14} />
          在 Google Maps 导航
        </a>
      </div>

      {/* ── Steps ── */}
      <div className="max-w-2xl mx-auto px-4 pb-16 space-y-8">
        {steps.map((step, idx) => (
          <div key={step.num} className="relative">
            {/* 连接线 */}
            {idx < steps.length - 1 && (
              <div className="absolute left-6 top-[4.5rem] bottom-[-2rem] w-0.5 bg-gradient-to-b from-terracotta/30 to-sand-200 z-0" />
            )}

            <div className="relative z-10 flex gap-4 items-start">
              {/* 步骤编号 */}
              <div className="shrink-0 w-12 h-12 rounded-2xl bg-terracotta text-white flex items-center justify-center font-bold text-lg shadow-warm">
                {step.num}
              </div>

              {/* 卡片 */}
              <div className="flex-1 bg-white rounded-2xl shadow-card overflow-hidden border border-sand-100">
                {/* 图片 */}
                <div className="relative w-full" style={{ aspectRatio: '16/10' }}>
                  <Image
                    src={`/location-guide/${step.num}.jpg`}
                    alt={`步骤 ${step.num}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 672px"
                    priority={step.num <= 2}
                  />
                </div>
                {/* 说明 */}
                <div className="px-4 py-3">
                  <p className="text-sm text-charcoal leading-relaxed">{step.caption}</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* ── 到达标志 ── */}
        <div className="flex justify-center pt-2">
          <div className="inline-flex items-center gap-2 rounded-2xl bg-sage/15 border border-sage/30 px-6 py-3 text-sage-dark font-semibold text-sm">
            ✅ 到达目的地！欢迎光临糖豆人手工工作室
          </div>
        </div>
      </div>

      {/* ── 联系客服 ── */}
      <div className="bg-white border-t border-sand-100">
        <div className="max-w-2xl mx-auto px-4 py-14 text-center">
          <MessageCircle size={32} className="text-terracotta mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold text-charcoal mb-2">
            如果有任何问题，请联系客服
          </h2>
          <p className="text-charcoal-light text-sm mb-8">
            我们很乐意为你提供详细的到店指引
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            {/* 二维码 */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-44 h-44 rounded-2xl overflow-hidden border border-sand-200 shadow-card bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/service-qr.jpg"
                  alt="客服微信二维码"
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-sm text-charcoal font-medium">扫码添加客服微信</p>
              <p className="text-xs text-charcoal-light">随时咨询，我们尽快回复</p>
            </div>

            {/* 分隔 */}
            <div className="hidden sm:block w-px h-32 bg-sand-200" />
            <div className="sm:hidden w-24 h-px bg-sand-200" />

            {/* 其他信息 */}
            <div className="text-left space-y-3">
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-terracotta mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-charcoal-light">地址</p>
                  <p className="text-sm font-medium text-charcoal">Unit 226, 65-75 Whitechapel Road</p>
                  <p className="text-sm font-medium text-charcoal">London E1 1DU</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-terracotta mt-0.5 shrink-0 text-base leading-none">🕐</span>
                <div>
                  <p className="text-xs text-charcoal-light">营业时间</p>
                  <p className="text-sm font-medium text-charcoal">周二至周日 11:00 – 21:00</p>
                  <p className="text-xs text-charcoal-light/70">每周一休息</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10">
            <Link href="/booking" className="btn-primary inline-flex">
              立即预约体验
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
