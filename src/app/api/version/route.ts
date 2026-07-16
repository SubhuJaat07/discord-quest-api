import { NextResponse } from 'next/server'

// Version tracking - update this with each deployment
const VERSION_INFO = {
  version: "1.0.1",
  buildNumber: "002",
  buildDate: new Date().toISOString(),
  features: [
    "Cookie-based auth (persistent sessions)",
    "WebClient activity injection via Puppeteer",
    "Improved WebSocket hooking with better logging",
    "Auto-login on page refresh",
    "Fallback activity injection methods"
  ],
  knownIssues: [
    "Activity may not inject if Discord gateway changes (monitoring)"
  ],
  changelog: {
    "1.0.0": "Initial release with WebClient activity injection + cookie persistence fix",
    "1.0.1": "Improved WebSocket hooking - better logging, fallback methods, proper gateway detection"
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
