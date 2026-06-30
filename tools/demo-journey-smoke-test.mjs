/* global console, URLSearchParams */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const moduleCache = new Map()

async function loadTsModule(file) {
  const fullPath = path.resolve(file)
  if (moduleCache.has(fullPath)) return moduleCache.get(fullPath).exports

  const source = await fs.readFile(fullPath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  moduleCache.set(fullPath, module)

  const requireLocal = specifier => {
    if (specifier.startsWith('@/')) {
      const nextPath = path.resolve(specifier.replace('@/', ''))
      const withExt = path.extname(nextPath) ? nextPath : `${nextPath}.ts`
      if (!moduleCache.has(withExt)) throw new Error(`Module not loaded: ${withExt}`)
      return moduleCache.get(withExt).exports
    }
    if (!specifier.startsWith('.')) throw new Error(`Unexpected external require: ${specifier}`)
    let nextPath = path.resolve(path.dirname(fullPath), specifier)
    if (!path.extname(nextPath)) nextPath += '.ts'
    if (!moduleCache.has(nextPath)) throw new Error(`Module not loaded: ${nextPath}`)
    return moduleCache.get(nextPath).exports
  }

  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, { console, URLSearchParams })(requireLocal, module, module.exports)
  return module.exports
}

await loadTsModule('lib/mock-data.ts')
await loadTsModule('lib/mock-geocode.ts')
await loadTsModule('lib/external-search.ts')
await loadTsModule('lib/trip-candidates.ts')
await loadTsModule('lib/travel-time.ts')
await loadTsModule('lib/trip-route-planner.ts')
await loadTsModule('lib/types/trip.ts')
await loadTsModule('lib/map-adapter.ts')
const tripSession = await loadTsModule('lib/trip-session.ts')
const tripStateModule = await loadTsModule('lib/trip-state.ts')
const travelTaskFrame = await loadTsModule('lib/travel-task-frame.ts')
const travelTaskPlanner = await loadTsModule('lib/travel-task-planner.ts')
const mapAdapter = await loadTsModule('lib/map-adapter.ts')
const candidatesModule = await loadTsModule('lib/trip-candidates.ts')
const routePlanner = await loadTsModule('lib/trip-route-planner.ts')

const demoInput = '第一次去东京，玩6天，8月出行，住在东京虹夕诺雅日式旅馆（Hoshinoya Tokyo），位于大手町，预算3万元左右；第一天10点半落地羽田机场，最后一天晚上22点从羽田机场返程；每天10点后开始；想去浅草寺、上野公园、涩谷Sky、表参道、银座、筑地、台场、代官山；喜欢美食、城市街区，节奏轻松一点。'

function processWithTravelTask(input, state) {
  const task = travelTaskFrame.normalizeTravelTaskFrame(
    travelTaskFrame.parseLocalTravelTask(input, state),
    state,
  )
  let parseResult = travelTaskPlanner.travelTaskToParseResult(task, state)
  if (parseResult.actionMode === 'record' || parseResult.actionMode === 'clarify') {
    const legacyParseResult = tripStateModule.processUserFeedback(input, state).parseResult
    if (legacyParseResult.actionMode !== 'record' && legacyParseResult.actionMode !== 'clarify') {
      parseResult = legacyParseResult
    }
  }
  const result = tripStateModule.processParsedFeedback(input, state, parseResult)
  assert.equal(result.validation.ok, true, `${input}: patch should validate`)
  return { task, parseResult, result }
}

function planText(state, day) {
  return JSON.stringify(state.itinerary.find(plan => plan.day === day))
}

function fullText(state) {
  return JSON.stringify(state.itinerary)
}

function assertMapHasPoints(state, day) {
  const mapTripState = mapAdapter.createMapTripStateFromLegacyTripState(state, day)
  const mapData = mapAdapter.createMapDataFromTripState(mapTripState)
  const targetDay = mapData.days.find(item => item.dayIndex === day)
  assert.ok(targetDay, `map should contain Day ${day}`)
  assert.ok(targetDay.points.length > 0, `Day ${day} map should have points`)
  return targetDay
}

function applyTransportReplan(state, input) {
  const extracted = candidatesModule.extractCandidatePlaces(input, state.destination)
  const merged = new Map(state.candidatePlaces.map(place => [place.name, place]))
  extracted.forEach(place => merged.set(place.name, merged.get(place.name) ? { ...merged.get(place.name), ...place } : place))
  const candidatePlaces = Array.from(merged.values())
  const nextPlans = routePlanner.generateCandidateDrivenPlans({
    destination: state.destination,
    days: state.days,
    pace: state.pace,
    interests: state.preferences,
    candidatePlaces,
    fallbackPlans: state.itinerary,
    optimizeByTransport: true,
  })
  return {
    ...state,
    candidatePlaces,
    itinerary: nextPlans,
  }
}

let session = tripSession.createTripSession(demoInput, [])
assert.equal(session.destination, '东京')
assert.equal(session.days, 6)
assert.equal(session.clarificationDetails.arrivalInfo.airport, '羽田机场')
assert.equal(session.clarificationDetails.arrivalInfo.time, '10:30')
assert.equal(session.clarificationDetails.departureInfo.airport, '羽田机场')
assert.equal(session.clarificationDetails.departureInfo.time, '22:00')
assert.equal(session.clarificationDetails.dailyStartTime, '早上10:00后')
assert.equal(session.missingInfo.some(item => item.id === 'arrivalInfo'), false)
assert.equal(session.missingInfo.some(item => item.id === 'departureInfo'), false)
assert.match(JSON.stringify(session.recognizedInfo), /落地信息/)
assert.match(JSON.stringify(session.recognizedInfo), /返程信息/)

let state = tripStateModule.createTripStateFromSession(session)
assert.match(planText(state, 1), /羽田机场|落地|抵达/)
assert.match(planText(state, 6), /羽田机场|返程/)
assertMapHasPoints(state, 1)
assertMapHasPoints(state, 6)

let taskRun = processWithTravelTask('我还想去迪士尼', state)
assert.equal(taskRun.task.taskType, 'add_must_go_place')
assert.equal(taskRun.parseResult.actionMode, 'execute')
state = taskRun.result.nextState
assert.match(fullText(state), /迪士尼/)
assert.equal(taskRun.result.aiResult.reply.includes('记录下这个想法'), false)
assert.equal(taskRun.result.aiResult.reply.includes('需要确认'), false)

state = applyTransportReplan(
  state,
  '根据交通因素以及我住的区域重新规划浅草、迪士尼、表参道、涩谷、银座、筑地、台场、代官山。第一天要把我预计10点30抵达羽田机场这个点考虑在内',
)
assertMapHasPoints(state, 1)
const allPlaces = state.itinerary.flatMap(plan => plan.places.map(place => place.name))
const duplicateCorePlaces = allPlaces.filter((place, index) => allPlaces.indexOf(place) !== index && ['台场', '代官山', '迪士尼', '浅草', '涩谷'].some(core => place.includes(core)))
assert.equal(duplicateCorePlaces.length, 0, `core places should not duplicate: ${duplicateCorePlaces.join('、')}`)

taskRun = processWithTravelTask('不想去寺庙，换成街区和咖啡', state)
state = taskRun.result.nextState
assert.equal(state.constraints.avoidCategories.includes('寺庙'), true)
assert.equal(state.preferences.includes('城市街区'), true)
assert.equal(state.preferences.includes('咖啡店'), true)

taskRun = processWithTravelTask('第二天太满了，帮我轻松一点', state)
state = taskRun.result.nextState
assert.equal(state.itinerary.find(plan => plan.day === 2)?.intensity, '轻松')
assertMapHasPoints(state, 2)

console.log('Demo journey smoke test passed.')
