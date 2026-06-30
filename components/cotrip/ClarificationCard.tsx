'use client'

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Sparkles, CheckCircle2, ArrowRight, Plane, Send } from 'lucide-react'
import type { StayInfo, TripProfileField, TripSession } from '@/lib/types'
import type { TripProfileApiResponse } from '@/lib/trip-profile-api'
import { updateTripSessionWithClarification } from '@/lib/trip-session'
import { cn } from '@/lib/utils'

interface ClarificationCardProps {
  session: TripSession
  onSessionUpdate: Dispatch<SetStateAction<TripSession>>
  onGenerate: () => void
}

interface ConversationTurn {
  id: string
  user: string
  ai?: string
  snapshot?: TripSession
}

function AiBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5 text-primary" />
      </div>
      <div className="bg-card rounded-2xl rounded-tl-sm border border-border/60 p-4 shadow-sm flex-1">
        <div className="text-sm text-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 flex-row-reverse">
      <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0 text-xs font-bold text-accent-foreground">
        你
      </div>
      <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm p-4 shadow-sm flex-1 max-w-[88%]">
        <p className="text-sm leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <AiBubble>
      <div className="flex items-center gap-1.5 py-1">
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
      </div>
    </AiBubble>
  )
}

function getProfileFieldValue(field?: Partial<TripProfileField>) {
  return field?.value || field?.raw || ''
}

function getStayInfo(session: TripSession): StayInfo | undefined {
  const stayInfo = session.clarificationDetails.stayInfo
  if (stayInfo) return stayInfo

  const stayArea = session.clarificationDetails.lodgingArea
  const hotelAddress = session.clarificationDetails.hotelAddress
  if (!stayArea && !hotelAddress) return undefined

  return {
    ...(stayArea ? { stayArea: { raw: stayArea, value: stayArea, status: 'confirmed' as const, source: 'user' as const } } : {}),
    ...(hotelAddress ? { hotelAddress: { raw: hotelAddress, value: hotelAddress, status: 'user_provided' as const, source: 'user' as const } } : {}),
    geoLocation: { lat: null, lng: null, placeId: null, status: 'pending_geocode' },
  }
}

function mapGeoStatusLabel(status?: StayInfo['geoLocation']['status']) {
  switch (status) {
    case 'pending_geocode':
      return '待解析'
    case 'geocoded':
      return '已定位'
    case 'ambiguous':
      return '多个候选'
    case 'failed':
      return '解析失败'
    default:
      return '未开始'
  }
}

function hotelAddressStatusLabel(stayInfo?: StayInfo) {
  const address = getProfileFieldValue(stayInfo?.hotelAddress)
  const geoStatus = stayInfo?.geoLocation.status

  if (!address) return '未提供'
  if (geoStatus === 'pending_geocode') return '已提供 / 待地图验证'
  if (geoStatus === 'geocoded') return '已提供 / 已验证'
  if (geoStatus === 'ambiguous') return '已提供 / 待确认'
  if (geoStatus === 'failed') return '已提供 / 解析失败'
  return '已提供'
}

function hasStayClue(stayInfo?: StayInfo) {
  return Boolean(
    getProfileFieldValue(stayInfo?.stayArea) ||
    getProfileFieldValue(stayInfo?.hotelName) ||
    getProfileFieldValue(stayInfo?.hotelAddress),
  )
}

function StayInfoStatusCard({ session }: { session: TripSession }) {
  const stayInfo = getStayInfo(session)

  return (
    <div className="mt-4 rounded-2xl bg-background/70 border border-border/60 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs font-semibold text-foreground">住宿信息状态</span>
        <span className="text-[11px] text-muted-foreground bg-secondary rounded-full px-2 py-1">
          可用于后续地图 API
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {[
          ['住宿区域', getProfileFieldValue(stayInfo?.stayArea) || '未提供'],
          ['酒店名称', getProfileFieldValue(stayInfo?.hotelName) || '未提供'],
          ['酒店地址', hotelAddressStatusLabel(stayInfo)],
          ['地图定位', hasStayClue(stayInfo) ? mapGeoStatusLabel(stayInfo?.geoLocation.status) : '未开始'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start gap-2 min-w-0">
            <span className="text-xs text-muted-foreground mt-0.5 shrink-0">{label}</span>
            <span className="text-xs font-medium text-foreground bg-accent/50 rounded-lg px-2 py-0.5 break-words">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecognizedInfoCard({ session }: { session: TripSession }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-foreground">已识别信息</span>
        </div>
        <span className="text-[11px] text-muted-foreground bg-secondary rounded-full px-2 py-1">
          基于完整对话持续更新
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {session.recognizedInfo.map(item => (
          <div key={item.label} className="flex items-start gap-2 min-w-0">
            <span className="text-xs text-muted-foreground mt-0.5 shrink-0">{item.label}</span>
            <span className="text-xs font-medium text-foreground bg-accent/50 rounded-lg px-2 py-0.5 break-words">
              {item.value}
            </span>
          </div>
        ))}
      </div>
      <StayInfoStatusCard session={session} />
    </div>
  )
}

export default function ClarificationCard({
  session,
  onSessionUpdate,
  onGenerate,
}: ClarificationCardProps) {
  const [answer, setAnswer] = useState('')
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const hasRequestedGenerateRef = useRef(false)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)

  const missingPrompt = useMemo(() => {
    if (session.missingInfo.length === 0) return ''
    return session.missingInfo.map(item => item.prompt).join('；')
  }, [session.missingInfo])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [turns, session.missingInfo.length])

  useEffect(() => {
    if (!session.isReadyForPlanning || hasRequestedGenerateRef.current) return

    hasRequestedGenerateRef.current = true
    const timer = setTimeout(() => {
      onGenerate()
    }, 1100)

    return () => clearTimeout(timer)
  }, [onGenerate, session.isReadyForPlanning])

  const buildAssistantReply = (nextSession: TripSession) => {
    const details = nextSession.clarificationDetails
    const stayInfo = getStayInfo(nextSession)
    const stayArea = getProfileFieldValue(stayInfo?.stayArea)
    const hotelName = getProfileFieldValue(stayInfo?.hotelName)
    const hotelAddress = getProfileFieldValue(stayInfo?.hotelAddress)
    const staySentence = hotelName
      ? '我已记录你住在' + hotelName + (stayArea ? '，位于' + stayArea : '') + '。后续会以这里作为每天路线的出发点。接入地图后，我会进一步确认具体位置并计算通勤时间。'
      : stayArea
        ? '我已记录住宿区域为' + stayArea + '。接入地图后，可以继续定位到更具体的出发点。'
        : hotelAddress
          ? '我已记录你提供的酒店地址。接入地图后，我会进一步确认具体位置并计算通勤时间。'
          : ''
    const remembered = [
      details.arrivalInfo ? '落地信息为' + [details.arrivalInfo.time, details.arrivalInfo.airport].filter(Boolean).join(' · ') : null,
      details.departureInfo ? '返程信息为' + [details.departureInfo.time, details.departureInfo.airport].filter(Boolean).join(' · ') : null,
      details.dailyStartTime ? '开始时间为' + details.dailyStartTime : null,
      details.budgetLevel ? '预算为' + details.budgetLevel : null,
    ].filter(Boolean)

    if (nextSession.isReadyForPlanning) {
      return [
        staySentence || '收到，我已经基于完整对话补齐了关键信息。',
        remembered.length > 0 ? '同时已记住：' + remembered.join('，') + '。' : '',
        '接下来会自动生成初版行程。',
      ].filter(Boolean).join('')
    }

    const stillMissing = nextSession.missingInfo.map(item => item.prompt).join('；')
    return [
      staySentence,
      remembered.length > 0 ? '已为您记住：' + remembered.join('，') + '。' : '',
      stillMissing ? '目前还需要补充：' + stillMissing + '。' : '我已经更新了能识别到的信息。',
    ].filter(Boolean).join('')
  }

  const handleSubmit = async () => {
    const trimmed = answer.trim()
    if (!trimmed || isParsing) return

    const turnId = 'clarification-turn-' + Date.now()
    setTurns(prev => [...prev, { id: turnId, user: trimmed }])
    setAnswer('')
    setIsParsing(true)

    try {
      const response = await fetch('/api/trip-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session, answer: trimmed }),
      })

      if (!response.ok) {
        throw new Error('Trip profile API request failed')
      }

      const data = (await response.json()) as TripProfileApiResponse
      const nextSession = updateTripSessionWithClarification(session, trimmed, data.session.clarificationDetails)
      const aiReply = buildAssistantReply(nextSession)
      onSessionUpdate(prev => updateTripSessionWithClarification(prev, trimmed, data.session.clarificationDetails))
      setTurns(prev => prev.map(turn => (
        turn.id === turnId ? { ...turn, ai: aiReply, snapshot: nextSession } : turn
      )))
    } catch {
      const nextSession = updateTripSessionWithClarification(session, trimmed)
      const aiReply = buildAssistantReply(nextSession)
      onSessionUpdate(nextSession)
      setTurns(prev => prev.map(turn => (
        turn.id === turnId ? { ...turn, ai: aiReply, snapshot: nextSession } : turn
      )))
    } finally {
      setIsParsing(false)
    }
  }

  const currentMissingCount = session.missingInfo.length

  return (
    <main className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/95 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Plane className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-lg text-foreground tracking-tight">CoTrip AI</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-muted-foreground">AI 正在持续完善行程信息</span>
        </div>
      </header>

      <section className="flex-1 min-h-0 overflow-y-auto px-4 py-6 overscroll-contain">
        <div className="w-full max-w-2xl mx-auto space-y-5 pb-4">
          <AiBubble>
            <p>
              {session.summary} 在生成完整行程前，我会基于完整对话持续维护一份结构化 tripProfile；每次补充只会更新缺失字段，不会丢失前面已经识别到的信息。
            </p>
          </AiBubble>

          <RecognizedInfoCard session={session} />

          {turns.map(turn => (
            <div key={turn.id} className="space-y-5">
              <UserBubble>{turn.user}</UserBubble>
              {turn.ai ? <AiBubble>{turn.ai}</AiBubble> : <TypingBubble />}
              {turn.snapshot && <RecognizedInfoCard session={turn.snapshot} />}
            </div>
          ))}

          <div ref={conversationEndRef} />
        </div>
      </section>

      <footer className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-sm px-4 py-4">
        <div className="w-full max-w-2xl mx-auto">
          {!session.isReadyForPlanning ? (
            <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <span className="text-sm font-semibold text-foreground">补充未识别信息</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                直接用一句话告诉我即可。当前只会询问真正缺失的信息，已识别内容会被保留在上方 profile 中。
              </p>
              <div className="relative bg-background border border-border/60 rounded-2xl focus-within:border-primary/50 transition-all">
                <textarea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  placeholder={'请补充：' + missingPrompt}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[96px] max-h-[160px] p-4 pr-14 leading-relaxed"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSubmit()
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!answer.trim() || isParsing}
                  className={cn(
                    'absolute right-3 bottom-3 w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                    answer.trim() && !isParsing
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                      : 'bg-muted text-muted-foreground opacity-60'
                  )}
                  aria-label="发送补充信息"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Ctrl+Enter 快速发送</span>
                <span>{currentMissingCount} 项待补充</span>
              </div>
            </div>
          ) : (
            <button
              onClick={onGenerate}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-4 rounded-2xl font-semibold text-base hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 shadow-sm"
            >
              <Sparkles className="w-5 h-5" />
              正在生成初版行程
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </footer>
    </main>
  )
}
