'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { t, pick } from '@/lib/i18n/translations'

export default function GalleryHeader() {
  const { lang } = useLanguage()
  const p = (entry: { zh: string; en: string }) => pick(entry, lang)

  return (
    <section className="py-16 bg-gradient-to-br from-cream to-warm-100 text-center">
      <span className="text-terracotta text-sm font-medium tracking-wider uppercase">
        {p(t.gallerySectionLabel)}
      </span>
      <h1 className="font-display text-4xl font-bold text-charcoal mt-2 sm:text-5xl">
        {p(t.galleryPageTitle)}
        <span className="text-terracotta">{p(t.galleryPageTitleHighlight)}</span>
        {p(t.galleryPageTitleSuffix)}
      </h1>
      <p className="mt-4 text-charcoal-light max-w-md mx-auto">
        {p(t.galleryPageSubtitle)}
      </p>
    </section>
  )
}
