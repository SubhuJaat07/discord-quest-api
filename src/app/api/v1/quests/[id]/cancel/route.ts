import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, hasPermission } from '@/lib/api-keys'
import { getActiveQuests } from '../start/route'

// DELETE /api/v1/quests/:id/cancel - Cancel active quest
export async function DELETE(
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

    if (!hasPermission(keyData, 'quests:cancel')) {
      return NextResponse.json(
        { error: 'Requires quests:cancel permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // Find and mark quest for cancellation
    const quests = getActiveQuests()
    let cancelled = false
    
    for (const [, quest] of quests.entries()) {
      if ((quest.questId === questId || quest.id === questId) && 
          quest.userId === keyData.user.id &&
          !['completed', 'failed', 'cancelled'].includes(quest.status)) {
        quest.status = 'cancelled'
        quest.phase = 'Cancelling...'
        cancelled = true
        break
      }
    }

    if (!cancelled) {
      return NextResponse.json(
        { error: 'No active quest found to cancel', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      questId,
      status: 'cancelling',
      message: 'Quest cancellation requested',
      note: 'The quest will stop within a few seconds',
      warning: 'Any progress made will be lost',
      nextSteps: [
        'Check status at GET /api/v1/quests/:id/status',
        'Restart with POST /api/v1/quests/:id/start if needed'
      ]
    })

  } catch (error) {
    console.error('[V1 CANCEL] Error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel quest', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
