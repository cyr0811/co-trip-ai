import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { updateTripSessionWithClarification } from '@/lib/trip-session'
import type { GeoLocationStatus, StayInfo, TripClarificationDetails, TripProfileField, TripSession } from '@/lib/types'
import type { TripProfileApiRequest, TripProfileApiResponse } from '@/lib/trip-profile-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AiProvider = 'openai' | 'doubao'

interface AiTripProfileField {
  raw: string
  value: string
  status: TripProfileField['status']
  source: TripProfileField['source']
}

interface AiStayInfoExtraction {
  stayArea: AiTripProfileField | null
  hotelName: AiTripProfileField | null
  hotelAddress: AiTripProfileField | null
  geoLocation: {
    lat: number | null
    lng: number | null
    placeId: string | null
    status: GeoLocationStatus
  }
}

interface AiTransportBoundaryExtraction {
  time: string | null
  airport: string | null
  raw: string | null
}

interface AiTripProfileExtraction {
  clarificationDetails: {
    travelTime: string | null
    lodgingArea: string | null
    hotelAddress: string | null
    dailyStartTime: string | null
    budgetLevel: string | null
    arrivalInfo: AiTransportBoundaryExtraction | null
    departureInfo: AiTransportBoundaryExtraction | null
    stayInfo: AiStayInfoExtraction | null
  }
  assistantMessage: string
}

interface AiClientConfig {
  provider: AiProvider
  apiKey: string
  baseURL?: string
  model: string
}

const profileFieldSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['raw', 'value', 'status', 'source'],
  properties: {
    raw: { type: 'string' },
    value: { type: 'string' },
    status: { enum: ['missing', 'inferred', 'confirmed', 'user_provided'] },
    source: { enum: ['user', 'ai', 'system'] },
  },
}

const tripProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['clarificationDetails', 'assistantMessage'],
  properties: {
    clarificationDetails: {
      type: 'object',
      additionalProperties: false,
      required: ['travelTime', 'lodgingArea', 'hotelAddress', 'dailyStartTime', 'budgetLevel', 'arrivalInfo', 'departureInfo', 'stayInfo'],
      properties: {
        travelTime: { type: ['string', 'null'] },
        lodgingArea: { type: ['string', 'null'] },
        hotelAddress: { type: ['string', 'null'] },
        dailyStartTime: { type: ['string', 'null'] },
        budgetLevel: { type: ['string', 'null'] },
        arrivalInfo: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['time', 'airport', 'raw'],
          properties: {
            time: { type: ['string', 'null'] },
            airport: { type: ['string', 'null'] },
            raw: { type: ['string', 'null'] },
          },
        },
        departureInfo: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['time', 'airport', 'raw'],
          properties: {
            time: { type: ['string', 'null'] },
            airport: { type: ['string', 'null'] },
            raw: { type: ['string', 'null'] },
          },
        },
        stayInfo: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['stayArea', 'hotelName', 'hotelAddress', 'geoLocation'],
          properties: {
            stayArea: { anyOf: [profileFieldSchema, { type: 'null' }] },
            hotelName: { anyOf: [profileFieldSchema, { type: 'null' }] },
            hotelAddress: { anyOf: [profileFieldSchema, { type: 'null' }] },
            geoLocation: {
              type: 'object',
              additionalProperties: false,
              required: ['lat', 'lng', 'placeId', 'status'],
              properties: {
                lat: { type: ['number', 'null'] },
                lng: { type: ['number', 'null'] },
                placeId: { type: ['string', 'null'] },
                status: { enum: ['missing', 'pending_geocode', 'geocoded', 'ambiguous', 'failed'] },
              },
            },
          },
        },
      },
    },
    assistantMessage: { type: 'string' },
  },
}

const systemInstructions = [
  '你是旅行规划产品里的需求识别助手，只负责把用户自然语言抽取成结构化字段。',
  '你必须基于 currentSession 的完整上下文更新 tripProfile。新一轮用户输入只补充或更新字段，不能清空、覆盖或丢失之前已经识别到的字段。',
  '不要编造用户没有提供的信息。没有明确提供时返回 null，让服务端保留已有值。',
  '住宿信息必须拆成 stayInfo：stayArea 是城市内区域，例如大手町、太古里、新宿、涩谷；hotelName 是具体酒店或民宿名；hotelAddress 是用户提供的详细地址；geoLocation 是地图 API 解析结果。',
  '如果用户提供酒店名称或详细地址，但当前还没有地图 API 结果，geoLocation.status 必须返回 pending_geocode，不要继续追问具体酒店地址。',
  '只有 stayArea、hotelName、hotelAddress 都没有任何线索时，才询问住宿区域。只有地图解析失败 failed 或多个候选 ambiguous 时，才追问用户补充或确认。',
  '落地信息必须拆成 arrivalInfo：time 是第一天抵达/落地时间，例如“10:30”；airport 是抵达机场或车站，例如“羽田机场”；raw 保留用户原文。没有明确提供时返回 null。',
  '返程信息必须拆成 departureInfo：time 是最后一天返程/起飞/离开时间；airport 是返程机场或车站；raw 保留用户原文。没有明确提供时返回 null。',
  '中文时间“10点半”必须标准化为“10:30”；“晚上22点的飞机”必须识别为 departureInfo.time=22:00。',
  '如果用户说“第一天和最后一天都在羽田机场”，表示 arrivalInfo.airport 和 departureInfo.airport 都是羽田机场。',
  '不要把“第一天10点半落地”误识别为 dailyStartTime；dailyStartTime 只用于每天希望几点开始游玩。',
  '每日开始时间要保留用户表达并尽量标准化，例如“早上10:00后”。',
  '预算可以是金额、档位或原文表达；用户写成“1w”或“1万”时理解为“1万元左右”；用户写成“3000K”时按旅行预算语境理解为“3000元左右”。',
  'assistantMessage 用中文，一两句话即可，说明已识别什么、下一步是否待地图定位；不要重复询问已经识别到的字段。',
]

function isTripSession(value: unknown): value is TripSession {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<TripSession>
  return (
    typeof candidate.userInput === 'string' &&
    typeof candidate.destination === 'string' &&
    typeof candidate.days === 'number' &&
    Array.isArray(candidate.missingInfo) &&
    Array.isArray(candidate.recognizedInfo)
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
      baseURL: process.env.DOUBAO_BASE_URL || process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      model,
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

function cleanString(value: string | null | undefined) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function cleanProfileField(field: AiTripProfileField | null | undefined, fallbackStatus: TripProfileField['status'] = 'confirmed') {
  const value = cleanString(field?.value || field?.raw)
  if (!value) return undefined

  return {
    raw: cleanString(field?.raw) || value,
    value,
    status: field?.status || fallbackStatus,
    source: field?.source || 'user',
  } satisfies TripProfileField
}

function toStayInfo(stayInfo: AiStayInfoExtraction | null | undefined): StayInfo | undefined {
  if (!stayInfo) return undefined

  const stayArea = cleanProfileField(stayInfo.stayArea)
  const hotelName = cleanProfileField(stayInfo.hotelName)
  const hotelAddress = cleanProfileField(stayInfo.hotelAddress, 'user_provided')
  const hasStayClue = Boolean(stayArea || hotelName || hotelAddress)

  if (!hasStayClue) return undefined

  return {
    ...(stayArea ? { stayArea } : {}),
    ...(hotelName ? { hotelName } : {}),
    ...(hotelAddress ? { hotelAddress } : {}),
    geoLocation: {
      lat: typeof stayInfo.geoLocation?.lat === 'number' ? stayInfo.geoLocation.lat : null,
      lng: typeof stayInfo.geoLocation?.lng === 'number' ? stayInfo.geoLocation.lng : null,
      placeId: cleanString(stayInfo.geoLocation?.placeId) || null,
      status: stayInfo.geoLocation?.status || 'pending_geocode',
    },
  }
}

function toTransportBoundary(boundary: AiTransportBoundaryExtraction | null | undefined) {
  const time = cleanString(boundary?.time)
  const airport = cleanString(boundary?.airport)
  const raw = cleanString(boundary?.raw)
  if (!time && !airport && !raw) return undefined
  return {
    ...(time ? { time } : {}),
    ...(airport ? { airport } : {}),
    ...(raw ? { raw } : {}),
  }
}

function toClarificationDetails(extraction: AiTripProfileExtraction): TripClarificationDetails {
  const details = extraction.clarificationDetails
  const stayInfo = toStayInfo(details.stayInfo)
  const arrivalInfo = toTransportBoundary(details.arrivalInfo)
  const departureInfo = toTransportBoundary(details.departureInfo)

  return {
    ...(cleanString(details.travelTime) ? { travelTime: cleanString(details.travelTime) } : {}),
    ...(cleanString(details.lodgingArea) ? { lodgingArea: cleanString(details.lodgingArea) } : {}),
    ...(cleanString(details.hotelAddress) ? { hotelAddress: cleanString(details.hotelAddress) } : {}),
    ...(cleanString(details.dailyStartTime) ? { dailyStartTime: cleanString(details.dailyStartTime) } : {}),
    ...(cleanString(details.budgetLevel) ? { budgetLevel: cleanString(details.budgetLevel) } : {}),
    ...(arrivalInfo ? { arrivalInfo } : {}),
    ...(departureInfo ? { departureInfo } : {}),
    ...(stayInfo ? { stayInfo } : {}),
  }
}

function buildLocalAssistantMessage(session: TripSession) {
  if (session.isReadyForPlanning) {
    return '信息已经补齐，我会基于这些内容开始生成初版行程。'
  }

  const stillMissing = session.missingInfo.map(item => item.prompt).join('、')
  return '我已经更新了能识别到的信息。还差一点点：' + stillMissing + '。你可以继续用一句话补充。'
}

function buildUserPayload(session: TripSession, answer: string) {
  return {
    currentSession: {
      userInput: session.userInput,
      destination: session.destination,
      days: session.days,
      pace: session.pace,
      interests: session.interests,
      constraints: session.constraints,
      recognizedInfo: session.recognizedInfo,
      clarificationDetails: session.clarificationDetails,
      missingInfo: session.missingInfo,
    },
    latestUserAnswer: answer,
    task: '基于 currentSession 和 latestUserAnswer 更新 clarificationDetails。',
  }
}

function parseAiExtraction(content: string): AiTripProfileExtraction {
  return JSON.parse(content) as AiTripProfileExtraction
}

async function extractWithOpenAI(client: OpenAI, model: string, session: TripSession, answer: string) {
  const response = await client.responses.create({
    model,
    instructions: systemInstructions.join('\n'),
    input: JSON.stringify(buildUserPayload(session, answer)),
    text: {
      format: {
        type: 'json_schema',
        name: 'trip_profile_extraction',
        strict: true,
        schema: tripProfileSchema,
      },
    },
  }, { timeout: 20000 })

  return parseAiExtraction(response.output_text)
}

async function extractWithDoubao(client: OpenAI, model: string, session: TripSession, answer: string) {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: systemInstructions.join('\n') + '\n只输出一个 JSON 对象，不要输出 Markdown。JSON 字段必须是 clarificationDetails 和 assistantMessage。',
      },
      {
        role: 'user',
        content: JSON.stringify(buildUserPayload(session, answer)),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  }, { timeout: 20000 })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('Doubao response did not include message content.')

  return parseAiExtraction(content)
}

async function extractProfileWithAI(session: TripSession, answer: string) {
  const config = getAiConfig()
  if (!config) return null

  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  })

  if (config.provider === 'doubao') {
    return extractWithDoubao(client, config.model, session, answer)
  }

  return extractWithOpenAI(client, config.model, session, answer)
}

function getMissingConfigMessage() {
  if (process.env.AI_PROVIDER?.toLowerCase() === 'doubao' || process.env.DOUBAO_API_KEY) {
    return 'DOUBAO_API_KEY and DOUBAO_MODEL are not configured.'
  }

  return 'OPENAI_API_KEY is not configured.'
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<TripProfileApiRequest>
    const answer = body.answer?.trim() || ''

    if (!isTripSession(body.session)) {
      return NextResponse.json({ error: 'Invalid trip session.' }, { status: 400 })
    }

    const localSession = updateTripSessionWithClarification(body.session, answer)

    try {
      const extraction = await extractProfileWithAI(body.session, answer)

      if (!extraction) {
        const payload: TripProfileApiResponse = {
          session: localSession,
          assistantMessage: buildLocalAssistantMessage(localSession),
          usedAI: false,
          error: getMissingConfigMessage(),
        }
        return NextResponse.json(payload)
      }

      const aiSession = updateTripSessionWithClarification(
        body.session,
        answer,
        toClarificationDetails(extraction),
      )

      const payload: TripProfileApiResponse = {
        session: aiSession,
        assistantMessage: extraction.assistantMessage || buildLocalAssistantMessage(aiSession),
        usedAI: true,
      }

      return NextResponse.json(payload)
    } catch (error) {
      console.error('Trip profile AI extraction failed:', error)

      const payload: TripProfileApiResponse = {
        session: localSession,
        assistantMessage: buildLocalAssistantMessage(localSession),
        usedAI: false,
        error: error instanceof Error ? error.message : 'Unknown AI extraction error.',
      }

      return NextResponse.json(payload)
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
}
