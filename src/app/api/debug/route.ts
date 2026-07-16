import { NextRequest, NextResponse } from 'next/server'
import { getActiveWebClientSessions, getWebClientSessionStatus } from '@/lib/webclient-activity'

// GET /api/debug - REAL debugging info (no fake data!)
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    
    if (!sessionId) {
      // Return all active sessions
      const sessions = getActiveWebClientSessions()
      
      return NextResponse.json({
        debug: true,
        message: 'REAL debugging info - no fake data!',
        timestamp: new Date().toISOString(),
        activeSessionsCount: sessions.length,
        sessions: sessions.map(s => ({
          id: s.id,
          questId: s.questId,
          gameName: s.gameName,
          status: s.status,
          elapsedSeconds: Math.floor((Date.now() - s.startTime.getTime()) / 1000),
          hasBrowser: !!s.browser,
          hasPage: !!s.page,
          lastActivityUpdate: s.lastActivityUpdate?.toISOString() || null,
        })),
        
        realityCheck: {
          ourProgressIs: "TIMER_BASED_FAKE",
          actualDiscordProgress: "UNKNOWN_NEED_TO_CHECK",
          needToVerify: [
            "Does browser actually load Discord?",
            "Does WebSocket connect to gateway?",
            "Does activity payload get sent?",
            "Does Discord accept the activity?"
          ]
        }
      })
    }
    
    // Get specific session
    const session = getWebClientSessionStatus(sessionId)
    
    if (!session) {
      return NextResponse.json({
        error: 'Session not found',
        hint: 'Session may have been cancelled or never started'
      }, { status: 404 })
    }
    
    return NextResponse.json({
      debug: true,
      sessionId: session.id,
      
      // REAL DATA (not fake)
      actualStatus: {
        status: session.status,
        startTime: session.startTime.toISOString(),
        currentTime: new Date().toISOString(),
        realElapsedSeconds: Math.floor((Date.now() - session.startTime.getTime()) / 1000),
        hasBrowser: !!session.browser,
        hasPage: !!session.page,
        lastActivityUpdate: session.lastActivityUpdate?.toISOString() || null,
        error: session.error || null
      },
      
      whatWeNeedToVerify: [
        "1. Is browser still alive? (hasBrowser)",
        "2. Did Discord web client load properly?",
        "3. Did WebSocket hook capture gateway connection?",
        "4. Was activity payload actually sent via WS?",
        "5. Did Discord accept and register the activity?"
      ],
      
      howToCheckRealProgress: [
        "Open Discord app → User Settings → Quests",
        "Check if EA SPORTS FC 26 shows > 0% progress",
        "If still 0% → Our system is NOT working",
        "If > 0% → System IS actually working!"
      ]
    })
    
  } catch (error) {
    return NextResponse.json({
      error: 'Debug endpoint failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 })
  }
}
