'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const copy = {
  zh: { hint: '双指缩放 · 左右滑动翻页', close: '关闭' },
  en: { hint: 'Pinch to zoom · Swipe to flip', close: 'Close' },
} as const

interface ImageLightboxProps {
  images: string[]
  initialIndex: number
  onClose: () => void
}

export default function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
  const { lang } = useLanguage()
  const c = copy[lang]
  const [index, setIndex] = useState(initialIndex)

  // 触摸滑动状态（不实现缩放，缩放交给浏览器原生捏合）
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const pinchCancelled = useRef(false)
  const swiped = useRef(false)

  const goPrev = useCallback(() => setIndex(i => (i - 1 + images.length) % images.length), [images.length])
  const goNext = useCallback(() => setIndex(i => (i + 1) % images.length), [images.length])

  // 打开时锁背景滚动
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // 键盘：Esc 关闭，←/→ 翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, goPrev, goNext])

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    pinchCancelled.current = false
    swiped.current = false
  }

  function onTouchMove(e: React.TouchEvent) {
    // 双指捏合 → 取消翻页；已被原生放大（正在平移）→ 取消翻页
    if (e.touches.length >= 2) { pinchCancelled.current = true; return }
    if (window.visualViewport && window.visualViewport.scale > 1.01) { pinchCancelled.current = true }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start || pinchCancelled.current || e.changedTouches.length !== 1) return

    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true
      if (dx < 0) goNext()
      else goPrev()
    }
  }

  // 点击图片四周空白关闭；滑动结束后忽略随之而来的 click
  function onImageAreaClick(e: React.MouseEvent) {
    if (swiped.current) { swiped.current = false; return }
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* 顶栏：计数 + 关闭 */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-white/90">
          {index + 1} / {images.length}
        </span>
        <button
          onClick={onClose}
          aria-label={c.close}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X size={20} />
        </button>
      </div>

      {/* 图片区：原生捏合缩放，左右滑动翻页，点空白关闭 */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-2"
        onClick={onImageAreaClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={images[index]}
          src={images[index]}
          alt={lang === 'zh' ? `拼豆图片教程第 ${index + 1} 步` : `Bead art tutorial step ${index + 1}`}
          className="max-h-full max-w-full object-contain"
          draggable={false}
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-4 text-center">
        <p className="text-xs text-white/60">{c.hint}</p>
      </div>
    </div>
  )
}
