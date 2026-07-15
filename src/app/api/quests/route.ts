import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken } from '@/lib/session'

// Fetch REAL Discord Quests from the correct endpoint
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 401 })
    }

    // Verify session
    const token = getSessionToken(sessionId)
    if (!token) {
      return NextResponse.json({ error: 'Session expired or invalid' }, { status: 401 })
    }

    // Fetch REAL quests from Discord's actual quest endpoint
    const questsRes = await fetch('https://discord.com/api/v10/quests/@me', {
      headers: { 
        'Authorization': token,
        'User-Agent': 'DiscordQuestTool/1.0 (Educational)'
      }
    })

    if (!questsRes.ok) {
      console.error('[QUESTS API] Discord returned:', questsRes.status, await questsRes.text())
      return NextResponse.json({
        success: true,
        quests: [],
        error: `Discord API error: ${questsRes.status}`,
        message: 'Unable to fetch quests from Discord. Please check your token.'
      })
    }

    const questsData = await questsRes.json()
    const rawQuests = questsData.quests || []

    // Get current time for filtering
    const now = new Date()

    // Process and filter real quests
    const processedQuests = rawQuests
      .map((quest: any) => {
        const config = quest.config || {}
        const messages = config.messages || {}
        const application = config.application || {}
        const taskConfig = config.task_config_v2 || {}
        const tasks = taskConfig.tasks || {}
        const userStatus = quest.user_status || {}

        // Parse dates
        const expiresAt = new Date(config.expires_at)
        const startsAt = new Date(config.starts_at)

        // Determine quest status - FIXED LOGIC
        let status: 'available' | 'in_progress' | 'completed' | 'expired' = 'available'
        const isExpired = now > expiresAt
        
        // Progress tracking
        const progressSeconds = userStatus.stream_progress_seconds || 0
        const taskEntry = Object.entries(tasks)[0]
        const [, taskDetails] = taskEntry || ['UNKNOWN', {}]
        const targetSeconds = (taskDetails as any)?.target || 900
        const hasProgress = progressSeconds > 0
        const isProgressComplete = progressSeconds >= targetSeconds
        
        // CORRECT completion detection:
        // 1. Must have is_claimed = true (user actually claimed/rewarded)
        // 2. OR must have 100% progress + completed_at is a real timestamp (not 0 or empty)
        const claimedReward = userStatus.is_claimed === true
        const hasRealCompletionTimestamp = userStatus.completed_at && 
                                          userStatus.completed_at > 0 && 
                                          typeof userStatus.completed_at === 'number' &&
                                          userStatus.completed_at > 1000000000000 // Valid Unix timestamp (ms)
        const isCompleted = claimedReward || (hasRealCompletionTimestamp && isProgressComplete)
        
        // Determine status with FIXED logic
        if (isCompleted) {
          status = 'completed'
        } else if (isExpired) {
          status = 'expired'
        } else if (hasProgress) {
          status = 'in_progress'
        } else {
          status = 'available'
        }

        // Extract task info (already extracted above for status calculation)
        const [taskType] = taskEntry || ['UNKNOWN', {}]
        const progressPercent = Math.min((progressSeconds / targetSeconds) * 100, 100)

        return {
          id: quest.id,
          name: messages.quest_name || application.name || 'Unknown Quest',
          description: `${application.name} - ${messages.game_publisher || 'Unknown Publisher'}`,
          status,
          reward: getRewardFromFeatures(config.features),
          progress: Math.round(progressPercent),
          totalTime: Math.ceil(targetSeconds / 60), // Convert to minutes
          gameName: application.name || 'Unknown Game',
          gameIcon: getGameIcon(application.id),
          appId: application.id,
          isReal: true,
          canComplete: !isExpired && !isCompleted,
          
          // Additional real data
          publisher: messages.game_publisher || 'Unknown',
          taskType: taskType,
          taskTargetSeconds: targetSeconds,
          progressSeconds: progressSeconds,
          remainingSeconds: Math.max(0, targetSeconds - progressSeconds),
          startsAt: config.starts_at,
          expiresAt: config.expires_at,
          isExpired,
          isCompleted,
          enrolledAt: userStatus.enrolled_at,
          completedAt: userStatus.completed_at,
          claimedAt: userStatus.claimed_at,
          isClaimed: userStatus.is_claimed || false,
          
          // Asset URLs
          heroImage: config.assets?.hero 
            ? `https://cdn.discordapp.com/quest-assets/${config.assets.hero}` 
            : null,
          gameTile: config.assets?.game_tile 
            ? `https://cdn.discordapp.com/quest-assets/${config.assets.game_tile}` 
            : null,
          
          // Colors
          primaryColor: config.colors?.primary || '#5865F2',
          secondaryColor: config.colors?.secondary || '#000000',
          
          // Application link
          appLink: application.link || null
        }
      })
      .filter((quest: any) => {
        // Only show non-expired quests by default, or completed ones
        return !quest.isExpired || quest.isCompleted
      })
      .sort((a: any, b: any) => {
        // Sort: available first, then in_progress, then completed, expired last
        const statusOrder = { 'available': 0, 'in_progress': 1, 'completed': 2, 'expired': 3 }
        return (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4)
      })

    // Summary statistics
    const summary = {
      total: processedQuests.length,
      available: processedQuests.filter((q: any) => q.status === 'available').length,
      inProgress: processedQuests.filter((q: any) => q.status === 'in_progress').length,
      completed: processedQuests.filter((q: any) => q.status === 'completed').length,
      expired: processedQuests.filter((q: any) => q.status === 'expired').length
    }

    return NextResponse.json({
      success: true,
      quests: processedQuests,
      summary,
      fetchedAt: now.toISOString(),
      message: `Found ${processedQuests.length} quests (${summary.available} available, ${summary.completed} completed)`,
      note: 'These are REAL Discord quests. Completion requires local gameplay detection.',
      method: 'PLAY_ON_DESKTOP - Requires local Discord client with Rich Presence'
    })

  } catch (error) {
    console.error('[QUESTS API Error]', error)
    
    return NextResponse.json({
      success: true,
      quests: [],
      error: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      message: 'Unable to fetch quests. Please try again.'
    })
  }
}

// Helper function to determine reward based on features
function getRewardFromFeatures(features?: number[]): string {
  if (!features || features.length === 0) return 'Rewards'
  
  // Common reward patterns based on feature flags
  const featureSum = features.reduce((a, b) => a + b, 0)
  
  if (features.includes(15)) return '⊙ 700 Orbs + PFP' // High value quest
  if (features.includes(7)) return '⊙ 200 Orbs' // Standard quest
  if (features.includes(3)) return '⊙ 100 Orbs' // Small quest
  
  return 'Orbs Reward'
}

// Helper function to get game icon URL
function getGameIcon(appId?: string): string {
  if (!appId) return '🎮'
  
  // Return CDN URL for app icon
  return `https://cdn.discordapp.com/app-icons/${appId}/icon.png?size=64`
}
