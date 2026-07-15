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
