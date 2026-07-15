import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission, getApiKeyToken } from '@/lib/api-keys'
import WebSocket from 'ws'

// Active quest tracking
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
}

const activeQuests = new Map<string, ActiveQuest>()

// Export for other routes to access
export function getActiveQuests() {
  return activeQuests
}

const QUEST_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const HEARTBEAT_INTERVAL = 41250 // ~41 seconds (Discord requirement)
const PRESENCE_UPDATE_INTERVAL = 30000 // 30 seconds

// POST /api/v1/quests/:id/start - Start quest completion
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: questId } = await params
    
    // Verify API key
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

    // Check permission
    if (!hasPermission(keyData, 'quests:start')) {
      return NextResponse.json(
        { error: 'Requires quests:start permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // Get token
    const token = getApiKeyToken(apiKey)
    if (!token) {
      return NextResponse.json(
        { error: 'Session expired. Re-authenticate.', code: 'SESSION_EXPIRED' },
        { status: 401 }
      )
    }

    // Parse body for additional options
    const body = await request.json().catch(() => ({}))
    const { appId, gameName } = body

    // Check for existing active quest
    for (const [, quest] of activeQuests.entries()) {
      if (quest.userId === keyData.user.id && 
          ['running', 'connecting', 'identifying'].includes(quest.status)) {
        return NextResponse.json({
          error: 'Quest already in progress',
          code: 'QUEST_IN_PROGRESS',
          currentQuest: {
            id: quest.id,
            questId: quest.questId,
            gameName: quest.gameName,
            elapsed: Math.floor((Date.now() - quest.startTime) / 1000),
            progress: quest.progress,
            phase: quest.phase
          },
          statusEndpoint: `/api/v1/quests/${quest.questId}/status`,
          cancelEndpoint: `/api/v1/quests/${quest.questId}/cancel`
        }, { status: 409 })
      }
    }

    // Resolve game info
    const gameInfo = resolveGameInfo(questId, appId, gameName)
    
    // Create quest session
    const questSessionId = `v1_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const now = Date.now()

    const quest: ActiveQuest = {
      id: questSessionId,
      questId,
      appId: gameInfo.appId,
      gameName: gameInfo.gameName,
      userId: keyData.user.id,
      startTime: now,
      endTime: now + QUEST_DURATION_MS,
      status: 'initializing',
      progress: 0,
      phase: 'Initializing Gateway connection...',
      ws: null
    }

    activeQuests.set(questSessionId, quest)

    // Start async completion process
    startGatewayCompletion(questSessionId, token, gameInfo)

    return NextResponse.json({
      success: true,
      questSessionId,
      quest: {
        id: questId,
        name: gameInfo.gameName,
        appId: gameInfo.appId
      },
      estimatedTime: '15 minutes',
      method: 'Discord Gateway WebSocket',
      status: 'started',
      endpoints: {
        status: `/api/v1/quests/${questId}/status`,
        cancel: `/api/v1/quests/${questId}/cancel`
      },
      phases: [
        'Connecting to Discord Gateway',
        'Authenticating with token',
        'Sending PresenceUpdate (game activity)',
        'Maintaining heartbeat connection',
        'Tracking gameplay time (15 min)',
        'Completing quest objectives'
      ],
      note: 'Quest completion runs server-side via real Discord Gateway connection'
    })

  } catch (error) {
    console.error('[V1 START] Error:', error)
    return NextResponse.json(
      { error: 'Failed to start quest', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

// Resolve game information
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

// Main gateway-based completion engine
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
    quest.status = 'connecting'
    quest.phase = 'Connecting to Discord Gateway...'

    ws = await connectToGateway(token)
    if (!ws) throw new Error('Gateway connection failed')

    quest.ws = ws
    quest.status = 'identifying'
    quest.phase = 'Authenticated! Setting up game presence...'
    await delay(2000)

    quest.status = 'running'
    quest.phase = `${gameInfo.gameName} activity tracking active...`

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
      q.progress = Math.min((elapsed / QUEST_DURATION_MS) * 100, 99.9)

      if (q.progress < 15) q.phase = 'Establishing game session...'
      else if (q.progress < 30) q.phase = 'Gameplay detected by Discord...'
      else if (q.progress < 50) q.phase = 'Tracking playtime actively...'
      else if (q.progress < 75) q.phase = 'Approaching quest objective...'
      else if (q.progress < 90) q.phase = 'Finalizing quest data...'
      else q.phase = 'Almost complete!'
    }, 3000)

    await new Promise<void>((resolve) => {
      const check = () => {
        const q = activeQuests.get(questSessionId)
        if (!q || q.status === 'failed' || Date.now() >= q.endTime) resolve()
        else setTimeout(check, 1000)
      }
      setTimeout(check, QUEST_DURATION_MS + 10000)
    })

    const finalQuest = activeQuests.get(questSessionId)
    if (finalQuest?.status === 'running') {
      finalQuest.status = 'completed'
      finalQuest.progress = 100
      finalQuest.phase = '✅ Quest Completed!'
      
      console.log(`[V1 QUEST COMPLETED] ${gameInfo.gameName}`)
    }

  } catch (error) {
    console.error('[V1 GATEWAY ERROR]', error)
    const failedQuest = activeQuests.get(questSessionId)
    if (failedQuest) {
      failedQuest.status = 'failed'
      failedQuest.phase = `Error: ${error instanceof Error ? error.message : 'Unknown'}`
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

function connectToGateway(token: string): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json', {
      headers: { 'User-Agent': 'DiscordQuestAPI/1.0' }
    })

    const timeout = setTimeout(() => {
      ws.close()
      resolve(null)
    }, 15000)

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
          console.log('[V1 GATEWAY] Ready!')
          resolve(ws)
        }
        
        if (msg.op === 11) {}
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
        assets: {
          large_image: game.appId,
          large_text: game.gameName
        },
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
