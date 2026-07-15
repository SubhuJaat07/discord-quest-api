import { NextRequest, NextResponse } from 'next/server'
import {
  isValidTokenFormat,
  createSession,
  deleteSession
} from '@/lib/session'

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
    // Discord user tokens use direct Authorization (no Bearer prefix)
    let userInfo
    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          'Authorization': trimmedToken,
          'Content-Type': 'application/json',
          'User-Agent': 'DiscordQuestTool/1.0 (Educational)'
        }
      })

      if (!response.ok) {
        // Log for debugging (don't expose to client)
        console.error('Discord API error:', response.status, response.statusText)
        
        if (response.status === 401) {
          return NextResponse.json(
            { error: 'Token verification failed. Make sure you copied the complete token from Discord DevTools (F12 → Application → Local Storage).' },
            { status: 401 }
          )
        }
        if (response.status === 403) {
          return NextResponse.json(
            { error: 'Token blocked. Your account might be locked or token revoked.' },
            { status: 403 }
          )
        }
        if (response.status === 429) {
          return NextResponse.json(
            { error: 'Rate limited. Please wait a moment and try again.' },
            { status: 429 }
          )
        }
        throw new Error(`Discord API returned ${response.status}`)
      }

      userInfo = await response.json()
    } catch (error) {
      console.error('Discord API error:', error)
      return NextResponse.json(
        { error: 'Failed to connect to Discord. Please check your internet connection.' },
        { status: 502 }
      )
    }

    // Create session - store token securely in memory only
    const sessionId = createSession(trimmedToken, {
      username: userInfo.username,
      discriminator: userInfo.discriminator,
      avatar: userInfo.avatar,
      id: userInfo.id
    })

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

    if (sessionId && deleteSession(sessionId)) {
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
