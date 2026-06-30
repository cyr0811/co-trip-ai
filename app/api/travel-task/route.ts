import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { normalizeTravelTaskFrame, parseLocalTravelTask } from '@/lib/travel-task-frame'
import type { TravelTaskApiRequest, TravelTaskApiResponse } from '@/lib/travel-task-api'
import type { TravelTaskFrameV2, TravelTaskTypeV2 } from '@/lib/travel-task-frame'
import type { TripState } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AiProvider = 'openai' | 'doubao'

interface AiClientConfig {
  provider: AiProvider
  apiKey: string
  baseURL?: string
  model: string
}

const taskTypes: TravelTaskTypeV2[] = [
  'add_must_go_place',
  'remove_place',
  'replace_day',
  'adjust_pace',
  'add_food_request',
  'update_transport_boundary',
  'update_hotel',
  'reroute_by_transport',
  'ask_why',
  'clarify',
  'record',
  'unsupported',
]

const taskSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['taskType', 'confidence', 'needsClarification', 'userIntentSummary', 'target', 'constraints', 'payload', 'rawUserInput'],
  properties: {
    taskType: { enum: taskTypes },
    confidence: { type: 'number' },
    needsClarification: { type: 'boolean' },
    userIntentSummary: { type: 'string' },
    target: {
      type: 'object',
      additionalProperties: false,
      required: ['day', 'place', 'timeSlot'],
      properties: {
        day: { type: ['number', 'null'] },
        place: { type: ['string', 'null'] },
        timeSlot: { anyOf: [{ enum: ['breakfast', 'morning', 'lunch', 'noon', 'afternoon', 'tea_time', 'dinner', 'evening', 'night', 'late_night'] }, { type: 'null' }] },
      },
    },
    constraints: {
      type: 'object',
      additionalProperties: false,
      required: ['needsFullDay', 'avoidFirstDay', 'avoidDepartureDay', 'routePreference', 'pace', 'reason'],
      properties: {
        needsFullDay: { type: ['boolean', 'null'] },
        avoidFirstDay: { type: ['boolean', 'null'] },
        avoidDepartureDay: { type: ['boolean', 'null'] },
        routePreference: { anyOf: [{ enum: ['same_area', 'minimal_detour', 'transport_optimized'] }, { type: 'null' }] },
        pace: { anyOf: [{ enum: ['relaxed', 'normal', 'intense'] }, { type: 'null' }] },
        reason: { type: ['string', 'null'] },
      },
    },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['theme', 'category', 'places', 'avoidPlaces', 'note'],
      properties: {
        theme: { type: ['string', 'null'] },
        category: { anyOf: [{ enum: ['restaurant', 'cafe', 'shopping', 'sightseeing', 'experience', 'rest'] }, { type: 'null' }] },
        places: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
        avoidPlaces: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
        note: { type: ['string', 'null'] },
      },
    },
    rawUserInput: { type: 'string' },
  },
}

const systemInstructions = [
  '你是 CoTrip AI 的旅行任务语义理解层。你只输出 TravelTaskFrame JSON，不输出自然语言回复。',
  '你的目标是理解用户想完成的旅行任务，而不是直接修改行程。',
  '不要把可执行旅行任务降级成 record 或 clarify。只有缺少关键目标时才 clarify。',
  '“我还想去X / 想去X / 把X加入行程 / 新增X / 添加X / 加到我的行程里”必须输出 taskType=add_must_go_place。',
  '迪士尼、环球影城、富士山、箱根通常 needsFullDay=true，并且 avoidFirstDay=true、avoidDepartureDay=true。',
  '“第二天改成X / 第N天去X / 第N天换成X”输出 replace_day。',
  '“day5想安排成二次元主题日 / 第五天安排成建筑主题日 / 第N天改成X主题”输出 replace_day，target.day 必须等于用户指定的 N，payload.theme=X。',
  '“不想去X / 不去X / 避开X”输出 remove_place，并把 X 放进 payload.avoidPlaces。',
  '“太满 / 轻松一点 / 别太赶”输出 adjust_pace。',
  '“加餐厅 / 加咖啡 / 附近吃饭”输出 add_food_request。',
  '“按交通 / 顺路 / 重新规划这些地点 / 怎么走”输出 reroute_by_transport。',
  '“为什么这样安排”输出 ask_why。',
  '如果用户没有指定 day，但任务可执行，不要 clarify；day 返回 null，由规划层选择合适日期。',
  '字段未知用 null 或空数组，不要省略 schema 字段。',
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

function summarizeTripState(tripState: TripState) {
  return {
    destination: tripState.destination,
    days: tripState.days,
    pace: tripState.pace,
    hotel: tripState.hotel,
    transportInfo: tripState.transportInfo,
    preferences: tripState.preferences,
    constraints: tripState.constraints,
    itinerary: tripState.itinerary.map(day => ({
      day: day.day,
      title: day.title,
      theme: day.theme,
      intensity: day.intensity,
      places: day.places.map(place => place.name),
      estimatedTransport: day.estimatedTransport,
    })),
    rules: {
      firstDayArrivalSensitive: Boolean(tripState.transportInfo.arrival),
      lastDayDepartureSensitive: Boolean(tripState.transportInfo.departure),
      mapMustComeFromTripState: true,
    },
  }
}

function buildPayload(input: string, tripState: TripState) {
  return {
    latestUserInput: input,
    tripState: summarizeTripState(tripState),
    outputContract: 'TravelTaskFrameV2',
  }
}

function parseAiJson(content: string): unknown {
  const trimmed = content.trim()
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse(match?.[1] || trimmed)
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : undefined
}

function sanitizeTask(value: unknown, input: string, tripState: TripState): TravelTaskFrameV2 {
  const fallback = parseLocalTravelTask(input, tripState)
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, unknown>
  const taskType = cleanString(raw.taskType)
  if (!taskType || !taskTypes.includes(taskType as TravelTaskTypeV2)) return fallback
  const target = raw.target && typeof raw.target === 'object' ? raw.target as Record<string, unknown> : {}
  const constraints = raw.constraints && typeof raw.constraints === 'object' ? raw.constraints as Record<string, unknown> : {}
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload as Record<string, unknown> : {}
  const routePreference = cleanString(constraints.routePreference)
  const pace = cleanString(constraints.pace)
  const category = cleanString(payload.category)
  const timeSlot = cleanString(target.timeSlot)

  return normalizeTravelTaskFrame({
    taskType: taskType as TravelTaskTypeV2,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : fallback.confidence,
    needsClarification: typeof raw.needsClarification === 'boolean' ? raw.needsClarification : fallback.needsClarification,
    userIntentSummary: cleanString(raw.userIntentSummary) || fallback.userIntentSummary,
    target: {
      ...(typeof target.day === 'number' ? { day: target.day } : {}),
      ...(cleanString(target.place) ? { place: cleanString(target.place) } : {}),
      ...(timeSlot ? { timeSlot: timeSlot as TravelTaskFrameV2['target']['timeSlot'] } : {}),
    },
    constraints: {
      ...(typeof constraints.needsFullDay === 'boolean' ? { needsFullDay: constraints.needsFullDay } : {}),
      ...(typeof constraints.avoidFirstDay === 'boolean' ? { avoidFirstDay: constraints.avoidFirstDay } : {}),
      ...(typeof constraints.avoidDepartureDay === 'boolean' ? { avoidDepartureDay: constraints.avoidDepartureDay } : {}),
      ...(routePreference === 'same_area' || routePreference === 'minimal_detour' || routePreference === 'transport_optimized' ? { routePreference } : {}),
      ...(pace === 'relaxed' || pace === 'normal' || pace === 'intense' ? { pace } : {}),
      ...(cleanString(constraints.reason) ? { reason: cleanString(constraints.reason) } : {}),
    },
    payload: {
      ...(cleanString(payload.theme) ? { theme: cleanString(payload.theme) } : {}),
      ...(category === 'restaurant' || category === 'cafe' || category === 'shopping' || category === 'sightseeing' || category === 'experience' || category === 'rest' ? { category } : {}),
      ...(cleanStringArray(payload.places) ? { places: cleanStringArray(payload.places) } : {}),
      ...(cleanStringArray(payload.avoidPlaces) ? { avoidPlaces: cleanStringArray(payload.avoidPlaces) } : {}),
      ...(cleanString(payload.note) ? { note: cleanString(payload.note) } : {}),
    },
    rawUserInput: cleanString(raw.rawUserInput) || input,
  }, tripState)
}

function shouldPreferLocalCompoundTask(localTask: TravelTaskFrameV2, aiTask: TravelTaskFrameV2) {
  return (
    localTask.taskType === 'add_must_go_place' &&
    Boolean(localTask.target.place) &&
    Boolean(localTask.payload.avoidPlaces?.length) &&
    (
      aiTask.taskType === 'remove_place' ||
      aiTask.target.place !== localTask.target.place ||
      !aiTask.payload.avoidPlaces?.length
    )
  )
}

function shouldPreferLocalExplicitDayTask(localTask: TravelTaskFrameV2, aiTask: TravelTaskFrameV2) {
  return (
    localTask.taskType === 'replace_day' &&
    Boolean(localTask.target.day) &&
    Boolean(localTask.payload.theme) &&
    (
      aiTask.taskType === 'clarify' ||
      aiTask.taskType === 'record' ||
      aiTask.target.day !== localTask.target.day ||
      (Boolean(aiTask.payload.theme) && aiTask.payload.theme !== localTask.payload.theme)
    )
  )
}

async function parseWithOpenAI(client: OpenAI, model: string, input: string, tripState: TripState) {
  const response = await client.responses.create({
    model,
    instructions: systemInstructions.join('\n'),
    input: JSON.stringify(buildPayload(input, tripState)),
    text: {
      format: {
        type: 'json_schema',
        name: 'travel_task_frame',
        strict: true,
        schema: taskSchema,
      },
    },
  }, { timeout: 20000 })
  return parseAiJson(response.output_text)
}

async function parseWithDoubao(client: OpenAI, model: string, input: string, tripState: TripState) {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: systemInstructions.join('\n') + '\n只输出一个 JSON 对象，不要输出 Markdown。',
      },
      {
        role: 'user',
        content: JSON.stringify(buildPayload(input, tripState)),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  }, { timeout: 20000 })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('AI travel-task response did not include message content.')
  return parseAiJson(content)
}

async function parseWithAI(input: string, tripState: TripState) {
  const config = getAiConfig()
  if (!config) return null
  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  })
  if (config.provider === 'doubao') return parseWithDoubao(client, config.model, input, tripState)
  return parseWithOpenAI(client, config.model, input, tripState)
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`AI travel-task parsing timed out after ${ms}ms`)), ms)
    }),
  ])
}

function getMissingConfigMessage() {
  if (process.env.AI_PROVIDER?.toLowerCase() === 'doubao' || process.env.DOUBAO_API_KEY) {
    return 'DOUBAO_API_KEY and DOUBAO_MODEL are not configured.'
  }
  return 'OPENAI_API_KEY is not configured.'
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<TravelTaskApiRequest>
    const input = body.input?.trim() || ''
    if (!input || !isTripState(body.tripState)) {
      return NextResponse.json({ error: 'Invalid travel-task request.' }, { status: 400 })
    }

    const localTask = normalizeTravelTaskFrame(parseLocalTravelTask(input, body.tripState), body.tripState)

    try {
      const aiResult = await withTimeout(parseWithAI(input, body.tripState), 8000)
      if (!aiResult) {
        const payload: TravelTaskApiResponse = {
          task: localTask,
          usedAI: false,
          error: getMissingConfigMessage(),
        }
        return NextResponse.json(payload)
      }

      const payload: TravelTaskApiResponse = {
        task: (() => {
          const aiTask = sanitizeTask(aiResult, input, body.tripState)
          return shouldPreferLocalCompoundTask(localTask, aiTask) || shouldPreferLocalExplicitDayTask(localTask, aiTask) ? localTask : aiTask
        })(),
        usedAI: true,
      }
      return NextResponse.json(payload)
    } catch (error) {
      console.error('Travel-task AI parsing failed:', error)
      const payload: TravelTaskApiResponse = {
        task: localTask,
        usedAI: false,
        error: error instanceof Error ? error.message : 'Unknown travel-task parsing error.',
      }
      return NextResponse.json(payload)
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
}
