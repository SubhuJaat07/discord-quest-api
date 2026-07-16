import { NextRequest, NextResponse } from 'next/server'
import { getWebClientSessionStatus, getSessionToken } from '@/lib/webclient-activity'

// GET /api/quest/status?sessionId=xxx
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
    
    // REAL Discord progress
    const realDiscordProgress = sessionStatus.discordVerifiedProgress ?? 0
    const discordHasProgress = sessionStatus.realProgressDetected ?? false
    
    let displayPercent: number
    let progressSource: string
    
    if (discordHasProgress && realDiscordProgress > 0) {
      displayPercent = Math.min((realDiscordProgress / requiredSeconds) * 100, 100)
      progressSource = 'DISCORD_API_REAL'
    } else {
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

      progress: {
        percent: Math.round(displayPercent * 100) / 100,
        source: progressSource,
        elapsedSeconds: elapsed,
        elapsedFormatted: formatTime(elapsed),
        remainingSeconds: remaining,
        remainingFormatted: formatTime(remaining),
        totalRequired: requiredSeconds,
        
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
        hasRealDiscordProgress: discordHasProgress
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

      message: getStatusMessage(sessionStatus.status, displayPercent, discordHasProgress),
      
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

function formatTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '00:00'
  
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function getStatusMessage(status: string, progress: number, hasRealProgress: boolean): string {
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
