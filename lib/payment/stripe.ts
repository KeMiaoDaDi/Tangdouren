// ============================================================
// Stripe 服务端客户端 — 仅在 API Routes / Server Actions 中使用
// 不要在客户端组件中 import 此文件
// ============================================================
import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY 环境变量未配置')
    _stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
  }
  return _stripe
}
