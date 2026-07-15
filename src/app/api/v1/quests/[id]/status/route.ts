import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission } from '@/lib/api-keys'
import { getActiveQuests } from '../start/route'

// GET /api/v1/quests/:id/status - Get quest completion status
export async function GET(
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

    const keyData = keyCheck as NonNullable<typeof keyCheck>

    if (!hasPermission(keyData, 'quests:status')) {
      return NextResponse.json(
        { error: 'Requires quests:status permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // Find active quest
    let activeQuest = null
    const quests = getActiveQuests()
    
    for (const [, quest] of quests.entries()) {
      if ((quest.questId === questId || quest.id === questId) && 
          quest.userId === keyData.user.id) {
        activeQuest = quest
        break
      }
    }

    if (!activeQuest) {
      return NextResponse.json({
        success: true,
        status: 'not_found',
        message: 'No active quest found for this quest ID',
        suggestions: [
          'Start a quest first using POST /api/v1/quests/:id/start',
          'Check if quest ID is correct',
          'Quest may have completed or been cancelled'
        ]
      })
    }

    const now = Date.now()
    const elapsed = now - activeQuest.startTime
    const remaining = Math.max(0, activeQuest.endTime - now)
    const progress = activeQuest.progress || Math.min((elapsed / 900000) * 100, 99.9)

    return NextResponse.json({
      success: true,
      quest: {
        id: activeQuest.id || activeQuest.questId,
        questId: activeQuest.questId,
        gameName: activeQuest.gameName,
        appId: activeQuest.appId,
        status: activeQuest.status,
        phase: activeQuest.phase,
        progress: Math.round(progress),
        timing: {
          startedAt: new Date(activeQuest.startTime).toISOString(),
          elapsedSeconds: Math.floor(elapsed / 1000),
          elapsedFormatted: formatTime(Math.floor(elapsed / 1000)),
          remainingSeconds: Math.ceil(remaining / 1000),
          remainingFormatted: formatTime(Math.ceil(remaining / 1000)),
          totalSeconds: 900,
          estimatedCompletion: new Date(activeQuest.endTime).toISOString(),
          isOvertime: now > activeQuest.endTime
        },
        connection: {
          gatewayConnected: activeQuest.ws !== null,
          method: 'Discord Gateway WebSocket'
        },
        actions: {
          cancel: `/api/v1/quests/${questId}/cancel`,
          refresh: `/api/v1/quests/${questId}/status`
        }
      },
      message: getStatusMessage(activeQuest.status)
    })

  } catch (error) {
    console.error('[V1 STATUS] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get quest status', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    initializing: 'Quest is starting up...',
    connecting: 'Connecting to Discord...',
    identifying: 'Authenticating with Discord...',
    running: 'Quest is in progress!',
    completing: 'Finalizing completion...',
    completed: '🎉 Quest completed successfully!',
    failed: 'Quest failed to complete',
    cancelled: 'Quest was cancelled'
  }
  return messages[status] || 'Unknown status'
}
