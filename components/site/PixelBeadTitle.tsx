'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

// ── 配置 ─────────────────────────────────────────────────────────────────────
const LINE1   = '爱拼才'
const LINE2   = '会赢！'
const LINES   = [LINE1, LINE2]
const NCOLS   = 3          // 每行3字
const W       = 780          // 加宽画布，为拉伸后的字形留出空间
const H       = 430
const FS      = 185
const STRETCH = 1.3          // 水平拉伸系数（字形变宽30%）
const LINE1_Y = 115
const LINE2_Y = 320
const LINE_MID = (LINE1_Y + LINE2_Y) / 2
const STEP    = 8          // 细笔画至少2个采样点，爱/赢等复杂字更清晰
const R       = 3.2        // R/STEP=0.4，豆间保持清晰间隙

// 缓存版本号：v4 修复字重检测（ZCOOL 只有 400 字重）
const CACHE_VER = `v4-${W}-${H}-${FS}-${STEP}-${R}-${STRETCH}`

const CHAR_COLORS: string[][] = [
  ['#E85252', '#F07070', '#C43838'],
  ['#F5882A', '#F5A95A', '#D46518'],
  ['#F0C828', '#F5DC60', '#C8A010'],
  ['#42B86A', '#6CCC8A', '#2A9850'],
  ['#3AABDC', '#60C4F0', '#1A88BC'],
  ['#A855F7', '#C47EF7', '#8030D8'],
]

interface Dot { x: number; y: number; color: string }
interface VB   { x: number; y: number; w: number; h: number }

// ── 模块级缓存：第一次采样成功后存储，后续导航直接复用，彻底避免字体重载问题 ──
let _cache: { ver: string; dots: Dot[]; vb: VB } | null = null

// ── 字体就绪检测：ZCOOL QingKe HuangYou 只有单一字重，用 400 检测 ──
async function waitForZCOOL(fs: number, timeoutMs = 6000): Promise<void> {
  // ZCOOL 字体只有一个字重，必须用 400 检测，否则 fonts.check() 永远返回 false
  const fontSpec400 = `400 ${fs}px 'ZCOOL QingKe HuangYou'`

  // 优先方案：document.fonts.load() 是最可靠的字体加载 API
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await Promise.race([
        document.fonts.load(fontSpec400),
        new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
      ])
      if (document.fonts.check(fontSpec400)) return
    } catch { /* 降级到轮询 */ }
  }

  // 回退方案：对比 ZCOOL 与 sans-serif 渲染宽度差（不指定字重，用浏览器默认匹配）
  const cvs = document.createElement('canvas')
  cvs.width = 400; cvs.height = 100
  const ctx = cvs.getContext('2d')!
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    ctx.font = `${fs}px 'ZCOOL QingKe HuangYou', sans-serif`
    const w1 = ctx.measureText('爱拼').width
    ctx.font = `${fs}px sans-serif`
    const w2 = ctx.measureText('爱拼').width
    if (Math.abs(w1 - w2) > fs * 0.05) return
    await new Promise(r => setTimeout(r, 60))
  }
}

export default function PixelBeadTitle() {
  const svgRef     = useRef<SVGSVGElement>(null)
  const [dots, setDots] = useState<Dot[]>([])
  const [vb,   setVb  ] = useState<VB>({ x: 0, y: 0, w: W, h: H })
  const didAnimate = useRef(false)

  useEffect(() => {
    let alive = true
    didAnimate.current = false

    ;(async () => {
      // ── 有缓存直接用，跳过字体加载和采样 ──
      if (_cache && _cache.ver === CACHE_VER) {
        if (alive) { setVb(_cache.vb); setDots(_cache.dots) }
        return
      }

      // ── 首次：等 ZCOOL 字体就绪再采样 ──
      await waitForZCOOL(FS)

      const cvs = document.createElement('canvas')
      // 按屏幕 DPI 缩放 canvas，高分屏字体渲染更清晰，采样更准确
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      cvs.width = W * dpr; cvs.height = H * dpr
      const ctx = cvs.getContext('2d')!
      ctx.scale(dpr, dpr)

      ctx.fillStyle    = '#000'
      ctx.font         = `900 ${FS}px 'ZCOOL QingKe HuangYou', 'Noto Sans SC', sans-serif`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'

      const cellW = W / NCOLS

      // 每行3字等宽排列，水平拉伸 STRETCH 倍使字形更宽
      LINES.forEach((line, li) => {
        const lineY = li === 0 ? LINE1_Y : LINE2_Y
        line.split('').forEach((ch, ci) => {
          const cx = cellW * ci + cellW / 2
          ctx.save()
          ctx.translate(cx, lineY)
          ctx.scale(STRETCH, 1)
          ctx.fillText(ch, 0, 0)
          ctx.restore()
        })
      })

      // 采样物理像素，坐标换算回逻辑像素存入 dots
      const { data } = ctx.getImageData(0, 0, W * dpr, H * dpr)
      const out: Dot[] = []
      const segW = cellW
      const stepPhy = Math.round(STEP * dpr)

      for (let py = 0; py < H * dpr; py += stepPhy) {
        for (let px = 0; px < W * dpr; px += stepPhy) {
          if (data[(py * W * dpr + px) * 4 + 3] > 100) {
            const lx = px / dpr
            const ly = py / dpr
            const lineOff = ly < LINE_MID ? 0 : 3
            const charIdx = lineOff + Math.min(Math.floor(lx / segW), NCOLS - 1)
            const palette = CHAR_COLORS[charIdx]
            out.push({ x: lx, y: ly, color: palette[Math.floor(ly / STEP) % palette.length] })
          }
        }
      }

      out.sort((a, b) => a.x - b.x || a.y - b.y)

      if (out.length > 0 && alive) {
        const pad = STEP * 1.5
        const xs = out.map(d => d.x), ys = out.map(d => d.y)
        const vb: VB = {
          x: Math.min(...xs) - pad,
          y: Math.min(...ys) - pad,
          w: Math.max(...xs) - Math.min(...xs) + pad * 2,
          h: Math.max(...ys) - Math.min(...ys) + pad * 2,
        }
        // 存入模块缓存，后续导航直接复用
        _cache = { ver: CACHE_VER, dots: out, vb }
        setVb(vb)
        setDots(out)
      }
    })()

    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!dots.length || !svgRef.current || didAnimate.current) return
    didAnimate.current = true

    const circles = svgRef.current.querySelectorAll<SVGCircleElement>('circle')
    const tl = gsap.timeline({ repeat: -1 })

    tl.fromTo(circles,
      { scale: 0, opacity: 0, transformOrigin: '50% 50%' },
      { scale: 1, opacity: 1, duration: 0.38, ease: 'back.out(2.8)',
        stagger: { amount: 1.6, from: 'start' } }
    )
    tl.to({}, { duration: 6 })
    tl.to(circles, {
      scale: 0, opacity: 0, duration: 0.28, ease: 'back.in(1.8)',
      stagger: { amount: 1.0, from: 'start' }
    })
    tl.to({}, { duration: 0.35 })
  }, [dots])

  return (
    <div className="w-full" aria-label="爱拼才会赢！">
      {dots.length === 0 ? (
        <div style={{ height: H }} />
      ) : (
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="w-full"
          role="img"
          aria-hidden="true"
        >
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={R} fill={d.color} />
          ))}
        </svg>
      )}
    </div>
  )
}

