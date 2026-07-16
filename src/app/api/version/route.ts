import { NextResponse } from 'next/server'

// Version tracking - update this with each deployment
const VERSION_INFO = {
  version: "1.0.0",
  buildNumber: "001",
  buildDate: new Date().toISOString(),
  features: [
    "Cookie-based auth (persistent sessions)",
    "WebClient activity injection via Puppeteer",
    "WebSocket hooking for presence updates",
    "Auto-login on page refresh"
  ],
  knownIssues: [
    "localStorage error in headless mode (fixed with cookie injection)",
    "Quest completion not verified yet (testing phase)"
  ],
  changelog: {
    "1.0.0": "Initial release with WebClient activity injection + cookie persistence fix"
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
