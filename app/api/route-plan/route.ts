import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { extractCandidatePlaces } from '@/lib/trip-candidates'
import { generateCandidateDrivenPlans } from '@/lib/trip-route-planner'
import type { RoutePlanApiRequest, RoutePlanApiResponse } from '@/lib/route-plan-api'
import type { CandidatePlace, DayIntensity, DayPlan, Place, TimeSlot, TripState } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AiProvider = 'openai' | 'doubao'

interface AiClientConfig {
  provider: AiProvider
  apiKey: string
  baseURL?: string
  model: string
}

const dayIntensityValues = ['轻松', '适中', '较满'] as const
const periodValues = ['上午', '下午', '晚上', '全天'] as const

const routePlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'plans'],
  properties: {
    reply: { type: 'string' },
    plans: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'title', 'theme', 'intensity', 'slots', 'reason', 'places', 'estimatedTransport'],
        properties: {
          day: { type: 'number' },
          title: { type: 'string' },
          theme: { type: 'string' },
          intensity: { enum: dayIntensityValues },
          slots: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['period', 'activities'],
              properties: {
                period: { enum: periodValues },
                activities: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          reason: { type: 'string' },
          places: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'type'],
              properties: {
                name: { type: 'string' },
                type: { enum: ['attraction', 'food', 'shopping', 'hotel', 'transport'] },
              },
            },
          },
          estimatedTransport: { type: 'string' },
        },
      },
    },
  },
}

const systemInstructions = [
  '你是 CoTrip AI 的结构化旅行路线规划器。只输出 JSON，不输出 Markdown。',
  '你的任务不是写泛泛建议，而是基于用户最新输入、已有 TripState、地点位置线索和约束，生成可直接渲染的 DayPlan[]。',
  '必须尊重用户新增约束，例如抵达时间、机场到达、第一天不要太满、住址/住宿区域、交通便利、轻松节奏。',
  '如果用户说“第一天 10 点到机场，10:30 抵达东京”，Day 1 不应再安排高强度跨区景点，应以抵达、入住、住宿周边轻松适应为主。',
  '如果 tripState.transportInfo.arrival 存在，Day 1 必须优先安排落地、入境/取行李、前往住宿区和低强度周边活动。',
  '如果 tripState.transportInfo.departure 存在，最后一天必须保留返程弹性，避免安排远距离或高风险跨区景点。',
  '每一天尽量一个主区域。不要把相隔很远的区域硬塞同一天；远郊或主题乐园单独成天。',
  '餐厅/咖啡可以作为顺路补给，不要把餐饮候选当作主景点强行占全天。',
  'plans 数量必须等于 tripState.days。day 从 1 连续递增。',
  'places 只放当天地图应该展示的主要点位，优先使用用户提到的地点名称。不要放“自由活动”“休息”这类非地点。',
  'reply 要简短说明你如何按交通和约束调整了路线，但不要夸大为实时导航。',
]

function isTripState(value: unknown): value is TripState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TripState>
  return (
    typeof candidate.destination === 'string' &&
    typeof candidate.days === 'number' &&
    Array.isArray(candidate.itinerary) &&
    Array.isArray(candidate.preferences) &&
    Boolean(candidate.constraints)
  )
}

function getAiConfig(): AiClientConfig | null {
  const requestedProvider = process.env.AI_PROVIDER?.toLowerCase()
  const provider: AiProvider = requestedProvider === 'doubao' || process.env.DOUBAO_API_KEY ? 'doubao' : 'openai'

  if (provider === 'doubao') {
    const apiKey = process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY
    const model = process.env.DOUBAO_MODEL || process.env.ARK_MODEL
    if (!apiKey || !model) return null

    return {
      provider,
      apiKey,
      model,
      baseURL: process.env.DOUBAO_BASE_URL || process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  return {
    provider,
    apiKey,
    model: process.env.OPENAI_MODEL || 'gpt-5.5',
  }
}

function mergeCandidatePlaces(existing: CandidatePlace[], incoming: CandidatePlace[]) {
  const map = new Map(existing.map(place => [place.name, place]))
  incoming.forEach(place => {
    const current = map.get(place.name)
    map.set(place.name, current ? { ...current, ...place, status: current.status === 'excluded' ? place.status : current.status } : place)
  })
  return Array.from(map.values())
}

function summarizeTripState(tripState: TripState) {
  return {
    destination: tripState.destination,
    days: tripState.days,
    pace: tripState.pace,
    hotel: tripState.hotel,
    transportInfo: tripState.transportInfo,
    preferences: tripState.preferences,
    constraints: tripState.constraints,
    existingItinerary: tripState.itinerary.map(day => ({
      day: day.day,
      title: day.title,
      theme: day.theme,
      intensity: day.intensity,
      places: day.places.map(place => place.name),
      slots: day.slots,
      reason: day.reason,
      estimatedTransport: day.estimatedTransport,
    })),
  }
}

function buildPayload(input: string, tripState: TripState, candidates: CandidatePlace[]) {
  return {
    latestUserRequest: input,
    tripState: summarizeTripState(tripState),
    candidatePlaces: candidates.map(place => ({
      name: place.name,
      type: place.type,
      priority: place.priority,
      tags: place.constraintTags,
      status: place.status,
      areaHint: place.areaHint,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
    })),
    outputContract: {
      type: 'RoutePlanApiResponse',
      notes: 'Return reply and DayPlan[] only. DayPlan shape must match schema.',
    },
  }
}

function parseAiJson(content: string): unknown {
  const trimmed = content.trim()
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse(match?.[1] || trimmed)
}

function toPlanPlace(place: { name: string; type?: string }, candidates: CandidatePlace[], index: number): Place {
  const candidate = candidates.find(item => item.name === place.name || place.name.includes(item.name) || item.name.includes(place.name))
  return {
    id: `${place.name}-${index}`.replace(/\s+/g, '-').toLowerCase(),
    name: place.name,
    type: place.type === 'food' || place.type === 'shopping' || place.type === 'hotel' || place.type === 'transport'
      ? place.type
      : 'attraction',
    x: typeof candidate?.lng === 'number' ? Math.max(12, Math.min(88, (candidate.lng - 139.55) * 180 + 45)) : 30 + index * 10,
    y: typeof candidate?.lat === 'number' ? Math.max(18, Math.min(82, 72 - (candidate.lat - 35.55) * 180)) : 42 + index * 5,
  }
}

function sanitizePlans(value: unknown, tripState: TripState, candidates: CandidatePlace[]) {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.plans)) return null

  const plans: DayPlan[] = raw.plans.slice(0, tripState.days).map((planValue, index) => {
    const plan = planValue && typeof planValue === 'object' ? planValue as Record<string, unknown> : {}
    const rawSlots = Array.isArray(plan.slots) ? plan.slots : []
    const rawPlaces = Array.isArray(plan.places) ? plan.places : []
    const slots: TimeSlot[] = rawSlots
      .map(slotValue => {
        const slot = slotValue && typeof slotValue === 'object' ? slotValue as Record<string, unknown> : {}
        const period = typeof slot.period === 'string' && periodValues.includes(slot.period as TimeSlot['period'])
          ? slot.period as TimeSlot['period']
          : '下午'
        const activities = Array.isArray(slot.activities)
          ? slot.activities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()).slice(0, 4)
          : []
        return activities.length > 0 ? { period, activities } : null
      })
      .filter((slot): slot is TimeSlot => Boolean(slot))

    return {
      day: typeof plan.day === 'number' ? plan.day : index + 1,
      title: typeof plan.title === 'string' && plan.title.trim() ? plan.title.trim() : `Day ${index + 1}`,
      theme: typeof plan.theme === 'string' && plan.theme.trim() ? plan.theme.trim() : '区域集中路线',
      intensity: typeof plan.intensity === 'string' && dayIntensityValues.includes(plan.intensity as DayIntensity) ? plan.intensity as DayIntensity : tripState.pace,
      slots: slots.length > 0 ? slots : [{ period: '下午', activities: ['按当天主区域轻松游览', '保留弹性休息时间'] }],
      reason: typeof plan.reason === 'string' && plan.reason.trim() ? plan.reason.trim() : '根据用户补充的交通和区域约束调整。',
      places: rawPlaces
        .map((place, placeIndex) => place && typeof place === 'object' ? toPlanPlace(place as { name: string; type?: string }, candidates, placeIndex) : null)
        .filter((place): place is Place => Boolean(place?.name))
        .slice(0, 5),
      estimatedTransport: typeof plan.estimatedTransport === 'string' && plan.estimatedTransport.trim() ? plan.estimatedTransport.trim() : '待路线 API 精算',
    }
  })

  if (plans.length !== tripState.days) return null

  return {
    reply: typeof raw.reply === 'string' && raw.reply.trim()
      ? raw.reply.trim()
      : '我已按你的交通和时间约束重新生成路线，行程卡片和地图会同步更新。',
    plans: plans.map((plan, index) => ({ ...plan, day: index + 1 })),
  }
}

async function planWithOpenAI(client: OpenAI, model: string, input: string, tripState: TripState, candidates: CandidatePlace[]) {
  const response = await client.responses.create({
    model,
    instructions: systemInstructions.join('\n'),
    input: JSON.stringify(buildPayload(input, tripState, candidates)),
    text: {
      format: {
        type: 'json_schema',
        name: 'route_plan_result',
        strict: true,
        schema: routePlanSchema,
      },
    },
  }, { timeout: 25000 })

  return parseAiJson(response.output_text)
}

async function planWithDoubao(client: OpenAI, model: string, input: string, tripState: TripState, candidates: CandidatePlace[]) {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: systemInstructions.join('\n') + '\n只输出一个 JSON 对象，不要输出 Markdown。JSON 必须包含 reply 和 plans。',
      },
      {
        role: 'user',
        content: JSON.stringify(buildPayload(input, tripState, candidates)),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  }, { timeout: 25000 })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('AI route planner response did not include message content.')
  return parseAiJson(content)
}

async function planWithAI(input: string, tripState: TripState, candidates: CandidatePlace[]) {
  const config = getAiConfig()
  if (!config) return null

  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  })

  if (config.provider === 'doubao') return planWithDoubao(client, config.model, input, tripState, candidates)
  return planWithOpenAI(client, config.model, input, tripState, candidates)
}

function looksLikeArrivalConstraint(input: string, tripState: TripState) {
  return Boolean(tripState.transportInfo.arrival) || (/第一天/.test(input) && /(机场|抵达|到达|落地|航班|入住|行李)/.test(input))
}

function applyTransportConstraints(plans: DayPlan[], tripState: TripState, input: string) {
  const hasArrival = looksLikeArrivalConstraint(input, tripState)
  const hasDeparture = Boolean(tripState.transportInfo.departure)
  if (!hasArrival && !hasDeparture) return plans

  const firstArea = tripState.hotel.area || tripState.destination
  const hotelAnchor = tripState.hotel.name || tripState.hotel.area || `${tripState.destination}住宿区域`
  const arrivalInfo = tripState.transportInfo.arrival
  const departureInfo = tripState.transportInfo.departure
  const arrivalAnchor = arrivalInfo?.airport || (input.includes('机场') ? `${tripState.destination}机场` : tripState.destination)
  const arrivalText = arrivalInfo
    ? [arrivalInfo.time, arrivalInfo.airport].filter(Boolean).join('抵达') || arrivalInfo.raw || '抵达并办理入住'
    : input.match(/(?:\d{1,2}(?::|：)?\d{0,2}\s*)?(?:抵达|到达|落地|到)(?:东京|大阪|成都)?(?:机场)?/)?.[0] || '抵达并办理入住'
  const relaxedFirstDay: DayPlan = {
    day: 1,
    title: `抵达${tripState.destination} + 住宿周边`,
    theme: '抵达日轻量适应',
    intensity: '轻松',
    slots: [
      { period: '上午', activities: [arrivalText, '入境/取行李/前往住宿区域'] },
      { period: '下午', activities: [`${firstArea}附近办理入住`, '选择一个步行可达的轻量街区或咖啡休息'] },
      { period: '晚上', activities: ['住宿周边晚餐', '不安排跨区景点，保留体力'] },
    ],
    reason: '你补充了第一天抵达时间和机场约束，因此 Day 1 只安排低强度适应，不再塞入核心景点。',
    places: [
      { id: 'day-1-arrival-anchor', name: arrivalAnchor, type: 'transport', x: 36, y: 42 },
      { id: 'day-1-hotel-anchor', name: hotelAnchor, type: 'hotel', x: 48, y: 50 },
    ],
    estimatedTransport: '机场到市区约 60-90 分钟，市区内不再跨区',
  }

  return plans.map(plan => {
    if (hasArrival && plan.day === 1) return relaxedFirstDay
    if (hasDeparture && plan.day === tripState.days && departureInfo) {
      const departureText = [departureInfo.time, departureInfo.airport].filter(Boolean).join('从') || departureInfo.raw || '返程'
      return {
        ...plan,
        title: `${tripState.destination}轻松收尾 + 返程`,
        theme: '返程日弹性收尾',
        intensity: '轻松' as const,
        slots: [
          { period: '上午' as const, activities: ['住宿周边轻量补漏或购买伴手礼', '避免安排远距离景点'] },
          { period: '下午' as const, activities: ['回住宿区域整理行李', `预留时间前往${departureText}`] },
          { period: '晚上' as const, activities: ['返程', '不追加高强度活动'] },
        ],
        places: [
          ...plan.places.slice(0, 1),
          { id: 'day-final-departure-anchor', name: departureInfo.airport || `${tripState.destination}机场`, type: 'transport' as const, x: 68, y: 58 },
        ],
        estimatedTransport: '市区到机场约 60-90 分钟，建议额外预留安检和换乘时间',
        reason: '已把返程时间和机场作为最后一天硬约束，因此保留充足机动时间，避免影响返程。',
      }
    }
    return plan
  })
}

function createLocalFallback(input: string, tripState: TripState, candidates: CandidatePlace[]) {
  const plans = generateCandidateDrivenPlans({
    destination: tripState.destination,
    days: tripState.days,
    pace: tripState.pace,
    interests: tripState.preferences,
    candidatePlaces: candidates,
    fallbackPlans: tripState.itinerary,
    optimizeByTransport: true,
  })

  return {
    plans: applyTransportConstraints(plans, tripState, input),
    reply: '我先按地点位置、抵达时间和交通便利性生成一版路线草案：相邻区域优先合并，抵达日降低强度。接入真实路线 API 后，还可以继续精算每段通勤时间。',
  }
}

function getMissingConfigMessage() {
  if (process.env.AI_PROVIDER?.toLowerCase() === 'doubao' || process.env.DOUBAO_API_KEY) {
    return 'DOUBAO_API_KEY and DOUBAO_MODEL are not configured.'
  }

  return 'OPENAI_API_KEY is not configured.'
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<RoutePlanApiRequest>
    const input = body.input?.trim() || ''

    if (!input || !isTripState(body.tripState)) {
      return NextResponse.json({ error: 'Invalid route plan request.' }, { status: 400 })
    }

    const extractedPlaces = extractCandidatePlaces(input, body.tripState.destination)
    const candidates = mergeCandidatePlaces(body.tripState.candidatePlaces, extractedPlaces)

    try {
      const aiResult = await planWithAI(input, body.tripState, candidates)
      if (aiResult) {
        const sanitized = sanitizePlans(aiResult, body.tripState, candidates)
        if (sanitized) {
          const payload: RoutePlanApiResponse = {
            plans: applyTransportConstraints(sanitized.plans, body.tripState, input),
            reply: sanitized.reply,
            usedAI: true,
          }
          return NextResponse.json(payload)
        }
      }

      const fallback = createLocalFallback(input, body.tripState, candidates)
      const payload: RoutePlanApiResponse = {
        ...fallback,
        usedAI: false,
        error: getMissingConfigMessage(),
      }
      return NextResponse.json(payload)
    } catch (error) {
      console.error('Route plan AI generation failed:', error)
      const fallback = createLocalFallback(input, body.tripState, candidates)
      const payload: RoutePlanApiResponse = {
        ...fallback,
        usedAI: false,
        error: error instanceof Error ? error.message : 'Unknown route planning error.',
      }
      return NextResponse.json(payload)
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
}
