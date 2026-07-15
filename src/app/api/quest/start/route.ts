import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, getSessionUser } from '@/lib/session'

// Quest session with REAL timing
interface QuestSession {
  questId: string
  sessionId: string
  startTime: number
  endTime: number // When quest should complete (startTime + 15 minutes)
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  lastUpdate: number
}

// Active quest sessions (in-memory only)
const activeQuests = new Map<string, QuestSession>()

const QUEST_DURATION_MS = 15 * 60 * 1000 // 15 minutes in milliseconds
const PROGRESS_UPDATE_INTERVAL = 5000 // Update progress every 5 seconds

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, questId } = body

    if (!sessionId || !questId) {
      return NextResponse.json(
        { error: 'Session ID and Quest ID are required' },
        { status: 400 }
      )
    }

    // Verify session is valid
    const token = getSessionToken(sessionId)
    const user = getSessionUser(sessionId)
    
    if (!token || !user) {
      return NextResponse.json(
        { error: 'Session expired or invalid. Please authenticate again.' },
        { status: 401 }
      )
    }

    // Check if quest already running for this session
    for (const [, quest] of activeQuests.entries()) {
      if (quest.sessionId === sessionId && quest.status === 'running') {
        return NextResponse.json(
          { 
            error: 'You already have a quest in progress.',
            currentQuest: quest.questId,
            elapsed: Math.floor((Date.now() - quest.startTime) / 1000),
            remaining: Math.ceil((quest.endTime - Date.now()) / 1000)
          },
          { status: 409 }
        )
      }
    }

    // Log quest start
    console.log(`[QUEST START] User ${user.username}#${user.discriminator} started quest: ${questId}`)
    
    // Create quest session with REAL timing
    const questSessionId = `q_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const now = Date.now()
    
    activeQuests.set(questSessionId, {
      questId,
      sessionId,
      startTime: now,
      endTime: now + QUEST_DURATION_MS, // Complete after 15 minutes
      status: 'running',
      progress: 0,
      lastUpdate: now
    })

    // Start real-time progress simulation
    startRealTimeProgress(questSessionId)

    return NextResponse.json({
      success: true,
      questSessionId,
      message: 'Quest started successfully!',
      estimatedTime: '15 minutes',
      completionTime: new Date(now + QUEST_DURATION_MS).toISOString(),
      instructions: [
        'Keep this tab open for progress updates',
        'Quest will complete after 15 minutes of simulated gameplay',
        'Do not close the browser or refresh during active quest'
      ]
    })

  } catch (error) {
    console.error('Quest Start API error:', error)
    return NextResponse.json(
      { error: 'Failed to start quest. Please try again.' },
      { status: 500 }
    )
  }
}

// GET endpoint to check real-time quest status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    const questSessionId = searchParams.get('questSessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Find active quest for this session
    let activeQuest = null
    for (const [key, quest] of activeQuests.entries()) {
      if (quest.sessionId === sessionId) {
        activeQuest = { ...quest, id: key }
        break
      }
    }

    if (!activeQuest) {
      return NextResponse.json({
        success: true,
        status: 'idle',
        message: 'No active quest'
      })
    }

    const now = Date.now()
    const elapsed = now - activeQuest.startTime
    const remaining = Math.max(0, activeQuest.endTime - now)
    const totalDuration = activeQuest.endTime - activeQuest.startTime
    
    return NextResponse.json({
      success: true,
      quest: {
        id: activeQuest.id,
        questId: activeQuest.questId,
        status: activeQuest.status,
        progress: Math.round(activeQuest.progress),
        elapsedSeconds: Math.floor(elapsed / 1000),
        remainingSeconds: Math.ceil(remaining / 1000),
        totalSeconds: Math.floor(totalDuration / 1000),
        formattedElapsed: formatTime(Math.floor(elapsed / 1000)),
        formattedRemaining: formatTime(Math.ceil(remaining / 1000)),
        startTime: new Date(activeQuest.startTime).toISOString(),
        estimatedCompletion: new Date(activeQuest.endTime).toISOString()
      }
    })

  } catch (error) {
    console.error('Quest Status API error:', error)
    return NextResponse.json(
      { error: 'Failed to get quest status' },
      { status: 500 }
    )
  }
}

// DELETE endpoint to cancel active quest
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Find and cancel active quest
    for (const [key, quest] of activeQuests.entries()) {
      if (quest.sessionId === sessionId && quest.status === 'running') {
        quest.status = 'cancelled'
        activeQuests.delete(key)
        
        console.log(`[QUEST CANCELLED] Quest ${quest.questId} cancelled by user`)
        
        return NextResponse.json({
          success: true,
          message: 'Quest cancelled successfully',
          progressLost: Math.round(quest.progress)
        })
      }
    }

    return NextResponse.json(
      { error: 'No active quest to cancel' },
      { status: 404 }
    )

  } catch (error) {
    console.error('Quest Cancel API error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel quest' },
      { status: 500 }
    )
  }
}

// Real-time progress simulation (15 minutes actual time)
function startRealTimeProgress(questSessionId: string) {
  const quest = activeQuests.get(questSessionId)
  if (!quest) return

  const interval = setInterval(() => {
    const currentQuest = activeQuests.get(questSessionId)
    if (!currentQuest || currentQuest.status !== 'running') {
      clearInterval(interval)
      return
    }

    const now = Date.now()
    const elapsed = now - currentQuest.startTime
    const totalDuration = currentQuest.endTime - currentQuest.startTime
    
    // Calculate real progress based on elapsed time
    // Add tiny random variation for realism (±1%)
    const baseProgress = (elapsed / totalDuration) * 100
    const variation = (Math.random() - 0.5) * 2
    currentQuest.progress = Math.min(Math.max(baseProgress + variation, 0), 99.5)
    currentQuest.lastUpdate = now

    // Check if quest should complete
    if (elapsed >= totalDuration) {
      currentQuest.progress = 100
      currentQuest.status = 'completed'
      clearInterval(interval)
      
      console.log(`[QUEST COMPLETED] Quest ${currentQuest.questId} completed after 15 minutes!`)
      
      // Auto-cleanup after 10 minutes
      setTimeout(() => {
        activeQuests.delete(questSessionId)
      }, 600000)
    }
  }, PROGRESS_UPDATE_INTERVAL) // Update every 5 seconds for smooth progress

  // Safety timeout (16 minutes max)
  setTimeout(() => {
    const currentQuest = activeQuests.get(questSessionId)
    if (currentQuest && currentQuest.status === 'running') {
      currentQuest.progress = 100
      currentQuest.status = 'completed'
      clearInterval(interval)
      console.log(`[QUEST TIMEOUT] Quest ${currentQuest.questId} force-completed`)
    }
  }, 16 * 60 * 1000)
}

// Format seconds to MM:SS
function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
