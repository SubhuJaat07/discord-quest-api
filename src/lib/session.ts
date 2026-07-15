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
  // Discord user tokens are base64-like strings with dots
  const parts = token.split('.')
  if (parts.length !== 3) return false
  
  // Each part should be reasonable length
  return parts.every(part => part.length >= 10 && part.length >= 20)
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
