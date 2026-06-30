# CoTrip AI

CoTrip AI 是一个 AI 协作式旅行规划工作台。它不是一次性生成静态攻略，而是让用户通过多轮自然语言对话不断修改计划，系统维护统一的结构化 `TripState`，并把行程实时同步到时间轴卡片和地图视图。

这个项目主要展示我对 AI 产品工程化的理解：把“用户自然语言”转成可验证的旅行任务、patch、状态更新和 UI 同步，而不是只停留在聊天回复。

## Live Demo

- 在线演示：https://co-trip-ai.vercel.app/
- 本地运行：`http://localhost:3000`
- 推荐演示脚本：见下方 `Demo Guide`

部署后可以把链接替换为：

```text
https://your-cotrip-ai-demo.vercel.app
```

## Project Highlights

- **AI 协作式规划**：用户可以在聊天区连续提出修改，例如“第二天不去上野和原宿，想去迪士尼玩”“Day 5 安排成二次元主题日”。
- **结构化 TripState**：目的地、天数、节奏、酒店、约束、偏好和行程统一由 `TripState` 管理，聊天、卡片和地图不各自维护孤立数据。
- **Itinerary Patch System**：AI 结果会被转换为结构化 command / patch，再通过 reducer 更新行程，避免“AI 嘴上说改了，页面没变”。
- **多轮语义记忆**：住宿、预算、落地机场、返程时间、避开地点、偏好变化会持续写入状态，不会只看当前一句话。
- **地图同步**：右侧 Leaflet 地图完全从当前 `TripState.itinerary` 派生，行程卡片变化后地图点位同步变化。
- **候选地点规划**：支持从用户输入中提取想去的景点、区域、餐厅和约束，再根据位置、节奏和交通估算重新分组。
- **稳定 Demo 兜底**：当 LLM API 不可用或返回不稳定时，本地 `TravelTaskFrame` fallback 仍能支撑核心演示路径。

## Demo Guide

下面是一套适合放作品集或面试演示的稳定用户旅程。建议按顺序演示，可以完整覆盖首页输入、AI 信息识别、初版行程生成、多轮修改、地图同步和导出。

### 1. 首页输入完整需求

在首页输入：

```text
第一次去东京，玩6天，8月出行，住在东京虹夕诺雅日式旅馆（Hoshinoya Tokyo），位于大手町，预算3万元左右；第一天10点半落地羽田机场，最后一天晚上22点从羽田机场返程；每天10点后开始；喜欢美食、城市街区，节奏轻松一点。
```

预期效果：

- AI 识别目的地、天数、出行时间、预算、住宿、落地机场、返程机场和偏好。
- 第一天下午/晚上按抵达日低强度安排。
- 最后一天保留返程弹性。
- 信息完整后自动生成初版 6 天行程。

### 2. 加入临时想去地点

在聊天区输入：

```text
第二天想换成去迪士尼。
```

预期效果：

- 系统识别为必须加入的远郊/主题乐园。
- 自动选择非首日、非返程日的合适日期。
- 行程卡片出现迪士尼全天安排，地图同步更新。

### 3. 按交通重新规划路线

输入：

```text
根据交通因素以及我住的区域重新规划迪士尼、表参道、涩谷、银座、筑地、台场、代官山。第一天和最后一天要把我抵达东京和离开东京的行程考虑在内。
```

预期效果：

- 系统按区域和交通估算重新分组。
- 相邻区域优先放在同一天。
- Day 1 继续考虑羽田机场抵达时间。
- 地图点位随新的行程同步变化。

### 4. 替换某一天主题

输入：

```text
day5想安排成二次元主题日，给我安排一下
```

预期效果：

- 系统识别目标是 `Day 5`，不是最后一天或 Day 6。
- Day 5 被替换为二次元主题日。
- 东京场景下会生成秋叶原、池袋/中野等相关点位。


### 5. 跳转至外部链接

点击地图右下角“小红书”“导航”“点评”按钮。

预期效果：

- 跳转至小红书，并对应关键词搜索。
- 跳转至谷歌地图。
- 跳转至大众点评APP

### 6. 导出行程

点击右上角：

```text
确认并导出行程
```

预期效果：

- 进入导出页。
- 导出区只保留：
  - 导出网页
  - 导出PDF

## Tech Stack

- **Framework**：Next.js 16 App Router
- **UI**：React 19, Tailwind CSS 4, Base UI / shadcn-style conventions
- **Language**：TypeScript
- **Map**：Leaflet
- **AI API**：OpenAI SDK compatible interface, supports Doubao / OpenAI-style APIs
- **Icons**：lucide-react
- **State Model**：TripState + TravelTaskFrame + ParseResult + TripPatch
- **Quality**：ESLint, TypeScript, demo smoke tests

## Architecture

```text
app/                    Next.js app routes and API routes
components/cotrip/      Workspace, chat, itinerary cards, map and export UI
components/ui/          Shared UI primitives
lib/types.ts            Core TripState, itinerary, patch and semantic frame types
lib/trip-state.ts       Intent parsing, patch generation, reducer, validation and reply generation
lib/travel-task-frame.ts
                        LLM-facing travel task semantics and local fallback parser
lib/travel-task-planner.ts
                        TravelTaskFrame -> ParseResult / TripPatch pipeline
lib/trip-session.ts     Homepage input parsing and initial trip session creation
lib/trip-candidates.ts  CandidatePlace extraction and normalization
lib/trip-route-planner.ts
                        CandidatePlace -> itinerary planning and route regrouping
lib/travel-time.ts      Local travel-time estimator used by route grouping
lib/map-adapter.ts      TripState / itinerary -> Leaflet map data adapter
lib/types/trip.ts       Map-oriented trip item types
```

核心数据流：

```text
User Message
  -> TravelTaskFrame
  -> ParseResult / TravelEditCommand
  -> TripPatch
  -> applyPatches(TripState)
  -> validatePatchResult
  -> AI reply from afterState
  -> Itinerary Cards + Leaflet Map
```

## Getting Started

项目使用 pnpm。Windows 下如果终端识别不到 `pnpm`，可以直接使用本机 npm 全局目录里的 `pnpm.cmd`。

```powershell
pnpm install
pnpm dev
```

如果 `pnpm` 不在 PATH 中：

```powershell
C:\Users\thisi\AppData\Roaming\npm\pnpm.cmd install
C:\Users\thisi\AppData\Roaming\npm\pnpm.cmd dev
```

打开：

```text
http://localhost:3000
```

## Environment Variables

如需启用服务端 AI 识别，请从 `.env.example` 创建 `.env.local`，并配置模型服务。

```env
AI_PROVIDER=doubao
DOUBAO_API_KEY=your_api_key
DOUBAO_MODEL=your_model_name
DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

不要把 `.env.local` 提交到公开仓库。

## Quality Checks

```powershell
pnpm typecheck
pnpm lint
pnpm build
pnpm test:patch
pnpm test:demo
```

Windows 下也可以使用：

```powershell
C:\Users\thisi\AppData\Roaming\npm\pnpm.cmd typecheck
C:\Users\thisi\AppData\Roaming\npm\pnpm.cmd lint
C:\Users\thisi\AppData\Roaming\npm\pnpm.cmd build
C:\Users\thisi\AppData\Roaming\npm\pnpm.cmd test:patch
C:\Users\thisi\AppData\Roaming\npm\pnpm.cmd test:demo
```

## Roadmap

- 接入真实路线 API，替换当前本地交通时间估算。
- 接入 POI 搜索与地理编码，完善餐厅、咖啡店、景点详情。
- 支持用户上传攻略截图，抽取候选地点、偏好和约束。
- 增强多城市行程状态，例如“前 3 天东京，后 3 天大阪”。
- 增加持久化、分享链接和更完整的 PDF 导出能力。
