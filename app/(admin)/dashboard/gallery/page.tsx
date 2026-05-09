'use client'

import { useState, useEffect, useRef, useCallback, DragEvent } from 'react'
import Image from 'next/image'
import { Upload, Trash2, Pencil, X, Check, AlertCircle, Loader2, Home, Plus, CheckCircle2, ImagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GalleryItem } from '@/components/site/GalleryGrid'

const BASE_CATEGORIES = ['展示图库']

// ── 队列项类型 ─────────────────────────────────────────────────────────────────

interface QueueItem {
  id:      string
  file:    File
  preview: string
  alt:     string
  cat:     string
  status:  'pending' | 'uploading' | 'done' | 'error'
  error?:  string
}

// ── 编辑弹层 ─────────────────────────────────────────────────────────────────

function EditModal({
  item,
  categories,
  onClose,
  onSave,
}: {
  item:       GalleryItem
  categories: string[]
  onClose:    () => void
  onSave:     (id: string, alt: string, cat: string) => Promise<void>
}) {
  const [alt, setAlt]       = useState(item.alt_text ?? '')
  const [cat, setCat]       = useState(item.category)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(item.id, alt, cat)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-charcoal">编辑图片信息</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-warm-100 text-charcoal-light">
            <X size={16} />
          </button>
        </div>

        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-warm-50">
          <Image src={item.storage_path} alt={item.alt_text ?? ''} fill className="object-cover" sizes="320px" />
        </div>

        <div>
          <label className="label">说明文字（Alt Text）</label>
          <input
            className="input-field"
            placeholder="如：彩虹独角兽、柴犬肖像"
            value={alt}
            onChange={e => setAlt(e.target.value)}
          />
        </div>

        <div>
          <label className="label">分类</label>
          <select className="input-field" value={cat} onChange={e => setCat(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm">取消</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 py-2.5 text-sm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function GalleryAdminPage() {
  const [items,    setItems]   = useState<GalleryItem[]>([])
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState('')

  // 自定义分类
  const [extraCats, setExtraCats] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('gallery_extra_cats') ?? '[]') } catch { return [] }
  })
  const [newCatInput, setNewCatInput] = useState('')

  const allCategories = Array.from(new Set([
    ...BASE_CATEGORIES,
    ...items.map(i => i.category),
    ...extraCats,
  ]))

  function addCategory() {
    const name = newCatInput.trim()
    if (!name || allCategories.includes(name)) { setNewCatInput(''); return }
    const next = [...extraCats, name]
    setExtraCats(next)
    localStorage.setItem('gallery_extra_cats', JSON.stringify(next))
    setDefaultCat(name)
    setNewCatInput('')
  }

  function removeExtraCat(cat: string) {
    const next = extraCats.filter(c => c !== cat)
    setExtraCats(next)
    localStorage.setItem('gallery_extra_cats', JSON.stringify(next))
    if (defaultCat === cat) setDefaultCat(BASE_CATEGORIES[0])
  }

  // ── 上传队列 ───────────────────────────────────────────────────────────────
  const [queue,       setQueue]      = useState<QueueItem[]>([])
  const [isDragging,  setIsDragging] = useState(false)
  const [defaultCat,  setDefaultCat] = useState('展示图库')
  const [uploading,   setUploading]  = useState(false)

  // 编辑 / 删除
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const featuredCount = items.filter(i => i.category === '展示图库').length
  const featuredFull  = featuredCount >= 4

  // ── 加载图库 ───────────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/gallery')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '加载失败')
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // ── 添加文件到队列 ─────────────────────────────────────────────────────────
  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif']
    const newItems: QueueItem[] = []

    for (const file of arr) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!allowed.includes(ext)) continue
      if (file.size > 5 * 1024 * 1024) continue
      newItems.push({
        id:      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
        alt:     '',
        cat:     defaultCat,
        status:  'pending',
      })
    }
    setQueue(prev => [...prev, ...newItems])
  }

  // ── 拖拽事件 ───────────────────────────────────────────────────────────────
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setIsDragging(true)
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  // ── 移出队列 ───────────────────────────────────────────────────────────────
  function removeFromQueue(id: string) {
    setQueue(prev => {
      const item = prev.find(q => q.id === id)
      if (item) URL.revokeObjectURL(item.preview)
      return prev.filter(q => q.id !== id)
    })
  }

  // ── 修改队列项 ─────────────────────────────────────────────────────────────
  function updateQueueItem(id: string, patch: Partial<Pick<QueueItem, 'alt' | 'cat'>>) {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q))
  }

  // ── 上传队列 ───────────────────────────────────────────────────────────────
  async function handleUploadAll() {
    if (uploading || queue.length === 0) return
    setUploading(true)

    for (const item of queue) {
      if (item.status === 'done') continue

      // mark uploading
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading' } : q))

      try {
        const fd = new FormData()
        fd.append('file',     item.file)
        fd.append('alt_text', item.alt)
        fd.append('category', item.cat)

        const res  = await fetch('/api/gallery', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? '上传失败')

        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done' } : q))
      } catch (e) {
        setQueue(prev => prev.map(q =>
          q.id === item.id
            ? { ...q, status: 'error', error: e instanceof Error ? e.message : '上传失败' }
            : q
        ))
      }
    }

    setUploading(false)
    await fetchItems()
  }

  // 清除已完成项
  function clearDone() {
    setQueue(prev => {
      prev.filter(q => q.status === 'done').forEach(q => URL.revokeObjectURL(q.preview))
      return prev.filter(q => q.status !== 'done')
    })
  }

  const pendingCount = queue.filter(q => q.status === 'pending' || q.status === 'error').length
  const doneCount    = queue.filter(q => q.status === 'done').length

  // ── 删除图库图片 ───────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/gallery/${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '删除失败') }
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSaveEdit(id: string, alt: string, cat: string) {
    const res = await fetch(`/api/gallery/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ alt_text: alt || null, category: cat }),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '保存失败') }
    setItems(prev => prev.map(i => i.id === id ? { ...i, alt_text: alt || null, category: cat } : i))
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">作品图库</h1>
        <p className="text-sm text-charcoal-light mt-0.5">管理前台展示的作品图片</p>
      </div>

      {/* 分类管理 */}
      <div className="card p-5">
        <h2 className="font-semibold text-charcoal text-sm mb-3">分类管理</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/10 text-terracotta px-3 py-1 text-xs font-medium">
            <Home size={11} /> 展示图库
          </span>
          {Array.from(new Set(items.map(i => i.category)))
            .filter(c => !BASE_CATEGORIES.includes(c) && !extraCats.includes(c))
            .map(c => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-stone-100 text-stone-600 px-3 py-1 text-xs font-medium">{c}</span>
            ))}
          {extraCats.map(c => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-600 px-3 py-1 text-xs font-medium">
              {c}
              <button onClick={() => removeExtraCat(c)} className="hover:text-red-500 transition"><X size={11} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newCatInput}
            onChange={e => setNewCatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="输入新分类名称，回车确认"
            className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30"
          />
          <button
            onClick={addCategory}
            disabled={!newCatInput.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-terracotta text-white rounded-xl text-sm font-medium hover:bg-terracotta/90 disabled:opacity-40 transition"
          >
            <Plus size={14} /> 添加
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-1.5">蓝色标签为自定义分类，点 × 可移除（不影响已分配的图片）</p>
      </div>

      {/* 上传区 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-charcoal text-sm">上传新作品</h2>
          {queue.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-charcoal-light">
              <span>{queue.length} 张待处理</span>
              {doneCount > 0 && (
                <button onClick={clearDone} className="text-terracotta hover:underline">清除已完成</button>
              )}
            </div>
          )}
        </div>

        {/* 默认分类选择 */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs text-charcoal-light whitespace-nowrap">默认分类</label>
          <select
            className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30"
            value={defaultCat}
            onChange={e => setDefaultCat(e.target.value)}
          >
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {defaultCat === '展示图库' && (
            <span className={cn(
              'text-xs whitespace-nowrap',
              featuredFull ? 'text-red-500' : 'text-charcoal-light'
            )}>
              {featuredCount}/4
              {featuredFull && ' 已满'}
            </span>
          )}
        </div>

        {/* 拖拽 / 点击区域 */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors mb-4',
            isDragging
              ? 'border-terracotta bg-terracotta/5'
              : 'border-sand-200 hover:border-terracotta/40'
          )}
        >
          <ImagePlus size={28} className={cn('mx-auto mb-2', isDragging ? 'text-terracotta' : 'text-sand-300')} />
          <p className="text-sm font-medium text-charcoal">
            {isDragging ? '松开即可添加' : '拖拽图片到此处，或点击选择'}
          </p>
          <p className="text-xs text-charcoal-light mt-1">支持 JPG、PNG、WebP，单张最大 5MB，可多选</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
        />

        {/* 队列列表 */}
        {queue.length > 0 && (
          <div className="space-y-3 mb-4">
            {queue.map(item => (
              <div
                key={item.id}
                className={cn(
                  'flex gap-3 items-start rounded-2xl border p-3 transition-colors',
                  item.status === 'done'     ? 'bg-green-50 border-green-200'  :
                  item.status === 'error'    ? 'bg-red-50 border-red-200'      :
                  item.status === 'uploading'? 'bg-amber-50 border-amber-200'  :
                  'bg-stone-50 border-stone-200'
                )}
              >
                {/* 预览缩略图 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt="" className="h-16 w-16 rounded-xl object-cover shrink-0" />

                {/* 内容 */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-xs text-charcoal-light truncate">{item.file.name}</p>
                  {item.status === 'pending' || item.status === 'error' ? (
                    <div className="flex gap-2">
                      <input
                        className="flex-1 border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-terracotta/30 bg-white"
                        placeholder="说明文字（可选）"
                        value={item.alt}
                        onChange={e => updateQueueItem(item.id, { alt: e.target.value })}
                      />
                      <select
                        className="border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-terracotta/30 bg-white"
                        value={item.cat}
                        onChange={e => updateQueueItem(item.id, { cat: e.target.value })}
                      >
                        {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ) : item.status === 'uploading' ? (
                    <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                      <Loader2 size={12} className="animate-spin" />
                      上传中…
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-green-600 text-xs">
                      <CheckCircle2 size={12} />
                      上传成功
                    </div>
                  )}
                  {item.status === 'error' && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle size={11} />{item.error ?? '上传失败，可重试'}
                    </p>
                  )}
                </div>

                {/* 状态图标 / 移除按钮 */}
                <div className="shrink-0">
                  {item.status !== 'uploading' && (
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="p-1.5 rounded-lg hover:bg-stone-200 text-charcoal-light transition"
                      title="移出队列"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 上传按钮 */}
        {queue.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={() => { queue.forEach(q => removeFromQueue(q.id)) }}
              disabled={uploading}
              className="btn-secondary text-sm px-4 py-2"
            >
              全部清除
            </button>
            <button
              onClick={handleUploadAll}
              disabled={uploading || pendingCount === 0}
              className="btn-primary text-sm px-5 py-2 flex items-center gap-1.5"
            >
              {uploading
                ? <><Loader2 size={14} className="animate-spin" />上传中…</>
                : <><Upload size={14} />上传全部（{pendingCount} 张）</>
              }
            </button>
          </div>
        )}
      </div>

      {/* 图库列表 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-charcoal text-sm">
            已上传图片
            {!loading && <span className="ml-1 text-charcoal-light font-normal">（{items.length} 张）</span>}
          </h2>
          <button onClick={fetchItems} className="text-xs text-terracotta hover:underline">刷新</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-charcoal-light text-sm">
            <Loader2 size={18} className="animate-spin" />加载中…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-10 text-red-500 text-sm">
            <AlertCircle size={16} />{error}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-charcoal-light">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="w-12 h-12 rounded-xl object-cover mx-auto mb-3 opacity-40" />
            <p className="text-sm">暂无图片，请先上传</p>
            <p className="text-xs mt-1 text-charcoal-light/60">
              提示：需先在 Supabase 控制台创建名为「gallery」的 Public Bucket
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {['展示图库', ...Array.from(new Set(items.map(i => i.category))).filter(c => c !== '展示图库')]
              .filter(cat => items.some(i => i.category === cat))
              .map(cat => {
                const catItems   = items.filter(i => i.category === cat)
                const isFeatured = cat === '展示图库'
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-3">
                      {isFeatured
                        ? <Home size={14} className="text-terracotta" />
                        : <span className="w-2 h-2 rounded-full bg-stone-300 inline-block" />}
                      <span className="text-sm font-semibold text-charcoal">
                        {isFeatured ? '首页展示图库' : cat}
                      </span>
                      {isFeatured ? (
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          featuredFull ? 'bg-red-100 text-red-600' : 'bg-terracotta/10 text-terracotta'
                        )}>{featuredCount}/4</span>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-500">
                          {catItems.length} 张
                        </span>
                      )}
                    </div>

                    <div className={cn(
                      'grid gap-4',
                      isFeatured ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                    )}>
                      {catItems.map(item => (
                        <div key={item.id} className="group relative card overflow-hidden aspect-square">
                          <Image
                            src={item.storage_path}
                            alt={item.alt_text ?? item.category}
                            fill className="object-cover" sizes="200px"
                          />
                          <div className={cn(
                            'absolute inset-0 bg-black/0 transition-all duration-200',
                            deletingId === item.id ? 'bg-black/50' : 'group-hover:bg-black/40'
                          )} />
                          {isFeatured && (
                            <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-terracotta/90 px-2 py-0.5 text-[10px] text-white font-medium">
                              <Home size={9} /> 首页展示
                            </div>
                          )}
                          {deletingId !== item.id && (
                            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <button onClick={() => setEditingItem(item)} className="p-2 rounded-xl bg-white/90 text-charcoal hover:bg-white shadow-sm" title="编辑">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleDelete(item.id)} className="p-2 rounded-xl bg-red-500 text-white hover:bg-red-600 shadow-sm" title="删除">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                          {deletingId === item.id && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Loader2 size={22} className="text-white animate-spin" />
                            </div>
                          )}
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                            {item.alt_text && <p className="text-white text-xs font-medium truncate">{item.alt_text}</p>}
                          </div>
                        </div>
                      ))}
                      {isFeatured && Array.from({ length: 4 - featuredCount }).map((_, idx) => (
                        <div key={`empty-${idx}`} className="aspect-square rounded-2xl border-2 border-dashed border-sand-200 flex items-center justify-center text-charcoal-light/40">
                          <div className="text-center">
                            <div className="text-2xl mb-1">＋</div>
                            <p className="text-xs">空位</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {editingItem && (
        <EditModal
          item={editingItem}
          categories={allCategories}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  )
}
