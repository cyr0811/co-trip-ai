import type { ParseResult, TripState } from './types'

export interface ItineraryCommandApiRequest {
  input: string
  tripState: TripState
}

export interface ItineraryCommandApiResponse {
  parseResult: ParseResult
  usedAI: boolean
  error?: string
}
