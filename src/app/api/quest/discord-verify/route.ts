import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken } from '@/lib/session'

/**
 * REAL Discord Quest Progress Verification
 * 
 * This endpoint queries DISCORD'S OWN API to check actual quest progress.
 * No fake data - only what Discord returns!
 * 
 * Endpoint: GET /api/quest/discord-verify?questId=xxx
 * 
 * Returns:
 * - Raw Discord API response (for debugging)
 * - Parsed progress for specific quest
 * - Whether Discord has ANY recorded progress
 */

export async function GET(request: NextRequest) {
  try {
    const questId = request.nextUrl.searchParams.get('questId')
    const token = await getSessionToken()
    
    if (!token) {
      return NextResponse.json({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
        hint: 'Login with /api/token first'
      }, { status: 401 })
    }

    console.log('[DISCORD VERIFY] Querying real Discord Quest API...')
    
    // 🔥🔥🔥 THE REAL DISCORD QUEST API 🔥🔥🔥
    // This is where Discord stores ACTUAL quest progress
    const discordResponse = await fetch('https://discord.com/api/v10/users/@me/quests', {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordClient/1.0 (Windows 10)',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })

    if (!discordResponse.ok) {
      console.error(`[DISCORD VERIFY] API Error: ${discordResponse.status}`)
      return NextResponse.json({
        error: `Discord API returned ${discordResponse.status}`,
        code: 'DISCORD_API_ERROR',
        status: discordResponse.status,
        statusText: discordResponse.statusText
      }, { status: discordResponse.status })
    }

    const questsData = await discordResponse.json()
    console.log(`[DISCORD VERIFY] Got ${Array.isArray(questsData) ? questsData.length : 'non-array'} quests`)

    // Find the specific quest if questId provided
    let targetQuest = null
    let otherQuests = []
    
    if (Array.isArray(questsData)) {
      for (const quest of questsData) {
        if (quest.id === questId || quest.quest_id === questId) {
          targetQuest = quest
        } else {
          otherQuests.push(quest)
        }
      }
    } else if (questsData && typeof questsData === 'object') {
      // Handle nested structure
      if (questsData.quests) {
        for (const quest of questsData.quests) {
          if (quest.id === questId || quest.quest_id === questId) {
            targetQuest = quest
          } else {
            otherQuests.push(quest)
          }
        }
      }
    }

    // 🎯 CRITICAL: Extract REAL progress information
    const verificationResult = {
      timestamp: new Date().toISOString(),
      queriedAt: Date.now(),
      
      // Raw data for debugging
      rawDiscordResponse: questsData,
      responseType: typeof questsData,
      isArray: Array.isArray(questsData),
      
      // Target quest analysis
      targetQuestId: questId,
      targetQuestFound: !!targetQuest,
      targetQuest: targetQuest ? {
        id: targetQuest.id || targetQuest.quest_id,
        // 🔥 THESE ARE THE FIELDS THAT MATTER FOR REAL PROGRESS
        status: targetQuest.status || targetQuest.user_status || 'unknown',
        progress: targetQuest.progress || targetQuest.progress_seconds || targetQuest.current_progress || 0,
        progressPercent: targetQuest.percent_complete || targetQuest.progress_percent || null,
        startTime: targetQuest.started_at || targetQuest.joined_at || null,
        elapsedSeconds: targetQuest.elapsed || targetQuest.time_played || 0,
        
        // All fields for debugging
        allFields: Object.keys(targetQuest),
        rawData: targetQuest
      } : null,
      
      // Other active quests
      otherQuestsCount: otherQuests.length,
      otherQuests: otherQuests.map(q => ({
        id: q.id || q.quest_id,
        status: q.status || q.user_status,
        name: q.config?.name || q.name || 'Unknown',
        hasProgress: !!(q.progress || q.progress_seconds || q.current_progress)
      })),
      
      // ✅ VERDICT - Is there ANY real progress?
      verdict: {
        hasAnyProgress: false,
        progressValue: 0,
        confidence: 'LOW', // LOW, MEDIUM, HIGH
        reason: ''
      }
    }

    // Calculate verdict based on REAL Discord data
    if (targetQuest) {
      const progressFields = [
        targetQuest.progress,
        targetQuest.progress_seconds,
        targetQuest.current_progress,
        targetQuest.elapsed,
        targetQuest.time_played
      ].filter(v => v && typeof v === 'number' && v > 0)
      
      const statusIndicatesProgress = ['IN_PROGRESS', 'active', 'started'].includes(
        targetQuest.status || targetQuest.user_status || ''
      )
      
      if (progressFields.length > 0) {
        const maxProgress = Math.max(...progressFields)
        verificationResult.verdict = {
          hasAnyProgress: true,
          progressValue: maxProgress,
          confidence: maxProgress > 60 ? 'HIGH' : maxProgress > 10 ? 'MEDIUM' : 'LOW',
          reason: `Discord reports ${maxProgress} seconds/units of progress`
        }
      } else if (statusIndicatesProgress) {
        verificationResult.verdict = {
          hasAnyProgress: true,
          progressValue: 0, // Status shows in-progress but no numeric value yet
          confidence: 'MEDIUM',
          reason: `Quest status is "${targetQuest.status || targetQuest.user_status}" - Discord sees it as active`
        }
      } else {
        verificationResult.verdict = {
          hasAnyProgress: false,
          progressValue: 0,
          confidence: 'HIGH',
          reason: `No progress detected. Status: ${targetQuest.status || targetQuest.user_status || 'no status field'}`
        }
      }
    } else {
      verificationResult.verdict = {
        hasAnyProgress: false,
        progressValue: 0,
        confidence: questId ? 'HIGH' : 'UNKNOWN',
        reason: questId 
          ? `Quest ${questId} not found in Discord's response` 
          : 'No questId specified - check otherQuests for available quests'
      }
    }

    console.log(`[DISCORD VERIFY] VERDICT: ${JSON.stringify(verificationResult.verdict)}`)
    
    return NextResponse.json({
      success: true,
      ...verificationResult,
      
      message: verificationResult.verdict.hasAnyProgress
        ? `✅ REAL Progress Detected! (${verificationResult.verdict.confidence} confidence)`
        : `❌ No Real Progress Yet (Discord shows 0%)`,
        
      whatThisMeans: verificationResult.verdict.hasAnyProgress
        ? [
            '🎉 Discord HAS recorded some progress!',
            '⏱️ Keep the session running to accumulate more time',
            `📊 Confidence: ${verificationResult.verdict.confidence} - ${verificationResult.verdict.reason}`
          ]
        : [
            '⚠️ Discord shows NO progress for this quest',
            '🔍 Possible reasons:',
            '   • Activity injection not reaching Discord correctly',
            '   • Quest not started/accepted yet',
            '   • Different validation method required',
            '💡 Try keeping quest-home page open in browser session'
          ],
          
      nextSteps: verificationResult.verdict.hasAnyProgress
        ? ['Continue running until quest completes', 'Check progress periodically']
        : [
            'Debug: Check if activity is being sent',
            'Try: Open discord.com/quest-home in browser',
            'Verify: Token has correct permissions'
          ]
    })

  } catch (error) {
    console.error('[DISCORD VERIFY] Error:', error)
    return NextResponse.json({
      error: 'Failed to verify with Discord API',
      code: 'VERIFICATION_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Alternative endpoint that tries multiple Discord API paths
 * Some quests might be under different endpoints
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questId, tryAlternateEndpoints = true } = body
    
    const token = await getSessionToken()
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const results = {}
    
    // Primary endpoint
    const primaryRes = await fetch('https://discord.com/api/v10/users/@me/quests', {
      headers: { 'Authorization': token, 'User-Agent': 'DiscordClient/1.0' }
    })
    results.primary = { 
      status: primaryRes.status, 
      data: primaryRes.ok ? await primaryRes.json() : null 
    }

    if (tryAlternateEndpoints) {
      // Try alternate endpoints that might have quest data
      const alternatePaths = [
        '/api/v10/users/@me/quests/progress',
        '/api/v9/users/@me/quests',
        '/api/v10/quests',
        '/api/v10/users/@me/activities'
      ]

      for (const path of alternatePaths) {
        try {
          const res = await fetch(`https://discord.com${path}`, {
            headers: { 'Authorization': token, 'User-Agent': 'DiscordClient/1.0' }
          })
          results[path] = {
            status: res.status,
            data: res.ok ? await res.json() : null
          }
        } catch (e) {
          results[path] = { error: e instanceof Error ? e.message : 'Failed' }
        }
      }
    }

    return NextResponse.json({
      success: true,
      questId,
      results,
      message: 'Checked multiple Discord API endpoints'
    })

  } catch (error) {
    return NextResponse.json({
      error: 'Multi-endpoint verification failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 })
  }
}
