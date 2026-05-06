'use client'

import Link from 'next/link'
import { ArrowRight, Heart, Sparkles, Leaf } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { t, pick } from '@/lib/i18n/translations'

export default function FaqPage() {
  const { lang } = useLanguage()
  const p = (entry: { zh: string; en: string }) => pick(entry, lang)

  const values = [
    { icon: Heart,    title: p(t.faqValue1Title), desc: p(t.faqValue1Desc) },
    { icon: Sparkles, title: p(t.faqValue2Title), desc: p(t.faqValue2Desc) },
    { icon: Leaf,     title: p(t.faqValue3Title), desc: p(t.faqValue3Desc) },
  ]

  const faqs = [
    { q: p(t.faqQ1), a: p(t.faqA1) },
    { q: p(t.faqQ2), a: p(t.faqA2) },
    { q: p(t.faqQ3), a: p(t.faqA3) },
    { q: p(t.faqQ4), a: p(t.faqA4) },
    { q: p(t.faqQ5), a: p(t.faqA5) },
    { q: p(t.faqQ6), a: p(t.faqA6) },
    { q: p(t.faqQ7), a: p(t.faqA7) },
    { q: p(t.faqQ8), a: p(t.faqA8) },
  ]

  return (
    <div className="pt-16">
      {/* Why Us */}
      <section className="py-20 bg-warm-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">{p(t.faqValuesLabel)}</span>
            <h2 className="section-title mt-2">{p(t.faqValuesTitle)}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-terracotta/10">
                  <Icon size={24} className="text-terracotta" />
                </div>
                <h3 className="font-display text-lg font-semibold text-charcoal mb-2">{title}</h3>
                <p className="text-sm text-charcoal-light leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Header */}
      <section className="py-20 bg-gradient-to-br from-cream to-warm-100">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-terracotta text-sm font-medium tracking-wider uppercase">{p(t.faqSectionLabel)}</span>
          <h1 className="font-display text-4xl font-bold text-charcoal mt-3 mb-4 sm:text-5xl">
            {p(t.faqSectionTitle)}
          </h1>
          <p className="text-charcoal-light leading-relaxed">
            {p(t.faqSectionSubtitle)}
          </p>
        </div>
      </section>

      {/* FAQ List */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <details key={q} className="card group">
                <summary className="flex cursor-pointer items-center justify-between p-5 text-sm font-medium text-charcoal list-none">
                  {q}
                  <span className="ml-4 shrink-0 text-terracotta transition-transform duration-200 group-open:rotate-45">＋</span>
                </summary>
                <p className="px-5 pb-5 text-sm text-charcoal-light leading-relaxed border-t border-sand-100 pt-4">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-warm-50">
        <div className="mx-auto max-w-xl px-4 text-center">
          <p className="text-charcoal-light mb-6">{p(t.faqCtaText)}</p>
          <Link href="/booking" className="btn-primary text-base px-8 py-3.5">
            {p(t.faqCtaBtn)}
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  )
}
