import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, getSessionUser } from '@/lib/session'
import {
  startWebClientQuest,
  getWebClientSessionStatus,
  cancelWebClientSession,
  getActiveWebClientSessions
} from '@/lib/webclient-activity'

// ============================================
// 🌐 DISCORD WEB CLIENT ACTIVITY INJECTION
// ============================================
// 
// This endpoint uses PUPPETEER + DISCORD'S OWN WEB CLIENT
// We don't fake RPC - we USE Discord's client to send activity!
//
// What actually happens:
// 1. Launches REAL headless Chrome browser
// 2. Opens Discord.com with your token (legitimate login)
// 3. Hooks into Discord's WebSocket connection
// 4. Injects game activity into presence updates
// 5. Discord sees it as legitimate gameplay → QUEST COMPLETE!
// ============================================

interface GameInfo {
  appId: string
  gameName: string
  requiredMinutes: number
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
}

// POST - Start Quest with Web Client Activity Injection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questId, gameId, appName } = body

    const sessionToken = await getSessionToken()
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Login first.', code: 'NOT_AUTHENTICATED' },
        { status: 401 }
      )
    }

    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Session expired. Login again.', code: 'SESSION_EXPIRED' },
        { status: 401 }
      )
    }

    if (!questId) {
      return NextResponse.json(
        { error: 'questId is required', code: 'QUEST_ID_REQUIRED' },
        { status: 400 }
      )
    }

    // Check for existing active sessions for this user
    const activeSessions = getActiveWebClientSessions()
    for (const [, session] of activeSessions.entries()) {
      if (session.userId === user.id && 
          ['launching', 'authenticating', 'setting_activity', 'running'].includes(session.status)) {
        return NextResponse.json({
          success: false,
          error: 'Quest already in progress',
          code: 'ALREADY_RUNNING',
          currentSession: {
            id: session.id,
            questId: session.questId,
            gameName: session.gameName,
            elapsed: Math.floor((Date.now() - session.startTime.getTime()) / 1000),
            status: session.status,
            method: '🌐 Discord Web Client'
          },
          message: `Already running ${session.gameName} - ${session.totalSeconds}s elapsed`
        }, { status: 409 })
      }
    }

    // Resolve game info
    const gameInfo = resolveGameInfo(questId, gameId, appName)

    console.log(`[QUEST START] Starting WebClient quest for user ${user.id}: ${gameInfo.gameName}`)

    // 🌐 START WEB CLIENT ACTIVITY INJECTION
    const result = await startWebClientQuest(
      sessionToken,
      questId,
      gameInfo.appId,
      gameInfo.gameName,
      user.id,
      {
        headless: true,
        timeout: 60000,
        activityUpdateInterval: 25000
      }
    )

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.message,
        code: 'START_ERROR'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      method: '🚀 Real Browser + Quest Page + API Verification',
      message: `🚀 Starting ${gameInfo.gameName} with REAL Discord verification...`,
      
      questDetails: {
        questId,
        gameId: gameInfo.appId,
        gameName: gameInfo.gameName,
        requiredMinutes: gameInfo.requiredMinutes,
      },

      whatHappensNext: [
        '🚀 Launching REAL Chromium browser...',
        '🔐 Authenticating with your token...',
        '📱 Opening discord.com/quest-home (like extensions do)...',
        '💉 Setting up activity injection methods...',
        '📊 Polling Discord API every 30s for REAL progress...',
        '✅ Only reporting SUCCESS when Discord confirms >0%!'
      ],

      technicalDetails: {
        engine: 'Puppeteer + Real Chromium',
        method: 'Quest Page Open + WebSocket Hook + API Verification',
        detectionType: 'Real Discord Quest API Response',
        verificationMethod: 'GET /api/v10/users/@me/quests',
        honestyLevel: '100% - No fake progress!',
        activityInterval: '20 seconds',
        apiCheckInterval: '30 seconds'
      },

      endpoints: {
        status: `/api/quest/status?sessionId=${result.sessionId}`,
        verifyDiscord: `/api/quest/discord-verify?questId=${questId}`, // NEW!
        cancel: `/api/quest/cancel?sessionId=${result.sessionId}`
      },

      importantNotes: [
        '✅ This version shows ONLY real Discord-verified progress',
        '✅ Will show 0% until Discord actually detects activity',
        '✅ Uses same approach as mobile browser extensions',
        '⏳ May take 2-5 minutes for Discord to register first progress',
        '📊 Check /api/quest/discord-verify for raw API data'
      ],
      
      howThisIsDifferent: [
        '❌ OLD: Fake internal timer (showed 44% when Discord had 0%)',
        '✅ NEW: Real Discord API polling (shows 0% until Discord confirms)',
        '✅ NEW: Opens quest-home page like extensions do',
        '✅ NEW: Multiple activity injection methods',
        '✅ NEW: Honest progress reporting only from Discord API'
      ]
    })

  } catch (error) {
    console.error('[QUEST START] Error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to start quest',
      code: 'START_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Check server logs for details'
    }, { status: 500 })
  }
}

// GET - Check quest status (WITH REAL DISCORD API VERIFICATION)
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    
    if (!sessionId) {
      return NextResponse.json({
        error: 'sessionId parameter required',
        code: 'SESSION_ID_REQUIRED',
        usage: '/api/quest/status?sessionId=xxx'
      }, { status: 400 })
    }

    const sessionStatus = getWebClientSessionStatus(sessionId)
    
    if (!sessionStatus) {
      return NextResponse.json({
        success: false,
        error: 'Session not found or expired',
        code: 'NOT_FOUND',
        suggestions: [
          'Session may have completed or been cancelled',
          'Start a new quest to get a fresh session ID'
        ]
      }, { status: 404 })
    }

    const elapsed = sessionStatus.totalSeconds
    const requiredSeconds = 900 // 15 minutes default
    
    // 🎯🎯🎯 CRITICAL: Show REAL Discord progress, not fake internal timer! 🎯🎯🎯
    const realDiscordProgress = sessionStatus.discordVerifiedProgress ?? 0
    const discordHasProgress = sessionStatus.realProgressDetected ?? false
    
    // Calculate display progress based on REAL data only
    let displayPercent: number
    let progressSource: string
    
    if (discordHasProgress && realDiscordProgress > 0) {
      // Use ACTUAL Discord progress if available
      displayPercent = Math.min((realDiscordProgress / requiredSeconds) * 100, 100)
      progressSource = 'DISCORD_API_REAL'
    } else {
      // No real progress yet - show 0% honestly!
      displayPercent = 0
      progressSource = 'WAITING_FOR_DISCORD'
    }
    
    const remaining = Math.max(0, requiredSeconds - elapsed)

    return NextResponse.json({
      success: true,
      status: sessionStatus.status,
      method: '🚀 Real Browser + Quest Page + API Verification',
      
      quest: {
        questId: sessionStatus.questId,
        gameName: sessionStatus.gameName,
        appId: sessionStatus.appId
      },

      // 🎯 REAL PROGRESS DATA FROM DISCORD API
      progress: {
        percent: Math.round(displayPercent * 100) / 100,
        source: progressSource, // IMPORTANT: Shows where data comes from
        elapsedSeconds: elapsed,
        elapsedFormatted: formatTime(elapsed),
        remainingSeconds: remaining,
        remainingFormatted: formatTime(remaining),
        totalRequired: requiredSeconds,
        
        // 🔥 THE TRUTH - Real Discord verification
        discordVerified: {
          hasRealProgress: discordHasProgress,
          progressValue: realDiscordProgress,
          questStatus: sessionStatus.discordQuestStatus || 'unknown',
          lastChecked: sessionStatus.lastDiscordCheck?.toISOString() || null,
          firstDetectedAt: sessionStatus.firstProgressTime?.toISOString() || null
        }
      },

      browser: {
        phase: sessionStatus.status,
        lastActivityUpdate: sessionStatus.lastActivityUpdate?.toISOString() || null,
        hasRealDiscordProgress: discordHasProgress // Renamed from discordConfirmed
      },

      timing: {
        startedAt: sessionStatus.startTime.toISOString(),
        currentTime: new Date().toISOString(),
        totalElapsed: `${elapsed}s`,
        uptimeMinutes: Math.round(elapsed / 60)
      },

      actions: {
        cancel: `/api/quest/cancel?sessionId=${sessionId}`,
        refresh: `/api/quest/status?sessionId=${sessionId}`,
        verifyDiscord: `/api/quest/discord-verify?questId=${sessionStatus.questId}`
      },

      // HONEST status messages
      message: getHonestStatusMessage(sessionStatus.status, displayPercent, discordHasProgress),
      
      warnings: !discordHasProgress && elapsed > 60 ? [
        '⚠️ Session running but Discord shows 0%',
        '⏳ This is normal - Discord may take time to register activity',
        '💡 Keep session running and check again in 2-3 minutes',
        '🔍 Use verifyDiscord endpoint for raw API data'
      ] : undefined
    })

  } catch (error) {
    console.error('[QUEST STATUS] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get status', code: 'STATUS_ERROR' },
      { status: 500 }
    )
  }
}

// DELETE - Cancel quest
export async function DELETE(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    
    if (!sessionId) {
      return NextResponse.json({
        error: 'sessionId parameter required',
        code: 'SESSION_ID_REQUIRED'
      }, { status: 400 })
    }

    const sessionStatus = getWebClientSessionStatus(sessionId)
    
    if (!sessionStatus) {
      return NextResponse.json({
        error: 'Session not found',
        code: 'NOT_FOUND'
      }, { status: 404 })
    }

    const currentStatus = sessionStatus.status
    if (['completed', 'error'].includes(currentStatus)) {
      return NextResponse.json({
        success: false,
        error: `Cannot cancel - already ${currentStatus}`,
        code: 'INVALID_STATE'
      }, { status: 400 })
    }

    const cancelled = await cancelWebClientSession(sessionId)

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Failed to cancel', code: 'CANCEL_FAILED' },
        { status: 500 }
      )
    }

    const elapsed = sessionStatus.totalSeconds

    return NextResponse.json({
      success: true,
      status: 'cancelling',
      message: '🛑 Closing browser and stopping activity...',
      
      cancelledSession: {
        sessionId,
        gameName: sessionStatus.gameName,
        timeElapsed: formatTime(elapsed)
      },

      whatHappens: [
        '🔒 Closing browser instance...',
        '⏹️ Stopping activity injection...',
        '🧹 Cleaning up resources...'
      ],
    })

  } catch (error) {
    console.error('[QUEST CANCEL] Error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel', code: 'CANCEL_ERROR' },
      { status: 500 }
    )
  }
}

// ============================================
// Helper Functions
// ============================================

function resolveGameInfo(questId?: string, providedGameId?: string, providedAppName?: string): GameInfo {
  if (providedGameId && providedAppName) {
    return { appId: providedGameId, gameName: providedAppName, requiredMinutes: 15 }
  }

  if (questId && KNOWN_GAMES[questId]) {
    return KNOWN_GAMES[questId]
  }

  return { appId: '1421154726023532544', gameName: 'EA SPORTS FC 26', requiredMinutes: 15 }
}

function formatTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '00:00'
  
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function getHonestStatusMessage(status: string, progress: number, hasRealProgress: boolean): string {
  switch (status) {
    case 'launching':
      return '🚀 Launching Chromium browser...'
    case 'authenticating':
      return '🔐 Authenticating with Discord token...'
    case 'opening_quest_page':
      return '📱 Opening discord.com/quest-home (like extensions do)...'
    case 'injecting_activity':
      return '💉 Setting up activity injection methods...'
    case 'running':
      if (!hasRealProgress) {
        return '⏳ Session active - waiting for Discord to detect activity...'
      }
      if (progress < 20) return '✅ Discord detected gameplay! Progress starting...'
      if (progress < 50) return '✅ Good progress on Discord side...'
      if (progress < 80) return '✅ Almost there! Keep going...'
      return '🎉 Finalizing! Quest almost complete!'
    case 'verifying':
      return '🔍 Verifying progress with Discord API...'
    case 'completed':
      return '🎉🎉🎉 QUEST COMPLETE! Claim reward in Discord! 🎉🎉🎉'
    case 'error':
      return '❌ Something went wrong'
    default:
      return `Status: ${status}`
  }
}
