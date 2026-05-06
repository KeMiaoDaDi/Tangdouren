'use client'

import Link from 'next/link'
import { MapPin, Mail } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { t, pick } from '@/lib/i18n/translations'

export default function Footer() {
  const { lang } = useLanguage()
  const p = (entry: { zh: string; en: string }) => pick(entry, lang)

  const navLinks = [
    { href: '/',         label: p(t.navHome) },
    { href: '/gallery',  label: p(t.navGallery) },
    { href: '/faq',      label: 'FAQs' },
    { href: '/booking',  label: p(t.footerInline) },
  ]

  return (
    <footer className="bg-charcoal text-white/80">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="logo" className="w-8 h-8 rounded-lg object-cover shrink-0" />
              <span className="font-display text-lg font-semibold text-white">{p(t.studioName)}</span>
            </div>
            <p className="text-sm leading-relaxed text-white/60 whitespace-pre-line">
              {p(t.studioTagline)}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">{p(t.footerQuickLinks)}</h4>
            <ul className="space-y-2 text-sm">
              {navLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="hover:text-terracotta-light transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">{p(t.footerContact)}</h4>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 shrink-0 text-terracotta-light" />
                <span>
                  Unit 226, 65-75 Whitechapel Road<br />
                  London E1 1DU<br />
                  <span className="text-white/50">{p(t.footerTimezone)}</span>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={14} className="shrink-0 text-terracotta-light" />
                <a href="mailto:hello@tangdouren.co.uk" className="hover:text-terracotta-light transition-colors">
                  hello@tangdouren.co.uk
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <p>{p(t.footerCopyright)}</p>
          <Link href="/login" className="hover:text-white/60 transition-colors">
            {p(t.footerAdmin)}
          </Link>
        </div>
      </div>
    </footer>
  )
}
