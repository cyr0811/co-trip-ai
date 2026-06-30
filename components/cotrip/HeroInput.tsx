'use client'

import { useState } from 'react'
import { MapPin, Sparkles, ArrowRight, Plane } from 'lucide-react'
import { examplePrompts, preferenceTags } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface HeroInputProps {
  onStart: (input: string, tags: string[]) => void
}

export default function HeroInput({ onStart }: HeroInputProps) {
  const [input, setInput] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const toggleTag = (id: string) => {
    setSelectedTags(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  const handleStart = () => {
    const finalInput = input.trim() || examplePrompts[0]
    onStart(finalInput, selectedTags)
  }

  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* 顶部导航 */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Plane className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-lg text-foreground tracking-tight">CoTrip AI</span>
        </div>
        <span className="text-xs text-muted-foreground bg-accent/50 px-3 py-1 rounded-full">AI 行程工作台</span>
      </header>

      {/* 主体内容 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        {/* 装饰性地图 pin */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center gap-1 bg-sky-50 border border-sky-200 rounded-full px-3 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-primary font-medium">Tokyo</span>
          </div>
          <div className="flex items-center gap-1 bg-mint-50 border border-emerald-200 rounded-full px-3 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-mint" />
            <span className="text-xs text-emerald-700 font-medium">Osaka</span>
          </div>
          <div className="flex items-center gap-1 bg-peach-100 border border-orange-200 rounded-full px-3 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-peach" />
            <span className="text-xs text-orange-700 font-medium">Kyoto</span>
          </div>
        </div>

        {/* 标题区域 */}
        <div className="text-center mb-10 max-w-2xl">
          <h1 className="font-heading text-4xl md:text-5xl font-extrabold text-foreground leading-tight mb-3 text-balance">
            和 AI 一起规划
            <br />
            <span className="text-primary">你的第一次</span>城市自由行
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed text-pretty">
            不是一键生成模板行程，而是通过对话理解你的需求，
            <br className="hidden md:block" />
            生成真正适合你的可执行计划。
          </p>
        </div>

        {/* 输入框 */}
        <div className="w-full max-w-2xl mb-4">
          <div className="relative bg-card rounded-2xl shadow-sm border border-border/80 hover:border-primary/40 focus-within:border-primary/60 focus-within:shadow-md transition-all duration-200">
            <div className="flex items-start gap-3 p-4">
              <div className="mt-1 w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="告诉我你想去哪里、玩几天、喜欢什么…"
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-base leading-relaxed resize-none outline-none min-h-[72px] font-sans"
                rows={3}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart()
                }}
              />
            </div>
            <div className="flex items-center justify-between px-4 pb-3">
              <span className="text-xs text-muted-foreground">Ctrl+Enter 快速开始</span>
              <button
                onClick={handleStart}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all duration-150"
              >
                开始规划
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 示例 Prompt */}
        <div className="w-full max-w-2xl mb-6">
          <p className="text-xs text-muted-foreground mb-2 text-center">试试这些</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {examplePrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => setInput(prompt)}
                className="text-xs text-muted-foreground bg-card border border-border/60 hover:border-primary/40 hover:text-primary hover:bg-primary/5 rounded-xl px-3 py-2 transition-all duration-150"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* 快捷偏好标签 */}
        <div className="w-full max-w-2xl">
          <p className="text-xs text-muted-foreground mb-2 text-center">快捷偏好（可多选）</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {preferenceTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  'text-sm rounded-full px-4 py-1.5 border transition-all duration-150 font-medium',
                  selectedTags.includes(tag.id)
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground'
                )}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* 底部特性说明 */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
          {[
            {
              icon: '💬',
              title: 'AI 会先追问',
              desc: '理解你的真实需求，而不是直接生成模板',
            },
            {
              icon: '🗺️',
              title: '结构化行程',
              desc: '每日卡片 + 地图可视化，一眼看清安排',
            },
            {
              icon: '✏️',
              title: '随时修改',
              desc: '用自然语言调整，AI 解释每次修改原因',
            },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl border border-border/60 p-4 text-center"
            >
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="font-semibold text-sm text-foreground mb-1">{item.title}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
