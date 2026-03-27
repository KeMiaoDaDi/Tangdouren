'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [show,    setShow]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [form,    setForm]    = useState({ email: '', password: '' })
  const [error,   setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.email || !form.password) {
      setError('请填写邮箱和密码')
      return
    }

    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    form.email,
      password: form.password,
    })
    setLoading(false)

    if (authError) {
      setError('邮箱或密码错误，请重试')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-warm-100 to-sand-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🫘</span>
          <h1 className="font-display text-2xl font-bold text-charcoal mt-2">管理员登录</h1>
          <p className="text-sm text-charcoal-light mt-1">拼豆工作室后台管理系统</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="label" htmlFor="email">邮箱</label>
              <input
                id="email"
                type="email"
                className="input-field"
                placeholder="admin@example.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">密码</label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  className="input-field pr-10"
                  placeholder="请输入密码"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-light hover:text-charcoal"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              <LogIn size={16} />
              {loading ? '登录中…' : '登录后台'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-charcoal-light mt-6">
          <a href="/" className="hover:text-terracotta transition-colors">← 返回官网首页</a>
        </p>
      </div>
    </div>
  )
}
