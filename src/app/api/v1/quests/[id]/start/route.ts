import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission, getApiKeyToken } from '@/lib/api-keys'
import {
  startWebClientQuest,
  getWebClientSessionStatus,
  getActiveWebClientSessions
} from '@/lib/webclient-activity'

// ============================================
// 🌐 Discord Web Client Activity Injection API
// ============================================
// 
// This endpoint uses Puppeteer to control Discord's ACTUAL web client
// and inject game activity through Discord's own JavaScript runtime.
//
// What actually happens:
// 1. Launches REAL headless Chrome browser
// 2. Opens Discord.com with user's token (legitimate login)
// 3. Hooks into Discord's WebSocket connection
// 4. Injects game activity into presence updates (op: 3)
// 5. Discord sees it as legitimate gameplay → QUEST COMPLETE!
// ============================================

interface GameInfo {
  appId: string
  gameName: string
  requiredMinutes: number
}

// POST - Start Quest Completion via Web Client Injection
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

    const keyData = keyCheck as NonNullable<typeof keyData>

    // Check permissions
    if (!hasPermission(keyData, 'quests:start')) {
      return NextResponse.json(
        { error: 'Requires quests:start permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // Get token from API key
    const token = getApiKeyToken(apiKey)
    if (!token) {
      return NextResponse.json(
        { error: 'Session expired. Re-authenticate.', code: 'SESSION_EXPIRED' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { appId, gameName, customConfig } = body

    // Check for existing active sessions for this user
    const activeSessions = getActiveWebClientSessions()
    for (const [, session] of activeSessions.entries()) {
      if (session.userId === keyData.user.id && 
          ['launching', 'authenticating', 'setting_activity', 'running'].includes(session.status)) {
        return NextResponse.json({
          error: 'Quest already in progress',
          code: 'QUEST_IN_PROGRESS',
          currentSession: {
            id: session.id,
            questId: session.questId,
            gameName: session.gameName,
            elapsed: Math.floor((Date.now() - session.startTime.getTime()) / 1000),
            status: session.status,
            method: '🌐 Web Client'
          },
          hint: 'Use the status endpoint to check progress or cancel endpoint to stop it'
        }, { status: 409 })
      }
    }

    // Resolve game info
    const gameInfo = resolveGameInfo(questId, appId, gameName)

    // Start the WebClient quest completion
    const result = await startWebClientQuest(
      token,
      questId,
      gameInfo.appId,
      gameInfo.gameName,
      keyData.user.id,
      customConfig ? {
        ...customConfig,
        headless: true,
        timeout: 60000,
        activityUpdateInterval: 25000
      } : undefined
    )

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.message,
        code: 'START_FAILED'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: result.success,
      sessionId: result.sessionId,
      message: `🌐 Starting ${gameInfo.gameName} via Discord Web Client...`,
      
      questDetails: {
        questId,
        gameId: gameInfo.appId,
        gameName: gameInfo.gameName,
        requiredMinutes: gameInfo.requiredMinutes,
      },
      
      whatHappensNext: [
        '🌐 Launching Chromium browser...',
        '📂 Opening discord.com/app...',
        '🔐 Injecting your auth token...',
        '🎣 Hooking into Discord WebSocket...',
        '💉 Injecting game activity into presence...',
        `⏱️ After ~${gameInfo.requiredMinutes} minutes → QUEST COMPLETE!`
      ],
      
      technicalDetails: {
        method: 'Discord Web Client + WebSocket Hook',
        detectionType: 'Legitimate Presence Update (op: 3)',
        presenceInterval: '25 seconds',
        whyThisWorks: "Uses Discord's OWN client - not faking!"
      },
      
      endpoints: {
        status: `/api/v1/quests/${questId}/status?session=${result.sessionId}`,
        cancel: `/api/v1/quests/${questId}/cancel?session=${result.sessionId}`,
        docs: '/api/v1/docs'
      }
    })

  } catch (error) {
    console.error('[WEBCLIENT START] Error:', error)
    
    return NextResponse.json({
      error: 'Failed to start quest completion',
      code: 'START_FAILED',
      details: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Check server logs for detailed error information'
    }, { status: 500 })
  }
}

// GET - Get current status of quest completion (if running)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: questId } = await params
    const sessionParam = request.nextUrl.searchParams.get('session')
    
    // If session ID provided, get specific session status
    if (sessionParam) {
      const status = getWebClientSessionStatus(sessionParam)
      if (!status) {
        return NextResponse.json({
          error: 'Session not found or expired',
          code: 'SESSION_NOT_FOUND'
        }, { status: 404 })
      }
      
      const elapsed = status.totalSeconds
      const requiredSeconds = 900
      const progress = Math.min((elapsed / requiredSeconds) * 100, 99.9)
      
      return NextResponse.json({
        success: true,
        sessionId: status.id,
        status: status.status,
        method: '🌐 Discord Web Client Injection',
        
        quest: {
          questId: status.questId,
          gameName: status.gameName,
          appId: status.appId
        },

        progress: {
          percent: Math.round(progress * 100) / 100,
          elapsedSeconds: elapsed,
          remainingSeconds: Math.max(0, requiredSeconds - elapsed)
        },
        
        timing: {
          startedAt: status.startTime.toISOString(),
          lastActivityUpdate: status.lastActivityUpdate?.toISOString(),
          currentTime: new Date().toISOString()
        },
        
        discordConfirmed: status.discordConfirmed || false
      })
    }
    
    // Otherwise, check if any session exists for this quest
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
    
    // Find active sessions for this user and quest
    const activeSessions = getActiveWebClientSessions()
    const userSessions = Array.from(activeSessions.values())
      .filter(s => s.userId === keyData.user.id && s.questId === questId)
    
    if (userSessions.length === 0) {
      return NextResponse.json({
        success: true,
        activeSessions: [],
        message: 'No active sessions found for this quest'
      })
    }
    
    return NextResponse.json({
      success: true,
      activeSessions: userSessions.map(s => ({
        id: s.id,
        status: s.status,
        totalSeconds: s.totalSeconds,
        startedAt: s.startTime.toISOString()
      }))
    })
    
  } catch (error) {
    console.error('[WEBCLIENT STATUS] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get status', code: 'STATUS_ERROR' },
      { status: 500 }
    )
  }
}

// ============================================
// Game Info Resolution
// ============================================

function resolveGameInfo(
  questId: string, 
  providedAppId?: string, 
  providedGameName?: string
): GameInfo {
  if (providedAppId && providedGameName) {
    return {
      appId: providedAppId,
      gameName: providedGameName,
      requiredMinutes: 15
    }
  }

  const KNOWN_GAMES: Record<string, GameInfo> = {
    '1421154726023532544': { appId: '1421154726023532544', gameName: 'EA SPORTS FC 26', requiredMinutes: 15 },
    '1437509662303059998': { appId: '1437509662303059998', gameName: 'Where Winds Meet', requiredMinutes: 15 },
    '1470616226995765409': { appId: '1470616226995765409', gameName: 'Neverness to Everness', requiredMinutes: 15 },
    '363445589247131668': { appId: '363445589247131668', gameName: 'Roblox', requiredMinutes: 15 },
    '1257819671114289184': { appId: '1257819671114289184', gameName: 'Zenless Zone Zero', requiredMinutes: 15 },
    '700136079562375258': { appId: '700136079562375258', gameName: 'VALORANT', requiredMinutes: 15 },
    '1247227126416146462': { appId: '1247227126416146462', gameName: 'Wuthering Waves', requiredMinutes: 15 },
    '1461154307171811401': { appId: '1461154307171811401', gameName: 'Arknights: Endfield', requiredMinutes: 15 },
    '1180205756998488064': { appId: '1180205756998488064', gameName: 'Old School RuneScape', requiredMinutes: 15 },
    '1402418586244612216': { appId: '1402418586244612216', gameName: 'Warframe', requiredMinutes: 15 },
    '1140238527980916757': { appId: '1140238527980916757', gameName: 'Yu-Gi-Oh! Master Duel', requiredMinutes: 15 },
    '1314682894106497096': { appId: '1314682894106497096', gameName: 'Delta Force', requiredMinutes: 15 },
    '1162085521816813721': { appId: '1162085521816813721', gameName: 'Escape the Backrooms', requiredMinutes: 15 },
    '1506481295700529172': { appId: '1506481295700529172', gameName: 'EMPULSE', requiredMinutes: 15 },
    '1440130372162682961': { appId: '1440130372162682961', gameName: 'GOALS', requiredMinutes: 15 },
    '1515074184961724517': { appId: '1515074184961724517', gameName: 'The Mound: Omen of Cthulhu', requiredMinutes: 15 }
  }

  if (KNOWN_GAMES[questId]) {
    return KNOWN_GAMES[questId]
  }

  console.warn(`[WEBCLIENT] Unknown quest ID: ${questId}, using default`)
  return {
    appId: questId,
    gameName: `Unknown Game (${questId})`,
    requiredMinutes: 15
  }
}
