import { NextResponse } from 'next/server'

// Version tracking - update this with each deployment
const VERSION_INFO = {
  version: "1.0.2",
  buildNumber: "003",
  buildDate: new Date().toISOString(),
  features: [
    "Cookie-based auth (persistent sessions)",
    "WebClient activity injection via Puppeteer",
    "Improved WebSocket hooking with better logging",
    "Auto-login on page refresh",
    "Multi-method activity refresh (3 fallback methods)",
    "15-second activity update interval"
  ],
  knownIssues: [
    "Discord may change gateway URL format (monitoring)"
  ],
  changelog: {
    "1.0.0": "Initial release + cookie persistence fix",
    "1.0.1": "Improved WebSocket hooking + better logging",
    "1.0.2": "Multi-method activity refresh (WS → UI events → page interaction)"
  }
}

// GET /api/version - Check deployed version
export async function GET() {
  return NextResponse.json({
    ...VERSION_INFO,
    environment: process.env.NODE_ENV || 'development',
    deploymentUrl: process.env.RAILWAY_PUBLIC_URL || 'local',
    status: 'active',
    message: `Discord Quest Tool v${VERSION_INFO.version} (Build ${VERSION_INFO.buildNumber})`
  })
}
