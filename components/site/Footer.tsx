import Link from 'next/link'
import { MapPin, Mail, Instagram } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-charcoal text-white/80">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">"Logo"</span>
              <span className="font-display text-lg font-semibold text-white">伦敦糖豆人拼豆工作室</span>
            </div>
            <p className="text-sm leading-relaxed text-white/60">
              在伦敦，用一颗颗小豆子，<br />拼出你独一无二的糖豆人。
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">快捷导航</h4>
            <ul className="space-y-2 text-sm">
              {[
                { href: '/', label: '首页' },
                { href: '/gallery', label: '作品展示' },
                { href: '/about', label: '关于我们' },
                { href: '/booking', label: '在线预约' },
              ].map(({ href, label }) => (
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
            <h4 className="text-sm font-semibold text-white mb-3">联系我们</h4>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 shrink-0 text-terracotta-light" />
                <span>London, United Kingdom<br /><span className="text-white/50">（英国时区 GMT/BST）</span></span>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={14} className="shrink-0 text-terracotta-light" />
                <a href="mailto:hello@pinbean.studio" className="hover:text-terracotta-light transition-colors">
                  hello@pinbean.studio
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Instagram size={14} className="shrink-0 text-terracotta-light" />
                <a href="#" className="hover:text-terracotta-light transition-colors">
                  @pinbean.studio
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <p>© 2025 拼豆工作室 Pinbean Studio. All rights reserved.</p>
          <Link href="/login" className="hover:text-white/60 transition-colors">
            管理员入口
          </Link>
        </div>
      </div>
    </footer>
  )
}
