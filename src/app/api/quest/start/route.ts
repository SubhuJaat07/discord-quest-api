import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, getSessionUser } from '../token/route'

// Simulate quest completion process
// In a real implementation, this would:
// 1. Create a dummy game executable
// 2. Register it with Discord's Rich Presence
// 3. Keep it running for ~15 minutes
// 4. Track progress and completion

interface QuestSession {
  questId: string
  sessionId: string
  startTime: number
  status: 'running' | 'completed' | 'failed'
  progress: number
}

// Active quest sessions (in-memory only)
const activeQuests = new Map<string, QuestSession>()

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
    for (const [key, quest] of activeQuests.entries()) {
      if (quest.sessionId === sessionId && quest.status === 'running') {
        return NextResponse.json(
          { error: 'You already have a quest in progress. Please wait for it to complete.' },
          { status: 409 }
        )
      }
    }

    // Validate quest ID (basic check)
    const validQuestIds = [
      'quest_001', 'quest_002', 'quest_003', 'quest_004',
      'quest_005', 'quest_006', 'quest_007', 'quest_008'
    ]

    if (!validQuestIds.includes(questId)) {
      return NextResponse.json(
        { error: 'Invalid quest ID' },
        { status: 400 }
      )
    }

    // Log quest start for educational/monitoring purposes
    console.log(`[EDUCATIONAL] User ${user.username}#${user.discriminator} started quest: ${questId}`)
    
    // Create quest session
    const questSessionId = `q_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    activeQuests.set(questSessionId, {
      questId,
      sessionId,
      startTime: Date.now(),
      status: 'running',
      progress: 0
    })

    // Start simulated quest progress (in background)
    startQuestSimulation(questSessionId, token)

    return NextResponse.json({
      success: true,
      questSessionId,
      message: 'Quest started successfully',
      estimatedTime: '15 minutes',
      note: 'This is a simulation for educational purposes. No actual game is being run.'
    })

  } catch (error) {
    console.error('Quest Start API error:', error)
    return NextResponse.json(
      { error: 'Failed to start quest. Please try again.' },
      { status: 500 }
    )
  }
}

// GET endpoint to check quest status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const questSessionId = searchParams.get('questSessionId')
    const sessionId = searchParams.get('sessionId')

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

    if (!activeQuest && !questSessionId) {
      return NextResponse.json({
        success: true,
        status: 'idle',
        message: 'No active quest'
      })
    }

    return NextResponse.json({
      success: true,
      quest: activeQuest ? {
        id: activeQuest.id,
        questId: activeQuest.questId,
        status: activeQuest.status,
        progress: Math.round(activeQuest.progress),
        elapsed: Math.round((Date.now() - activeQuest.startTime) / 1000)
      } : null
    })

  } catch (error) {
    console.error('Quest Status API error:', error)
    return NextResponse.json(
      { error: 'Failed to get quest status' },
      { status: 500 }
    )
  }
}

// Simulate quest progression
function startQuestSimulation(questSessionId: string, discordToken: string) {
  const quest = activeQuests.get(questSessionId)
  if (!quest) return

  const totalTime = 15 * 60 * 1000 // 15 minutes in ms
  const updateInterval = 1000 // Update every second
  let elapsedTime = 0

  const interval = setInterval(() => {
    const currentQuest = activeQuests.get(questSessionId)
    if (!currentQuest || currentQuest.status !== 'running') {
      clearInterval(interval)
      return
    }

    elapsedTime += updateInterval
    
    // Calculate progress (with some randomness for realism)
    const baseProgress = (elapsedTime / totalTime) * 100
    const randomVariation = (Math.random() - 0.5) * 2
    currentQuest.progress = Math.min(Math.max(baseProgress + randomVariation, 0), 99)

    // Check if complete
    if (elapsedTime >= totalTime) {
      currentQuest.progress = 100
      currentQuest.status = 'completed'
      clearInterval(interval)
      
      console.log(`[EDUCATIONAL] Quest ${currentQuest.questId} completed!`)
      
      // Clean up after 5 minutes
      setTimeout(() => {
        activeQuests.delete(questSessionId)
      }, 300000)
    }
  }, updateInterval)

  // Safety timeout (20 minutes max)
  setTimeout(() => {
    const currentQuest = activeQuests.get(questSessionId)
    if (currentQuest && currentQuest.status === 'running') {
      currentQuest.progress = 100
      currentQuest.status = 'completed'
      clearInterval(interval)
    }
  }, 20 * 60 * 1000)
}
