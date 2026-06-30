'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, User, RotateCcw, Loader2 } from 'lucide-react'
import type { ChatMessage } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  messages: ChatMessage[]
  onSendMessage: (msg: string) => void
  onQuickAction: (action: string) => void
  updatedDays: number[]
  isLoading: boolean
  loadingText: string
  canUndo: boolean
  onUndo: () => void
}

const quickActions = [
  { id: 'too-full', label: '这一天太满了' },
  { id: 'relax', label: '帮我轻松一点' },
  { id: 'change-place', label: '换一个地点' },
  { id: 'why', label: '为什么这样安排？' },
  { id: 'more-food', label: '增加美食' },
  { id: 'less-budget', label: '预算低一点' },
]

export default function ChatPanel({
  messages,
  onSendMessage,
  onQuickAction,
  updatedDays,
  isLoading,
  loadingText,
  canUndo,
  onUndo,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSendMessage(trimmed)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-card border-r border-border/60">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">CoTrip AI</div>
          <div className="text-xs text-muted-foreground">旅行规划助手</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo || isLoading}
            className={cn(
              'w-7 h-7 rounded-lg border border-border/60 flex items-center justify-center transition-all',
              canUndo && !isLoading
                ? 'text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5'
                : 'text-muted-foreground opacity-40'
            )}
            aria-label="撤销最近一次修改"
            title="撤销最近一次修改"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-muted-foreground">在线</span>
          </div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={cn('flex items-start gap-2.5', msg.role === 'user' && 'flex-row-reverse')}
          >
            {/* 头像 */}
            <div
              className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                msg.role === 'ai' ? 'bg-primary/10' : 'bg-accent'
              )}
            >
              {msg.role === 'ai' ? (
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              ) : (
                <User className="w-3.5 h-3.5 text-accent-foreground" />
              )}
            </div>
            {/* 气泡 */}
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                msg.role === 'ai'
                  ? 'bg-background border border-border/50 text-foreground rounded-tl-sm'
                  : 'bg-primary text-primary-foreground rounded-tr-sm'
              )}
            >
              {msg.content}
              {msg.role === 'ai' && msg.id.startsWith('patch-day-') && (
                <div className="mt-2 inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {updatedDays.length > 0 ? `已更新 Day ${updatedDays[updatedDays.length - 1]}` : '已更新'}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-background border border-border/50 text-foreground rounded-tl-sm">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                {loadingText}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 快捷操作 */}
      <div className="px-4 py-2 border-t border-border/40 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {quickActions.map(action => (
            <button
              key={action.id}
              onClick={() => onQuickAction(action.id)}
              disabled={isLoading}
              className="shrink-0 text-xs text-muted-foreground bg-background border border-border/60 hover:border-primary/40 hover:text-primary hover:bg-primary/5 rounded-full px-3 py-1.5 transition-all duration-150 whitespace-nowrap disabled:opacity-50 disabled:hover:text-muted-foreground disabled:hover:border-border/60 disabled:hover:bg-background"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* 输入框 */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex items-center gap-2 bg-background border border-border/60 rounded-xl px-3 py-2 focus-within:border-primary/50 transition-all">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="说说你想改什么…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-60"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 active:scale-95 transition-all"
          >
            <Send className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
