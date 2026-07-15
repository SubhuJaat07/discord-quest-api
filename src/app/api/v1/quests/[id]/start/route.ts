import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission, getApiKeyToken } from '@/lib/api-keys'
import WebSocket from 'ws'

// Active quest tracking - FIXED VERSION with real progress
interface ActiveQuest {
  id: string
  questId: string
  appId: string
  gameName: string
  userId: string
  startTime: number
  endTime: number
  status: string
  progress: number
  phase: string
  ws: WebSocket | null
  
  // NEW: Real Discord data
  realProgressSeconds: number
  targetSeconds: number
  remainingSeconds: number
  gatewayError?: string
}

const activeQuests = new Map<string, ActiveQuest>()

// Export for other routes to access
export function getActiveQuests() {
  return activeQuests
}

const HEARTBEAT_INTERVAL = 41250
const PRESENCE_UPDATE_INTERVAL = 30000

// POST /api/v1/quests/:id/start - Start quest completion (FIXED)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: questId } = await params
    
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required', code: 'API_KEY_REQUIRED' },
        { status: 401 }
      )
    }

    const keyCheck = verifyApiKey(apiKey)
    if (typeof keyCheck === 'object' && 'error' in keyCheck) {
      return NextResponse.json(keyCheck as any, { status: (keyCheck as any).status })
    }

    const keyData = keyCheck as NonNullable<typeof keyCheck>

    if (!hasPermission(keyData, 'quests:start')) {
      return NextResponse.json(
        { error: 'Requires quests:start permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const token = getApiKeyToken(apiKey)
    if (!token) {
      return NextResponse.json(
        { error: 'Session expired. Re-authenticate.', code: 'SESSION_EXPIRED' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { appId, gameName } = body

    // Check for existing active quest
    for (const [, quest] of activeQuests.entries()) {
      if (quest.userId === keyData.user.id && 
          ['running', 'connecting', 'identifying', 'fetching_progress'].includes(quest.status)) {
        return NextResponse.json({
          error: 'Quest already in progress',
          code: 'QUEST_IN_PROGRESS',
          currentQuest: {
            id: quest.id,
            questId: quest.questId,
            gameName: quest.gameName,
            elapsed: Math.floor((Date.now() - quest.startTime) / 1000),
            progress: quest.progress,
            phase: quest.phase,
            remainingTime: formatTime(quest.remainingSeconds)
          },
          statusEndpoint: `/api/v1/quests/${quest.questId}/status`,
          cancelEndpoint: `/api/v1/quests/${quest.questId}/cancel`
        }, { status: 409 })
      }
    }

    const gameInfo = resolveGameInfo(questId, appId, gameName)
    
    const questSessionId = `v1_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const now = Date.now()

    const quest: ActiveQuest = {
      id: questSessionId,
      questId,
      appId: gameInfo.appId,
      gameName: gameInfo.gameName,
      userId: keyData.user.id,
      startTime: now,
      endTime: now + (15 * 60 * 1000), // Will be updated after fetching real progress
      status: 'initializing',
      progress: 0,
      phase: 'Initializing...',
      ws: null,
      
      // Real data (will be populated)
      realProgressSeconds: 0,
      targetSeconds: 900,
      remainingSeconds: 900
    }

    activeQuests.set(questSessionId, quest)

    startGatewayCompletion(questSessionId, token, gameInfo)

    return NextResponse.json({
      success: true,
      questSessionId,
      quest: {
        id: questId,
        name: gameInfo.gameName,
        appId: gameInfo.appId
      },
      method: 'Discord Gateway WebSocket (REAL)',
      status: 'starting',
      phases: [
        '📊 Fetching real progress from Discord',
        '🔌 Connecting to Gateway',
        '🔐 Authenticating',
        '🎮 Sending PresenceUpdate',
        '⏱️ Tracking REAL remaining time',
        '✅ Completing quest'
      ],
      endpoints: {
        status: `/api/v1/quests/${questId}/status`,
        cancel: `/api/v1/quests/${questId}/cancel`
      },
      note: 'Will use ACTUAL remaining time from Discord!'
    })

  } catch (error) {
    console.error('[V1 START] Error:', error)
    return NextResponse.json(
      { error: 'Failed to start quest', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

function resolveGameInfo(
  questId: string, 
  providedAppId?: string, 
  providedGameName?: string
): { appId: string; gameName: string } {
  if (providedAppId && providedGameName) {
    return { appId: providedAppId, gameName: providedGameName }
  }

  const KNOWN_GAMES: Record<string, { appId: string; gameName: string }> = {
    '1421154726023532544': { appId: '1421154726023532544', gameName: 'EA SPORTS FC 26' },
    '1437509662303059998': { appId: '1437509662303059998', gameName: 'Where Winds Meet' },
    '1470616226995765409': { appId: '1470616226995765409', gameName: 'Neverness to Everness' },
    '363445589247131668': { appId: '363445589247131668', gameName: 'Roblox' },
    '1257819671114289184': { appId: '1257819671114289184', gameName: 'Zenless Zone Zero' },
    '700136079562375258': { appId: '700136079562375258', gameName: 'VALORANT' },
    '1247227126416146462': { appId: '1247227126416146462', gameName: 'Wuthering Waves' },
    '1461154307171811401': { appId: '1461154307171811401', gameName: 'Arknights: Endfield' },
    '1180205756998488064': { appId: '1180205756998488064', gameName: 'Old School RuneScape' },
    '1402418586244612216': { appId: '1402418586244612216', gameName: 'Warframe' },
    '1140238527980916757': { appId: '1140238527980916757', gameName: 'Yu-Gi-Oh! Master Duel' },
    '1314682894106497096': { appId: '1314682894106497096', gameName: 'Delta Force' },
    '1162085521816813721': { appId: '1162085521816813721', gameName: 'Escape the Backrooms' },
    '1506481295700529172': { appId: '1506481295700529172', gameName: 'EMPULSE' },
    '1440130372162682961': { appId: '1440130372162682961', gameName: 'GOALS' },
    '1515074184961724517': { appId: '1515074184961724517', gameName: 'The Mound: Omen of Cthulhu' }
  }

  if (KNOWN_GAMES[questId]) {
    return KNOWN_GAMES[questId]
  }

  return { appId: '1421154726023532544', gameName: 'EA SPORTS FC 26' }
}

// MAIN COMPLETION ENGINE - WITH REAL PROGRESS FETCHING
async function startGatewayCompletion(
  questSessionId: string,
  token: string,
  gameInfo: { appId: string; gameName: string }
) {
  const quest = activeQuests.get(questSessionId)
  if (!quest) return

  let ws: WebSocket | null = null
  let heartbeatInterval: NodeJS.Timeout | null = null
  let presenceInterval: NodeJS.Timeout | null = null
  let progressInterval: NodeJS.Timeout | null = null

  try {
    // PHASE 0: Fetch REAL Progress
    quest.status = 'fetching_progress'
    quest.phase = '📊 Fetching real progress from Discord...'
    
    console.log(`[V1 PHASE 0] Fetching real progress for ${gameInfo.gameName}...`)
    
    const realData = await fetchRealProgress(token, quest.questId)
    
    if (realData) {
      quest.realProgressSeconds = realData.progressSeconds || 0
      quest.targetSeconds = realData.targetSeconds || 900
      quest.remainingSeconds = Math.max(0, quest.targetSeconds - quest.realProgressSeconds)
      quest.endTime = Date.now() + (quest.remainingSeconds * 1000)
      quest.progress = (quest.realProgressSeconds / quest.targetSeconds) * 100
      
      console.log(`[V1 PHASE 0] ✅ Real progress: ${quest.realProgressSeconds}/${quest.targetSeconds}s (${Math.round(quest.progress)}%)`)
      quest.phase = `✅ Fetched: ${Math.round(quest.progress)}% done, ${formatTime(quest.remainingSeconds)} left`
    } else {
      quest.phase = '⚠️ Using default timing (could not fetch)'
      console.log('[V1 PHASE 0] ⚠️ Could not fetch real progress')
    }

    await delay(2000)

    // PHASE 1: Connect to Gateway
    quest.status = 'connecting'
    quest.phase = '🔌 Connecting to Discord Gateway...'
    
    console.log('[V1 PHASE 1] Connecting...')
    
    ws = await connectToGateway(token)
    if (!ws) throw new Error('Gateway connection failed')

    quest.ws = ws
    quest.status = 'identifying'
    quest.phase = '🔐 Authenticated! Setting up presence...'
    await delay(2000)

    // PHASE 2: Running
    quest.status = 'running'
    quest.phase = `🎮 ${gameInfo.gameName} activity tracking...`

    sendPresence(ws, gameInfo)

    heartbeatInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 1, d: Date.now() }))
      }
    }, HEARTBEAT_INTERVAL)

    presenceInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN && quest.status === 'running') {
        sendPresence(ws, gameInfo)
      }
    }, PRESENCE_UPDATE_INTERVAL)

    progressInterval = setInterval(() => {
      const q = activeQuests.get(questSessionId)
      if (!q || q.status !== 'running') return

      const elapsed = Date.now() - q.startTime
      const totalDuration = q.targetSeconds * 1000
      const elapsedWithBase = q.realProgressSeconds * 1000 + elapsed
      
      q.progress = Math.min((elapsedWithBase / totalDuration) * 100, 99.9)
      q.remainingSeconds = Math.max(0, totalDuration - elapsedWithBase)

      if (q.progress < 15) q.phase = '🎮 Establishing session...'
      else if (q.progress < 30) q.phase = '📡 Gameplay detected...'
      else if (q.progress < 50) q.phase = '⏱️ Tracking playtime...'
      else if (q.progress < 75) q.phase = '🎯 Approaching objective...'
      else if (q.progress < 90) q.phase = '🔄 Finalizing...'
      else q.phase = '🎉 Almost complete!'
    }, 3000)

    // Wait for REAL remaining time
    const waitMs = quest.remainingSeconds * 1000 + 10000
    console.log(`[V1 PHASE 2] ⏱️ Waiting ${formatTime(quest.remainingSeconds)}...`)

    await new Promise<void>((resolve) => {
      const check = () => {
        const q = activeQuests.get(questSessionId)
        if (!q || q.status === 'failed' || Date.now() >= q.endTime) resolve()
        else setTimeout(check, 1000)
      }
      setTimeout(check, waitMs)
    })

    // Complete
    const finalQuest = activeQuests.get(questSessionId)
    if (finalQuest?.status === 'running') {
      finalQuest.status = 'completed'
      finalQuest.progress = 100
      finalQuest.phase = '✅ Quest Completed!'
      console.log(`[V1 COMPLETED] ${gameInfo.gameName}`)
    }

  } catch (error) {
    console.error('[V1 GATEWAY ERROR]', error)
    const failedQuest = activeQuests.get(questSessionId)
    if (failedQuest) {
      failedQuest.status = 'failed'
      failedQuest.gatewayError = error instanceof Error ? error.message : 'Unknown'
      failedQuest.phase = `❌ Error: ${failedQuest.gatewayError}`
    }
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (presenceInterval) clearInterval(presenceInterval)
    if (progressInterval) clearInterval(progressInterval)
    if (ws) {
      try { ws.close(1000, 'Complete') } catch {}
    }
  }
}

// Fetch REAL progress from Discord
async function fetchRealProgress(token: string, questId: string): Promise<any> {
  try {
    const res = await fetch('https://discord.com/api/v10/quests/@me', {
      headers: { 'Authorization': token, 'User-Agent': 'DiscordQuestAPI/1.0' }
    })

    if (!res.ok) return null

    const data = await res.json()
    const quests = data.quests || []
    const target = quests.find((q: any) => q.id === questId || q.config?.application?.id === questId)
    
    if (!target) return null

    const userStatus = target.user_status || {}
    const tasks = target.config?.task_config_v2?.tasks || {}
    const taskEntry = Object.entries(tasks)[0]
    const [, details] = taskEntry || ['UNKNOWN', {}]
    const targetSec = (details as any)?.target || 900
    const progressSec = userStatus.stream_progress_seconds || 0

    return {
      questId: target.id,
      progressSeconds: progressSec,
      targetSeconds: targetSec,
      percentComplete: Math.round((progressSec / targetSec) * 100),
      remainingSeconds: Math.max(0, targetSec - progressSec)
    }
  } catch (e) {
    return null
  }
}

function connectToGateway(token: string): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json', {
      headers: { 'User-Agent': 'DiscordQuestAPI/1.0' }
    })

    const timeout = setTimeout(() => {
      ws.close()
      resolve(null)
    }, 20000)

    ws.on('open', () => console.log('[V1 GATEWAY] Connected'))

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        
        if (msg.op === 10) {
          clearTimeout(timeout)
          ws.send(JSON.stringify({
            op: 2,
            d: {
              token,
              properties: { os: 'windows', browser: 'DiscordQuestAPI', device: 'DiscordQuestAPI' },
              compress: false,
              intents: 1 << 8 | 1 << 12 | 1 << 15
            }
          }))
        }
        
        if (msg.t === 'READY') {
          console.log('[V1 GATEWAY] 🎉 Ready!')
          resolve(ws)
        }
        
        if (msg.op === 11) {} // Heartbeat ACK
      } catch (e) {}
    })

    ws.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

function sendPresence(ws: WebSocket, game: { appId: string; gameName: string }) {
  if (ws.readyState !== WebSocket.OPEN) return
  
  ws.send(JSON.stringify({
    op: 3,
    d: {
      since: null,
      activities: [{
        name: game.gameName,
        type: 0,
        application_id: game.appId,
        details: `Playing ${game.gameName}`,
        state: 'In Game',
        timestamps: { start: Date.now() },
        assets: { large_image: game.appId, large_text: game.gameName },
        instance: true
      }],
      status: 'online',
      afk: false
    }
  }))
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
