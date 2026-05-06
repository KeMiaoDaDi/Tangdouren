'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Star, Clock, Users, MapPin, ChevronRight, Heart, Sparkles, Leaf } from 'lucide-react'
import PixelBeadTitle from '@/components/site/PixelBeadTitle'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { t, pick } from '@/lib/i18n/translations'

interface FeaturedWork {
  id: string
  storage_path: string
  alt_text: string | null
  category: string
}

interface HomeContentProps {
  featuredWorks: FeaturedWork[]
}

const reviews = [
  { name: '小薇', lang: '🇨🇳', rating: 5, text: '超级开心的体验！店员很有耐心，作品完成后真的很有成就感，强烈推荐给朋友们！' },
  { name: 'Amy', lang: '🇬🇧', rating: 5, text: 'Made a cute Shiba Inu with my girlfriend. The studio is cozy and the teacher is wonderful!' },
  { name: '小张', lang: '🇨🇳', rating: 5, text: '给家里猫猫定制了一幅拼豆，可爱爆了！工作室很干净温馨，下次还要来！' },
]

export default function HomeContent({ featuredWorks }: HomeContentProps) {
  const { lang } = useLanguage()
  const p = (entry: { zh: string; en: string }) => pick(entry, lang)

  const steps = [
    { step: '01', emoji: '📅', title: p(t.step1Title), desc: p(t.step1Desc) },
    { step: '02', emoji: '📝', title: p(t.step2Title), desc: p(t.step2Desc) },
    { step: '03', emoji: '🎉', title: p(t.step3Title), desc: p(t.step3Desc) },
  ]

  const locationItems = [
    { icon: MapPin, label: p(t.address),        value: 'Unit 226, 65-75 Whitechapel Road, London E1 1DU' },
    { icon: Clock,  label: p(t.openingHours),   value: p(t.openingHoursValue) },
    { icon: Users,  label: p(t.locationContact), value: p(t.locationContactValue) },
  ]

  return (
    <div className="overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-cream-50 via-warm-100 to-sand-100">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-terracotta/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-sage/10 blur-3xl" />

        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          {['🟠','🔴','🟡','🟢','🔵','🟣','⚪','🟤'].map((bead, i) => (
            <span
              key={i}
              className="absolute text-2xl opacity-20 animate-float"
              style={{
                left:  `${8 + i * 12}%`,
                top:   `${15 + (i % 3) * 25}%`,
                animationDelay: `${i * 0.4}s`,
                animationDuration: `${3 + i * 0.3}s`,
              }}
            >
              {bead}
            </span>
          ))}
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-32 text-center">
          <div className="animate-fade-in flex justify-center mb-10">
            <span className="inline-block rounded-full bg-terracotta/10 px-4 py-1.5 text-sm font-medium text-terracotta border border-terracotta/20">
              {p(t.heroBadge)}
            </span>
          </div>

          <PixelBeadTitle />

          <p className="animate-slide-up mt-6 text-center leading-loose text-lg text-charcoal-light mx-auto whitespace-pre-line"
             style={{ animationDelay: '0.2s' }}>
            {p(t.heroSubtitle)}
          </p>

          <div className="animate-slide-up mt-16 flex flex-wrap items-center justify-center gap-4"
               style={{ animationDelay: '0.3s' }}>
            <Link href="/booking" className="btn-primary text-base px-8 py-3.5">
              {p(t.heroCta)}
              <ArrowRight size={18} />
            </Link>
            <Link href="/gallery" className="btn-secondary text-base px-8 py-3.5">
              {p(t.heroViewGallery)}
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-1 animate-bounce">
          <span className="text-xs text-charcoal-light/50">{p(t.heroScroll)}</span>
          <div className="w-px h-8 bg-gradient-to-b from-charcoal/20 to-transparent" />
        </div>
      </section>

      {/* ── Featured Gallery ─────────────────────────────────────────── */}
      <section className="py-28 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">{p(t.homeGallerySectionLabel)}</span>
            <h2 className="section-title mt-2">{p(t.homeGallerySectionTitle)}</h2>
          </div>

          {featuredWorks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              {featuredWorks.map((work) => (
                <div key={work.id} className="relative aspect-square overflow-hidden rounded-2xl group cursor-pointer">
                  <Image
                    src={work.storage_path}
                    alt={work.alt_text ?? work.category}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  {work.alt_text && (
                    <div className="absolute bottom-0 left-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                      <p className="text-white text-sm font-semibold">{work.alt_text}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-warm-50 py-20 text-center text-charcoal-light">
              <div className="text-5xl mb-4">🫘</div>
              <p className="text-base font-medium text-charcoal">{p(t.homeGalleryComingSoon)}</p>
              <p className="text-sm mt-2 text-charcoal-light">{p(t.homeGalleryStayTuned)}</p>
            </div>
          )}

          <div className="text-center mt-10">
            <Link href="/gallery" className="btn-ghost text-terracotta hover:text-terracotta-dark hover:bg-terracotta/5">
              {p(t.homeGalleryViewAll)}
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section className="py-28 bg-warm-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">{p(t.stepsSectionLabel)}</span>
            <h2 className="section-title mt-2">{p(t.stepsSectionTitle)}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px bg-gradient-to-r from-sand-200 via-terracotta/30 to-sand-200" />
            {steps.map(({ step, emoji, title, desc }) => (
              <div key={step} className="relative text-center px-4">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-terracotta/10 text-3xl">
                  {emoji}
                </div>
                <span className="absolute top-0 right-1/4 text-xs font-bold text-terracotta/30 font-display">{step}</span>
                <h3 className="font-display text-lg font-semibold text-charcoal mb-2">{title}</h3>
                <p className="text-sm text-charcoal-light leading-relaxed max-w-xs mx-auto">{desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link href="/booking" className="btn-primary text-base px-10 py-3.5">
              {p(t.stepsBookBtn)}
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Reviews ──────────────────────────────────────────────────── */}
      <section className="py-28 bg-gradient-to-br from-sand-100 to-cream">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">{p(t.reviewsSectionLabel)}</span>
            <h2 className="section-title mt-2">{p(t.reviewsSectionTitle)}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {reviews.map((review, i) => (
              <div key={i} className="card p-8">
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: review.rating }).map((_, j) => (
                    <Star key={j} size={15} className="fill-terracotta text-terracotta" />
                  ))}
                </div>
                <p className="text-sm text-charcoal-light leading-relaxed mb-6">&ldquo;{review.text}&rdquo;</p>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-terracotta to-terracotta-dark flex items-center justify-center text-white text-xs font-semibold">
                    {review.name[0]}
                  </div>
                  <span className="text-sm font-medium text-charcoal">{review.name}</span>
                  <span className="text-base">{review.lang}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Location ─────────────────────────────────────────────────── */}
      <section className="py-28 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-terracotta text-sm font-medium tracking-wider uppercase">{p(t.locationSectionLabel)}</span>
              <h2 className="section-title mt-2 mb-4">{p(t.locationSectionTitle)}</h2>
              <p className="section-subtitle mb-6">{p(t.locationSectionDesc)}</p>

              <ul className="space-y-4">
                {locationItems.map(({ icon: Icon, label, value }) => (
                  <li key={label} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-terracotta/10">
                      <Icon size={15} className="text-terracotta" />
                    </div>
                    <div>
                      <span className="text-xs text-charcoal-light">{label}</span>
                      <p className="text-sm font-medium text-charcoal">{value}</p>
                    </div>
                  </li>
                ))}
              </ul>

              {/* 客服二维码 */}
              <div className="mt-8 flex items-center gap-6">
                <div className="w-36 h-36 rounded-2xl overflow-hidden border border-sand-200 shadow-sm shrink-0 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/service-qr.jpg" alt="WeChat QR" className="w-full h-full object-contain" />
                </div>
                <div>
                  <p className="text-sm font-medium text-charcoal mb-1">{p(t.locationQrLabel)}</p>
                  <p className="text-xs text-charcoal-light leading-relaxed whitespace-pre-line">{p(t.locationQrSub)}</p>
                </div>
              </div>

              <Link href="/booking" className="btn-primary mt-6 inline-flex">
                {p(t.locationBookBtn)}
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Map placeholder */}
            <div className="relative h-72 lg:h-96 rounded-2xl overflow-hidden bg-gradient-to-br from-sand-100 to-warm-200 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="text-6xl mb-3">📍</div>
                <p className="font-semibold text-charcoal">{p(t.locationMapSearch)}</p>
                <p className="text-charcoal text-lg font-bold mt-2">{p(t.locationMapName)}</p>
                <p className="text-xl mt-1 text-red-500">❤</p>
                <a
                  href="https://maps.google.com/?q=糖豆人手作"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block text-xs text-terracotta hover:underline"
                >
                  {p(t.locationMapLink)}
                </a>
              </div>
              <div className="absolute inset-0 border-2 border-dashed border-sand-200 rounded-2xl m-4 opacity-40 pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────── */}
      <section className="py-28 bg-gradient-to-r from-terracotta to-terracotta-dark text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className="absolute text-4xl select-none" style={{ left: `${(i * 5.3) % 100}%`, top: `${(i * 7.1) % 100}%` }}>
              🫘
            </span>
          ))}
        </div>
        <div className="relative mx-auto max-w-2xl px-4 text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl mb-4">
            {p(t.ctaTitle)}
          </h2>
          <p className="text-white/80 text-lg mb-8">
            {p(t.ctaSubtitle)}
          </p>
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-terracotta shadow-warm-lg hover:bg-cream transition-colors"
          >
            {p(t.ctaBtn)}
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

    </div>
  )
}
