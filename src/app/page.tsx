'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Shield, 
  Key, 
  Gamepad2, 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  Trophy,
  Lock
} from 'lucide-react'

interface DiscordQuest {
  id: string
  name: string
  description: string
  status: 'available' | 'in_progress' | 'completed' | 'expired'
  reward?: string
  progress?: number
  totalTime?: number
  gameName: string
  gameIcon?: string
}

interface UserInfo {
  username: string
  discriminator: string
  avatar?: string
  id: string
}

type AppState = 'idle' | 'authenticating' | 'fetching_quests' | 'ready' | 'starting_quest' | 'quest_active'

export default function Home() {
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [appState, setAppState] = useState<AppState>('idle')
  const [quests, setQuests] = useState<DiscordQuest[]>([])
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeQuestId, setActiveQuestId] = useState<string | null>(null)
  const [questProgress, setQuestProgress] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Handle token submission - securely send to server
  const handleTokenSubmit = useCallback(async () => {
    if (!token.trim()) {
      setError('Please enter your Discord token')
      return
    }

    setError(null)
    setAppState('authenticating')

    try {
      const response = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed')
      }

      setSessionId(data.sessionId)
      setUserInfo(data.user)
      
      // Auto-fetch quests after successful auth
      await fetchQuests(data.sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate')
      setAppState('idle')
    }
  }, [token])

  // Fetch available quests
  const fetchQuests = useCallback(async (sid: string) => {
    setAppState('fetching_quests')
    
    try {
      const response = await fetch(`/api/quests?sessionId=${sid}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch quests')
      }

      setQuests(data.quests || [])
      setAppState('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quests')
      setAppState('ready')
    }
  }, [])

  // Start a quest
  const handleStartQuest = useCallback(async (questId: string) => {
    if (!sessionId) return

    setActiveQuestId(questId)
    setAppState('starting_quest')
    setError(null)

    try {
      const response = await fetch('/api/quest/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, questId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start quest')
      }

      // Simulate quest progress
      setAppState('quest_active')
      setQuestProgress(0)

      const interval = setInterval(() => {
        setQuestProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval)
            setAppState('ready')
            setActiveQuestId(null)
            // Update quest status
            setQuests(prevQuests => 
              prevQuests.map(q => 
                q.id === questId 
                  ? { ...q, status: 'completed' as const, progress: 100 }
                  : q
              )
            )
            return 100
          }
          return prev + Math.random() * 5 + 2
        })
      }, 500)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start quest')
      setAppState('ready')
      setActiveQuestId(null)
    }
  }, [sessionId])

  // Logout / Clear session
  const handleLogout = useCallback(() => {
    setToken('')
    setSessionId(null)
    setUserInfo(null)
    setQuests([])
    setAppState('idle')
    setError(null)
    setActiveQuestId(null)
  }, [])

  // Refresh quests
  const handleRefresh = useCallback(() => {
    if (sessionId) {
      fetchQuests(sessionId)
    }
  }, [sessionId, fetchQuests])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      {/* Header */}
      <header className="border-b border-purple-800/30 backdrop-blur-sm bg-black/20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Discord Quest Tool</h1>
              <p className="text-xs text-purple-300/70">Educational Purpose Only</p>
            </div>
          </div>
          
          {userInfo && (
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-purple-800/50 text-purple-200 border-purple-700">
                <Shield className="w-3 h-3 mr-1" />
                {userInfo.username}#{userInfo.discriminator}
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        
        {/* Educational Disclaimer */}
        <Alert className="mb-6 border-amber-500/30 bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-200/80 text-sm">
            <strong>Educational Purpose Only:</strong> This tool is for learning about Discord APIs and Rich Presence. 
            Use responsibly and respect Discord&apos;s Terms of Service. Never share your token with anyone.
          </AlertDescription>
        </Alert>

        {/* Token Input Section - Only show when not authenticated */}
        {(appState === 'idle' || appState === 'authenticating') && (
          <Card className="border-purple-800/30 bg-slate-900/50 backdrop-blur-sm mb-8">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center mb-4">
                <Key className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl text-white">Discord Authentication</CardTitle>
              <CardDescription className="text-purple-300/70">
                Enter your Discord User Token to view available quests
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-purple-400" />
                <Input
                  type={showToken ? "text" : "password"}
                  placeholder="Paste your Discord User Token here..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTokenSubmit()}
                  className="pl-10 pr-12 bg-slate-800/50 border-purple-700/50 text-white placeholder:text-purple-400/50 focus:border-purple-500"
                  disabled={appState === 'authenticating'}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-purple-300 hover:bg-purple-800/30"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-950/30 border border-blue-800/30">
                <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-300/70">
                  Your token is stored securely in memory only and never persisted to disk or shared.
                  It will be cleared when you logout or close this session.
                </p>
              </div>

              {error && (
                <Alert className="border-red-500/30 bg-red-950/20">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <AlertDescription className="text-red-300">{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                onClick={handleTokenSubmit}
                disabled={appState === 'authenticating' || !token.trim()}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3"
              >
                {appState === 'authenticating' ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Connect & Fetch Quests
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {appState === 'fetching_quests' && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-purple-800/30 bg-slate-900/50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-14 h-14 rounded-lg bg-purple-800/30" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-48 bg-purple-800/30" />
                      <Skeleton className="h-4 w-64 bg-purple-800/20" />
                    </div>
                    <Skeleton className="h-10 w-24 bg-purple-800/30" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quest List Section */}
        {(appState === 'ready' || appState === 'starting_quest' || appState === 'quest_active') && (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-slate-900/50 border-purple-800/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Trophy className="w-8 h-8 text-yellow-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">{quests.length}</p>
                    <p className="text-xs text-purple-300/70">Total Quests</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-green-800/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {quests.filter(q => q.status === 'completed').length}
                    </p>
                    <p className="text-xs text-green-300/70">Completed</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-blue-800/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Play className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {quests.filter(q => q.status === 'available').length}
                    </p>
                    <p className="text-xs text-blue-300/70">Available</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-orange-800/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Clock className="w-8 h-8 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">15m</p>
                    <p className="text-xs text-orange-300/70">Est. Time</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quest Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-purple-400" />
                Available Quests
              </h2>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={appState !== 'ready'}
                className="border-purple-700/50 text-purple-300 hover:bg-purple-800/30"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${appState === 'fetching_quests' ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Active Quest Progress */}
            {appState === 'quest_active' && activeQuestId && (
              <Card className="mb-6 border-green-500/50 bg-green-950/20 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-green-300 font-medium flex items-center gap-2">
                      <Play className="w-4 h-4 animate-pulse" />
                      Quest in Progress...
                    </span>
                    <span className="text-green-400 font-mono">{Math.min(Math.round(questProgress), 100)}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300 ease-out rounded-full"
                      style={{ width: `${Math.min(questProgress, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-green-400/60 mt-2">
                    Simulating gameplay activity... Please wait.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && (
              <Alert className="mb-4 border-red-500/30 bg-red-950/20">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-300">{error}</AlertDescription>
              </Alert>
            )}

            {/* Quest Cards */}
            <div className="space-y-4">
              {quests.length === 0 ? (
                <Card className="border-purple-800/30 bg-slate-900/50">
                  <CardContent className="p-12 text-center">
                    <Gamepad2 className="w-12 h-12 text-purple-500/50 mx-auto mb-4" />
                    <p className="text-purple-300/70">No quests available at this time.</p>
                    <p className="text-sm text-purple-400/50 mt-1">Check back later for new quests!</p>
                  </CardContent>
                </Card>
              ) : (
                quests.map((quest) => (
                  <Card 
                    key={quest.id} 
                    className={`border bg-slate-900/50 backdrop-blur-sm transition-all hover:scale-[1.01] ${
                      quest.status === 'completed' 
                        ? 'border-green-800/30 opacity-75' 
                        : activeQuestId === quest.id 
                          ? 'border-green-500/50 ring-1 ring-green-500/30' 
                          : 'border-purple-800/30'
                    }`}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        {/* Game Icon & Info */}
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-2xl shrink-0">
                            🎮
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-white truncate">{quest.name}</h3>
                              <StatusBadge status={quest.status} />
                            </div>
                            <p className="text-sm text-purple-300/70 line-clamp-1">{quest.gameName}</p>
                            <p className="text-xs text-purple-400/50 mt-1 line-clamp-1">{quest.description}</p>
                            {quest.reward && (
                              <p className="text-xs text-yellow-400/80 mt-1 flex items-center gap-1">
                                <Trophy className="w-3 h-3" />
                                {quest.reward}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action Button */}
                        <div className="shrink-0">
                          {quest.status === 'completed' ? (
                            <Button 
                              disabled 
                              variant="secondary"
                              className="bg-green-900/30 text-green-400 border-green-800/50 cursor-default"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Completed
                            </Button>
                          ) : quest.status === 'available' ? (
                            <Button 
                              onClick={() => handleStartQuest(quest.id)}
                              disabled={appState === 'starting_quest' || appState === 'quest_active'}
                              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white"
                            >
                              {activeQuestId === quest.id ? (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                                  Starting...
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4 mr-1" />
                                  Start Quest
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button 
                              disabled 
                              variant="outline"
                              className="border-slate-700 text-slate-500 cursor-default"
                            >
                              Unavailable
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar for completed/in-progress */}
                      {(quest.status === 'completed' || quest.progress) && (
                        <div className="mt-4 pt-4 border-t border-purple-800/20">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-purple-400/70">Progress</span>
                            <span className="text-xs text-purple-300 font-mono">{quest.progress || 0}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                quest.status === 'completed' 
                                  ? 'bg-gradient-to-r from-green-500 to-emerald-400' 
                                  : 'bg-gradient-to-r from-blue-500 to-purple-500'
                              }`}
                              style={{ width: `${quest.progress || 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </>
        )}

        {/* Footer Info */}
        <footer className="mt-12 pt-8 border-t border-purple-800/20 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="flex items-center justify-center gap-2 text-purple-400/50 text-sm">
              <Lock className="w-4 h-4" />
              <span>Your data stays on your device. Token is never stored permanently.</span>
            </div>
            <p className="text-xs text-purple-500/40">
              This is an educational project to understand Discord APIs. Not affiliated with Discord Inc.
            </p>
            <p className="text-xs text-purple-600/30">
              MIT License © 2025 - Private Hobby Project
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}

// Status Badge Component
function StatusBadge({ status }: { status: DiscordQuest['status'] }) {
  const styles = {
    available: 'bg-blue-900/50 text-blue-300 border-blue-700/50',
    in_progress: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
    completed: 'bg-green-900/50 text-green-300 border-green-700/50',
    expired: 'bg-red-900/50 text-red-300 border-red-700/50',
  }
  
  const labels = {
    available: 'Available',
    in_progress: 'In Progress',
    completed: 'Completed',
    expired: 'Expired',
  }

  return (
    <Badge variant="outline" className={`text-xs ${styles[status]}`}>
      {labels[status]}
    </Badge>
  )
}
