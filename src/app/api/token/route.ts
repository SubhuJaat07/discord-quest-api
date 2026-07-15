import { NextRequest, NextResponse } from 'next/server'
import {
  isValidTokenFormat,
  createSession,
  setSessionCookies,
  clearSession,
  SESSION_COOKIE_NAME,
  TOKEN_COOKIE_NAME
} from '@/lib/session'

// POST - Login with Discord token (sets persistent cookies!)
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
          'Authorization': trimmedToken,
          'Content-Type': 'application/json',
          'User-Agent': 'DiscordQuestTool/2.0 (Chromium Edition)'
        }
      })

      if (!response.ok) {
        console.error('Discord API error:', response.status, response.statusText)
        
        if (response.status === 401) {
          return NextResponse.json(
            { error: 'Token verification failed. Copy complete token from DevTools (F12 → Application → Local Storage).' },
            { status: 401 }
          )
        }
        if (response.status === 403) {
          return NextResponse.json(
            { error: 'Token blocked. Account might be locked or token revoked.' },
            { status: 403 }
          )
        }
        if (response.status === 429) {
          return NextResponse.json(
            { error: 'Rate limited. Please wait and try again.' },
            { status: 429 }
          )
        }
        throw new Error(`Discord API returned ${response.status}`)
      }

      userInfo = await response.json()
    } catch (error) {
      console.error('Discord API error:', error)
      return NextResponse.json(
        { error: 'Failed to connect to Discord. Check internet connection.' },
        { status: 502 }
      )
    }

    // Create session
    const sessionId = createSession(trimmedToken, {
      username: userInfo.username,
      discriminator: userInfo.discriminator,
      avatar: userInfo.avatar,
      id: userInfo.id
    })

    // 🍪 SET COOKIES - This is the KEY FIX!
    // Cookies persist across redeployments!
    await setSessionCookies(sessionId, trimmedToken, {
      username: userInfo.username,
      discriminator: userInfo.discriminator,
      avatar: userInfo.avatar,
      id: userInfo.id
    })

    console.log(`[TOKEN] User ${userInfo.username} logged in - cookies set!`)

    // Return success WITH cookies set
    const response = NextResponse.json({
      success: true,
      sessionId,
      user: {
        username: userInfo.username,
        discriminator: userInfo.discriminator,
        id: userInfo.id,
        avatar: userInfo.avatar
      },
      message: '✅ Login successful! Token saved securely.',
      cookieInfo: {
        sessionCookie: SESSION_COOKIE_NAME,
        tokenCookie: TOKEN_COOKIE_NAME,
        expiresIn: '7 days',
        survivesRedeploy: true
      },
      features: [
        '🔒 Token stored in httpOnly cookies',
        '♻️ Survives server restarts/redeploys',
        '⏰ Valid for 7 days',
        '🚀 Ready to start quests!'
      ]
    })

    return response

  } catch (error) {
    console.error('Token API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET - Check current login status (reads cookies)
export async function GET() {
  try {
    const { getSessionFromRequest } = await import('@/lib/session')
    const session = await getSessionFromRequest()
    
    if (session && session.token) {
      // Verify token still works
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          'Authorization': session.token,
          'User-Agent': 'DiscordQuestTool/2.0'
        }
      })
      
      if (response.ok) {
        const user = await response.json()
        return NextResponse.json({
          loggedIn: true,
          user: {
            username: user.username,
            discriminator: user.discriminator,
            id: user.id,
            avatar: user.avatar
          },
          sessionId: session.sessionId,
          message: '✅ You are logged in!',
          cookieStatus: {
            hasSessionCookie: true,
            hasTokenCookie: true,
            readyForQuests: true
          }
        })
      } else {
        // Token expired or invalid
        return NextResponse.json({
          loggedIn: false,
          error: 'Token expired or invalid',
          suggestion: 'Please login again'
        })
      }
    }
    
    return NextResponse.json({
      loggedIn: false,
      message: 'Not logged in',
      suggestion: 'POST your Discord token to /api/token'
    })
    
  } catch (error) {
    return NextResponse.json({
      loggedIn: false,
      error: 'Failed to check status'
    }, { status: 500 })
  }
}

// DELETE - Logout (clear cookies)
export async function DELETE() {
  try {
    await clearSession()
    
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully. Cookies cleared.'
    })
    
    return response
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    )
  }
}
