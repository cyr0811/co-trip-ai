import type { DayPlan, TripState } from './types'

export interface RoutePlanApiRequest {
  input: string
  tripState: TripState
}

export interface RoutePlanApiResponse {
  plans: DayPlan[]
  reply: string
  usedAI: boolean
  error?: string
}
