import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STUDIO_TIMEZONE = 'Europe/London'

export function formatLocalTime(date: string, time: string): string {
  const dt = new Date(`${date}T${time}`)
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: STUDIO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt)
}

export function formatLocalDate(dateStr: string): string {
  const dt = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: STUDIO_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(dt)
}

export function toShanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: STUDIO_TIMEZONE,
  }).format(date)
}
