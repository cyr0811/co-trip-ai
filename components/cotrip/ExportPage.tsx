'use client'

import { useState } from 'react'
import {
  Plane,
  Download,
  FileText,
  MapPin,
  Calendar,
  Wallet,
  Utensils,
  BusIcon as Bus,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Clock,
} from 'lucide-react'
import { dayColors } from '@/lib/mock-data'
import type { DayIntensity, DayPlan, TripSession } from '@/lib/types'
import { downloadTextFile } from '@/lib/itinerary-export'
import { cn } from '@/lib/utils'

interface ExportPageProps {
  session: TripSession
  plans: DayPlan[]
  onBack: () => void
}

const intensityColor: Record<DayIntensity, string> = {
  轻松: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  适中: 'bg-amber-50 text-amber-700 border-amber-200',
  较满: 'bg-rose-50 text-rose-700 border-rose-200',
}

function buildBudgetItems(session: TripSession) {
  const hotelNights = Math.max(session.days - 1, 1)
  return [
    { category: `住宿（${hotelNights} 晚）`, amount: '按目的地和住宿区域细化', icon: '🏨' },
    { category: '餐饮（每日 3 餐）', amount: session.interests.includes('美食') ? '建议预留弹性美食预算' : '按中等水平估算', icon: '🍜' },
    { category: '市内交通', amount: session.constraints.includes('减少步行和跨区移动') ? '优先减少换乘' : '按公共交通优先', icon: '🚇' },
    { category: '景点门票', amount: session.interests.includes('文化体验') ? '预留博物馆/展览门票' : '按实际景点确认', icon: '🎡' },
    { category: '购物预算', amount: session.interests.includes('购物') ? '建议单独设上限' : '可按需保留', icon: '🛍️' },
    { category: '合计估算', amount: '待接入实时价格后精算', icon: '💰' },
  ]
}

function buildFoodRecommendations(plans: DayPlan[], destination: string) {
  return plans.map(plan => ({
    day: plan.day,
    place: plan.places.find(place => place.type === 'food')?.name || `${destination}特色餐厅`,
    type: plan.day === 1 ? '抵达晚餐' : '当地特色',
    tip: plan.intensity === '轻松' ? '适合放慢节奏' : '建议提前确认营业时间',
  }))
}

const reminders = [
  '热门餐厅和体验项目建议提前 1-2 天确认或预约',
  '主题乐园、展览和热门景点建议提前在官网购票',
  '开放时间和交通情况建议出发前再次确认（特别是节假日）',
  '最后一天建议保留弹性时间 2-3 小时，避免影响返程',
  '当地交通卡、地铁票或打车方式建议到达前先确认',
]

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatItineraryHtml(plans: DayPlan[], session: TripSession) {
  const daySections = plans.map(plan => `
    <section class="day-card">
      <div class="day-kicker">Day ${plan.day}</div>
      <h2>${escapeHtml(plan.title)}</h2>
      <p class="theme">${escapeHtml(plan.theme)} · ${escapeHtml(plan.intensity)}</p>
      ${plan.slots.map(slot => `
        <div class="slot">
          <strong>${escapeHtml(slot.period)}</strong>
          <span>${escapeHtml(slot.activities.join(' · '))}</span>
        </div>
      `).join('')}
    </section>
  `).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(session.title)}</title>
  <style>
    body { margin: 0; background: #f8f7f4; color: #17212b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 880px; margin: 0 auto; padding: 40px 20px; }
    .cover, .day-card { background: #fff; border: 1px solid #e8e3dc; border-radius: 20px; box-shadow: 0 8px 24px rgba(16, 24, 40, .06); }
    .cover { padding: 32px; margin-bottom: 20px; }
    .badge { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #e7f7ff; color: #0b8cc4; font-size: 12px; font-weight: 700; }
    h1 { margin: 16px 0 8px; font-size: 30px; line-height: 1.2; }
    h2 { margin: 6px 0; font-size: 20px; }
    p { color: #667085; line-height: 1.7; }
    .meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 24px; }
    .meta div { background: #f8fafc; border: 1px solid #eef2f6; border-radius: 14px; padding: 12px; font-size: 13px; }
    .meta strong { display: block; color: #17212b; margin-top: 4px; font-size: 15px; }
    .day-card { padding: 22px; margin: 14px 0; }
    .day-kicker { color: #0b8cc4; font-weight: 800; font-size: 13px; }
    .theme { margin: 0 0 16px; font-size: 13px; }
    .slot { display: grid; grid-template-columns: 72px 1fr; gap: 10px; padding: 10px 0; border-top: 1px solid #eef2f6; font-size: 14px; line-height: 1.7; }
    .slot strong { color: #17212b; }
    .slot span { color: #475467; }
    footer { text-align: center; color: #98a2b3; font-size: 12px; margin-top: 28px; }
    @media print { body { background: #fff; } main { padding: 0; } .cover, .day-card { box-shadow: none; break-inside: avoid; } }
  </style>
</head>
<body>
  <main>
    <section class="cover">
      <span class="badge">CoTrip AI 行程</span>
      <h1>${escapeHtml(session.title)}</h1>
      <p>${escapeHtml(session.summary)}</p>
      <div class="meta">
        <div>目的地<strong>${escapeHtml(session.destination)}</strong></div>
        <div>行程天数<strong>${session.days} 天</strong></div>
        <div>旅行节奏<strong>${escapeHtml(session.pace)}</strong></div>
      </div>
    </section>
    ${daySections}
    <footer>CoTrip AI · AI 旅行规划</footer>
  </main>
</body>
</html>`
}

export default function ExportPage({ session, plans, onBack }: ExportPageProps) {
  const [exportedWeb, setExportedWeb] = useState(false)
  const [exportedPdf, setExportedPdf] = useState(false)
  const budgetItems = buildBudgetItems(session)
  const foodRecommendations = buildFoodRecommendations(plans, session.destination)

  const handleExportWebPage = () => {
    downloadTextFile(`cotrip-ai-${session.destination}-${session.days}-day-itinerary.html`, formatItineraryHtml(plans, session))
    setExportedWeb(true)
    setTimeout(() => setExportedWeb(false), 2000)
  }

  const handleExportPdf = () => {
    setExportedPdf(true)
    window.print()
    setTimeout(() => setExportedPdf(false), 2000)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/50 bg-card/95 backdrop-blur-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          返回工作台
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
            <Plane className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-sm text-foreground">CoTrip AI</span>
        </div>
        <div className="w-[92px]" aria-hidden="true" />
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* 封面概览 */}
        <div className="relative bg-card rounded-3xl border border-border/60 overflow-hidden shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50/80 via-transparent to-mint-50/50" />
          <div className="relative p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 font-medium">
                CoTrip AI 行程
              </span>
              <span className="text-xs text-muted-foreground">生成于今天</span>
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold text-foreground mb-2 text-balance">
              {session.title}
            </h1>
            <p className="text-muted-foreground text-sm mb-6">
              {session.summary}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { icon: MapPin, label: '目的地', value: session.destination },
                { icon: Calendar, label: '行程天数', value: `${session.days} 天 ${Math.max(session.days - 1, 1)} 晚` },
                { icon: Clock, label: '旅行风格', value: `${session.pace}自由行` },
                { icon: Utensils, label: '兴趣偏好', value: session.interests.join(' · ') },
                { icon: Wallet, label: '预算水平', value: session.constraints.includes('预算需要控制') ? '需要控制预算' : '待确认' },
                { icon: Bus, label: '住宿建议', value: `${session.destination}交通便利区域` },
              ].map(item => (
                <div key={item.label} className="bg-white/70 rounded-xl p-3 border border-white/80">
                  <div className="flex items-center gap-1.5 mb-1">
                    <item.icon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 每日行程时间线 */}
        <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
          <h2 className="font-heading font-bold text-base text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            每日行程
          </h2>
          <div className="space-y-4">
            {plans.map((day, i) => {
              const colors = dayColors[day.day]
              return (
                <div key={day.day} className="flex gap-3">
                  {/* 左侧时间线 */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn('w-8 h-8 rounded-xl flex items-center justify-center font-heading font-bold text-sm shrink-0', colors.bg, colors.text)}
                    >
                      {day.day}
                    </div>
                    {i < plans.length - 1 && (
                      <div className="w-px flex-1 mt-1" style={{ backgroundColor: colors.line, minHeight: '16px' }} />
                    )}
                  </div>
                  {/* 右侧内容 */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-foreground">{day.title}</span>
                      <span className="text-xs text-muted-foreground">· {day.theme}</span>
                      <span className={cn('text-xs rounded-full px-2 py-0.5 border font-medium shrink-0', intensityColor[day.intensity])}>
                        {day.intensity}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {day.slots.map((slot, si) => (
                        <div key={si} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground shrink-0">{slot.period}</span>
                          <span className="leading-relaxed">{slot.activities.join(' · ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 餐饮推荐 */}
        <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
          <h2 className="font-heading font-bold text-base text-foreground mb-4 flex items-center gap-2">
            <Utensils className="w-4 h-4 text-primary" />
            餐饮推荐
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {foodRecommendations.map(food => (
              <div key={food.day} className="flex items-start gap-3 bg-background rounded-xl p-3 border border-border/40">
                <div
                  className={cn('w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0', `bg-[${dayColors[food.day].dot}]`)}
                  style={{ backgroundColor: dayColors[food.day].dot }}
                >
                  {food.day}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{food.place}</div>
                  <div className="text-xs text-muted-foreground">{food.type} · {food.tip}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 交通建议 */}
        <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
          <h2 className="font-heading font-bold text-base text-foreground mb-4 flex items-center gap-2">
            <Bus className="w-4 h-4 text-primary" />
            交通建议
          </h2>
          <div className="space-y-2.5">
            {[
              { title: '交通工具', desc: `建议提前确认${session.destination}当地交通卡、地铁票或打车 App 的使用方式。` },
              { title: '市区移动', desc: `${session.destination}行程先按区域集中原则生成，后续可接入地图服务校准实时交通。` },
              { title: '热门项目', desc: '主题乐园、展览、演出或预约制景点建议单独确认开放时间和购票渠道。' },
              { title: '出发/返程', desc: '建议把机场/车站往返和最后一天弹性时间单独留出来，避免影响返程。' },
            ].map(item => (
              <div key={item.title} className="flex gap-3">
                <div className="w-1 rounded-full bg-primary/30 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-foreground mb-0.5">{item.title}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 预算粗估 */}
        <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
          <h2 className="font-heading font-bold text-base text-foreground mb-4 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            预算粗估（人民币，仅供参考）
          </h2>
          <div className="space-y-2">
            {budgetItems.map((item, i) => (
              <div
                key={item.category}
                className={cn(
                  'flex items-center justify-between py-2 text-sm',
                  i < budgetItems.length - 1 ? 'border-b border-border/30' : 'font-semibold text-foreground pt-3'
                )}
              >
                <span className={cn('flex items-center gap-2', i === budgetItems.length - 1 ? 'text-foreground' : 'text-muted-foreground')}>
                  <span>{item.icon}</span>
                  {item.category}
                </span>
                <span className={i === budgetItems.length - 1 ? 'text-primary font-bold' : 'text-foreground'}>
                  {item.amount}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 出行前提醒 */}
        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-5">
          <h2 className="font-heading font-bold text-base text-amber-800 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            出行前提醒
          </h2>
          <ul className="space-y-2">
            {reminders.map((reminder, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-amber-800">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                <span className="leading-relaxed">{reminder}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 导出按钮区 */}
        <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
          <h2 className="font-heading font-bold text-sm text-foreground mb-4">导出行程</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={handleExportWebPage}
              className={cn(
                'flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all',
                exportedWeb
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-background text-foreground border-border/60 hover:border-primary/40 hover:bg-primary/5'
              )}
            >
              {exportedWeb ? <CheckCircle2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              {exportedWeb ? '已导出网页' : '导出网页'}
            </button>
            <button
              onClick={handleExportPdf}
              className={cn(
                'flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all',
                exportedPdf
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
              )}
            >
              {exportedPdf ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              {exportedPdf ? '正在导出 PDF' : '导出 PDF'}
            </button>
          </div>
        </div>

        {/* 底部署名 */}
        <div className="text-center pb-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
              <Plane className="w-2.5 h-2.5 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-sm text-foreground">CoTrip AI</span>
          </div>
          <p className="text-xs text-muted-foreground">AI 旅行规划 · 从模糊想法到可执行行程</p>
        </div>
      </div>
    </div>
  )
}
