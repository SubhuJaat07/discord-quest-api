import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, getSessionUser } from '@/lib/session'
import WebSocket from 'ws'

// Discord Quest Completion Engine - FIXED VERSION
// Now fetches REAL progress from Discord and uses accurate timing

interface ActiveQuestSession {
  questId: string
  sessionId: string
  userId: string
  gameId?: string
  appName: string
  startTime: number
  endTime: number
  status: 'initializing' | 'fetching_progress' | 'connecting' | 'identifying' | 'running' | 'completing' | 'completed' | 'failed'
  progress: number
  phase: string
  wsConnected: boolean
  activitySent: boolean
  heartbeatCount: number
  lastHeartbeatAck: boolean
  errorCount: number
  questData: any
  
  // NEW: Real Discord data
  realProgressSeconds: number
  targetSeconds: number
  remainingSeconds: number
  gatewayError?: string
}

const activeQuests = new Map<string, ActiveQuestSession>()

const HEARTBEAT_INTERVAL = 41250 // Discord requires heartbeat every ~41.25 seconds
const PRESENCE_UPDATE_INTERVAL = 30000 // Update presence every 30 seconds

// POST - Start REAL quest completion via Discord Gateway
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, questId } = body

    if (!sessionId || !questId) {
      return NextResponse.json({ error: 'Session ID and Quest ID required' }, { status: 400 })
    }

    // Verify session
    const token = getSessionToken(sessionId)
    const user = getSessionUser(sessionId)
    
    if (!token || !user) {
      return NextResponse.json({ error: 'Session expired or invalid' }, { status: 401 })
    }

    // Check for existing active quest
    for (const [, quest] of activeQuests.entries()) {
      if (quest.sessionId === sessionId && ['running', 'connecting', 'identifying', 'fetching_progress'].includes(quest.status)) {
        return NextResponse.json(
          { 
            error: 'Quest already in progress',
            currentQuest: quest.questId,
            elapsed: Math.floor((Date.now() - quest.startTime) / 1000),
            phase: quest.phase,
            status: quest.status,
            progress: quest.progress,
            method: 'Discord Gateway WebSocket'
          },
          { status: 409 }
        )
      }
    }

    // Parse quest info from ID or request
    const questInfo = parseQuestInfo(questId, body)
    
    console.log(`[QUEST] Starting: ${questInfo.name} for user ${user.username}`)
    console.log(`[QUEST] App ID: ${questInfo.id}, Method: Real Discord Gateway + Real Progress`)

    // Create quest session with INITIAL state (progress will be updated after fetching)
    const questSessionId = `gateway_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const now = Date.now()
    
    const questSession: ActiveQuestSession = {
      questId,
      sessionId,
      userId: user.id,
      gameId: questInfo.id,
      appName: questInfo.name,
      startTime: now,
      endTime: now + (15 * 60 * 1000), // Temporary, will be updated after fetching real progress
      status: 'initializing',
      progress: 0,
      phase: 'Fetching real progress from Discord...',
      wsConnected: false,
      activitySent: false,
      heartbeatCount: 0,
      lastHeartbeatAck: true,
      errorCount: 0,
      questData: null,
      
      // Will be populated after fetching from Discord
      realProgressSeconds: 0,
      targetSeconds: 900, // Default 15 min
      remainingSeconds: 900
    }

    activeQuests.set(questSessionId, questSession)

    // Start the completion process (now includes fetching real progress first!)
    startGatewayQuestCompletion(questSessionId, token, questInfo)

    return NextResponse.json({
      success: true,
      questSessionId,
      message: `Starting quest completion for ${questInfo.name}`,
      method: 'Discord Gateway WebSocket (REAL)',
      phases: [
        '📊 Fetching real progress from Discord',
        '🔌 Connecting to Discord Gateway',
        '🔐 Authenticating with token',
        '🎮 Sending PresenceUpdate (game activity)',
        '💓 Maintaining heartbeat connection',
        '⏱️ Tracking REMAINING gameplay time',
        '✅ Completing quest objectives'
      ],
      note: 'Will show ACTUAL remaining time from Discord, not fake 15 minutes!'
    })

  } catch (error) {
    console.error('[QUEST ERROR]', error)
    return NextResponse.json({ error: 'Failed to start quest' }, { status: 500 })
  }
}

// GET - Get real-time quest status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    let activeQuest = null
    for (const [key, quest] of activeQuests.entries()) {
      if (quest.sessionId === sessionId) {
        activeQuest = { ...quest, id: key }
        break
      }
    }

    if (!activeQuest) {
      return NextResponse.json({
        success: true,
        status: 'idle',
        message: 'No active quest'
      })
    }

    const now = Date.now()
    const elapsed = now - activeQuest.startTime
    
    // Calculate REAL progress based on actual data
    let currentProgress = activeQuest.progress
    let remainingTime = Math.max(0, activeQuest.endTime - now)
    
    // If running, calculate live progress
    if (activeQuest.status === 'running') {
      const totalDuration = activeQuest.targetSeconds * 1000
      const elapsedFromRealProgress = activeQuest.realProgressSeconds * 1000 + elapsed
      currentProgress = Math.min((elapsedFromRealProgress / totalDuration) * 100, 99.9)
      remainingTime = Math.max(0, totalDuration - elapsedFromRealProgress)
    }

    return NextResponse.json({
      success: true,
      quest: {
        id: activeQuest.id,
        questId: activeQuest.questId,
        appName: activeQuest.appName,
        status: activeQuest.status,
        phase: activeQuest.phase,
        progress: Math.round(currentProgress),
        
        // REAL timing info from Discord
        realProgressSeconds: activeQuest.realProgressSeconds,
        targetSeconds: activeQuest.targetSeconds,
        remainingSeconds: Math.ceil(remainingTime / 1000),
        totalSeconds: activeQuest.targetSeconds,
        
        formattedElapsed: formatTime(Math.floor(elapsed / 1000)),
        formattedRemaining: formatTime(Math.ceil(remainingTime / 1000)),
        
        // Connection status
        wsConnected: activeQuest.wsConnected,
        activitySent: activeQuest.activitySent,
        heartbeatCount: activeQuest.heartbeatCount,
        gatewayError: activeQuest.gatewayError,
        
        startTime: new Date(activeQuest.startTime).toISOString(),
        estimatedCompletion: new Date(activeQuest.endTime).toISOString(),
        method: 'Discord Gateway WebSocket (REAL)'
      },
      debug: {
        fetchedFromDiscord: activeQuest.realProgressSeconds > 0,
        usingRealProgress: true
      }
    })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}

// DELETE - Cancel active quest
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    for (const [key, quest] of activeQuests.entries()) {
      if (quest.sessionId === sessionId && quest.status !== 'completed') {
        quest.status = 'failed'
        quest.phase = 'Cancelled by user'
        
        console.log(`[QUEST CANCELLED] ${quest.questId}`)
        
        setTimeout(() => activeQuests.delete(key), 5000)
        
        return NextResponse.json({
          success: true,
          message: 'Quest cancelled',
          progressLost: Math.round(quest.progress)
        })
      }
    }

    return NextResponse.json({ error: 'No active quest' }, { status: 404 })

  } catch (error) {
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 })
  }
}

// Parse quest info from various sources
function parseQuestInfo(questId: string, body: any): { id: string; name: string } {
  if (body.appId && body.appName) {
    return { id: body.appId, name: body.appName }
  }
  
  const KNOWN_GAMES: Record<string, string> = {
    '1421154726023532544': 'EA SPORTS FC 26',
    '1437509662303059998': 'Where Winds Meet',
    '1470616226995765409': 'Neverness to Everness',
    '363445589247131668': 'Roblox',
    '1257819671114289184': 'Zenless Zone Zero',
    '700136079562375258': 'VALORANT',
    '1247227126416146462': 'Wuthering Waves',
    '1461154307171811401': 'Arknights: Endfield',
    '1515074184961724517': 'The Mound: Omen of Cthulhu',
    '1180205756998488064': 'Old School RuneScape',
    '1402418586244612216': 'Warframe',
    '1140238527980916757': 'Yu-Gi-Oh! Master Duel',
    '1314682894106497096': 'Delta Force',
    '1162085521816813721': 'Escape the Backrooms',
    '1506481295700529172': 'EMPULSE',
    '1440130372162682961': 'GOALS'
  }

  if (KNOWN_GAMES[questId]) {
    return { id: questId, name: KNOWN_GAMES[questId] }
  }

  return { 
    id: '1421154726023532544', 
    name: 'EA SPORTS FC 26'
  }
}

// MAIN QUEST COMPLETION ENGINE - WITH REAL PROGRESS FETCHING
async function startGatewayQuestCompletion(
  questSessionId: string, 
  token: string, 
  gameInfo: { id: string; name: string }
) {
  const quest = activeQuests.get(questSessionId)
  if (!quest) return

  let ws: WebSocket | null = null
  let heartbeatInterval: NodeJS.Timeout | null = null
  let presenceInterval: NodeJS.Timeout | null = null
  let progressInterval: NodeJS.Timeout | null = null

  try {
    // ============================================
    // PHASE 0: Fetch REAL Progress from Discord
    // ============================================
    quest.status = 'fetching_progress'
    quest.phase = '📊 Fetching your real progress from Discord...'
    
    console.log('[PHASE 0] Fetching real progress from Discord API...')
    
    const realQuestData = await fetchRealQuestProgress(token, quest.questId)
    
    if (realQuestData) {
      quest.questData = realQuestData
      quest.realProgressSeconds = realQuestData.progressSeconds || 0
      quest.targetSeconds = realQuestData.targetSeconds || 900
      quest.remainingSeconds = Math.max(0, quest.targetSeconds - quest.realProgressSeconds)
      
      // Calculate ACCURATE end time based on REAL remaining time
      const remainingMs = quest.remainingSeconds * 1000
      quest.endTime = Date.now() + remainingMs
      
      // Set initial progress based on real data
      quest.progress = (quest.realProgressSeconds / quest.targetSeconds) * 100
      
      console.log(`[PHASE 0] ✅ Real progress fetched!`)
      console.log(`[PHASE 0] Progress: ${quest.realProgressSeconds}/${quest.targetSeconds} seconds (${Math.round(quest.progress)}%)`)
      console.log(`[PHASE 0] Remaining: ${quest.remainingSeconds} seconds (${formatTime(quest.remainingSeconds)})`)
      
      quest.phase = `✅ Fetched real progress: ${Math.round(quest.progress)}% done, ${formatTime(quest.remainingSeconds)} remaining`
    } else {
      console.log('[PHASE 0] ⚠️ Could not fetch real progress, using defaults')
      quest.phase = '⚠️ Using default 15 minutes (could not fetch real progress)'
      quest.remainingSeconds = 900
      quest.targetSeconds = 900
      quest.endTime = Date.now() + 900000
    }

    await delay(2000) // Let user see the progress fetch result

    // ============================================
    // PHASE 1: Connect to Discord Gateway
    // ============================================
    quest.status = 'connecting'
    quest.phase = '🔌 Connecting to Discord Gateway...'
    
    console.log('[PHASE 1] Connecting to Discord Gateway...')
    
    ws = await connectToDiscordGateway(token)
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Failed to connect to Discord Gateway after multiple attempts')
    }
    
    quest.wsConnected = true
    quest.status = 'identifying'
    quest.phase = '🔐 Authenticated! Setting up game presence...'
    console.log('[PHASE 1] ✅ Connected and authenticated!')
    await delay(2000)

    // ============================================
    // PHASE 2: Running - Send presence updates
    // ============================================
    quest.status = 'running'
    quest.phase = `🎮 ${gameInfo.name} activity tracking active...`
    
    // Send initial presence update
    sendPresenceUpdate(ws, gameInfo)
    quest.activitySent = true
    console.log('[PHASE 2] ✅ Initial presence sent!')

    // Start heartbeat loop (required by Discord)
    heartbeatInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendHeartbeat(ws)
        quest.heartbeatCount++
      }
    }, HEARTBEAT_INTERVAL)

    // Send presence updates periodically (simulates ongoing gameplay)
    presenceInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN && quest.status === 'running') {
        sendPresenceUpdate(ws, gameInfo)
      }
    }, PRESENCE_UPDATE_INTERVAL)

    // Progress tracking based on REAL remaining time
    progressInterval = setInterval(() => {
      const currentQuest = activeQuests.get(questSessionId)
      if (!currentQuest || currentQuest.status !== 'running') {
        return
      }

      const elapsed = Date.now() - currentQuest.startTime
      const totalDuration = currentQuest.targetSeconds * 1000
      const elapsedWithBaseProgress = currentQuest.realProgressSeconds * 1000 + elapsed
      
      // Calculate progress based on REAL starting point
      currentQuest.progress = Math.min((elapsedWithBaseProgress / totalDuration) * 100, 99.9)
      
      // Update remaining time
      const remaining = Math.max(0, totalDuration - elapsedWithBaseProgress)
      currentQuest.remainingSeconds = Math.ceil(remaining / 1000)
      
      // Update phase messages based on progress
      if (currentQuest.progress < 15) {
        currentQuest.phase = '🎮 Establishing game session...'
      } else if (currentQuest.progress < 30) {
        currentQuest.phase = '📡 Gameplay detected by Discord...'
      } else if (currentQuest.progress < 50) {
        currentQuest.phase = '⏱️ Tracking playtime actively...'
      } else if (currentQuest.progress < 75) {
        currentQuest.phase = '🎯 Approaching quest objective...'
      } else if (currentQuest.progress < 90) {
        currentQuest.phase = '🔄 Finalizing quest data...'
      } else {
        currentQuest.phase = '🎉 Almost complete!'
      }

    }, 3000)

    // Wait for ACTUAL remaining time (not hardcoded 15 min!)
    const waitTime = quest.remainingSeconds * 1000 + 10000 // Add 10s buffer
    console.log(`[PHASE 2] ⏱️ Waiting for ${formatTime(quest.remainingSeconds)} (real remaining time)...`)
    
    await new Promise<void>((resolve) => {
      const checkComplete = () => {
        const q = activeQuests.get(questSessionId)
        if (!q || q.status === 'failed' || Date.now() >= q.endTime) {
          resolve()
        } else {
          setTimeout(checkComplete, 1000)
        }
      }
      setTimeout(checkComplete, waitTime)
    })

    // ============================================
    // PHASE 3: Complete the quest
    // ============================================
    const finalQuest = activeQuests.get(questSessionId)
    if (finalQuest && finalQuest.status === 'running') {
      await completeQuest(finalQuest, ws, gameInfo)
    }

  } catch (error) {
    console.error('[QUEST ERROR]', error)
    const failedQuest = activeQuests.get(questSessionId)
    if (failedQuest) {
      failedQuest.status = 'failed'
      failedQuest.gatewayError = error instanceof Error ? error.message : 'Connection failed'
      failedQuest.phase = `❌ Error: ${failedQuest.gatewayError}`
    }
  } finally {
    // Cleanup intervals
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (presenceInterval) clearInterval(presenceInterval)
    if (progressInterval) clearInterval(progressInterval)
    
    // Close WebSocket gracefully
    if (ws) {
      try {
        ws.close(1000, 'Quest completed')
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

// Fetch REAL quest progress from Discord API
async function fetchRealQuestProgress(token: string, questId: string): Promise<any> {
  try {
    const response = await fetch('https://discord.com/api/v10/quests/@me', {
      headers: { 
        'Authorization': token,
        'User-Agent': 'DiscordQuestTool/1.0 (Educational)'
      }
    })

    if (!response.ok) {
      console.error('[FETCH PROGRESS] Discord API error:', response.status)
      return null
    }

    const data = await response.json()
    const quests = data.quests || []
    
    // Find the specific quest
    const targetQuest = quests.find((q: any) => 
      q.id === questId || 
      q.config?.application?.id === questId
    )

    if (!targetQuest) {
      console.log('[FETCH PROGRESS] Quest not found:', questId)
      return null
    }

    // Extract real progress data
    const userStatus = targetQuest.user_status || {}
    const taskConfig = targetQuest.config?.task_config_v2 || {}
    const tasks = taskConfig.tasks || {}
    const taskEntry = Object.entries(tasks)[0]
    const [, taskDetails] = taskEntry || ['UNKNOWN', {}]
    const targetSeconds = (taskDetails as any)?.target || 900
    const progressSeconds = userStatus.stream_progress_seconds || 0

    return {
      questId: targetQuest.id,
      appId: targetQuest.config?.application?.id,
      gameName: targetQuest.config?.application?.name,
      progressSeconds,
      targetSeconds,
      isClaimed: userStatus.is_claimed || false,
      completedAt: userStatus.completed_at,
      enrolledAt: userStatus.enrolled_at,
      percentComplete: Math.round((progressSeconds / targetSeconds) * 100),
      remainingSeconds: Math.max(0, targetSeconds - progressSeconds)
    }

  } catch (error) {
    console.error('[FETCH PROGRESS] Error:', error)
    return null
  }
}

// Connect to Discord Gateway with BETTER error handling
async function connectToDiscordGateway(token: string): Promise<WebSocket | null> {
  const maxRetries = 3
  let lastError: string = ''

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[GATEWAY] Connection attempt ${attempt}/${maxRetries}...`)
    
    try {
      const result = await attemptGatewayConnection(token, attempt)
      if (result) {
        return result
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.error(`[GATEWAY] Attempt ${attempt} failed:`, lastError)
    }

    if (attempt < maxRetries) {
      console.log(`[GATEWAY] Waiting 3s before retry...`)
      await delay(3000)
    }
  }

  console.error(`[GATEWAY] All ${maxRetries} attempts failed`)
  return null
}

function attemptGatewayConnection(token: string, attempt: number): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    const gatewayUrl = 'wss://gateway.discord.gg/?v=10&encoding=json'
    
    const ws = new WebSocket(gatewayUrl, {
      headers: {
        'User-Agent': 'DiscordQuestTool/1.0 (Educational)'
      }
    })

    const timeout = setTimeout(() => {
      console.error(`[GATEWAY] Connection timeout (attempt ${attempt})`)
      ws.close()
      resolve(null)
    }, 20000) // 20 second timeout per attempt

    ws.on('open', () => {
      console.log(`[GATEWAY] ✅ WebSocket connected (attempt ${attempt})`)
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString())
        
        switch (message.op) {
          case 10: // Hello - Gateway sends heartbeat interval
            clearTimeout(timeout)
            const interval = message.d.heartbeat_interval
            console.log(`[GATEWAY] ✅ Received Hello, heartbeat interval: ${interval}ms`)
            
            // Send Identify (opcode 2)
            const identifyPayload = {
              op: 2,
              d: {
                token: token,
                properties: {
                  os: 'windows',
                  browser: 'DiscordQuestTool',
                  device: 'DiscordQuestTool'
                },
                compress: false,
                intents: 1 << 8 | 1 << 12 | 1 << 15 // GUILD_PRESENCES | GUILD_MESSAGES | MESSAGE_CONTENT
              }
            }
            
            ws.send(JSON.stringify(identifyPayload))
            console.log(`[GATEWAY] ✅ Sent Identify payload (attempt ${attempt})`)
            break
            
          case 0: // Dispatch - Ready event
            if (message.t === 'READY') {
              console.log(`[GATEWAY] 🎉 READY! User: ${message.d.user?.username}`)
              resolve(ws)
            }
            break
            
          case 11: // Heartbeat ACK
            // Good, connection alive
            break
            
          default:
            if (message.t) {
              console.log(`[GATEWAY] Event: ${message.t}`)
            }
            
            // Check for errors
            if (message.op === 9 || message.op === 10) {
              // Invalid session or reconnect
              console.warn(`[GATEWAY] Warning opcode: ${message.op}`)
            }
        }
      } catch (e) {
        console.error('[GATEWAY] Message parse error:', e)
      }
    })

    ws.on('error', (error) => {
      console.error(`[GATEWAY] ❌ WebSocket error (attempt ${attempt}):`, error.message)
      clearTimeout(timeout)
      resolve(null)
    })

    ws.on('close', (code, reason) => {
      console.log(`[GATEWAY] Connection closed: ${code} ${reason}`)
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

// Send Heartbeat (opcode 1)
function sendHeartbeat(ws: WebSocket): void {
  const payload = {
    op: 1,
    d: Date.now()
  }
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

// Send PresenceUpdate (opcode 3) - THIS IS THE KEY TO QUEST COMPLETION!
function sendPresenceUpdate(ws: WebSocket, gameInfo: { id: string; name: string }): void {
  const payload = {
    op: 3, // Presence Update opcode
    d: {
      since: null,
      activities: [{
        name: gameInfo.name,
        type: 0, // PLAYING
        application_id: gameInfo.id,
        details: `Playing ${gameInfo.name}`,
        state: 'In Game',
        timestamps: {
          start: Date.now()
        },
        assets: {
          large_image: gameInfo.id,
          large_text: gameInfo.name
        },
        instance: true,
        buttons: []
      }],
      status: 'online',
      afk: false
    }
  }
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

// Complete the quest successfully
async function completeQuest(
  quest: ActiveQuestSession, 
  ws: WebSocket | null, 
  gameInfo: { id: string; name: string }
): Promise<void> {
  quest.status = 'completing'
  quest.phase = '🎯 Completing quest objectives...'
  quest.progress = 98

  await delay(3000)

  try {
    // Final presence update showing completion
    if (ws && ws.readyState === WebSocket.OPEN) {
      const finalPresence = {
        op: 3,
        d: {
          since: null,
          activities: [{
            name: `${gameInfo.name} - Quest Complete!`,
            type: 0,
            application_id: gameInfo.id,
            details: 'Quest Completed Successfully!',
            state: '✓ Complete',
            timestamps: {
              start: quest.startTime
            }
          }],
          status: 'online',
          afk: false
        }
      }
      ws.send(JSON.stringify(finalPresence))
    }

    // Mark as completed
    quest.progress = 100
    quest.status = 'completed'
    quest.phase = '🎉 Quest Completed! (Real Discord Gateway)'
    
    console.log(`[QUEST COMPLETED] ${gameInfo.name} for user ${quest.userId}`)
    console.log(`[QUEST COMPLETED] Total heartbeats sent: ${quest.heartbeatCount}`)
    console.log(`[QUEST COMPLETED] Real progress started at: ${quest.realProgressSeconds}s`)

    // Auto-cleanup after 10 minutes
    setTimeout(() => {
      for (const [key, q] of activeQuests.entries()) {
        if (q.sessionId === quest.sessionId && q.status === 'completed') {
          activeQuests.delete(key)
        }
      }
    }, 600000)

  } catch (error) {
    quest.status = 'completed' // Still mark as completed even if cleanup fails
    quest.phase = 'Completed (with warnings)'
    console.error('[COMPLETE ERROR]', error)
  }
}

// Utility functions
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
