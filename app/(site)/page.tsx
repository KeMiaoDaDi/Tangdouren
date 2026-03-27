import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Star, Clock, Users, MapPin, ChevronRight } from 'lucide-react'

// ─── Mock gallery data ───────────────────────────────────────────────────────
const featuredWorks = [
  { id: 1, title: '彩虹独角兽', category: '动物系列', src: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', span: 'col-span-2 row-span-2' },
  { id: 2, title: '星空风景',   category: '风景系列', src: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=400&h=400&fit=crop', span: '' },
  { id: 3, title: '可爱柴犬',   category: '宠物定制', src: 'https://images.unsplash.com/photo-1611003229636-9f9128dbb445?w=400&h=400&fit=crop', span: '' },
  { id: 4, title: '草莓蛋糕',   category: '美食系列', src: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=400&fit=crop', span: '' },
  { id: 5, title: '日式庭院',   category: '风景系列', src: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=400&h=400&fit=crop', span: '' },
]

const reviews = [
  { name: '小雨', lang: '🇨🇳', rating: 5, text: '超级开心的体验！老师很有耐心，作品完成后真的很有成就感，强烈推荐给朋友们！' },
  { name: 'Amy', lang: '🇬🇧', rating: 5, text: 'Made a cute Shiba Inu with my girlfriend. The studio is cozy and the teacher is wonderful!' },
  { name: '晓彤', lang: '🇨🇳', rating: 5, text: '给自己的猫咪做了一幅定制肖像，简直太可爱了！工作室环境温馨，下次还要来！' },
]

export default function HomePage() {
  return (
    <div className="overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-cream-50 via-warm-100 to-sand-100">
        {/* Decorative blobs */}
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-terracotta/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-sage/10 blur-3xl" />

        {/* Floating beads decoration */}
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
          <div className="animate-fade-in">
            <span className="inline-block mb-4 rounded-full bg-terracotta/10 px-4 py-1.5 text-sm font-medium text-terracotta border border-terracotta/20">
              伦敦拼豆手作体验工作室
            </span>
          </div>

          <h1 className="animate-slide-up font-display text-5xl font-bold text-charcoal leading-tight mt-4 sm:text-6xl lg:text-7xl"
              style={{ animationDelay: '0.1s' }}>
            于遥 James，<br />
            <span className="text-terracotta">是Gay</span>
          </h1>

          <p className="animate-slide-up mt-6 text-lg text-charcoal-light max-w-lg mx-auto leading-relaxed"
             style={{ animationDelay: '0.2s' }}>
            不来的是gay，来了也是gay。
          </p>

          <div className="animate-slide-up mt-10 flex flex-wrap items-center justify-center gap-4"
               style={{ animationDelay: '0.3s' }}>
            <Link href="/booking" className="btn-primary text-base px-8 py-3.5">
              立即预约体验
              <ArrowRight size={18} />
            </Link>
            <Link href="/gallery" className="btn-secondary text-base px-8 py-3.5">
              查看作品展示
            </Link>
          </div>

          {/* Stats */}
          <div className="animate-slide-up mt-16 grid grid-cols-3 gap-4 max-w-sm mx-auto"
               style={{ animationDelay: '0.4s' }}>
            {[
              { label: '完成作品', value: '500+' },
              { label: '好评率',   value: '98%' },
              { label: '每周开放', value: '6场' },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="font-display text-2xl font-bold text-terracotta">{value}</div>
                <div className="text-xs text-charcoal-light mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce">
          <span className="text-xs text-charcoal-light/50">向下滚动</span>
          <div className="w-px h-8 bg-gradient-to-b from-charcoal/20 to-transparent" />
        </div>
      </section>

      {/* ── Featured Gallery ─────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">作品展示</span>
            <h2 className="section-title mt-2">每一颗豆都有温度</h2>
            <p className="section-subtitle mt-3 max-w-md mx-auto">
              学员们的精彩创作，每件都是独一无二的存在
            </p>
          </div>

          {/* Mobile: 2-column uniform grid / Desktop: mosaic grid */}
          <div className="grid grid-cols-2 gap-3 sm:hidden">
            {featuredWorks.map((work) => (
              <div key={work.id} className="relative aspect-square overflow-hidden rounded-2xl group cursor-pointer">
                <Image
                  src={work.src} alt={work.title} fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="50vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 p-2.5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                  <p className="text-white text-xs font-semibold">{work.title}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:grid grid-cols-3 grid-rows-2 gap-3 h-[600px]">
            {featuredWorks.map((work) => (
              <div
                key={work.id}
                className={`${work.span || ''} relative overflow-hidden rounded-2xl group cursor-pointer`}
              >
                <Image
                  src={work.src} alt={work.title} fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                  <p className="text-white text-sm font-semibold">{work.title}</p>
                  <p className="text-white/70 text-xs">{work.category}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/gallery" className="btn-ghost text-terracotta hover:text-terracotta-dark hover:bg-terracotta/5">
              查看全部作品
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">预约流程</span>
            <h2 className="section-title mt-2">三步开启你的拼豆之旅</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px bg-gradient-to-r from-sand-200 via-terracotta/30 to-sand-200" />

            {[
              { step: '01', emoji: '📅', title: '选择日期时段', desc: '浏览可预约日历，选择你心仪的日期与时间段' },
              { step: '02', emoji: '📝', title: '填写预约信息', desc: '告诉我们你的姓名、联系方式和参与人数' },
              { step: '03', emoji: '🎉', title: '到店开始创作', desc: '收到确认后，带着好心情来工作室，一起动手创作！' },
            ].map(({ step, emoji, title, desc }) => (
              <div key={step} className="relative text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-terracotta/10 text-2xl">
                  {emoji}
                </div>
                <span className="absolute top-0 right-1/4 text-xs font-bold text-terracotta/30 font-display">{step}</span>
                <h3 className="font-display text-lg font-semibold text-charcoal mb-2">{title}</h3>
                <p className="text-sm text-charcoal-light leading-relaxed max-w-xs mx-auto">{desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/booking" className="btn-primary text-base px-10 py-3.5">
              马上预约
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Reviews ──────────────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-sand-100 to-cream">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-terracotta text-sm font-medium tracking-wider uppercase">学员反馈</span>
            <h2 className="section-title mt-2">他们说</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {reviews.map((review, i) => (
              <div key={i} className="card p-6">
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: review.rating }).map((_, j) => (
                    <Star key={j} size={14} className="fill-terracotta text-terracotta" />
                  ))}
                </div>
                <p className="text-sm text-charcoal-light leading-relaxed mb-4">"{review.text}"</p>
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
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-terracotta text-sm font-medium tracking-wider uppercase">找到我们</span>
              <h2 className="section-title mt-2 mb-4">来伦敦看看我们</h2>
              <p className="section-subtitle mb-6">
                工作室位于伦敦市中心，交通便利，环境温馨。工作时间为英国本地时间（GMT/BST），
                预约确认后会发送详细地址。
              </p>

              <ul className="space-y-4">
                {[
                  { icon: MapPin,  label: '地址', value: 'London, United Kingdom' },
                  { icon: Clock,   label: '营业时间', value: '周三至周日 10:00 – 18:00 (GMT/BST)' },
                  { icon: Users,   label: '每场人数', value: '最多 4 人，温馨小班' },
                ].map(({ icon: Icon, label, value }) => (
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

              <Link href="/booking" className="btn-primary mt-8 inline-flex">
                预约到访
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Map placeholder */}
            <div className="relative h-72 lg:h-96 rounded-2xl overflow-hidden bg-gradient-to-br from-sand-100 to-warm-200 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-3">🗺️</div>
                <p className="text-charcoal-light text-sm">预约确认后提供详细地址</p>
              </div>
              <div className="absolute inset-0 border-2 border-dashed border-sand-200 rounded-2xl m-4 opacity-40 pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-r from-terracotta to-terracotta-dark text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className="absolute text-4xl select-none" style={{ left: `${(i * 5.3) % 100}%`, top: `${(i * 7.1) % 100}%` }}>
              🫘
            </span>
          ))}
        </div>
        <div className="relative mx-auto max-w-2xl px-4 text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl mb-4">
            准备好了吗？
          </h2>
          <p className="text-white/80 text-lg mb-8">
            现在预约，和我们一起用小豆子创造大惊喜
          </p>
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-terracotta shadow-warm-lg hover:bg-cream transition-colors"
          >
            立即预约体验
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

    </div>
  )
}
