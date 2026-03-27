'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays } from 'lucide-react'

export default function MobileBookingBar() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  // 只在首页、关于页、作品页显示（预约页本身不需要）
  const show = pathname === '/' || pathname === '/about' || pathname === '/gallery'

  useEffect(() => {
    if (!show) return
    // 滚动超过 300px 后显示
    const onScroll = () => setVisible(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [show])

  if (!show) return null

  return (
    <div
      className={`
        md:hidden fixed bottom-0 inset-x-0 z-50
        transition-transform duration-300
        ${visible ? 'translate-y-0' : 'translate-y-full'}
      `}
    >
      {/* Safe area padding for iPhone home bar */}
      <div className="bg-white/95 backdrop-blur-md border-t border-sand-100 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-warm-lg">
        <Link
          href="/booking"
          className="btn-primary w-full py-3.5 text-base justify-center"
        >
          <CalendarDays size={18} />
          立即预约体验
        </Link>
      </div>
    </div>
  )
}
