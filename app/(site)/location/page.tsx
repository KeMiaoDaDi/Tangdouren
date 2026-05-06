'use client'

import Link from 'next/link'
import { MapPin, MessageCircle } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { t, pick } from '@/lib/i18n/translations'

const stepNums = [1, 2, 3, 4, 5] as const
const stepKeys = [t.locationStep1, t.locationStep2, t.locationStep3, t.locationStep4, t.locationStep5]

export default function LocationPage() {
  const { lang } = useLanguage()
  const p = (entry: { zh: string; en: string }) => pick(entry, lang)

  const steps = stepNums.map((num, idx) => ({
    num,
    caption: p(stepKeys[idx]),
  }))

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-warm-50">
      {/* ── Hero ── */}
      <div className="pt-24 pb-12 px-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-terracotta/10 px-3 py-1 text-xs font-medium text-terracotta mb-4">
          <MapPin size={12} /> {p(t.locationPageBadge)}
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-charcoal mb-3">
          {p(t.locationPageTitle)}
        </h1>
        <p className="text-charcoal-light text-base max-w-md mx-auto leading-relaxed">
          Unit 226, 65-75 Whitechapel Road, London E1 1DU<br />
          <span className="text-sm">{p(t.locationPageNote)}</span>
        </p>
        <a
          href="https://maps.google.com/?q=糖豆人手作"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-4 rounded-xl bg-terracotta text-white px-5 py-2.5 text-sm font-medium hover:bg-terracotta/90 transition-colors shadow-warm"
        >
          <MapPin size={14} />
          {p(t.locationPageNavBtn)}
        </a>
      </div>

      {/* ── Steps ── */}
      <div className="max-w-2xl mx-auto px-4 pb-16 space-y-8">
        {steps.map((step, idx) => (
          <div key={step.num} className="relative">
            {idx < steps.length - 1 && (
              <div className="absolute left-6 top-[4.5rem] bottom-[-2rem] w-0.5 bg-gradient-to-b from-terracotta/30 to-sand-200 z-0" />
            )}

            <div className="relative z-10 flex gap-4 items-start">
              <div className="shrink-0 w-12 h-12 rounded-2xl bg-terracotta text-white flex items-center justify-center font-bold text-lg shadow-warm">
                {step.num}
              </div>

              <div className="flex-1 bg-white rounded-2xl shadow-card overflow-hidden border border-sand-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/location-guide/${step.num}.jpg`}
                  alt={`Step ${step.num}`}
                  className="w-full h-auto block"
                  loading={step.num <= 2 ? 'eager' : 'lazy'}
                />
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
            {p(t.locationPageArrived)}
          </div>
        </div>
      </div>

      {/* ── 联系客服 ── */}
      <div className="bg-white border-t border-sand-100">
        <div className="max-w-2xl mx-auto px-4 py-14 text-center">
          <MessageCircle size={32} className="text-terracotta mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold text-charcoal mb-2">
            {p(t.locationPageContactTitle)}
          </h2>
          <p className="text-charcoal-light text-sm mb-8">
            {p(t.locationPageContactSubtitle)}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            {/* 二维码 */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-44 h-44 rounded-2xl overflow-hidden border border-sand-200 shadow-card bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/service-qr.jpg"
                  alt="WeChat QR"
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-sm text-charcoal font-medium">{p(t.locationPageQrLabel)}</p>
              <p className="text-xs text-charcoal-light">{p(t.locationPageQrSub)}</p>
            </div>

            <div className="hidden sm:block w-px h-32 bg-sand-200" />
            <div className="sm:hidden w-24 h-px bg-sand-200" />

            {/* 其他信息 */}
            <div className="text-left space-y-3">
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-terracotta mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-charcoal-light">{p(t.address)}</p>
                  <p className="text-sm font-medium text-charcoal">Unit 226, 65-75 Whitechapel Road</p>
                  <p className="text-sm font-medium text-charcoal">London E1 1DU</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-terracotta mt-0.5 shrink-0 text-base leading-none">🕐</span>
                <div>
                  <p className="text-xs text-charcoal-light">{p(t.openingHours)}</p>
                  <p className="text-sm font-medium text-charcoal">{p(t.openingHoursValue)}</p>
                  <p className="text-xs text-charcoal-light/70">{p(t.closedMonday)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10">
            <Link href="/booking" className="btn-primary inline-flex">
              {p(t.locationPageBookBtn)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
