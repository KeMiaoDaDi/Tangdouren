'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { t, pick } from '@/lib/i18n/translations'

export default function NavBar() {
  const pathname                  = usePathname()
  const [open, setOpen]           = useState(false)
  const [scrolled, setScrolled]   = useState(false)
  const { lang, toggle }          = useLanguage()

  const navLinks = [
    { href: '/',         label: pick(t.navHome,     lang) },
    { href: '/gallery',  label: pick(t.navGallery,  lang) },
    { href: '/location', label: pick(t.navLocation, lang) },
    { href: '/faq',      label: pick(t.navFaq,      lang) },
    { href: '/booking',  label: pick(t.navBook,     lang) },
  ]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/90 backdrop-blur-md shadow-card border-b border-sand-100'
          : 'bg-transparent'
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0 shadow-sm">
            <Image
              src="/logo.png"
              alt={pick(t.studioName, lang)}
              width={112}
              height={112}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <span className="font-display text-base font-semibold text-charcoal group-hover:text-terracotta transition-colors leading-tight">
            {lang === 'zh' ? (
              <>糖豆人<br />手工工作室</>
            ) : (
              <>Jelly Bean<br />Studio</>
            )}
          </span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label }) =>
            href === '/booking' ? (
              <li key={href}>
                <Link href={href} className="btn-primary text-sm px-5 py-2 ml-2">
                  {label}
                </Link>
              </li>
            ) : (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    pathname === href
                      ? 'text-terracotta bg-terracotta/8 font-semibold'
                      : 'text-charcoal-light hover:text-charcoal hover:bg-warm-100'
                  )}
                >
                  {label}
                </Link>
              </li>
            )
          )}

          {/* Language toggle */}
          <li>
            <button
              onClick={toggle}
              className="ml-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-sand-200 text-charcoal-light hover:text-charcoal hover:border-terracotta/40 hover:bg-warm-100 transition-all duration-200 tracking-wide"
              aria-label="Switch language"
            >
              {lang === 'zh' ? 'EN' : '中'}
            </button>
          </li>
        </ul>

        {/* Mobile: language toggle + hamburger */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={toggle}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-sand-200 text-charcoal-light hover:text-charcoal hover:bg-warm-100 transition-all"
            aria-label="Switch language"
          >
            {lang === 'zh' ? 'EN' : '中'}
          </button>
          <button
            className="p-2 rounded-lg hover:bg-warm-100 transition-colors"
            onClick={() => setOpen(!open)}
            aria-label="菜单"
          >
            {open ? <X size={20} className="text-charcoal" /> : <Menu size={20} className="text-charcoal" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white/95 backdrop-blur-md border-b border-sand-100 px-4 pb-4">
          <ul className="flex flex-col gap-1 pt-2">
            {navLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                    href === '/booking'
                      ? 'bg-terracotta text-white text-center mt-2'
                      : pathname === href
                        ? 'text-terracotta bg-terracotta/8 font-semibold'
                        : 'text-charcoal hover:bg-warm-100'
                  )}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}
