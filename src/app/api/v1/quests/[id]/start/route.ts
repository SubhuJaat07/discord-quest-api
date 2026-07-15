import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission, getApiKeyToken } from '@/lib/api-keys'
import {
  startChromiumQuest,
  getChromiumSessionStatus,
  getActiveSessions
} from '@/lib/chromium-client'

// ============================================
// 🚀 Chromium-Based Quest Completion API
// ============================================
// 
// This endpoint starts a REAL browser automation session using Puppeteer.
// It launches an actual Chromium instance that:
// 1. Opens Discord web app with user's token
// 2. Injects activity scripts that hook into Discord's internal systems
// 3. Sends presence updates that mimic real game detection
// 4. Maintains connection for required duration (default 15 min)
//
// This is NOT a simulation - it uses real browser automation!
// ============================================

interface GameInfo {
  appId: string
  gameName: string
  requiredMinutes: number
}

// POST - Start Quest Completion via Chromium Browser
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
    const activeSessions = getActiveSessions()
    for (const [, session] of activeSessions.entries()) {
      if (session.userId === keyData.user.id && 
          ['launching', 'authenticating', 'active'].includes(session.status)) {
        return NextResponse.json({
          error: 'Quest already in progress',
          code: 'QUEST_IN_PROGRESS',
          currentSession: {
            id: session.id,
            questId: session.questId,
            gameName: session.gameName,
            elapsed: Math.floor((Date.now() - session.startTime) / 1000),
            progress: Math.round(session.progress * 100) / 100,
            phase: session.phase,
            status: session.status
          },
          hint: 'Use the status endpoint to check progress or cancel endpoint to stop it'
        }, { status: 409 })
      }
    }

    // Resolve game info
    const gameInfo = resolveGameInfo(questId, appId, gameName)

    // Start the Chromium quest completion
    const result = await startChromiumQuest(
      token,
      questId,
      gameInfo.appId,
      gameInfo.gameName,
      keyData.user.id,
      customConfig ? {
        ...customConfig,
        debugLogs: true,
        stealthMode: true
      } : undefined
    )

    return NextResponse.json({
      success: result.success,
      sessionId: result.sessionId,
      message: `🚀 Starting ${gameInfo.gameName} quest completion...`,
      
      questDetails: {
        questId,
        gameId: gameInfo.appId,
        gameName: gameInfo.gameName,
        requiredMinutes: gameInfo.requiredMinutes,
        estimatedCompletion: result.estimatedCompletion
      },
      
      whatHappensNext: [
        '🌐 Real Chromium browser is launching',
        '🔐 Your token is being used to authenticate',
        '🎮 Activity injection script will be loaded',
        '💓 Presence updates will be sent every 25 seconds',
        `⏱️ After ~${gameInfo.requiredMinutes} minutes, quest should complete`
      ],
      
      technicalDetails: {
        method: 'Puppeteer Browser Automation',
        detectionType: 'Local Activity Simulation',
        presenceInterval: '25 seconds',
        heartbeatInterval: '40 seconds',
        stealthMode: true
      },
      
      endpoints: {
        status: result.endpoints.status,
        cancel: result.endpoints.cancel,
        docs: '/api/v1/docs'
      },
      
      warnings: [
        '⚠️ Keep this tab/session open or use status endpoint to monitor',
        '⚠️ Do not start multiple quests simultaneously',
        '⚠️ Token is used only for authentication, not stored permanently'
      ]
    })

  } catch (error) {
    console.error('[CHROMIUM START] Error:', error)
    
    // Provide helpful error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json({
      error: 'Failed to start quest completion',
      code: 'START_FAILED',
      details: errorMessage,
      commonCauses: [
        'Chromium not available in environment',
        'Invalid or expired Discord token',
        'Rate limited by Discord',
        'Network connectivity issues'
      ],
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
      const status = getChromiumSessionStatus(sessionParam)
      if (!status) {
        return NextResponse.json({
          error: 'Session not found or expired',
          code: 'SESSION_NOT_FOUND'
        }, { status: 404 })
      }
      
      return NextResponse.json({
        success: true,
        ...status,
        currentTime: Date.now(),
        timeRemaining: Math.max(0, ((status.endTime || 0) - Date.now()) / 1000)
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
    const activeSessions = getActiveSessions()
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
        progress: Math.round(s.progress * 100) / 100,
        phase: s.phase,
        elapsed: Math.floor((Date.now() - s.startTime) / 1000),
        startedAt: new Date(s.startTime).toISOString()
      }))
    })
    
  } catch (error) {
    console.error('[CHROMIUM STATUS] Error:', error)
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
  // Use provided values if both given
  if (providedAppId && providedGameName) {
    return {
      appId: providedAppId,
      gameName: providedGameName,
      requiredMinutes: 15
    }
  }

  // Known games database with their actual requirements
  const KNOWN_GAMES: Record<string, GameInfo> = {
    // EA Sports FC 26
    '1421154726023532544': { 
      appId: '1421154726023532544', 
      gameName: 'EA SPORTS FC 26',
      requiredMinutes: 15
    },
    // Where Winds Meet
    '1437509662303059998': { 
      appId: '1437509662303059998', 
      gameName: 'Where Winds Meet',
      requiredMinutes: 15
    },
    // Neverness to Everness
    '1470616226995765409': { 
      appId: '1470616226995765409', 
      gameName: 'Neverness to Everness',
      requiredMinutes: 15
    },
    // Roblox
    '363445589247131668': { 
      appId: '363445589247131668', 
      gameName: 'Roblox',
      requiredMinutes: 15
    },
    // Zenless Zone Zero
    '1257819671114289184': { 
      appId: '1257819671114289184', 
      gameName: 'Zenless Zone Zero',
      requiredMinutes: 15
    },
    // VALORANT
    '700136079562375258': { 
      appId: '700136079562375258', 
      gameName: 'VALORANT',
      requiredMinutes: 15
    },
    // Wuthering Waves
    '1247227126416146462': { 
      appId: '1247227126416146462', 
      gameName: 'Wuthering Waves',
      requiredMinutes: 15
    },
    // Arknights: Endfield
    '1461154307171811401': { 
      appId: '1461154307171811401', 
      gameName: 'Arknights: Endfield',
      requiredMinutes: 15
    },
    // Old School RuneScape
    '1180205756998488064': { 
      appId: '1180205756998488064', 
      gameName: 'Old School RuneScape',
      requiredMinutes: 15
    },
    // Warframe
    '1402418586244612216': { 
      appId: '1402418586244612216', 
      gameName: 'Warframe',
      requiredMinutes: 15
    },
    // Yu-Gi-Oh! Master Duel
    '1140238527980916757': { 
      appId: '1140238527980916757', 
      gameName: 'Yu-Gi-Oh! Master Duel',
      requiredMinutes: 15
    },
    // Delta Force
    '1314682894106497096': { 
      appId: '1314682894106497096', 
      gameName: 'Delta Force',
      requiredMinutes: 15
    },
    // Escape the Backrooms
    '1162085521816813721': { 
      appId: '1162085521816813721', 
      gameName: 'Escape the Backrooms',
      requiredMinutes: 15
    },
    // EMPULSE
    '1506481295700529172': { 
      appId: '1506481295700529172', 
      gameName: 'EMPULSE',
      requiredMinutes: 15
    },
    // GOALS
    '1440130372162682961': { 
      appId: '1440130372162682961', 
      gameName: 'GOALS',
      requiredMinutes: 15
    },
    // The Mound: Omen of Cthulhu
    '1515074184961724517': { 
      appId: '1515074184961724517', 
      gameName: 'The Mound: Omen of Cthulhu',
      requiredMinutes: 15
    }
  }

  // Look up known game
  if (KNOWN_GAMES[questId]) {
    return KNOWN_GAMES[questId]
  }

  // Default fallback
  console.warn(`[CHROMIUM] Unknown quest ID: ${questId}, using default`)
  return {
    appId: questId,
    gameName: `Unknown Game (${questId})`,
    requiredMinutes: 15
  }
}
