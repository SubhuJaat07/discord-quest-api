import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, getSessionUser } from '@/lib/session'
import {
  startChromiumQuest,
  getChromiumSessionStatus,
  cancelChromiumSession,
  getActiveSessions
} from '@/lib/chromium-client'

// ============================================
// 🚀 REAL Chromium Quest Completion API
// ============================================
// 
// This endpoint uses PUPPETEER + REAL CHROMIUM BROWSER
// No more fake RPC/WebSocket simulation!
//
// What actually happens:
// 1. Launches REAL headless Chrome browser
// 2. Opens Discord.com with your token
// 3. Injects activity scripts into Discord's JS
// 4. Sends presence updates every 25 seconds
// 5. Discord thinks game is running locally → QUEST COMPLETE!
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

// POST - Start Quest with REAL Chromium Browser
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questId, gameId, appName } = body

    // Get user session token
    const sessionToken = await getSessionToken()
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Login first.', code: 'NOT_AUTHENTICATED' },
        { status: 401 }
      )
    }

    // Get user info
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
    const activeSessions = getActiveSessions()
    for (const [, session] of activeSessions.entries()) {
      if (session.userId === user.id && 
          ['launching', 'authenticating', 'active'].includes(session.status)) {
        return NextResponse.json({
          success: false,
          error: 'Quest already in progress',
          code: 'ALREADY_RUNNING',
          currentSession: {
            id: session.id,
            questId: session.questId,
            gameName: session.gameName,
            elapsed: Math.floor((Date.now() - session.startTime) / 1000),
            progress: Math.round(session.progress * 100) / 100,
            phase: session.phase,
            status: session.status,
            method: '🚀 Chromium Browser'
          },
          message: `Already running ${session.gameName} - ${session.progress.toFixed(1)}% complete`
        }, { status: 409 })
      }
    }

    // Resolve game info
    const gameInfo = resolveGameInfo(questId, gameId, appName)

    console.log(`[QUEST START] Starting Chromium quest for user ${user.id}: ${gameInfo.gameName}`)

    // 🚀 START REAL CHROMIUM BROWSER AUTOMATION
    const result = await startChromiumQuest(
      sessionToken,
      questId,
      gameInfo.appId,
      gameInfo.gameName,
      user.id,
      {
        debugLogs: true,
        stealthMode: true,
        headless: true,
        requiredMinutes: gameInfo.requiredMinutes
      }
    )

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      method: '🚀 Real Chromium Browser',
      message: `🚀 Starting ${gameInfo.gameName} with REAL browser...`,
      
      questDetails: {
        questId,
        gameId: gameInfo.appId,
        gameName: gameInfo.gameName,
        requiredMinutes: gameInfo.requiredMinutes,
        estimatedCompletion: result.estimatedCompletion
      },

      whatHappensNext: [
        '🌐 Launching REAL Chromium browser...',
        '🔐 Authenticating with your Discord token...',
        '🎮 Opening Discord.com in browser...',
        '💉 Injecting activity detection script...',
        '💓 Sending presence updates every 25 seconds...',
        `⏱️ After ~${gameInfo.requiredMinutes} minutes → QUEST COMPLETE!`
      ],

      technicalDetails: {
        engine: 'Puppeteer + Headless Chrome',
        method: 'Browser Automation (NOT RPC)',
        detectionType: 'Local Activity Simulation',
        stealthMode: true,
        presenceInterval: '25 seconds',
        heartbeatInterval: '40 seconds'
      },

      endpoints: {
        status: `/api/quest/status?sessionId=${result.sessionId}`,
        statusV1: `/api/v1/quests/${questId}/status?session=${result.sessionId}`,
        cancel: `/api/quest/cancel?sessionId=${result.sessionId}`,
        cancelV1: `/api/v1/quests/${questId}/cancel?session=${result.sessionId}`
      },

      warnings: [
        '⚠️ This uses REAL browser - do not refresh repeatedly',
        '⚠️ Browser will run for full duration',
        '⚠️ Progress is tracked by Discord in real-time'
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

// GET - Check quest status
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

    const sessionStatus = getChromiumSessionStatus(sessionId)
    
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

    // Calculate timing
    const now = Date.now()
    const startTime = sessionStatus.startTime as number || now
    const endTime = sessionStatus.endTime as number || now
    const elapsed = Math.floor((now - startTime) / 1000)
    const remaining = Math.max(0, Math.ceil((endTime - now) / 1000))
    const progress = sessionStatus.progress || Math.min((elapsed / 900) * 100, 99.9)

    return NextResponse.json({
      success: true,
      status: sessionStatus.status as string,
      method: '🚀 Chromium Browser Automation',
      
      quest: {
        questId: sessionStatus.questId,
        gameName: sessionStatus.gameName,
        appId: sessionStatus.appId
      },

      progress: {
        percent: Math.round(progress * 100) / 100,
        elapsedSeconds: elapsed,
        elapsedFormatted: formatTime(elapsed),
        remainingSeconds: remaining,
        remainingFormatted: formatTime(remaining),
        totalRequired: sessionStatus.requiredSeconds || 900
      },

      browser: {
        phase: sessionStatus.phase as string,
        presenceUpdates: sessionStatus.presenceUpdates || 0,
        discordConfirmedProgress: sessionStatus.discordProgress || 0,
        lastHeartbeat: sessionStatus.lastHeartbeat ? new Date(sessionStatus.lastHeartbeat as number).toISOString() : null
      },

      timing: {
        startedAt: new Date(startTime).toISOString(),
        estimatedCompletion: new Date(endTime).toISOString(),
        currentTime: new Date().toISOString(),
        isOvertime: now > endTime
      },

      actions: {
        cancel: `/api/quest/cancel?sessionId=${sessionId}`,
        refresh: `/api/quest/status?sessionId=${sessionId}`
      },

      message: getStatusMessage(sessionStatus.status as string, progress)
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

    const sessionStatus = getChromiumSessionStatus(sessionId)
    
    if (!sessionStatus) {
      return NextResponse.json({
        error: 'Session not found',
        code: 'NOT_FOUND'
      }, { status: 404 })
    }

    // Check if already in terminal state
    const currentStatus = sessionStatus.status as string
    if (['completed', 'error', 'cancelled'].includes(currentStatus)) {
      return NextResponse.json({
        success: false,
        error: `Cannot cancel - already ${currentStatus}`,
        code: 'INVALID_STATE'
      }, { status: 400 })
    }

    // Perform cancellation
    const cancelled = await cancelChromiumSession(sessionId)

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Failed to cancel', code: 'CANCEL_FAILED' },
        { status: 500 }
      )
    }

    const elapsed = Math.floor((Date.now() - ((sessionStatus.startTime as number) || Date.now())) / 1000)

    return NextResponse.json({
      success: true,
      status: 'cancelling',
      message: '🛑 Stopping Chromium browser...',
      
      cancelledSession: {
        sessionId,
        gameName: sessionStatus.gameName,
        timeElapsed: formatTime(elapsed),
        progressLost: `${Math.round((sessionStatus.progress || 0) * 100) / 100}%`
      },

      whatHappens: [
        '🔒 Closing browser instance...',
        '⏹️ Stopping presence updates...',
        '🧹 Cleaning up resources...'
      ],

      warning: '⚠️ Progress lost - Discord requires continuous activity!',
      nextSteps: ['Start a new quest anytime']
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

function getStatusMessage(status: string, progress: number): string {
  switch (status) {
    case 'launching':
      return '🌐 Launching Chromium browser...'
    case 'authenticating':
      return '🔐 Logging into Discord...'
    case 'active':
      if (progress < 20) return '📊 Establishing gameplay detection...'
      if (progress < 40) return '🎮 Discord tracking activity...'
      if (progress < 60) return '⏱️ Good progress...'
      if (progress < 80) return '🎯 Almost there...'
      return '🔄 Finalizing...'
    case 'completed':
      return '✅ Quest COMPLETE! Claim reward in Discord!'
    case 'error':
      return '❌ Something went wrong'
    case 'cancelled':
      return '🛑 Cancelled by user'
    default:
      return `Status: ${status}`
  }
}
