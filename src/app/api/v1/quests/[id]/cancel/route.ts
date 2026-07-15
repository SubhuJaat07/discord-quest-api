import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission } from '@/lib/api-keys'
import { 
  cancelChromiumSession, 
  getChromiumSessionStatus,
  getActiveSessions,
  ChromiumQuestSession 
} from '@/lib/chromium-client'

// DELETE /api/v1/quests/:id/cancel - Cancel active Chromium quest session
export async function DELETE(
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

    if (!hasPermission(keyData, 'quests:cancel')) {
      return NextResponse.json(
        { error: 'Requires quests:cancel permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // If specific session ID provided, cancel that exact session
    if (sessionParam) {
      // Verify this session belongs to this user
      const sessionStatus = getChromiumSessionStatus(sessionParam)
      
      if (!sessionStatus) {
        return NextResponse.json(
          { error: 'Session not found or already expired', code: 'SESSION_NOT_FOUND' },
          { status: 404 }
        )
      }
      
      if ((sessionStatus.userId as string) !== keyData.user.id) {
        return NextResponse.json(
          { error: 'You can only cancel your own sessions', code: 'FORBIDDEN' },
          { status: 403 }
        )
      }

      // Check if session is already in a terminal state
      const currentStatus = sessionStatus.status
      if (['completed', 'error', 'cancelled'].includes(currentStatus || '')) {
        return NextResponse.json({
          success: false,
          error: `Cannot cancel session - it is already ${currentStatus}`,
          code: 'INVALID_STATE',
          currentState: currentStatus,
          hint: 'The session has already ended'
        }, { status: 400 })
      }

      // Perform cancellation
      const cancelled = await cancelChromiumSession(sessionParam)

      if (!cancelled) {
        return NextResponse.json(
          { error: 'Failed to cancel session', code: 'CANCEL_FAILED' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        sessionId: sessionParam,
        questId,
        status: 'cancelling',
        message: '🛑 Quest cancellation initiated',
        
        whatHappens: [
          'Browser is being closed',
          'Presence updates are stopping',
          'Session will be cleaned up shortly'
        ],
        
        progressLost: {
          elapsedSeconds: Math.floor((Date.now() - ((sessionStatus.startTime as number) || Date.now())) / 1000),
          progressPercent: Math.round((sessionStatus.progress || 0) * 100) / 100,
          note: 'This progress will NOT count toward quest completion'
        },
        
        nextSteps: [
          '✅ You can start a new quest immediately',
          '📊 Use GET /api/v1/quests/:id/status to verify cancellation',
          '🔄 Use POST /api/v1/quests/:id/start to start again'
        ],
        
        warning: '⚠️ Any time accumulated during this session will not count toward quest completion. Discord requires continuous gameplay detection.'
      })
    }

    // No session ID - find and cancel all active sessions for this user+quest
    const activeSessionsMap = getActiveSessions()
    const sessionsToCancel: string[] = []
    
    for (const [, session] of activeSessionsMap.entries()) {
      if (session.userId === keyData.user.id && 
          (session.questId === questId || session.id === questId) &&
          ['launching', 'authenticating', 'active', 'paused'].includes(session.status)) {
        sessionsToCancel.push(session.id)
      }
    }

    if (sessionsToCancel.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active sessions found to cancel',
        code: 'NOT_FOUND',
        questId,
        suggestions: [
          'All sessions may have already completed or been cancelled',
          'Use ?session=<id> to target a specific session',
          'Check status at GET /api/v1/quests/:id/status'
        ]
      }, { status: 404 })
    }

    // Cancel all found sessions
    const cancelResults = await Promise.allSettled(
      sessionsToCancel.map(id => cancelChromiumSession(id))
    )

    const successfulCancels = cancelResults.filter(r => r.status === 'fulfilled' && r.value).length
    
    return NextResponse.json({
      success: successfulCancels > 0,
      questId,
      sessionsAttempted: sessionsToCancel.length,
      sessionsCancelled: successfulCancels,
      status: successfulCancels > 0 ? 'cancelling' : 'partial_failure',
      message: successfulCancels > 0 
        ? `🛑 Cancelling ${successfulCancels} session(s)...`
        : 'Failed to cancel sessions',
      
      cancelledSessions: sessionsToCancel.map((id, idx) => ({
        sessionId: id,
        status: cancelResults[idx].status === 'fulfilled' ? 'cancelling' : 'failed'
      })),
      
      nextSteps: [
        'Sessions are being cleaned up',
        'Browser instances will close within seconds',
        'You can start new quests immediately'
      ]
    })

  } catch (error) {
    console.error('[CHROMIUM CANCEL] Error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel quest', code: 'INTERNAL_ERROR', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
