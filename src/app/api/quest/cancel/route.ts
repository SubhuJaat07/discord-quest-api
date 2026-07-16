import { NextRequest, NextResponse } from 'next/server'
import { cancelWebClientSession, getWebClientSessionStatus } from '@/lib/webclient-activity'

// DELETE /api/quest/cancel?sessionId=xxx
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

function formatTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '00:00'
  
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
