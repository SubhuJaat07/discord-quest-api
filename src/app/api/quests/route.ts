import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken } from '@/lib/session'

// Mock quest data for educational/demo purposes
// In a real scenario, this would come from Discord's internal quest APIs
function getMockQuests(): Array<{
  id: string
  name: string
  description: string
  status: 'available' | 'in_progress' | 'completed' | 'expired'
  reward?: string
  progress?: number
  totalTime?: number
  gameName: string
  gameIcon?: string
}> {
  return [
    {
      id: 'quest_001',
      name: 'Play Overwatch 2',
      description: 'Play Overwatch 2 for 15 minutes to complete this quest and earn exclusive rewards.',
      status: 'available',
      reward: 'Overwatch 2 Spray + 500 XP',
      totalTime: 15,
      gameName: 'Overwatch 2',
      gameIcon: '🎯'
    },
    {
      id: 'quest_002',
      name: 'Valorant Challenge',
      description: 'Jump into Valorant and play any game mode for 15 minutes.',
      status: 'available',
      reward: 'Valorant Player Card',
      totalTime: 15,
      gameName: 'VALORANT',
      gameIcon: '🔫'
    },
    {
      id: 'quest_003',
      name: 'League of Legends Quest',
      description: "Summoner's Rift awaits! Play a match or practice tool for 15 minutes.",
      status: 'available',
      reward: 'LoL Icon + Blue Essence',
      totalTime: 15,
      gameName: 'League of Legends',
      gameIcon: '⚔️'
    },
    {
      id: 'quest_004',
      name: 'Minecraft Adventure',
      description: 'Explore the world of Minecraft. Play for 15 minutes in any mode.',
      status: 'completed',
      progress: 100,
      reward: 'Minecraft Cape (Completed)',
      totalTime: 15,
      gameName: 'Minecraft',
      gameIcon: '⛏️'
    },
    {
      id: 'quest_005',
      name: 'Roblox Experience',
      description: 'Join any Roblox experience and play for 15 minutes.',
      status: 'available',
      reward: 'Roblox Avatar Item',
      totalTime: 15,
      gameName: 'Roblox',
      gameIcon: '🎮'
    },
    {
      id: 'quest_006',
      name: 'GTA V Session',
      description: "Enter Los Santos and engage in gameplay for 15 minutes.",
      status: 'expired',
      reward: 'GTA V In-Game Cash (Expired)',
      totalTime: 15,
      gameName: 'Grand Theft Auto V',
      gameIcon: '🚗'
    },
    {
      id: 'quest_007',
      name: 'CS2 Match Day',
      description: 'Compete in Counter-Strike 2 for 15 minutes of active gameplay.',
      status: 'available',
      reward: 'CS2 Sticker Capsule',
      totalTime: 15,
      gameName: 'Counter-Strike 2',
      gameIcon: '💣'
    },
    {
      id: 'quest_008',
      name: 'Fortnite Battle Royale',
      description: 'Drop into the island and survive! Play for 15 minutes.',
      status: 'available',
      reward: 'Fortnite Emote + V-Bucks',
      totalTime: 15,
      gameName: 'Fortnite',
      gameIcon: '🎯'
    }
  ]
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 401 }
      )
    }

    // Verify session is valid
    const token = getSessionToken(sessionId)
    if (!token) {
      return NextResponse.json(
        { error: 'Session expired or invalid. Please authenticate again.' },
        { status: 401 }
      )
    }

    // Try to get real detectable games from Discord API
    let discordGames: Array<{ name: string; id: string }> = []
    
    try {
      const response = await fetch('https://discord.com/api/v10/applications/detectable', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        discordGames = data.slice(0, 20).map((app: { name: string; id: string }) => ({
          name: app.name,
          id: app.id
        }))
      }
    } catch (error) {
      console.error('Failed to fetch detectable games:', error)
      // Continue with mock data if API fails
    }

    // Return mock quests combined with real Discord games info
    const quests = getMockQuests()
    
    return NextResponse.json({
      success: true,
      quests,
      detectedGames: discordGames.length,
      message: discordGames.length > 0 
        ? `Found ${discordGames.length} detectable games` 
        : 'Using demo quest data for educational purposes'
    })

  } catch (error) {
    console.error('Quests API error:', error)
    
    // Even on error, return mock data for educational purposes
    return NextResponse.json({
      success: true,
      quests: getMockQuests(),
      detectedGames: 0,
      message: 'Demo mode - Educational purposes only'
    })
  }
}
