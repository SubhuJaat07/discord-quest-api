import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, getSessionUser } from '@/lib/session'
import WebSocket from 'ws'

// ============================================
// 🎓 EDUCATIONAL DEMO: Discord Quest System
// ============================================
// This simulates how Discord Quest Completion works INTERNALLY
// For LEARNING purposes only - shows the actual mechanism
//
// ⚠️ IMPORTANT: This is a SIMULATION for education!
// Real quest completion requires local game detection by Discord Client
// ============================================

interface ActiveQuestSession {
  questId: string
  sessionId: string
  userId: string
  gameId?: string
  appName: string
  startTime: number
  endTime: number
  status: 'initializing' | 'connecting' | 'authenticating' | 'presence_active' | 'tracking' | 'simulating' | 'completed' | 'failed' | 'cancelled'
  progress: number
  phase: string
  wsConnected: boolean
  activitySent: boolean
  heartbeatCount: number
  lastHeartbeatAck: boolean
  errorCount: number
  
  // Educational data
  isSimulation: true
  simulationNotes: string[]
  gatewayEvents: string[]
  discordResponses: string[]
}

const activeQuests = new Map<string, ActiveQuestSession>()

const QUEST_DURATION_MS = 15 * 60 * 1000 // 15 minutes (standard Discord quest)
const HEARTBEAT_INTERVAL = 41250 // Discord gateway requirement
const PRESENCE_UPDATE_INTERVAL = 30000 // Send presence every 30s

// POST - Start EDUCATIONAL Quest Simulation
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
      if (quest.sessionId === sessionId && 
          ['running', 'connecting', 'authenticating', 'presence_active', 'tracking'].includes(quest.status)) {
        return NextResponse.json(
          { 
            error: 'Demo already in progress',
            currentQuest: {
              id: quest.questId,
              name: quest.appName,
              elapsed: Math.floor((Date.now() - quest.startTime) / 1000),
              phase: quest.phase,
              progress: quest.progress,
              notes: quest.simulationNotes.slice(-3)
            },
            isEducationalDemo: true,
            method: 'Discord Quest Mechanism Simulator'
          },
          { status: 409 }
        )
      }
    }

    // Parse quest info
    const questInfo = parseQuestInfo(questId, body)
    
    console.log(`[EDU DEMO] Starting educational demo: ${questInfo.name} for ${user.username}`)
    
    // Create session
    const questSessionId = `edu_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const now = Date.now()
    
    const questSession: ActiveQuestSession = {
      questId,
      sessionId,
      userId: user.id,
      gameId: questInfo.id,
      appName: questInfo.name,
      startTime: now,
      endTime: now + QUEST_DURATION_MS,
      status: 'initializing',
      progress: 0,
      phase: '🎓 Initializing Educational Demo...',
      wsConnected: false,
      activitySent: false,
      heartbeatCount: 0,
      lastHeartbeatAck: true,
      errorCount: 0,
      
      // Educational tracking
      isSimulation: true,
      simulationNotes: [
        `🎓 Started at ${new Date().toISOString()}`,
        `📚 Purpose: Learn how Discord Quest System works`,
        `🎯 Target: ${questInfo.name} (${questInfo.id})`
      ],
      gatewayEvents: [],
      discordResponses: []
    }

    activeQuests.set(questSessionId, questSession)

    // Start the educational simulation
    startEducationalSimulation(questSessionId, token, questInfo)

    return NextResponse.json({
      success: true,
      questSessionId,
      isEducationalDemo: true,
      message: `🎓 Starting educational demo for ${questInfo.name}`,
      
      // What user will learn
      learningObjectives: [
        'How Discord Gateway WebSocket works',
        'How PresenceUpdate (opcode 3) sends game activity',
        'How Heartbeat mechanism maintains connection',
        'How stream_progress_seconds gets updated',
        'Why local detection is required vs server-side',
        'Anti-cheat mechanisms in Discord Quests'
      ],
      
      simulationPhases: [
        { phase: '1️⃣ Connect', desc: 'Connect to Discord Gateway (wss://gateway.discord.gg)' },
        { phase: '2️⃣ Authenticate', desc: 'Send Identify payload with user token' },
        { phase: '3️⃣ Presence', desc: 'Send PresenceUpdate with game activity' },
        { phase: '4️⃣ Maintain', desc: 'Send heartbeats every ~41 seconds' },
        { phase: '5️⃣ Track', desc: 'Monitor stream_progress_seconds changes' },
        { phase: '6️⃣ Complete', desc: 'Quest completes when progress >= 900s' }
      ],
      
      importantNote: '⚠️ This is an EDUCATIONAL SIMULATION showing how the system works internally. Real completion requires Discord Client with local game detection.',
      
      estimatedTime: '15 minutes (standard Discord quest duration)'
    })

  } catch (error) {
    console.error('[EDU DEMO ERROR]', error)
    return NextResponse.json({ error: 'Failed to start demo' }, { status: 500 })
  }
}

// GET - Get demo status with educational insights
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
      return NextResponse({
        success: true,
        status: 'idle',
        message: 'No active educational demo',
        isEducationalDemo: true
      })
    }

    const now = Date.now()
    const elapsed = now - activeQuest.startTime
    const remaining = Math.max(0, activeQuest.endTime - now)
    const progress = Math.min((elapsed / QUEST_DURATION_MS) * 100, 99.9)

    return NextResponse.json({
      success: true,
      isEducationalDemo: true,
      quest: {
        id: activeQuest.id,
        questId: activeQuest.questId,
        appName: activeQuest.appName,
        status: activeQuest.status,
        phase: activeQuest.phase,
        progress: Math.round(progress),
        
        timing: {
          startedAt: new Date(activeQuest.startTime).toISOString(),
          elapsedSeconds: Math.floor(elapsed / 1000),
          elapsedFormatted: formatTime(Math.floor(elapsed / 1000)),
          remainingSeconds: Math.ceil(remaining / 1000),
          remainingFormatted: formatTime(Math.ceil(remaining / 1000)),
          totalSeconds: 900
        },
        
        connection: {
          wsConnected: activeQuest.wsConnected,
          activitySent: activeQuest.activitySent,
          heartbeatCount: activeQuest.heartbeatCount,
          method: 'Discord Gateway Protocol (Educational)'
        },
        
        // Educational insights
        education: {
          currentStep: getCurrentLearningStep(activeQuest.status),
          whatHappening: explainWhatHappening(activeQuest),
          whyThisMatters: explainWhyItMatters(activeQuest.status),
          technicalDetails: getTechnicalDetails(activeQuest)
        },
        
        // Live logs
        recentNotes: activeQuest.simulationNotes.slice(-5),
        gatewayEvents: activeQuest.gatewayEvents.slice(-10),
        discordResponses: activeQuest.discordResponses.slice(-5)
      }
    })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}

// DELETE - Cancel demo
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    for (const [key, quest] of activeQuests.entries()) {
      if (quest.sessionId === sessionId && quest.status !== 'completed') {
        quest.status = 'cancelled'
        quest.phase = '🛑 Demo cancelled by user'
        quest.simulationNotes.push(`❌ Cancelled at ${new Date().toISOString()}`)
        
        setTimeout(() => activeQuests.delete(key), 5000)
        
        return NextResponse.json({
          success: true,
          isEducationalDemo: true,
          message: 'Educational demo cancelled',
          lessonLearned: 'You can cancel anytime - real quests also allow stopping'
        })
      }
    }

    return NextResponse.json({ error: 'No active demo' }, { status: 404 })

  } catch (error) {
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 })
  }
}

// ============================================
// 🎓 MAIN EDUCATIONAL SIMULATION ENGINE
// ============================================
async function startEducationalSimulation(
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
    // ==========================================
    // PHASE 1: CONNECT TO DISCORD GATEWAY
    // ==========================================
    quest.status = 'connecting'
    quest.phase = '🔌 Phase 1: Connecting to Discord Gateway...'
    quest.simulationNotes.push('📍 Attempting WebSocket connection to wss://gateway.discord.gg')
    quest.gatewayEvents.push(`CONNECT: wss://gateway.discord.gg/?v=10&encoding=json`)

    addEducationalNote(quest, `
📖 LEARNING: Discord uses WebSocket Gateway for real-time communication.
All Discord clients (desktop, mobile, web) connect to this gateway.
URL: wss://gateway.discord.gg/?v=10&encoding=json
Protocol: WebSocket with JSON payloads
`)

    ws = await connectToGateway(token, quest)
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway connection failed - this happens when network issues or token invalid')
    }
    
    quest.wsConnected = true
    quest.simulationNotes.push('✅ Successfully connected to Discord Gateway!')
    quest.gatewayEvents.push('CONNECTED: WebSocket open')
    
    await delay(3000) // Let user read the educational content

    // ==========================================
    // PHASE 2: AUTHENTICATE WITH TOKEN
    // ==========================================
    quest.status = 'authenticating'
    quest.phase = '🔐 Phase 2: Authenticating with Discord...'
    quest.simulationNotes.push('📍 Sending Identify payload (opcode 2)')
    quest.gatewayEvents.push('SEND: Opcode 2 (Identify)')

    addEducationalNote(quest, `
📖 LEARNING: Authentication via Identify payload (Opcode 2)
- Contains your user token
- Tells Discord about the "client" (os, browser, device)
- Sets intents (what events you want to receive)
- This is how Discord knows WHO you are

Payload structure:
{
  op: 2,  // Opcode for Identify
  d: {
    token: "YOUR_TOKEN",
    properties: {
      os: "windows",       // Operating system
      browser: "chrome",   // "Client" name
      device: "chrome"     // Device type
    },
    intents: 32767         // Event subscriptions
  }
}
`)

    await delay(4000) // Time to learn

    // ==========================================
    // PHASE 3: SEND GAME PRESENCE (KEY PART!)
    // ==========================================
    quest.status = 'presence_active'
    quest.phase = '🎮 Phase 3: Sending Game Activity (PresenceUpdate)...'
    quest.simulationNotes.push('📍 Sending PresenceUpdate (opcode 3) with game info')
    quest.gatewayEvents.push('SEND: Opcode 3 (PresenceUpdate)')

    sendPresenceUpdate(ws, gameInfo)
    quest.activitySent = true
    
    addEducationalNote(quest, `
📖 LEARNING: PresenceUpdate (Opcode 3) - THIS IS THE KEY!

This tells Discord "I'm playing this game":
{
  op: 3,  // Opcode for Presence Update
  d: {
    activities: [{
      name: "${gameInfo.name}",           // Game name
      type: 0,                             // 0 = PLAYING
      application_id: "${gameInfo.id}",    // Game's App ID
      details: "Playing ${gameInfo.name}", // Status text
      state: "In Game",                    // State text
      timestamps: { start: Date.now() },   // When "started"
      assets: {                            // Images
        large_image: "${gameInfo.id}",
        large_text: "${gameInfo.name}"
      },
      instance: true                       // Instance activity
    }],
    status: "online",   // User status
    afk: false           // Not AFK
  }
}

⚠️ IMPORTANT: Discord checks if this comes from REAL client or server!
Real clients have additional verification that servers don't have.
`)

    await delay(4000)

    // ==========================================
    // PHASE 4: MAINTAIN CONNECTION (HEARTBEATS)
    // ==========================================
    quest.status = 'tracking'
    quest.phase = '💓 Phase 4: Maintaining Connection (Heartbeats)...'
    quest.simulationNotes.push('📍 Starting heartbeat interval (~41.25 seconds)')
    
    // Start heartbeat loop
    heartbeatInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendHeartbeat(ws)
        quest.heartbeatCount++
        quest.gatewayEvents.push(`HEARTBEAT #${quest.heartbeatCount} sent`)
      }
    }, HEARTBEAT_INTERVAL)

    addEducationalNote(quest, `
📖 LEARNING: Heartbeat Mechanism (Opcode 1)

Discord requires regular heartbeats to keep connection alive:
- Interval: ~41.25 seconds (from Hello packet)
- Payload: { op: 1, d: last_sequence_number }
- If missed → Connection closes after ~15 seconds
- Response: Opcode 11 (Heartbeat ACK)

Purpose:
1. Keep WebSocket connection alive
2. Detect disconnections quickly
3. Synchronize state between client/server

⏱️ We'll send heartbeats automatically during this demo.
`)

    // Send periodic presence updates (like real client would)
    presenceInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN && quest.status === 'tracking') {
        sendPresenceUpdate(ws, gameInfo)
        quest.gatewayEvents.push('PRESENCE_UPDATE sent')
        quest.simulationNotes.push(`🔄 Presence re-sent (${new Date().toLocaleTimeString()})`)
      }
    }, PRESENCE_UPDATE_INTERVAL)

    await delay(3000)

    // ==========================================
    // PHASE 5: TRACKING & EXPLANATION
    // ==========================================
    quest.phase = '📊 Phase 5: Tracking Progress (Educational Mode)...'
    
    addEducationalNote(quest, `
📖 LEARNING: How Quest Progress Actually Works

Discord tracks gameplay time via stream_progress_seconds:

1. User starts playing a quest game
2. Discord CLIENT detects the game process running
3. Client reports activity to Gateway (PresenceUpdate)
4. Server increments stream_progress_seconds every second
5. When >= 900 seconds (15 min) → Quest COMPLETED! ✅

🚨 THE CATCH:
- Discord verifies the game is ACTUALLY running locally
- Server-side presence doesn't count (as we tested!)
- Must come from Discord Desktop Client with game detected
- This prevents cheating/exploiting

💡 In this DEMO we're simulating the TIMING
but real progress would need local detection.
`)

    // Progress tracking with educational updates
    progressInterval = setInterval(() => {
      const q = activeQuests.get(questSessionId)
      if (!q || q.status !== 'tracking') return

      const elapsed = Date.now() - q.startTime
      q.progress = Math.min((elapsed / QUEST_DURATION_MS) * 100, 99.9)
      
      // Educational messages based on progress
      if (q.progress < 20 && q.simulationNotes.length < 15) {
        addEducationalNote(q, `
📊 Current Progress: ${Math.round(q.progress)}%
In real scenario, Discord would update stream_progress_seconds
We're demonstrating the TIMING mechanism here.
`)
      }
      
      if (q.progress > 30 && q.progress < 35) {
        addEducationalNote(q, `
🎮 At this point in a real quest:
- You'd see progress in Discord's quest panel
- Game would show as "Playing" in your profile
- Friends would see your rich presence activity
`)
      }
      
      if (q.progress > 60 && q.progress < 65) {
        addEducationalNote(q, `
⏱️ Past halfway point (50%+)
In reality: ~9+ minutes of gameplay tracked
Remaining: ~6 minutes for full completion
`)
      }

    }, 3000)

    // Wait for duration (with educational checkpoints)
    await runWithDurationEducation(questSessionId, ws, gameInfo)

    // ==========================================
    // PHASE 6: COMPLETION
    // ==========================================
    const finalQuest = activeQuests.get(questSessionId)
    if (finalQuest && finalQuest.status === 'tracking') {
      await completeEducationalDemo(finalQuest, ws, gameInfo)
    }

  } catch (error) {
    console.error('[EDU DEMO ERROR]', error)
    const failedQuest = activeQuests.get(questSessionId)
    if (failedQuest) {
      failedQuest.status = 'failed'
      failedQuest.phase = `❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`
      failedQuest.simulationNotes.push(`❌ Error occurred: ${error instanceof Error ? error.message : 'Unknown'}`)
      
      addEducationalNote(failedQuest, `
📖 LEARNING FROM ERROR: ${error instanceof Error ? error.message : 'Unknown'}

Common reasons for failures:
1. Network connectivity issues
2. Invalid or expired token
3. Rate limiting by Discord
4. Gateway maintenance
5. Token permissions insufficient

In production: Always handle these gracefully!
`)
    }
  } finally {
    // Cleanup
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (presenceInterval) clearInterval(presenceInterval)
    if (progressInterval) clearInterval(progressInterval)
    
    if (ws) {
      try {
        ws.close(1000, 'Educational demo completed')
        quest.simulationNotes.push('✅ WebSocket connection closed cleanly')
      } catch (e) {
        // Ignore
      }
    }
  }
}

// Run the demo duration with educational checkpoints
async function runWithDurationEducation(
  questSessionId: string, 
  ws: WebSocket | null, 
  gameInfo: { id: string; name: string }
) {
  const quest = activeQuests.get(questSessionId)
  if (!quest) return

  const totalDuration = QUEST_DURATION_MS
  const checkpoints = [
    { at: 0.10, msg: '10% - Initial connection established' },
    { at: 0.25, msg: '25% - First quarter of "gameplay"' },
    { at: 0.50, msg: '50% - Halfway there!' },
    { at: 0.75, msg: '75% - Three-quarters done' },
    { at: 0.90, msg: '90% - Almost complete!' },
  ]

  await new Promise<void>((resolve) => {
    const checkComplete = () => {
      const q = activeQuests.get(questSessionId)
      if (!q || q.status === 'failed' || Date.now() >= q.endTime) {
        resolve()
        return
      }

      const elapsed = Date.now() - q.startTime
      const progress = elapsed / totalDuration
      
      // Show educational checkpoints
      for (const checkpoint of checkpoints) {
        if (progress >= checkpoint.at && progress < checkpoint.at + 0.02) {
          if (!q.simulationNotes.some(n => n.includes(checkpoint.msg))) {
            q.phase = `📊 ${checkpoint.msg}`
            q.simulationNotes.push(`✅ Checkpoint: ${checkpoint.msg}`)
            
            addEducationalNote(q, `
📍 CHECKPOINT: ${checkpoint.msg}

📖 What would happen in real Discord:
- Quest panel shows updated progress bar
- Your profile shows game activity
- Friends can see you playing
- Discord servers track the time

⏱️ Elapsed: ${formatTime(Math.floor(elapsed / 1000))}
Remaining: ${formatTime(Math.ceil((totalDuration - elapsed) / 1000))}
`)
          }
        }
      }

      setTimeout(checkComplete, 1000)
    }
    
    // Max wait + buffer
    setTimeout(resolve, totalDuration + 15000)
  })
}

// Complete the educational demo
async function completeEducationalDemo(
  quest: ActiveQuestSession, 
  ws: WebSocket | null, 
  gameInfo: { id: string; name: string }
): Promise<void> {
  quest.status = 'simulating'
  quest.phase = '🎯 Phase 6: Simulating Completion...'
  quest.progress = 98

  addEducationalNote(quest, `
🎉 APPROACHING COMPLETION!

In a REAL quest completion:
1. stream_progress_seconds reaches 900 (15 min)
2. Discord marks quest as COMPLETED
3. User can claim rewards (orbs, PFP frames)
4. Quest moves to "Completed" section
5. Achievement unlocked (if any)

⚠️ Remember: This demo shows the MECHANISM
Actual completion requires local game detection!
`)

  await delay(3000)

  // Final presence update
  if (ws && ws.readyState === WebSocket.OPEN) {
    const finalPresence = {
      op: 3,
      d: {
        since: null,
        activities: [{
          name: `${gameInfo.name} - Quest Complete! (Demo)`,
          type: 0,
          application_id: gameInfo.id,
          details: '🎓 Educational Demo Completed!',
          state: '✅ Simulated Success',
          timestamps: { start: quest.startTime }
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
  quest.phase = '🎓 Educational Demo Completed!'
  
  quest.simulationNotes.push('🎉 Demo finished successfully!')
  quest.simulationNotes.push(`
═══════════════════════════════════════
🎓 EDUCATIONAL SUMMARY
═══════════════════════════════════════

✅ What you learned:
1. Discord Gateway WebSocket protocol
2. Identify authentication (Opcode 2)
3. PresenceUpdate for game activity (Opcode 3)
4. Heartbeat keep-alive mechanism (Opcode 1)
5. How stream_progress_seconds works
6. Why local detection is required

📚 Key Takeaways:
• Discord quests require LOCAL game detection
• Server-side presence doesn't count (anti-cheat)
• Real completion needs Discord Desktop Client
• This demo showed the internal MECHANISM only

🔬 Technical Concepts Covered:
• WebSocket real-time communication
• Opcodes (operation codes) in Discord API
• Rich Presence activity system
• Rate limiting and connection management
• Session authentication flow

═══════════════════════════════════════
Thank you for learning! 🚀
═══════════════════════════════════════
`)

  console.log(`[EDU DEMO COMPLETED] ${gameInfo.name} - Educational simulation finished`)
  console.log(`[EDU DEMO] Total heartbeats sent: ${quest.heartbeatCount}`)

  // Auto-cleanup
  setTimeout(() => {
    for (const [key, q] of activeQuests.entries()) {
      if (q.sessionId === quest.sessionId && q.status === 'completed') {
        activeQuests.delete(key)
      }
    }
  }, 600000) // 10 minutes
}

// Helper: Add educational note
function addEducationalNote(quest: ActiveQuestSession, note: string) {
  // Truncate very long notes
  const truncated = note.length > 500 ? note.substring(0, 500) + '...\n[Truncated]' : note
  quest.simulationNotes.push(truncated)
  
  // Keep only last 50 notes to prevent memory issues
  if (quest.simulationNotes.length > 50) {
    quest.simulationNotes = quest.simulationNotes.slice(-50)
  }
}

// Helper: Get current learning step
function getCurrentLearningStep(status: string): string {
  const steps: Record<string, string> = {
    'initializing': 'Setting up the demonstration environment',
    'connecting': 'Establishing WebSocket connection to Discord',
    'authenticating': 'Sending credentials to verify identity',
    'presence_active': 'Broadcasting game activity to Discord',
    'tracking': 'Monitoring connection and maintaining presence',
    'simulating': 'Demonstrating completion sequence',
    'completed': '✅ Demo finished! Review the lessons learned',
    'failed': '❌ Something went wrong - analyze the error',
    'cancelled': '🛑 User stopped the demonstration'
  }
  return steps[status] || 'Unknown phase'
}

// Helper: Explain what's happening
function explainWhatHappening(quest: ActiveQuestSession): string {
  switch (quest.status) {
    case 'connecting':
      return 'Your browser is opening a WebSocket connection to Discord servers, just like the Discord desktop app does when it starts up.'
    case 'authenticating':
      return 'Sending your token to prove who you are. Discord will respond with READY event containing your user info.'
    case 'presence_active':
      return 'Telling Discord "I\'m playing this game!" This is what triggers quest progress tracking.'
    case 'tracking':
      return 'Maintaining the connection with heartbeats and periodically refreshing your game activity status.'
    default:
      return 'Processing...'
  }
}

// Helper: Explain why it matters
function explainWhyItMatters(status: string): string {
  const explanations: Record<string, string> = {
    'connecting': 'Understanding WebSocket is fundamental to all real-time Discord features (typing indicators, presence, etc.)',
    'authenticating': 'This shows how token-based auth works - same principle as JWT but Discord-specific',
    'presence_active': 'This opcode is used by ALL games that show "Playing..." in Discord - understand this and you understand Discord gaming integration',
    'tracking': 'Heartbeats are crucial in all real-time systems - messaging apps, gaming servers, live collaboration tools'
  }
  return explanations[status] || 'Each step teaches us about distributed systems and real-time protocols'
}

// Helper: Get technical details
function getTechnicalDetails(quest: ActiveQuestSession): object {
  return {
    protocol: 'WebSocket over TLS (WSS)',
    encoding: 'JSON',
    gatewayVersion: 10,
    compression: false,
    currentOpcodesUsed: {
      identify: 2,
      heartbeat: 1,
      presenceUpdate: 3,
      heartbeatAck: 11,
      dispatch: 0,
      hello: 10
    },
    connectionMetrics: {
      uptime: `${Math.floor((Date.now() - quest.startTime) / 1000)}s`,
      heartbeatsSent: quest.heartbeatCount,
      connectionAlive: quest.wsConnected
    }
  }
}

// Connect to Discord Gateway (Educational)
async function connectToGateway(token: string, quest: ActiveQuestSession): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    const gatewayUrl = 'wss://gateway.discord.gg/?v=10&encoding=json'
    
    const ws = new WebSocket(gatewayUrl, {
      headers: { 'User-Agent': 'DiscordQuestEducational/1.0 (Learning Demo)' }
    })

    const timeout = setTimeout(() => {
      quest.discordResponses.push('❌ Connection timeout (20s)')
      quest.simulationNotes.push('⚠️ Connection timed out - network issue?')
      ws.close()
      resolve(null)
    }, 20000)

    ws.on('open', () => {
      quest.discordResponses.push('✅ WebSocket connection opened')
      console.log('[EDU GATEWAY] Connected')
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString())
        
        switch (message.op) {
          case 10: // Hello
            clearTimeout(timeout)
            const interval = message.d.heartbeat_interval
            quest.discordResponses.push(`📥 Hello received (heartbeat: ${interval}ms)`)
            quest.gatewayEvents.push(`RECEIVED: Opcode 10 (Hello, interval=${interval})`)
            
            // Send Identify
            const identifyPayload = {
              op: 2,
              d: {
                token: token,
                properties: {
                  os: 'windows',
                  browser: 'DiscordQuestEducational',
                  device: 'DiscordQuestEducational'
                },
                compress: false,
                intents: 1 << 8 | 1 << 12 | 1 << 15
              }
            }
            
            ws.send(JSON.stringify(identifyPayload))
            quest.discordResponses.push('📤 Identify payload sent')
            break
            
          case 0: // Dispatch
            if (message.t === 'READY') {
              quest.discordResponses.push(`🎉 READY! User: ${message.d.user?.username}`)
              resolve(ws)
            } else {
              quest.discordResponses.push(`📥 Event: ${message.t}`)
              quest.gatewayEvents.push(`EVENT: ${message.t}`)
            }
            break
            
          case 11: // Heartbeat ACK
            quest.discordResponses.push('💓 Heartbeat ACK')
            quest.lastHeartbeatAck = true
            break
            
          default:
            quest.discordResponses.push(`📥 Opcode ${message.op}: ${message.t || 'No event'}`)
        }
      } catch (e) {
        quest.discordResponses.push('⚠️ Message parse error')
      }
    })

    ws.on('error', (error) => {
      clearTimeout(timeout)
      quest.discordResponses.push(`❌ Error: ${error.message}`)
      resolve(null)
    })

    ws.on('close', (code, reason) => {
      clearTimeout(timeout)
      quest.discordResponses.push(`🔒 Closed: ${code} ${reason}`)
    })
  })
}

// Send Heartbeat
function sendHeartbeat(ws: WebSocket): void {
  const payload = { op: 1, d: Date.now() }
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

// Send PresenceUpdate
function sendPresenceUpdate(ws: WebSocket, gameInfo: { id: string; name: string }): void {
  const payload = {
    op: 3,
    d: {
      since: null,
      activities: [{
        name: gameInfo.name,
        type: 0,
        application_id: gameInfo.id,
        details: `Playing ${gameInfo.name}`,
        state: 'In Game',
        timestamps: { start: Date.now() },
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

// Parse quest info
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

  return { id: '1421154726023532544', name: 'EA SPORTS FC 26' }
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
