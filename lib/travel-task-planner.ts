import { isFullDayPlace, normalizeTravelTaskFrame, validateTravelTaskFrame } from './travel-task-frame'
import type { ActivityCategory, CommandPace, ParseResult, TimeIntent, TravelEditCommand, TravelEditScope, TravelTaskFrame, TripState } from './types'
import type { TravelTaskFrameV2 } from './travel-task-frame'

function averageConfidence(commands: TravelEditCommand[]) {
  if (commands.length === 0) return 0.5
  return commands.reduce((sum, command) => sum + command.confidence, 0) / commands.length
}

function command(
  operation: TravelEditCommand['operation'],
  scope: TravelEditScope,
  task: TravelTaskFrameV2,
  patch: Partial<TravelEditCommand> = {},
): TravelEditCommand {
  return {
    operation,
    scope,
    target: {
      ...(task.target.day ? { day: task.target.day } : {}),
      ...(task.target.timeSlot ? { timeSlots: [task.target.timeSlot] } : {}),
      ...(task.target.place ? { place: task.target.place } : {}),
      ...patch.target,
    },
    payload: {
      ...(task.payload.places ? { places: task.payload.places } : {}),
      ...(task.payload.theme ? { theme: task.payload.theme } : {}),
      ...(task.payload.avoidPlaces ? { avoidPlaces: task.payload.avoidPlaces } : {}),
      ...(task.payload.category ? { activityCategory: task.payload.category as ActivityCategory } : {}),
      ...(task.constraints.pace ? { pace: task.constraints.pace as CommandPace } : {}),
      ...(task.constraints.needsFullDay ? { duration: 'full_day' as const, overwrite: true } : {}),
      ...(task.payload.note ? { note: task.payload.note } : {}),
      ...patch.payload,
    },
    confidence: task.confidence,
    needsClarification: task.needsClarification,
    ...patch,
  }
}

function getActionMode(commands: TravelEditCommand[], task: TravelTaskFrameV2): ParseResult['actionMode'] {
  if (task.taskType === 'unsupported') return 'unsupported'
  if (task.needsClarification || task.taskType === 'clarify') return 'clarify'
  if (task.taskType === 'record') return 'record'
  if (commands.some(item => item.confidence < 0.72)) return 'confirm'
  return 'execute'
}

export function travelTaskToParseResult(rawTask: TravelTaskFrameV2, tripState: TripState): ParseResult {
  const task = normalizeTravelTaskFrame(rawTask, tripState)
  const validation = validateTravelTaskFrame(task)

  if (!validation.ok) {
    return {
      commands: [command('clarify', 'trip', task, {
        needsClarification: true,
        payload: { note: validation.reason || '需要确认要修改的内容' },
      })],
      confidence: 0.5,
      actionMode: 'clarify',
      userFacingMessage: validation.reason || '需要确认要修改的内容',
    }
  }

  const place = task.target.place || task.payload.places?.[0] || task.payload.theme
  const commands: TravelEditCommand[] = []

  switch (task.taskType) {
    case 'add_must_go_place': {
      if (task.payload.avoidPlaces?.length) {
        commands.push(command('add', 'constraint', task, {
          target: { day: task.target.day },
          payload: { avoidPlaces: task.payload.avoidPlaces },
        }))
      }
      if (place && (task.constraints.needsFullDay || isFullDayPlace(place))) {
        commands.push(command('replace', 'day', task, {
          target: { day: task.target.day, place },
          payload: {
            theme: place,
            anchorPlace: place === '迪士尼' ? `${tripState.destination}迪士尼度假区` : place,
            duration: 'full_day',
            overwrite: true,
          },
        }))
      } else if (place) {
        commands.push(command('add', 'place', task, {
          target: { day: task.target.day, place },
          payload: { places: [place], theme: place },
        }))
      }
      break
    }
    case 'remove_place':
      if (place) {
        commands.push(command('remove', 'place', task, {
          target: { day: task.target.day, place },
          payload: { avoidPlaces: [place] },
        }))
      }
      break
    case 'replace_day':
      commands.push(command('replace', 'day', task, {
        target: { day: task.target.day, place },
        payload: {
          theme: place || task.payload.theme || '新的全天行程',
          duration: task.constraints.needsFullDay ? 'full_day' : undefined,
          overwrite: true,
        },
      }))
      break
    case 'adjust_pace':
      commands.push(command('adjust', task.target.day ? 'day' : 'trip', task, {
        target: { day: task.target.day },
        payload: { pace: task.constraints.pace || 'relaxed' },
      }))
      break
    case 'add_food_request': {
      const category = task.payload.category === 'cafe' ? 'cafe' : 'restaurant'
      commands.push(command('recommend', 'activity', task, {
        payload: {
          activityCategory: category,
          timeIntents: task.target.timeSlot ? [task.target.timeSlot] as TimeIntent[] : undefined,
        },
      }))
      break
    }
    case 'reroute_by_transport':
      commands.push(command('adjust', 'map_route', task, {
        payload: { reason: '用户希望按交通便利性重新规划路线' },
      }))
      break
    case 'ask_why':
    case 'update_transport_boundary':
    case 'update_hotel':
    case 'record':
      commands.push(command('record', 'note', task, {
        payload: { note: task.payload.note || task.userIntentSummary },
      }))
      break
    case 'clarify':
      commands.push(command('clarify', 'trip', task, {
        needsClarification: true,
        payload: { note: task.userIntentSummary || '需要确认修改方向' },
      }))
      break
    default:
      commands.push(command('unsupported', 'trip', task, {
        payload: { note: task.userIntentSummary || '当前暂不支持这个修改' },
      }))
  }

  return {
    commands,
    confidence: averageConfidence(commands),
    actionMode: getActionMode(commands, task),
    userFacingMessage: task.needsClarification ? task.userIntentSummary : undefined,
  }
}

export function travelTaskToDebugFrame(task: TravelTaskFrameV2): TravelTaskFrame {
  return {
    taskType: task.taskType === 'add_must_go_place' ? 'add_activity' : task.taskType === 'remove_place' ? 'remove_activity' : 'record',
    operation: task.taskType === 'remove_place' ? 'remove' : task.taskType === 'record' ? 'record' : 'add',
    scope: task.taskType === 'reroute_by_transport' ? 'route' : task.taskType === 'replace_day' ? 'day' : 'activity',
    target: {
      day: task.target.day,
      place: task.target.place,
      ...(task.target.timeSlot ? { timeSlots: [task.target.timeSlot] } : {}),
    },
    activity: {
      category: task.payload.category === 'restaurant' || task.payload.category === 'cafe' ? task.payload.category : 'experience',
      theme: task.payload.theme,
      anchorPlace: task.target.place,
    },
    constraints: {
      avoidPlaces: task.payload.avoidPlaces,
      pace: task.constraints.pace,
      routePreference: task.constraints.routePreference === 'minimal_detour' ? 'minimal_detour' : undefined,
    },
    confidence: task.confidence,
    needsClarification: task.needsClarification,
    rawUserInput: task.rawUserInput,
  }
}
