import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { semanticParseUserFeedback } from '@/lib/trip-state'
import type { ItineraryCommandApiRequest, ItineraryCommandApiResponse } from '@/lib/itinerary-command-api'
import type { ActivityCategory, LocationConstraint, ParseResult, TimeIntent, TravelEditCommand, TripState } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AiProvider = 'openai' | 'doubao'

interface AiClientConfig {
  provider: AiProvider
  apiKey: string
  baseURL?: string
  model: string
}

const operationEnum = ['add', 'remove', 'replace', 'move', 'update', 'regenerate', 'adjust', 'recommend', 'clarify', 'record', 'unsupported']
const scopeEnum = ['trip', 'day', 'time_slot', 'place', 'activity', 'budget', 'preference', 'constraint', 'map_route', 'note']
const timeSlotEnum = ['morning', 'afternoon', 'evening']
const timeIntentEnum = ['breakfast', 'morning', 'lunch', 'noon', 'afternoon', 'tea_time', 'dinner', 'evening', 'night', 'late_night']
const activityCategoryEnum = ['sightseeing', 'restaurant', 'cafe', 'shopping', 'transport', 'hotel', 'rest', 'experience', 'free_time', 'nightlife', 'budget', 'reservation', 'unknown']
const locationConstraintTypeEnum = ['near', 'near_hotel', 'inside_area', 'same_area', 'on_route', 'minimal_detour', 'no_constraint']
const radiusLevelEnum = ['walkable', 'nearby', 'same_area']
const paceEnum = ['relaxed', 'normal', 'intense']
const durationEnum = ['short', 'half_day', 'full_day']
const actionModeEnum = ['execute', 'confirm', 'clarify', 'record', 'unsupported']

const nullableStringArray = {
  anyOf: [
    { type: 'array', items: { type: 'string' } },
    { type: 'null' },
  ],
}

const nullableTimeIntentArray = {
  anyOf: [
    { type: 'array', items: { enum: timeIntentEnum } },
    { type: 'null' },
  ],
}

const nullableLocationConstraint = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'anchorPlace', 'radiusLevel'],
      properties: {
        type: { enum: locationConstraintTypeEnum },
        anchorPlace: { type: ['string', 'null'] },
        radiusLevel: { anyOf: [{ enum: radiusLevelEnum }, { type: 'null' }] },
      },
    },
    { type: 'null' },
  ],
}

const commandSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'scope', 'target', 'payload', 'confidence', 'needsClarification'],
  properties: {
    operation: { enum: operationEnum },
    scope: { enum: scopeEnum },
    target: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['day', 'timeSlot', 'timeSlots', 'place', 'activityId'],
      properties: {
        day: { type: ['number', 'null'] },
        timeSlot: { anyOf: [{ enum: timeSlotEnum }, { type: 'null' }] },
        timeSlots: nullableTimeIntentArray,
        place: { type: ['string', 'null'] },
        activityId: { type: ['string', 'null'] },
      },
    },
    payload: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: [
        'activityCategory',
        'timeIntents',
        'places',
        'avoidPlaces',
        'preferPlaces',
        'categories',
        'theme',
        'anchorPlace',
        'locationConstraint',
        'duration',
        'pace',
        'budgetMode',
        'budgetCategories',
        'recommendationMode',
        'overwrite',
        'respectConstraints',
        'note',
        'reason',
      ],
      properties: {
        activityCategory: { anyOf: [{ enum: activityCategoryEnum }, { type: 'null' }] },
        timeIntents: nullableTimeIntentArray,
        places: nullableStringArray,
        avoidPlaces: nullableStringArray,
        preferPlaces: nullableStringArray,
        categories: nullableStringArray,
        theme: { type: ['string', 'null'] },
        anchorPlace: { type: ['string', 'null'] },
        locationConstraint: nullableLocationConstraint,
        duration: { anyOf: [{ enum: durationEnum }, { type: 'null' }] },
        pace: { anyOf: [{ enum: paceEnum }, { type: 'null' }] },
        budgetMode: { anyOf: [{ enum: ['summary', 'breakdown'] }, { type: 'null' }] },
        budgetCategories: nullableStringArray,
        recommendationMode: { type: ['string', 'null'] },
        overwrite: { type: ['boolean', 'null'] },
        respectConstraints: { type: ['boolean', 'null'] },
        note: { type: ['string', 'null'] },
        reason: { type: ['string', 'null'] },
      },
    },
    confidence: { type: 'number' },
    needsClarification: { type: 'boolean' },
  },
}

const parseResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['commands', 'confidence', 'actionMode', 'userFacingMessage'],
  properties: {
    commands: {
      type: 'array',
      items: commandSchema,
    },
    confidence: { type: 'number' },
    actionMode: { enum: actionModeEnum },
    userFacingMessage: { type: ['string', 'null'] },
  },
}

const systemInstructions = [
  '你是 CoTrip AI 的行程编辑语义解析器，只输出结构化 ParseResult JSON，不输出自然语言解释。',
  '你的任务是先在内部理解 TravelTaskFrame，再转换成 TravelEditCommand[]；不要直接修改行程，也不要生成最终回复。',
  '解析链路必须是：userInput -> surface hints -> semantic travel task frame -> command。不要把可执行旅行任务降级成 record。',
  '必须支持 multi-command parsing：一句话里如果同时包含“重新规划某天”和“避开某些地点”，要拆成多个 command。',
  '禁止 unknown fallback 成 add constraint。无法确定时使用 operation=clarify 或 record；只是想法/备注用 record；超出能力用 unsupported。',
  'operation 只能是 add/remove/replace/move/update/regenerate/adjust/recommend/clarify/record/unsupported。',
  'scope 只能是 trip/day/time_slot/place/activity/budget/preference/constraint/map_route/note。',
  '用户要求增加餐厅、咖啡店、休息点、购物、体验时，输出 add 或 recommend + activity；payload.activityCategory 必须对应 restaurant/cafe/rest/shopping/experience 等。',
  '中午、午餐使用 timeIntents=[lunch]；下午使用 [afternoon] 或 [tea_time]；晚上、晚餐使用 [dinner] 或 [evening]；一句话里有中午和晚上要同时保留两个 timeIntents。',
  '“在酒店附近”输出 locationConstraint.type=near_hotel；“在 X 附近”输出 type=near, anchorPlace=X；“顺路/路上/不要离太远”输出 type=on_route 或 minimal_detour。',
  '用户说“想增加预算细节/预算拆分/费用明细”时，输出 update + budget，payload.budgetMode=breakdown，budgetCategories=[交通,餐饮,门票,住宿,购物,备用金]。',
  '用户说“第N天去X/改成X/换成X”，如果 X 是明确主题或地点，应输出 replace 或 regenerate day，而不是 record。',
  '用户说“我还想去X / 把X加入行程 / 新增X / 加入X”是可执行新增意图，不要输出 clarify 或 record。',
  '如果 X 是迪士尼、环球影城、富士山、箱根这类远郊/主题乐园，即使用户没有指定 day，也应选择一个非首日、非返程日的合适 day，输出 replace + day，payload.theme=X，payload.duration=full_day。',
  '如果 X 是普通景点或街区且用户没有指定 day，应选择一个合适 day，输出 add + place，target.place=X。',
  '用户说“不去/不想去/不感兴趣/不要/避开 X 和 Y”时，将 X/Y 放入 avoidPlaces 或 categories，不要把整句塞进 constraint。',
  '用户说“第二天去迪士尼，不去上野和原宿了”应输出两个 commands：add constraint avoidPlaces=[上野,原宿] target day=2；replace day target day=2 theme=迪士尼 anchorPlace=东京迪士尼度假区。',
  '用户说“晚上不要安排活动”且没有明确 day 时，输出 clarify time_slot，needsClarification=true。',
  'confidence 使用 0 到 1。字段未知用 null 或空数组，不要省略 schema 字段。',
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
    preferences: tripState.preferences,
    constraints: tripState.constraints,
    budget: tripState.budget,
    itinerary: tripState.itinerary.map(day => ({
      day: day.day,
      title: day.title,
      theme: day.theme,
      intensity: day.intensity,
      places: day.places.map(place => place.name),
      slots: day.slots.map(slot => ({
        period: slot.period,
        activities: slot.activities,
      })),
      items: (day.items || []).map(item => ({
        timeLabel: item.timeLabel,
        timeIntent: item.timeIntent,
        type: item.type,
        title: item.title,
        place: item.place,
        status: item.status,
        locationConstraint: item.locationConstraint,
      })),
    })),
  }
}

function buildPayload(input: string, tripState: TripState) {
  return {
    latestUserFeedback: input,
    tripState: summarizeTripState(tripState),
    outputContract: {
      type: 'ParseResult',
      notes: 'Only produce TravelEditCommand objects. Do not produce final user reply.',
    },
  }
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : undefined
}

function cleanTimeIntentArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is TimeIntent => typeof item === 'string' && timeIntentEnum.includes(item))
    : undefined
}

function cleanLocationConstraint(value: unknown): LocationConstraint | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const type = cleanString(raw.type)
  if (!type || !locationConstraintTypeEnum.includes(type)) return undefined
  const radiusLevel = cleanString(raw.radiusLevel)
  return {
    type: type as LocationConstraint['type'],
    ...(cleanString(raw.anchorPlace) ? { anchorPlace: cleanString(raw.anchorPlace) } : {}),
    ...(radiusLevel && radiusLevelEnum.includes(radiusLevel) ? { radiusLevel: radiusLevel as NonNullable<LocationConstraint['radiusLevel']> } : {}),
  }
}

function sanitizeCommand(command: unknown): TravelEditCommand | null {
  if (!command || typeof command !== 'object') return null
  const raw = command as Record<string, unknown>
  const operation = cleanString(raw.operation)
  const scope = cleanString(raw.scope)
  if (!operation || !operationEnum.includes(operation) || !scope || !scopeEnum.includes(scope)) return null

  const rawTarget = raw.target && typeof raw.target === 'object' ? raw.target as Record<string, unknown> : undefined
  const rawPayload = raw.payload && typeof raw.payload === 'object' ? raw.payload as Record<string, unknown> : undefined
  const timeSlot = cleanString(rawTarget?.timeSlot)
  const pace = cleanString(rawPayload?.pace)
  const duration = cleanString(rawPayload?.duration)
  const budgetMode = cleanString(rawPayload?.budgetMode)
  const activityCategory = cleanString(rawPayload?.activityCategory)
  const confidence = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5
  const targetTimeSlots = cleanTimeIntentArray(rawTarget?.timeSlots)
  const payloadTimeIntents = cleanTimeIntentArray(rawPayload?.timeIntents)
  const locationConstraint = cleanLocationConstraint(rawPayload?.locationConstraint)

  return {
    operation: operation as TravelEditCommand['operation'],
    scope: scope as TravelEditCommand['scope'],
    target: rawTarget
      ? {
          ...(typeof rawTarget.day === 'number' ? { day: rawTarget.day } : {}),
          ...(timeSlot && timeSlotEnum.includes(timeSlot) ? { timeSlot: timeSlot as NonNullable<TravelEditCommand['target']>['timeSlot'] } : {}),
          ...(targetTimeSlots?.length ? { timeSlots: targetTimeSlots } : {}),
          ...(cleanString(rawTarget.place) ? { place: cleanString(rawTarget.place) } : {}),
          ...(cleanString(rawTarget.activityId) ? { activityId: cleanString(rawTarget.activityId) } : {}),
        }
      : undefined,
    payload: rawPayload
      ? {
          ...(activityCategory && activityCategoryEnum.includes(activityCategory) ? { activityCategory: activityCategory as ActivityCategory } : {}),
          ...(payloadTimeIntents?.length ? { timeIntents: payloadTimeIntents } : {}),
          ...(cleanStringArray(rawPayload.places) ? { places: cleanStringArray(rawPayload.places) } : {}),
          ...(cleanStringArray(rawPayload.avoidPlaces) ? { avoidPlaces: cleanStringArray(rawPayload.avoidPlaces) } : {}),
          ...(cleanStringArray(rawPayload.preferPlaces) ? { preferPlaces: cleanStringArray(rawPayload.preferPlaces) } : {}),
          ...(cleanStringArray(rawPayload.categories) ? { categories: cleanStringArray(rawPayload.categories) } : {}),
          ...(cleanString(rawPayload.theme) ? { theme: cleanString(rawPayload.theme) } : {}),
          ...(cleanString(rawPayload.anchorPlace) ? { anchorPlace: cleanString(rawPayload.anchorPlace) } : {}),
          ...(locationConstraint ? { locationConstraint } : {}),
          ...(duration && durationEnum.includes(duration) ? { duration: duration as NonNullable<TravelEditCommand['payload']>['duration'] } : {}),
          ...(pace && paceEnum.includes(pace) ? { pace: pace as NonNullable<TravelEditCommand['payload']>['pace'] } : {}),
          ...(budgetMode === 'summary' || budgetMode === 'breakdown' ? { budgetMode } : {}),
          ...(cleanStringArray(rawPayload.budgetCategories) ? { budgetCategories: cleanStringArray(rawPayload.budgetCategories) } : {}),
          ...(cleanString(rawPayload.recommendationMode) ? { recommendationMode: cleanString(rawPayload.recommendationMode) } : {}),
          ...(typeof rawPayload.overwrite === 'boolean' ? { overwrite: rawPayload.overwrite } : {}),
          ...(typeof rawPayload.respectConstraints === 'boolean' ? { respectConstraints: rawPayload.respectConstraints } : {}),
          ...(cleanString(rawPayload.note) ? { note: cleanString(rawPayload.note) } : {}),
          ...(cleanString(rawPayload.reason) ? { reason: cleanString(rawPayload.reason) } : {}),
        }
      : undefined,
    confidence,
    needsClarification: typeof raw.needsClarification === 'boolean' ? raw.needsClarification : confidence < 0.6,
  }
}

function sanitizeParseResult(value: unknown, fallback: ParseResult): ParseResult {
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, unknown>
  const commands = Array.isArray(raw.commands)
    ? raw.commands.map(sanitizeCommand).filter((command): command is TravelEditCommand => Boolean(command))
    : []
  const actionMode = cleanString(raw.actionMode)
  const confidence = typeof raw.confidence === 'number'
    ? Math.min(1, Math.max(0, raw.confidence))
    : commands.length > 0
      ? commands.reduce((sum, command) => sum + command.confidence, 0) / commands.length
      : fallback.confidence

  if (commands.length === 0 || !actionMode || !actionModeEnum.includes(actionMode)) return fallback

  return {
    commands,
    confidence,
    actionMode: actionMode as ParseResult['actionMode'],
    ...(cleanString(raw.userFacingMessage) ? { userFacingMessage: cleanString(raw.userFacingMessage) } : {}),
  }
}

function parseAiJson(content: string): unknown {
  const trimmed = content.trim()
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse(match?.[1] || trimmed)
}

async function parseWithOpenAI(client: OpenAI, model: string, input: string, tripState: TripState) {
  const response = await client.responses.create({
    model,
    instructions: systemInstructions.join('\n'),
    input: JSON.stringify(buildPayload(input, tripState)),
    text: {
      format: {
        type: 'json_schema',
        name: 'itinerary_command_parse_result',
        strict: true,
        schema: parseResultSchema,
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
        content: systemInstructions.join('\n') + '\n只输出一个 JSON 对象，不要输出 Markdown。JSON 字段必须符合 ParseResult。',
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
  if (!content) throw new Error('AI response did not include message content.')
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

function getMissingConfigMessage() {
  if (process.env.AI_PROVIDER?.toLowerCase() === 'doubao' || process.env.DOUBAO_API_KEY) {
    return 'DOUBAO_API_KEY and DOUBAO_MODEL are not configured.'
  }

  return 'OPENAI_API_KEY is not configured.'
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ItineraryCommandApiRequest>
    const input = body.input?.trim() || ''

    if (!input || !isTripState(body.tripState)) {
      return NextResponse.json({ error: 'Invalid itinerary command request.' }, { status: 400 })
    }

    const localParseResult = semanticParseUserFeedback(input, body.tripState)

    try {
      const aiResult = await parseWithAI(input, body.tripState)
      if (!aiResult) {
        const payload: ItineraryCommandApiResponse = {
          parseResult: localParseResult,
          usedAI: false,
          error: getMissingConfigMessage(),
        }
        return NextResponse.json(payload)
      }

      const payload: ItineraryCommandApiResponse = {
        parseResult: sanitizeParseResult(aiResult, localParseResult),
        usedAI: true,
      }
      return NextResponse.json(payload)
    } catch (error) {
      console.error('Itinerary command AI parsing failed:', error)
      const payload: ItineraryCommandApiResponse = {
        parseResult: localParseResult,
        usedAI: false,
        error: error instanceof Error ? error.message : 'Unknown itinerary command parsing error.',
      }
      return NextResponse.json(payload)
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
}
