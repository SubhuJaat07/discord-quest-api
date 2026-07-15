import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission } from '@/lib/api-keys'
import { 
  getChromiumSessionStatus, 
  getActiveSessions,
  ChromiumQuestSession 
} from '@/lib/chromium-client'

// GET /api/v1/quests/:id/status - Get Chromium quest completion status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: questId } = await params
    const sessionParam = request.nextUrl.searchParams.get('session')

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

    if (!hasPermission(keyData, 'quests:status')) {
      return NextResponse.json(
        { error: 'Requires quests:status permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // If specific session requested
    if (sessionParam) {
      const sessionStatus = getChromiumSessionStatus(sessionParam)
      
      if (!sessionStatus) {
        return NextResponse.json({
          success: true,
          status: 'session_expired',
          message: 'Session not found or has expired',
          sessionParam,
          suggestions: [
            'Session may have completed or been cancelled',
            'Start a new quest using POST /api/v1/quests/:id/start',
            'Check all active sessions without ?session= parameter'
          ]
        })
      }

      // Calculate timing info
      const now = Date.now()
      const elapsed = now - ((sessionStatus.startTime as number) || now)
      const remaining = Math.max(0, (((sessionStatus.endTime as number) || now) - now))
      const progress = sessionStatus.progress || Math.min((elapsed / 900000) * 100, 99.9)

      return NextResponse.json({
        success: true,
        session: {
          ...sessionStatus,
          timing: {
            startedAt: new Date((sessionStatus.startTime as number) || now).toISOString(),
            elapsedSeconds: Math.floor(elapsed / 1000),
            elapsedFormatted: formatTime(Math.floor(elapsed / 1000)),
            remainingSeconds: Math.ceil(remaining / 1000),
            remainingFormatted: formatTime(Math.ceil(remaining / 1000)),
            totalSeconds: (sessionStatus.requiredSeconds as number) || 900,
            estimatedCompletion: new Date((sessionStatus.endTime as number) || now).toISOString(),
            isOvertime: now > ((sessionStatus.endTime as number) || 0),
            progressPercent: Math.round(progress * 100) / 100
          },
          browserInfo: {
            method: 'Puppeteer Chromium Automation',
            stealthMode: (sessionStatus.config as any)?.stealthMode || true,
            presenceUpdates: sessionStatus.presenceUpdates || 0,
            discordConfirmedProgress: sessionStatus.discordProgress || 0
          },
          actions: {
            cancel: `/api/v1/quests/${questId}/cancel?session=${sessionParam}`,
            refresh: `/api/v1/quests/${questId}/status?session=${sessionParam}`
          }
        },
        message: getStatusMessage(sessionStatus.status as string),
        tips: getStatusTips(sessionStatus.status as string, progress)
      })
    }

    // Find active sessions for this user and quest
    const activeSessionsMap = getActiveSessions()
    const userQuestSessions: ChromiumQuestSession[] = []
    
    for (const [, session] of activeSessionsMap.entries()) {
      if (session.userId === keyData.user.id && 
          (session.questId === questId || session.id === questId)) {
        userQuestSessions.push(session)
      }
    }

    if (userQuestSessions.length === 0) {
      return NextResponse.json({
        success: true,
        status: 'no_active_sessions',
        message: 'No active Chromium sessions found',
        questId,
        suggestions: [
          'Start a quest using POST /api/v1/quests/:id/start',
          'The quest may have already completed or been cancelled',
          'Use ?session=<id> to check a specific session'
        ],
        availableActions: {
          start: `/api/v1/quests/${questId}/start`,
          listAll: '/api/v1/quests'
        }
      })
    }

    // Return summary of all matching sessions
    const sessionsSummary = userQuestSessions.map(s => ({
      id: s.id,
      status: s.status,
      gameName: s.gameName,
      progress: Math.round(s.progress * 100) / 100,
      phase: s.phase,
      elapsedSeconds: Math.floor((Date.now() - s.startTime) / 1000),
      presenceUpdates: s.presenceUpdates,
      discordProgress: s.discordProgress,
      startedAt: new Date(s.startTime).toISOString()
    }))

    return NextResponse.json({
      success: true,
      activeSessions: sessionsSummary,
      totalSessions: sessionsSummary.length,
      questId,
      message: `Found ${sessionsSummary.length} active session(s)`,
      details: {
        primarySession: sessionsSummary[0],
        canStartNew: !sessionsSummary.some(s => 
          ['launching', 'authenticating', 'active'].includes(s.status)
        )
      }
    })

  } catch (error) {
    console.error('[CHROMIUM STATUS] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get quest status', code: 'INTERNAL_ERROR', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// ============================================
// Utility Functions
// ============================================

function formatTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '00:00'
  
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = Math.floor(totalSeconds % 60)
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    launching: '🌐 Browser is launching...',
    authenticating: '🔐 Authenticating with Discord...',
    active: '🎮 Quest is actively running!',
    paused: '⏸️ Quest is paused',
    completed: '✅ Quest completed successfully!',
    error: '❌ Quest encountered an error',
    cancelled: '🛑 Quest was cancelled by user'
  }
  return messages[status] || `Status: ${status}`
}

function getStatusTips(status: string, progress: number): string[] {
  switch (status) {
    case 'launching':
      return ['Browser is starting up...', 'This usually takes 10-30 seconds']
    case 'authenticating':
      return ['Logging into Discord...', 'Token is being validated']
    case 'active':
      return [
        progress < 20 ? '📊 Establishing gameplay detection...' :
        progress < 40 ? '🎮 Discord is tracking activity...' :
        progress < 60 ? '⏱️ Making good progress...' :
        progress < 80 ? '🎯 Almost there...' :
        '🔄 Finalizing completion...',
        `Keep this session alive until ${formatTime((1 - progress/100) * 900)} remains`
      ]
    case 'completed':
      return [
        '🎉 Quest should be complete!',
        'Go to Discord to claim your reward',
        'Check the quests tab in Discord'
      ]
    case 'error':
      return [
        'Something went wrong',
        'Check the logs for details',
        'Try starting again'
      ]
    case 'cancelled':
      return [
        'Quest was stopped',
        'You can start again anytime'
      ]
    default:
      return []
  }
}
