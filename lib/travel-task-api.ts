import type { TravelTaskFrameV2 } from './travel-task-frame'
import type { TripState } from './types'

export interface TravelTaskApiRequest {
  input: string
  tripState: TripState
}

export interface TravelTaskApiResponse {
  task: TravelTaskFrameV2
  usedAI: boolean
  error?: string
}
