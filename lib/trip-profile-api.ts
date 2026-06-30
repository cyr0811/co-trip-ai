import type { TripSession } from './types'

export interface TripProfileApiRequest {
  session: TripSession
  answer?: string
}

export interface TripProfileApiResponse {
  session: TripSession
  assistantMessage: string
  usedAI: boolean
  error?: string
}
