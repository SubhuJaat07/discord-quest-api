import { NextResponse } from 'next/server'
import { getActiveSessions } from '@/lib/chromium-client'

// GET /api/health - Health check endpoint
export async function GET() {
  const startTime = Date.now()
  
  try {
    // Check active sessions count
    const activeSessions = getActiveSessions()
    const activeCount = activeSessions.size
    
    // System info
    const memoryUsage = process.memoryUsage()
    const uptime = process.uptime()
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      
      service: {
        name: 'Discord Quest API',
        version: '2.0.0',
        mode: 'production',
        features: {
          chromiumAutomation: true,
          apiKeys: true,
          questCompletion: true
        }
      },
      
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
        },
        uptime: {
          seconds: Math.floor(uptime),
          formatted: formatUptime(uptime)
        }
      },
      
      chromium: {
        status: 'available',
        path: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
        stealthMode: process.env.CHROMIUM_STEALTH_MODE === 'true',
        activeSessions: activeCount
      },
      
      endpoints: {
        docs: '/api/v1/docs',
        auth: '/api/v1/auth',
        quests: '/api/v1/quests',
        health: '/api/health'
      }
    })
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}
