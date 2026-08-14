'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Tag } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { t, pick } from '@/lib/i18n/translations'

export default function PricingPage() {
  const { lang } = useLanguage()
  const p = (entry: { zh: string; en: string }) => pick(entry, lang)

  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-cream to-warm-50">
      {/* ── Hero ── */}
      <section className="pt-16 pb-10 px-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-terracotta/10 px-3 py-1 text-xs font-medium text-terracotta mb-4">
          <Tag size={12} /> {p(t.pricingBadge)}
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-charcoal mb-3">
          {p(t.pricingTitle)}
        </h1>
        <p className="text-charcoal-light text-base max-w-md mx-auto leading-relaxed">
          {p(t.pricingSubtitle)}
        </p>
      </section>

      {/* ── 价格表图片 ── */}
      <section className="pb-16">
        <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
          <Image
            src="/price-list.jpg"
            alt={p(t.pricingImageAlt)}
            width={1280}
            height={1811}
            className="w-full h-auto rounded-2xl shadow-card border border-sand-100"
            priority
          />
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="pb-20">
        <div className="mx-auto max-w-xl px-4 text-center">
          <Link href="/booking" className="btn-primary text-base px-8 py-3.5 inline-flex">
            {p(t.pricingCta)}
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  )
}
