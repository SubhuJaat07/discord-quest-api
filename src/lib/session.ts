// Session & Token Management Utilities
// This file handles secure in-memory storage of Discord tokens

export interface SessionData {
  token: string
  user: {
    username: string
    discriminator: string
    avatar?: string
    id: string
  }
  createdAt: number
}

// In-memory storage for tokens (NEVER persist to disk/database)
// This is cleared on server restart
const sessions = new Map<string, SessionData>()

// Generate a random session ID
export function generateSessionId(): string {
  return 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// Validate Discord token format (basic check)
export function isValidTokenFormat(token: string): boolean {
  // Discord user tokens are base64-like strings with dots (e.g., "base64.base64.base64")
  // Format: UserID.Timestamp.HMAC
  const trimmed = token.trim()
  
  // Must have exactly 2 dots (3 parts)
  const parts = trimmed.split('.')
  if (parts.length !== 3) return false
  
  // Each part should have reasonable length (Discord tokens vary in length)
  // Part 1 (UserID): typically 18+ chars
  // Part 2 (Timestamp): typically 10+ chars  
  // Part 3 (HMAC): typically 6+ chars
  const [userId, timestamp, hmac] = parts
  
  return (
    userId.length >= 15 &&      // User ID portion
    timestamp.length >= 6 &&    // Timestamp portion
    hmac.length >= 6 &&         // HMAC hash portion
    /^[a-zA-Z0-9_\-]+$/.test(userId) &&
    /^[a-zA-Z0-9]+$/.test(timestamp) &&
    /^[a-zA-Z0-9_\-]+$/.test(hmac)
  )
}

// Create a new session
export function createSession(token: string, user: SessionData['user']): string {
  const sessionId = generateSessionId()
  
  sessions.set(sessionId, {
    token,
    user,
    createdAt: Date.now()
  })

  // Clean up old sessions (older than 1 hour)
  cleanupOldSessions()

  return sessionId
}

// Get token from session
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

// Get user info from session
export function getSessionUser(sessionId: string): SessionData['user'] | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  
  if (Date.now() - session.createdAt > 3600000) {
    sessions.delete(sessionId)
    return null
  }
  
  return session.user
}

// Delete/clear a session
export function deleteSession(sessionId: string): boolean {
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId)
    return true
  }
  return false
}

// Cleanup old sessions (older than 1 hour)
function cleanupOldSessions() {
  const now = Date.now()
  const maxAge = 3600000 // 1 hour
  
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > maxAge) {
      sessions.delete(id)
    }
  }
}
