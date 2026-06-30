/* global console */

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
    if (!specifier.startsWith('.')) throw new Error(`Unexpected external require: ${specifier}`)
    let nextPath = path.resolve(path.dirname(fullPath), specifier)
    if (!path.extname(nextPath)) nextPath += '.ts'
    if (!moduleCache.has(nextPath)) throw new Error(`Module not loaded: ${nextPath}`)
    return moduleCache.get(nextPath).exports
  }

  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, { console })(requireLocal, module, module.exports)
  return module.exports
}

await loadTsModule('lib/mock-data.ts')
await loadTsModule('lib/mock-geocode.ts')
await loadTsModule('lib/trip-candidates.ts')
await loadTsModule('lib/travel-time.ts')
await loadTsModule('lib/trip-route-planner.ts')
const tripSession = await loadTsModule('lib/trip-session.ts')
const tripState = await loadTsModule('lib/trip-state.ts')
const travelTaskFrame = await loadTsModule('lib/travel-task-frame.ts')
const travelTaskPlanner = await loadTsModule('lib/travel-task-planner.ts')

function createState() {
  const session = tripSession.createTripSession('第一次去东京，玩 6 天，想轻松一点，经典路线', [])
  return tripState.createTripStateFromSession(session)
}

const sessionWithTransport = tripSession.createTripSession(
  '第一次去东京，玩6天，10点30抵达羽田机场，最后一天18点从羽田机场返程，住在大手町，想去浅草、涩谷、银座',
  [],
)
assert.equal(sessionWithTransport.clarificationDetails.arrivalInfo.airport, '羽田机场')
assert.equal(sessionWithTransport.clarificationDetails.arrivalInfo.time, '10:30')
assert.equal(sessionWithTransport.clarificationDetails.departureInfo.airport, '羽田机场')
assert.equal(sessionWithTransport.clarificationDetails.departureInfo.time, '18:00')
assert.equal(sessionWithTransport.recognizedInfo.some(item => item.label === '落地信息'), true)
assert.equal(sessionWithTransport.recognizedInfo.some(item => item.label === '返程信息'), true)
assert.match(JSON.stringify(sessionWithTransport.plans[0]), /羽田机场|落地|抵达/)
assert.match(JSON.stringify(sessionWithTransport.plans.at(-1)), /羽田机场|返程/)

const sessionWithSharedAirport = tripSession.createTripSession(
  '第一天和最后一天都在羽田机场，第一天10点半落地，最后一天晚上22点的飞机，住在东京虹夕诺雅日式旅馆，位于大手町',
  [],
)
assert.equal(sessionWithSharedAirport.clarificationDetails.arrivalInfo.airport, '羽田机场')
assert.equal(sessionWithSharedAirport.clarificationDetails.arrivalInfo.time, '10:30')
assert.equal(sessionWithSharedAirport.clarificationDetails.departureInfo.airport, '羽田机场')
assert.equal(sessionWithSharedAirport.clarificationDetails.departureInfo.time, '22:00')
assert.equal(sessionWithSharedAirport.clarificationDetails.dailyStartTime, undefined)
assert.equal(sessionWithSharedAirport.missingInfo.some(item => item.id === 'arrivalInfo'), false)
assert.equal(sessionWithSharedAirport.missingInfo.some(item => item.id === 'departureInfo'), false)

function run(input, state = createState()) {
  const result = tripState.processUserFeedback(input, state)
  assert.equal(result.aiResult.reply.includes('我先帮你记录下这个想法'), false, `${input}: executable travel task should not fall back to note`)
  return result
}

function runTravelTask(input, state = createState()) {
  const task = travelTaskFrame.normalizeTravelTaskFrame(
    travelTaskFrame.parseLocalTravelTask(input, state),
    state,
  )
  const parseResult = travelTaskPlanner.travelTaskToParseResult(task, state)
  const result = tripState.processParsedFeedback(input, state, parseResult)
  assert.equal(result.validation.ok, true, `${input}: travel-task result should validate`)
  return { task, parseResult, result }
}

function dayPlan(state, day) {
  const plan = state.itinerary.find(item => item.day === day)
  assert.ok(plan, `Day ${day} should exist`)
  return plan
}

function planText(state, day) {
  return JSON.stringify(dayPlan(state, day))
}

function userRequestedItems(state, day) {
  return (dayPlan(state, day).items || []).filter(item => item.source === 'user_request')
}

function assertChanged(result, message) {
  assert.notEqual(JSON.stringify(result.nextState), JSON.stringify(result.debug ? undefined : null), message)
  assert.equal(result.validation.ok, true, `${message}: patch validation should pass`)
}

let result = run('第二天增加中午和晚上的餐厅推荐，都在迪士尼附近吃')
assert.equal(result.travelTaskFrames.some(frame => frame.taskType === 'add_recommendation'), true)
assert.equal(result.commands[0].scope, 'activity')
assert.equal(result.commands[0].payload.activityCategory, 'restaurant')
assert.equal(result.commands[0].target.day, 2)
assert.equal(result.commands[0].payload.timeIntents.includes('lunch'), true)
assert.equal(result.commands[0].payload.timeIntents.some(item => item === 'dinner' || item === 'evening'), true)
assert.equal(result.commands[0].payload.locationConstraint.type, 'near')
assert.match(result.commands[0].payload.locationConstraint.anchorPlace || '', /迪士尼/)
assert.equal(result.patches[0].operation, 'add_activity')
assert.equal(userRequestedItems(result.nextState, 2).some(item => item.type === 'restaurant' && item.status === 'needs_api'), true)
assert.equal(userRequestedItems(result.nextState, 2).some(item => item.timeIntent === 'lunch'), true)
assert.equal(userRequestedItems(result.nextState, 2).some(item => item.timeIntent === 'dinner' || item.timeIntent === 'evening'), true)
assertChanged(result, 'restaurant recommendation should update TripState')

result = run('晚上在酒店附近找个餐厅')
assert.equal(result.commands[0].scope, 'activity')
assert.equal(result.commands[0].payload.activityCategory, 'restaurant')
assert.equal(result.commands[0].target.day, 1)
assert.equal(result.commands[0].payload.locationConstraint.type, 'near_hotel')
assert.equal(userRequestedItems(result.nextState, 1).some(item => item.type === 'restaurant' && item.locationConstraint?.type === 'near_hotel'), true)

result = run('下午加一个咖啡店休息')
assert.equal(result.commands[0].scope, 'activity')
assert.equal(result.commands[0].payload.activityCategory, 'cafe')
assert.equal(result.commands[0].target.day, 1)
assert.equal(result.commands[0].payload.timeIntents.includes('afternoon'), true)
assert.equal(userRequestedItems(result.nextState, 1).some(item => item.type === 'cafe' && item.timeIntent === 'afternoon'), true)

result = run('午餐别离景点太远')
assert.equal(result.commands[0].operation, 'adjust')
assert.equal(result.commands[0].scope, 'map_route')
assert.equal(result.commands[0].payload.locationConstraint.type, 'minimal_detour')
assert.equal(result.patches[0].operation, 'adjust_route')
assert.equal(result.nextState.constraints.notes.some(note => note.includes('顺路') || note.includes('绕行')), true)

result = run('路上顺便安排吃饭')
assert.equal(result.commands[0].scope, 'activity')
assert.equal(result.commands[0].payload.activityCategory, 'restaurant')
assert.equal(result.commands[0].payload.locationConstraint.type, 'on_route')
assert.equal(userRequestedItems(result.nextState, 1).some(item => item.type === 'restaurant' && item.locationConstraint?.type === 'on_route'), true)

result = run('第二天去迪士尼')
assert.equal(result.commands[0].operation, 'replace')
assert.equal(result.commands[0].scope, 'day')
assert.match(planText(result.nextState, 2), /迪士尼/)

result = run('第二天换成全天迪士尼')
assert.equal(result.commands[0].operation, 'replace')
assert.equal(result.commands[0].scope, 'day')
assert.equal(result.commands[0].payload.duration, 'full_day')
assert.match(planText(result.nextState, 2), /迪士尼/)

result = run('我还想去迪士尼')
assert.equal(result.commands[0].operation, 'replace')
assert.equal(result.commands[0].scope, 'day')
assert.equal(result.parseResult.actionMode, 'execute')
assert.match(JSON.stringify(result.nextState.itinerary), /迪士尼/)
assert.equal(result.aiResult.reply.includes('记录下这个想法'), false)

result = run('把迪士尼加入我的行程中')
assert.equal(result.commands[0].operation, 'replace')
assert.equal(result.commands[0].scope, 'day')
assert.equal(result.parseResult.actionMode, 'execute')
assert.match(JSON.stringify(result.nextState.itinerary), /迪士尼/)
assert.equal(result.aiResult.reply.includes('我需要确认'), false)

let taskResult = runTravelTask('我还想去迪士尼')
assert.equal(taskResult.task.taskType, 'add_must_go_place')
assert.equal(taskResult.task.constraints.needsFullDay, true)
assert.equal(taskResult.parseResult.actionMode, 'execute')
assert.equal(taskResult.parseResult.commands[0].operation, 'replace')
assert.match(JSON.stringify(taskResult.result.nextState.itinerary), /迪士尼/)

taskResult = runTravelTask('把迪士尼加入我的行程中')
assert.equal(taskResult.task.taskType, 'add_must_go_place')
assert.equal(taskResult.parseResult.commands[0].scope, 'day')
assert.equal(taskResult.result.aiResult.reply.includes('记录下这个想法'), false)

taskResult = runTravelTask('第二天不去上野和原宿，想去迪士尼玩')
assert.equal(taskResult.task.taskType, 'add_must_go_place')
assert.equal(taskResult.task.target.day, 2)
assert.equal(taskResult.task.target.place, '迪士尼')
assert.equal(taskResult.task.payload.avoidPlaces.length, 2)
assert.equal(taskResult.task.payload.avoidPlaces.includes('上野'), true)
assert.equal(taskResult.task.payload.avoidPlaces.includes('原宿'), true)
assert.equal(taskResult.parseResult.commands.some(command => command.scope === 'constraint' && command.payload.avoidPlaces.includes('上野') && command.payload.avoidPlaces.includes('原宿')), true)
assert.equal(taskResult.parseResult.commands.some(command => command.operation === 'replace' && command.scope === 'day' && command.target.day === 2), true)
assert.match(planText(taskResult.result.nextState, 2), /迪士尼/)
assert.equal(planText(taskResult.result.nextState, 2).includes('上野'), false)
assert.equal(planText(taskResult.result.nextState, 2).includes('原宿'), false)
assert.equal(taskResult.result.nextState.constraints.avoidPlaces.includes('上野'), true)
assert.equal(taskResult.result.nextState.constraints.avoidPlaces.includes('原宿'), true)

taskResult = runTravelTask('day5想安排成二次元主题日，给我安排一下')
assert.equal(taskResult.task.taskType, 'replace_day')
assert.equal(taskResult.task.target.day, 5)
assert.equal(taskResult.task.payload.theme, '二次元')
assert.equal(taskResult.parseResult.commands[0].operation, 'replace')
assert.equal(taskResult.parseResult.commands[0].scope, 'day')
assert.equal(taskResult.parseResult.commands[0].target.day, 5)
assert.match(planText(taskResult.result.nextState, 5), /二次元|秋叶原/)
assert.equal(planText(taskResult.result.nextState, 6).includes('二次元'), false)
assert.equal(taskResult.result.validation.changedDays.length, 1)
assert.equal(taskResult.result.validation.changedDays.includes(5), true)

result = run('第三天改成购物')
assert.equal(result.commands[0].operation, 'replace')
assert.equal(result.commands[0].scope, 'day')
assert.match(planText(result.nextState, 3), /购物/)

result = run('第一天就在酒店附近休息')
assert.equal(result.commands.some(command => command.scope === 'activity' || command.scope === 'day'), true)
assert.equal(planText(result.nextState, 1).includes('酒店') || planText(result.nextState, 1).includes('休息'), true)

result = run('第一天不想去浅草，换一个地方')
assert.equal(result.commands.some(command => command.scope === 'constraint'), true)
assert.equal(result.nextState.constraints.avoidPlaces.includes('浅草'), true)
assert.equal(planText(result.nextState, 1).includes('浅草'), false)

result = run('不要再推荐寺庙')
assert.equal(result.commands[0].scope, 'constraint')
assert.equal(result.nextState.constraints.avoidCategories.includes('寺庙'), true)

result = run('不想去寺庙，换成街区和咖啡')
assert.equal(result.nextState.constraints.avoidCategories.includes('寺庙'), true)
assert.equal(result.nextState.preferences.includes('城市街区'), true)
assert.equal(result.nextState.preferences.includes('咖啡店'), true)
assert.equal(result.aiResult.reply.includes('替代偏好'), true)

result = run('第三天轻松一点')
assert.equal(result.commands[0].operation, 'adjust')
assert.equal(result.commands[0].scope, 'day')
assert.equal(dayPlan(result.nextState, 3).intensity, '轻松')

result = run('想增加预算的细节')
assert.equal(result.commands[0].scope, 'budget')
assert.equal(result.nextState.budget.mode, 'breakdown')
assert.equal(result.nextState.budget.categories.includes('餐饮'), true)

result = run('把上野放到第三天')
assert.equal(result.commands[0].operation, 'move')
assert.equal(result.commands[0].scope, 'place')
assert.equal(result.commands[0].target.place, '上野')
assert.equal(result.commands[0].target.day, 3)
assert.equal(planText(result.nextState, 3).includes('上野'), true)
assert.equal(result.nextState.itinerary.filter(plan => plan.day !== 3).some(plan => JSON.stringify(plan).includes('上野')), false)

result = tripState.processUserFeedback('这天感觉怪怪的', createState())
assert.equal(result.parseResult.actionMode, 'clarify')
assert.equal(result.commands[0].operation, 'clarify')
assert.equal(result.patches.length, 0)

console.log('Travel task frame and TripState patch tests passed.')
