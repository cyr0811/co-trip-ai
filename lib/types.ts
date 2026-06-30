export type AppState =
  | 'hero'
  | 'clarification'
  | 'loading'
  | 'workspace'
  | 'export'

export type DayIntensity = '轻松' | '适中' | '较满'
export type TimeIntent =
  | 'breakfast'
  | 'morning'
  | 'lunch'
  | 'noon'
  | 'afternoon'
  | 'tea_time'
  | 'dinner'
  | 'evening'
  | 'night'
  | 'late_night'

export type ActivityCategory =
  | 'sightseeing'
  | 'restaurant'
  | 'cafe'
  | 'shopping'
  | 'transport'
  | 'hotel'
  | 'rest'
  | 'experience'
  | 'free_time'
  | 'nightlife'
  | 'budget'
  | 'reservation'
  | 'unknown'

export interface LocationConstraint {
  type: 'near' | 'near_hotel' | 'inside_area' | 'same_area' | 'on_route' | 'minimal_detour' | 'no_constraint'
  anchorPlace?: string
  radiusLevel?: 'walkable' | 'nearby' | 'same_area'
}

export interface BudgetConstraint {
  mode?: 'total' | 'per_day' | 'per_person' | 'category_breakdown'
  amount?: number
  categories?: string[]
}

export interface ItineraryItem {
  id: string
  timeLabel?: string
  timeIntent?: TimeIntent
  type: Exclude<ActivityCategory, 'budget' | 'reservation' | 'unknown'> | 'placeholder'
  title: string
  place?: string
  area?: string
  note?: string
  locationConstraint?: LocationConstraint
  status: 'planned' | 'placeholder' | 'needs_api' | 'user_requested' | 'locked'
  source: 'initial_ai_plan' | 'user_request' | 'ai_generated' | 'map_api' | 'restaurant_api' | 'manual_edit'
}

export interface Place {
  id: string
  name: string
  type: 'attraction' | 'food' | 'shopping' | 'hotel' | 'transport'
  x: number
  y: number
}

export interface TimeSlot {
  period: '上午' | '下午' | '晚上' | '全天'
  activities: string[]
}

export interface DayPlan {
  day: number
  title: string
  theme: string
  intensity: DayIntensity
  slots: TimeSlot[]
  items?: ItineraryItem[]
  reason: string
  places: Place[]
  estimatedTransport: string
  locked?: boolean
}

export interface TripConstraints {
  avoidPlaces: string[]
  avoidCategories: string[]
  notes: string[]
}

export type CandidatePlaceType =
  | 'spot'
  | 'restaurant'
  | 'cafe'
  | 'shopping'
  | 'area'
  | 'hotel'
  | 'transport'

export type CandidatePlaceSource =
  | 'user_text'
  | 'screenshot'
  | 'ai_inferred'

export type CandidatePlacePriority =
  | 'must_go'
  | 'nice_to_have'
  | 'optional'
  | 'food_preference'

export type CandidateConstraintTag =
  | 'weather_sensitive'
  | 'reservation_required'
  | 'far_suburb'
  | 'crowded_on_holiday'
  | 'fits_first_day'
  | 'meal_candidate'
  | 'pass_through'
  | 'classic_anchor'

export type CandidatePlaceStatus =
  | 'pending_geocode'
  | 'resolved'
  | 'excluded'
  | 'backup'
  | 'locked'

export interface CandidatePlace {
  id: string
  name: string
  type: CandidatePlaceType
  source: CandidatePlaceSource
  priority: CandidatePlacePriority
  constraintTags: CandidateConstraintTag[]
  status: CandidatePlaceStatus
  lat?: number
  lng?: number
  address?: string
  rawText?: string
  areaHint?: string
  excludeReason?: string
}

export interface PlanningConstraints {
  hard: string[]
  preferences: string[]
  avoid: string[]
  routing: string[]
}

export interface TripHotelState {
  area?: string
  name?: string
  address?: string
}

export interface TripTransportBoundary {
  time?: string
  airport?: string
  raw?: string
}

export interface TripTransportInfo {
  arrival?: TripTransportBoundary
  departure?: TripTransportBoundary
}

export interface TripBudgetState {
  mode: 'summary' | 'breakdown'
  categories: string[]
}

export interface TripState {
  destination: string
  days: number
  pace: DayIntensity
  hotel: TripHotelState
  transportInfo: TripTransportInfo
  constraints: TripConstraints
  preferences: string[]
  budget: TripBudgetState
  candidatePlaces: CandidatePlace[]
  planningConstraints: PlanningConstraints
  itinerary: DayPlan[]
}

export type TravelEditOperation =
  | 'add'
  | 'remove'
  | 'replace'
  | 'move'
  | 'update'
  | 'regenerate'
  | 'adjust'
  | 'recommend'
  | 'clarify'
  | 'record'
  | 'unsupported'

export type TravelEditScope =
  | 'trip'
  | 'day'
  | 'time_slot'
  | 'place'
  | 'activity'
  | 'budget'
  | 'preference'
  | 'constraint'
  | 'map_route'
  | 'note'

export type CommandTimeSlot = 'morning' | 'afternoon' | 'evening'
export type CommandPace = 'relaxed' | 'normal' | 'intense'
export type CommandDuration = 'short' | 'half_day' | 'full_day'

export interface TravelEditCommand {
  operation: TravelEditOperation
  scope: TravelEditScope
  target?: {
    day?: number
    timeSlot?: CommandTimeSlot
    timeSlots?: TimeIntent[]
    place?: string
    activityId?: string
  }
  payload?: {
    activityCategory?: ActivityCategory
    timeIntents?: TimeIntent[]
    places?: string[]
    avoidPlaces?: string[]
    preferPlaces?: string[]
    categories?: string[]
    theme?: string
    anchorPlace?: string
    locationConstraint?: LocationConstraint
    duration?: CommandDuration
    pace?: CommandPace
    budgetMode?: TripBudgetState['mode']
    budgetCategories?: string[]
    recommendationMode?: string
    overwrite?: boolean
    respectConstraints?: boolean
    note?: string
    reason?: string
  }
  confidence: number
  needsClarification: boolean
}

export interface ParseResult {
  commands: TravelEditCommand[]
  confidence: number
  actionMode: 'execute' | 'confirm' | 'clarify' | 'record' | 'unsupported'
  userFacingMessage?: string
}

export type TravelTaskType =
  | 'modify_itinerary'
  | 'add_activity'
  | 'remove_activity'
  | 'replace_activity'
  | 'adjust_pace'
  | 'add_recommendation'
  | 'add_constraint'
  | 'update_budget'
  | 'move_activity'
  | 'clarify'
  | 'record'
  | 'unsupported'

export interface TravelTaskFrame {
  taskType: TravelTaskType
  operation: TravelEditOperation
  scope: TravelEditScope | 'route'
  target?: {
    day?: number
    dayRange?: number[]
    timeSlots?: TimeIntent[]
    place?: string
    activityId?: string
  }
  activity?: {
    category?: ActivityCategory
    subCategory?: string
    theme?: string
    anchorPlace?: string
    quantity?: number
    recommendationMode?: 'specific_places' | 'category_placeholder' | 'route_based' | 'nearby_options' | 'budget_options'
  }
  constraints?: {
    avoidPlaces?: string[]
    preferPlaces?: string[]
    avoidCategories?: string[]
    preferCategories?: string[]
    locationConstraint?: LocationConstraint
    budgetConstraint?: BudgetConstraint
    pace?: CommandPace
    routePreference?: 'nearby' | 'on_route' | 'minimal_detour' | 'same_area'
  }
  confidence: number
  needsClarification: boolean
  clarificationQuestion?: string
  rawUserInput: string
}

export type TripScope = 'trip' | 'day' | 'item' | 'time_slot' | 'constraint'
export type TripPatchOperation =
  | 'replace_day'
  | 'replace_place'
  | 'add_place'
  | 'add_activity'
  | 'remove_place'
  | 'move_place'
  | 'adjust_day_pace'
  | 'adjust_route'
  | 'remove_time_slot'
  | 'add_constraint'
  | 'update_preference'
  | 'update_budget'
  | 'record_note'

export interface TripPatchTarget {
  day?: number
  timeSlot?: TimeSlot['period']
  place?: string
}

export interface TripPatch {
  operation: TripPatchOperation
  target?: TripPatchTarget
  payload?: Record<string, unknown>
}

export interface AIResult {
  reply: string
  intent: string
  scope: TravelEditScope | TripScope
  patch: TripPatch
}

export interface ParsedItineraryIntent {
  intent: string
  scope: TripScope
  patch: TripPatch
  fullDay?: boolean
  overwrite?: boolean
}

export interface PatchValidationResult {
  ok: boolean
  reason?: string
  changedDays: number[]
}

export interface ChatMessage {
  id: string
  role: 'ai' | 'user'
  content: string
  timestamp?: string
}

export type TripFieldStatus = 'missing' | 'inferred' | 'confirmed' | 'user_provided'
export type TripFieldSource = 'user' | 'ai' | 'system'

export interface TripProfileField {
  raw: string
  value: string
  status: TripFieldStatus
  source: TripFieldSource
}

export type GeoLocationStatus = 'missing' | 'pending_geocode' | 'geocoded' | 'ambiguous' | 'failed'

export interface TripGeoLocation {
  lat: number | null
  lng: number | null
  placeId: string | null
  status: GeoLocationStatus
}

export interface StayInfo {
  stayArea?: TripProfileField
  hotelName?: TripProfileField
  hotelAddress?: TripProfileField
  geoLocation: TripGeoLocation
}

export interface TripClarificationDetails {
  travelTime?: string
  lodgingArea?: string
  hotelAddress?: string
  dailyStartTime?: string
  budgetLevel?: string
  arrivalInfo?: TripTransportBoundary
  departureInfo?: TripTransportBoundary
  stayInfo?: StayInfo
}

export interface MissingTripInfo {
  id: keyof TripClarificationDetails | 'stayArea' | 'hotelName' | 'geoLocation'
  label: string
  prompt: string
}

export interface TripSession {
  userInput: string
  selectedTags: string[]
  selectedTagLabels: string[]
  destination: string
  days: number
  pace: DayIntensity
  interests: string[]
  constraints: string[]
  travelerState: string
  title: string
  summary: string
  recognizedInfo: Array<{ label: string; value: string }>
  clarificationDetails: TripClarificationDetails
  missingInfo: MissingTripInfo[]
  candidatePlaces: CandidatePlace[]
  planningConstraints: PlanningConstraints
  isReadyForPlanning: boolean
  questions: Array<{ id: string; text: string }>
  quickOptions: Array<{ id: string; label: string; color: string }>
  loadingTexts: string[]
  plans: DayPlan[]
  initialMessages: ChatMessage[]
}
