'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/',          label: '首页' },
  { href: '/gallery',   label: '作品展示' },
  { href: '/about',     label: '关于我们' },
  { href: '/booking',   label: '立即预约' },
]

export default function NavBar() {
  const pathname                  = usePathname()
  const [open, setOpen]           = useState(false)
  const [scrolled, setScrolled]   = useState(false)

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
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-2xl select-none">"Logo"</span>
          <span className="font-display text-lg font-semibold text-charcoal group-hover:text-terracotta transition-colors">
            伦敦糖豆人拼豆工作室
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
        </ul>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-warm-100 transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="菜单"
        >
          {open ? <X size={20} className="text-charcoal" /> : <Menu size={20} className="text-charcoal" />}
        </button>
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
