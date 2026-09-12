import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupActiveTimer } from '@/lib/timer/selfService'

const LookupSchema = z.object({
  seatNumber: z.string().min(1).max(20),
  customerName: z.string().min(1).max(50),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const parsed = LookupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '请填写座位号与名字' }, { status: 400 })
  }

  try {
    const result = await lookupActiveTimer(
      createAdminClient(),
      parsed.data.seatNumber,
      parsed.data.customerName,
    )
    if (!result) return NextResponse.json({ error: '未找到进行中的计时' }, { status: 404 })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: '查询失败，请稍后重试' }, { status: 500 })
  }
}
