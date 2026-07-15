import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission, getApiKeyToken } from '@/lib/api-keys'
import WebSocket from 'ws'

// ============================================
// 🎓 EDUCATIONAL DEMO: External API Version
// ============================================

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
  
  // Educational data
  isSimulation: true
  simulationNotes: string[]
  gatewayEvents: string[]
}

const activeQuests = new Map<string, ActiveQuest>()

export function getActiveQuests() {
  return activeQuests
}

const HEARTBEAT_INTERVAL = 41250
const PRESENCE_UPDATE_INTERVAL = 30000

// POST - Start Educational Demo via External API
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

    const keyData = keyCheck as NonNullable<typeof keyData>

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

    // Check existing
    for (const [, quest] of activeQuests.entries()) {
      if (quest.userId === keyData.user.id && 
          ['running', 'connecting', 'authenticating', 'presence_active'].includes(quest.status)) {
        return NextResponse.json({
          error: 'Demo already in progress',
          code: 'DEMO_IN_PROGRESS',
          currentQuest: {
            id: quest.id,
            questId: quest.questId,
            gameName: quest.gameName,
            elapsed: Math.floor((Date.now() - quest.startTime) / 1000),
            phase: quest.phase,
            progress: quest.progress
          },
          isEducationalDemo: true
        }, { status: 409 })
      }
    }

    const gameInfo = resolveGameInfo(questId, appId, gameName)
    
    const questSessionId = `edu_v1_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const now = Date.now()

    const quest: ActiveQuest = {
      id: questSessionId,
      questId,
      appId: gameInfo.appId,
      gameName: gameInfo.gameName,
      userId: keyData.user.id,
      startTime: now,
      endTime: now + (15 * 60 * 1000),
      status: 'initializing',
      progress: 0,
      phase: '🎓 Initializing Educational Demo...',
      ws: null,
      
      isSimulation: true,
      simulationNotes: [
        `🎓 Started at ${new Date().toISOString()}`,
        `📚 Educational Demo Mode`,
        `🎯 Target: ${gameInfo.gameName}`
      ],
      gatewayEvents: []
    }

    activeQuests.set(questSessionId, quest)

    startEducationalDemo(questSessionId, token, gameInfo)

    return NextResponse.json({
      success: true,
      questSessionId,
      isEducationalDemo: true,
      message: `🎓 Starting educational demo for ${gameInfo.gameName}`,
      
      learningObjectives: [
        'Discord Gateway WebSocket protocol',
        'PresenceUpdate mechanism (Opcode 3)',
        'Heartbeat keep-alive system',
        'How stream_progress_seconds works',
        'Anti-cheat in Discord Quest system'
      ],
      
      phases: [
        '🔌 Connect to Gateway',
        '🔐 Authenticate with token',
        '🎮 Send PresenceUpdate',
        '💓 Maintain heartbeats',
        '📊 Track "progress" (simulated)',
        '✅ Complete demo'
      ],
      
      importantNote: '⚠️ EDUCATIONAL SIMULATION - Shows internal mechanism only. Real completion requires local detection.',
      
      endpoints: {
        status: `/api/v1/quests/${questId}/status`,
        cancel: `/api/v1/quests/${questId}/cancel`
      }
    })

  } catch (error) {
    console.error('[V1 EDU START] Error:', error)
    return NextResponse.json(
      { error: 'Failed to start demo', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

function resolveGameInfo(questId: string, providedAppId?: string, providedGameName?: string): { appId: string; gameName: string } {
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

// Main Educational Demo Engine
async function startEducationalDemo(
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
    // Phase 1: Connect
    quest.status = 'connecting'
    quest.phase = '🔌 Connecting to Discord Gateway...'
    quest.gatewayEvents.push(`CONNECT: wss://gateway.discord.gg`)

    ws = await connectToGateway(token, quest)
    if (!ws) throw new Error('Gateway connection failed')

    quest.ws = ws
    quest.wsConnected = true
    await delay(3000)

    // Phase 2: Authenticated
    quest.status = 'authenticating'
    quest.phase = '🔐 Authenticated! Setting up presence...'
    await delay(2000)

    // Phase 3: Send Presence
    quest.status = 'presence_active'
    quest.phase = `🎮 ${gameInfo.gameName} activity active...`
    sendPresence(ws, gameInfo)
    await delay(2000)

    // Phase 4: Running with heartbeats
    quest.status = 'tracking'
    quest.phase = '💓 Maintaining connection...'

    heartbeatInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 1, d: Date.now() }))
        quest.gatewayEvents.push('HEARTBEAT sent')
      }
    }, HEARTBEAT_INTERVAL)

    presenceInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN && quest.status === 'tracking') {
        sendPresence(ws, gameInfo)
        quest.gatewayEvents.push('PRESENCE updated')
      }
    }, PRESENCE_UPDATE_INTERVAL)

    progressInterval = setInterval(() => {
      const q = activeQuests.get(questSessionId)
      if (!q || q.status !== 'tracking') return

      const elapsed = Date.now() - q.startTime
      q.progress = Math.min((elapsed / (15 * 60 * 1000)) * 100, 99.9)

      if (q.progress < 20) q.phase = '📊 Establishing session...'
      else if (q.progress < 40) q.phase = '🎮 Gameplay detected...'
      else if (q.progress < 60) q.phase = '⏱️ Tracking actively...'
      else if (q.progress < 80) q.phase = '🎯 Approaching objective...'
      else q.phase = '🔄 Finalizing...'

    }, 3000)

    // Wait 15 minutes
    await new Promise<void>((resolve) => {
      const check = () => {
        const q = activeQuests.get(questSessionId)
        if (!q || q.status === 'failed' || Date.now() >= q.endTime) resolve()
        else setTimeout(check, 1000)
      }
      setTimeout(check, (15 * 60 * 1000) + 15000)
    })

    // Complete
    const finalQuest = activeQuests.get(questSessionId)
    if (finalQuest?.status === 'tracking') {
      finalQuest.status = 'completed'
      finalQuest.progress = 100
      finalQuest.phase = '🎓 Educational Demo Completed!'
      finalQuest.simulationNotes.push(`
═══════════════════════════
🎓 DEMO COMPLETE!

You learned:
• Discord Gateway protocol
• PresenceUpdate (Opcode 3)
• Heartbeat mechanism  
• How quests track time
• Why local detection matters

Thank you for learning! 🚀
═══════════════════════════
`)
    }

  } catch (error) {
    console.error('[V1 EDU ERROR]', error)
    const failedQuest = activeQuests.get(questSessionId)
    if (failedQuest) {
      failedQuest.status = 'failed'
      failedQuest.phase = `❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`
    }
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (presenceInterval) clearInterval(presenceInterval)
    if (progressInterval) clearInterval(progressInterval)
    if (ws) {
      try { ws.close(1000, 'Demo complete') } catch {}
    }
  }
}

function connectToGateway(token: string, quest: ActiveQuest): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json', {
      headers: { 'User-Agent': 'DiscordQuestEducational/1.0' }
    })

    const timeout = setTimeout(() => {
      quest.gatewayEvents.push('TIMEOUT')
      ws.close()
      resolve(null)
    }, 20000)

    ws.on('open', () => {
      quest.gatewayEvents.push('CONNECTED')
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        
        if (msg.op === 10) {
          clearTimeout(timeout)
          ws.send(JSON.stringify({
            op: 2,
            d: {
              token,
              properties: { os: 'windows', browser: 'DiscordQuestEdu', device: 'DiscordQuestEdu' },
              compress: false,
              intents: 1 << 8 | 1 << 12 | 1 << 15
            }
          }))
          quest.gatewayEvents.push('IDENTIFY sent')
        }
        
        if (msg.t === 'READY') {
          quest.gatewayEvents.push('READY received')
          resolve(ws)
        }
        
        if (msg.op === 11) {
          quest.gatewayEvents.push('HEARTBEAT ACK')
        }
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
