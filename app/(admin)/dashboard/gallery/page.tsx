'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Upload, Trash2, Pencil, X, Check, AlertCircle, Loader2, Home, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GalleryItem } from '@/components/site/GalleryGrid'

const BASE_CATEGORIES = ['展示图库']

// ── 编辑弹层 ─────────────────────────────────────────────────────────────────

function EditModal({
  item,
  categories,
  onClose,
  onSave,
}: {
  item: GalleryItem
  categories: string[]
  onClose: () => void
  onSave: (id: string, alt: string, cat: string) => Promise<void>
}) {
  const [alt, setAlt]     = useState(item.alt_text ?? '')
  const [cat, setCat]     = useState(item.category)
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
  const [items,      setItems]     = useState<GalleryItem[]>([])
  const [loading,    setLoading]   = useState(true)
  const [error,      setError]     = useState('')

  // 自定义分类（持久化到 localStorage）
  const [extraCats,  setExtraCats] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('gallery_extra_cats') ?? '[]') } catch { return [] }
  })
  const [newCatInput, setNewCatInput] = useState('')

  // 所有可用分类：固定 + 已有图片中的 + 手动添加的
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
    setUploadCat(name)
    setNewCatInput('')
  }

  function removeExtraCat(cat: string) {
    const next = extraCats.filter(c => c !== cat)
    setExtraCats(next)
    localStorage.setItem('gallery_extra_cats', JSON.stringify(next))
    if (uploadCat === cat) setUploadCat(BASE_CATEGORIES[0])
  }

  // 上传状态
  const [preview,    setPreview]   = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadAlt,  setUploadAlt] = useState('')
  const [uploadCat,  setUploadCat] = useState('展示图库')
  const [uploading,  setUploading] = useState(false)
  const [uploadErr,  setUploadErr] = useState('')

  // 编辑
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null)

  // 删除确认
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 展示图库已用数量
  const featuredCount = items.filter(i => i.category === '展示图库').length
  const featuredFull  = featuredCount >= 4

  // ── 加载图库 ───────────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
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

  // ── 选文件 ────────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploadErr('')
    const url = URL.createObjectURL(file)
    setPreview(url)
  }

  function clearUpload() {
    setUploadFile(null)
    setPreview(null)
    setUploadAlt('')
    setUploadCat('展示图库')
    setUploadErr('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── 上传 ──────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!uploadFile) return
    setUploading(true)
    setUploadErr('')
    try {
      const fd = new FormData()
      fd.append('file',     uploadFile)
      fd.append('alt_text', uploadAlt)
      fd.append('category', uploadCat)

      const res  = await fetch('/api/gallery', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '上传失败')

      clearUpload()
      await fetchItems()
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : '上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  // ── 删除 ──────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/gallery/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '删除失败')
      }
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  // ── 保存编辑 ──────────────────────────────────────────────────────────────
  async function handleSaveEdit(id: string, alt: string, cat: string) {
    const res  = await fetch(`/api/gallery/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt_text: alt || null, category: cat }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error ?? '保存失败')
    }
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
          {/* 固定分类（不可删） */}
          <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/10 text-terracotta px-3 py-1 text-xs font-medium">
            <Home size={11} /> 展示图库
          </span>
          {/* 从图片中派生的非固定分类 */}
          {Array.from(new Set(items.map(i => i.category)))
            .filter(c => !BASE_CATEGORIES.includes(c) && !extraCats.includes(c))
            .map(c => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-stone-100 text-stone-600 px-3 py-1 text-xs font-medium">
                {c}
              </span>
            ))}
          {/* 手动添加的分类（可删） */}
          {extraCats.map(c => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-600 px-3 py-1 text-xs font-medium">
              {c}
              <button onClick={() => removeExtraCat(c)} className="hover:text-red-500 transition">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        {/* 新增分类 */}
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
        <h2 className="font-semibold text-charcoal text-sm mb-4">上传新作品</h2>

        {!preview ? (
          <div
            className="border-2 border-dashed border-sand-200 rounded-2xl p-8 text-center hover:border-terracotta/40 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={32} className="mx-auto mb-3 text-sand-300" />
            <p className="text-sm font-medium text-charcoal">点击选择图片</p>
            <p className="text-xs text-charcoal-light mt-1">支持 JPG、PNG、WebP，最大 5MB</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-warm-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="预览" className="h-full w-full object-cover" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="label">说明文字（可选）</label>
                  <input
                    className="input-field"
                    placeholder="如：彩虹独角兽、柴犬肖像"
                    value={uploadAlt}
                    onChange={e => setUploadAlt(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">分类</label>
                  <select className="input-field" value={uploadCat} onChange={e => setUploadCat(e.target.value)}>
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {uploadCat === '展示图库' && (
                    <p className={cn(
                      'mt-1.5 text-xs flex items-center gap-1',
                      featuredFull ? 'text-red-500' : 'text-charcoal-light'
                    )}>
                      <Home size={11} />
                      首页展示位：{featuredCount}/4 已使用
                      {featuredFull && '，已达上限，请先删除一张'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {uploadErr && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                <AlertCircle size={14} />
                {uploadErr}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={clearUpload} className="btn-secondary text-sm px-4 py-2">
                取消
              </button>
              <button onClick={handleUpload} disabled={uploading || (uploadCat === '展示图库' && featuredFull)} className="btn-primary text-sm px-5 py-2">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? '上传中…' : '确认上传'}
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* 图库列表 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-charcoal text-sm">
            已上传图片
            {!loading && <span className="ml-1 text-charcoal-light font-normal">（{items.length} 张）</span>}
          </h2>
          <button onClick={fetchItems} className="text-xs text-terracotta hover:underline">
            刷新
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-charcoal-light text-sm">
            <Loader2 size={18} className="animate-spin" />
            加载中…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-10 text-red-500 text-sm">
            <AlertCircle size={16} />
            {error}
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
          <div className="space-y-6">
            {/* 展示图库专区 */}
            {items.some(i => i.category === '展示图库') && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Home size={14} className="text-terracotta" />
                  <span className="text-sm font-semibold text-charcoal">首页展示图库</span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    featuredFull ? 'bg-red-100 text-red-600' : 'bg-terracotta/10 text-terracotta'
                  )}>
                    {featuredCount}/4
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {items.filter(i => i.category === '展示图库').map(item => (
                    <div key={item.id} className="group relative card overflow-hidden aspect-square">
                      <Image
                        src={item.storage_path}
                        alt={item.alt_text ?? item.category}
                        fill
                        className="object-cover"
                        sizes="200px"
                      />
                      <div className={cn(
                        'absolute inset-0 bg-black/0 transition-all duration-200',
                        deletingId === item.id ? 'bg-black/50' : 'group-hover:bg-black/40'
                      )} />
                      <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-terracotta/90 px-2 py-0.5 text-[10px] text-white font-medium">
                        <Home size={9} />
                        首页展示
                      </div>
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
                  {/* 空位占位格 */}
                  {Array.from({ length: 4 - featuredCount }).map((_, idx) => (
                    <div key={`empty-${idx}`} className="aspect-square rounded-2xl border-2 border-dashed border-sand-200 flex items-center justify-center text-charcoal-light/40">
                      <div className="text-center">
                        <div className="text-2xl mb-1">＋</div>
                        <p className="text-xs">空位</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 其他图片 */}
            {items.some(i => i.category !== '展示图库') && (
              <div>
                {items.some(i => i.category === '展示图库') && (
                  <p className="text-sm font-semibold text-charcoal mb-3">其他图片</p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {items.filter(i => i.category !== '展示图库').map(item => (
                    <div key={item.id} className="group relative card overflow-hidden aspect-square">
                      <Image
                        src={item.storage_path}
                        alt={item.alt_text ?? item.category}
                        fill
                        className="object-cover"
                        sizes="200px"
                      />
                      <div className={cn(
                        'absolute inset-0 bg-black/0 transition-all duration-200',
                        deletingId === item.id ? 'bg-black/50' : 'group-hover:bg-black/40'
                      )} />
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
                        <span className="inline-block rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] text-white/80 mt-0.5">{item.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 编辑弹层 */}
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
