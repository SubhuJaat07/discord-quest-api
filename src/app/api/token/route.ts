import { NextRequest, NextResponse } from 'next/server'

// In-memory storage for tokens (NEVER persist to disk/database)
// This is cleared on server restart
const sessions = new Map<string, {
  token: string
  user: {
    username: string
    discriminator: string
    avatar?: string
    id: string
  }
  createdAt: number
}>()

// Generate a random session ID
function generateSessionId(): string {
  return 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// Validate Discord token format (basic check)
function isValidTokenFormat(token: string): boolean {
  // Discord user tokens are base64-like strings with dots
  const parts = token.split('.')
  if (parts.length !== 3) return false
  
  // Each part should be reasonable length
  return parts.every(part => part.length >= 10 && part.length >= 20)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    const trimmedToken = token.trim()

    if (!isValidTokenFormat(trimmedToken)) {
      return NextResponse.json(
        { error: 'Invalid token format. Please provide a valid Discord user token.' },
        { status: 400 }
      )
    }

    // Verify token by calling Discord API
    let userInfo
    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          'Authorization': `Bearer ${trimmedToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          return NextResponse.json(
            { error: 'Token is invalid or expired. Please check your token.' },
            { status: 401 }
          )
        }
        throw new Error(`Discord API returned ${response.status}`)
      }

      userInfo = await response.json()
    } catch (error) {
      console.error('Discord API error:', error)
      return NextResponse.json(
        { error: 'Failed to verify token with Discord. Please try again.' },
        { status: 502 }
      )
    }

    // Create session - store token securely in memory only
    const sessionId = generateSessionId()
    
    sessions.set(sessionId, {
      token: trimmedToken,
      user: {
        username: userInfo.username,
        discriminator: userInfo.discriminator,
        avatar: userInfo.avatar,
        id: userInfo.id
      },
      createdAt: Date.now()
    })

    // Clean up old sessions (older than 1 hour)
    cleanupOldSessions()

    // Return session info WITHOUT the actual token
    return NextResponse.json({
      success: true,
      sessionId,
      user: {
        username: userInfo.username,
        discriminator: userInfo.discriminator,
        id: userInfo.id
      },
      message: 'Authentication successful'
    })

  } catch (error) {
    console.error('Token API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE endpoint to clear session
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId)
      return NextResponse.json({ success: true, message: 'Session cleared' })
    }

    return NextResponse.json(
      { error: 'Invalid session' },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear session' },
      { status: 500 }
    )
  }
}

// Helper function to get token from session (used by other APIs)
export function getSessionToken(sessionId: string): string | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  
  // Check if session is expired (1 hour)
  if (Date.now() - session.createdAt > 3600000) {
    sessions.delete(sessionId)
    return null
  }
  
  return session.token
}

// Helper to get user info from session
export function getSessionUser(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return null
  
  if (Date.now() - session.createdAt > 3600000) {
    sessions.delete(sessionId)
    return null
  }
  
  return session.user
}

// Cleanup old sessions
function cleanupOldSessions() {
  const now = Date.now()
  const maxAge = 3600000 // 1 hour
  
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > maxAge) {
      sessions.delete(id)
    }
  }
}
