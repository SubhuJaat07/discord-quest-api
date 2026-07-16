'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
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
  Lock,
  Timer,
  XCircle,
  Zap,
  Wifi,
  Activity,
  Target,
  Download
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
  appId?: string
  isReal?: boolean
  canComplete?: boolean
}

interface UserInfo {
  username: string
  discriminator: string
  avatar?: string
  id: string
}

interface QuestStatus {
  id: string
  questId: string
  appName: string
  status: 'initializing' | 'detecting' | 'running' | 'completing' | 'completed' | 'failed' | 'cancelled'
  phase: string
  progress: number
  elapsedSeconds: number
  remainingSeconds: number
  totalSeconds: number
  formattedElapsed: string
  formattedRemaining: string
  rpcConnected: boolean
  activitySent: boolean
}

type AppState = 'idle' | 'authenticating' | 'fetching_quests' | 'ready' | 'starting_quest' | 'quest_active'

export default function Home() {
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [appState, setAppState] = useState<AppState>('idle')
  const [quests, setQuests] = useState<DiscordQuest[]>([])
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [activeQuestId, setActiveQuestId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  
  // Real-time quest status
  const [questStatus, setQuestStatus] = useState<QuestStatus | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // 🍪 AUTO-LOGIN: Check for existing session on page load!
  // This restores session from cookies - no need to re-enter token!
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        console.log('[Session] Checking for existing session...')
        const response = await fetch('/api/token', { method: 'GET' })
        const data = await response.json()
        
        if (data.loggedIn && data.user) {
          console.log('[Session] ✅ Found existing session!', data.user.username)
          setUserInfo(data.user)
          setSuccessMessage(`✅ Welcome back, ${data.user.username}! Session restored.`)
          
          // Auto-fetch quests
          await fetchQuests()
        } else {
          console.log('[Session] No existing session found')
        }
      } catch (err) {
        console.error('[Session] Error checking session:', err)
      }
    }
    
    // Only check if we're in idle state (not already logged in)
    if (appState === 'idle') {
      checkExistingSession()
    }
  }, []) // Run once on mount

  // Poll quest status when active
  useEffect(() => {
    if (appState === 'quest_active' && sessionId) {
      pollingRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/quest/start?sessionId=${sessionId}`)
          const data = await response.json()
          
          if (data.success) {
            // Update quest status from response
            if (data.progress) {
              setQuestStatus(prev => prev ? {
                ...prev,
                progress: data.progress.percent,
                elapsedSeconds: data.progress.elapsedSeconds,
                remainingSeconds: data.progress.remainingSeconds,
                formattedElapsed: data.progress.elapsedFormatted,
                formattedRemaining: data.progress.remainingFormatted,
                status: data.status === 'running' ? 'running' : 
                       data.status === 'error' ? 'failed' :
                       prev.status,
                phase: data.browser?.phase || data.status
              } : prev)
            }
            
            if (data.status === 'completed' || data.message?.includes('COMPLETE')) {
              clearInterval(pollingRef.current!)
              pollingRef.current = null
              setAppState('ready')
              setActiveQuestId(null)
              setSuccessMessage(`🎉 Quest completed successfully! Check Discord to claim reward.`)
              
              setQuests(prevQuests => 
                prevQuests.map(q => 
                  q.id === activeQuestId 
                    ? { ...q, status: 'completed' as const, progress: 100 }
                    : q
                )
              )
              
              setTimeout(() => setSuccessMessage(null), 10000)
            } else if (data.status === 'error') {
              clearInterval(pollingRef.current!)
              pollingRef.current = null
              setAppState('ready')
              setActiveQuestId(null)
              setError('Quest encountered an error. Please try again.')
            }
          }
        } catch (err) {
          console.error('Polling error:', err)
        }
      }, 3000)
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [appState, sessionId, activeQuestId])

  // Handle token submission
  const handleTokenSubmit = useCallback(async () => {
    if (!token.trim()) {
      setError('Please enter your Discord token')
      return
    }

    setError(null)
    setSuccessMessage(null)
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

      // Session is stored in cookies now, no need for client-side session ID
      setUserInfo(data.user)
      
      await fetchQuests()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate')
      setAppState('idle')
    }
  }, [token])

  // Fetch available quests (uses cookies for auth)
  const fetchQuests = useCallback(async () => {
    setAppState('fetching_quests')
    
    try {
      // No need to pass sessionId - API reads from cookies
      const response = await fetch('/api/quests')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch quests')
      }

      if (!data.success && data.code === 'NOT_AUTHENTICATED') {
        throw new Error('Session expired. Please login again.')
      }

      setQuests(data.quests || [])
      setAppState('ready')
      
      if (data.message && data.quests.length === 0) {
        setError(data.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quests')
      setAppState('ready')
    }
  }, [])

  // Start REAL quest completion via Web Client Injection
  const handleStartQuest = useCallback(async (questId: string) => {
    setActiveQuestId(questId)
    setAppState('starting_quest')
    setError(null)
    setSuccessMessage(null)
    setQuestStatus(null)

    try {
      const response = await fetch('/api/quest/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId })
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409 && data.currentQuest) {
          setError(`Already running: ${data.currentQuest.gameName} (${data.currentQuest.elapsed}s elapsed)`)
          setAppState('ready')
          setActiveQuestId(null)
          return
        }
        throw new Error(data.error || 'Failed to start quest')
      }

      // Quest started with WebClient method
      const newSessionId = data.sessionId
      setSessionId(newSessionId)
      setAppState('quest_active')
      
      setQuestStatus({
        id: newSessionId,
        questId,
        appName: quests.find(q => q.id === questId)?.gameName || 'Game',
        status: 'initializing',
        phase: 'launching',
        progress: 0,
        elapsedSeconds: 0,
        remainingSeconds: 900,
        totalSeconds: 900,
        formattedElapsed: '00:00',
        formattedRemaining: '15:00',
        rpcConnected: false,
        activitySent: false
      })

      setSuccessMessage(`🌐 Starting quest via Discord Web Client...`)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start quest')
      setAppState('ready')
      setActiveQuestId(null)
    }
  }, [quests])

  // Download local completion script
  const handleDownloadScript = useCallback(async (quest: DiscordQuest) => {
    if (!sessionId) return
    
    try {
      const response = await fetch('/api/quest/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId, 
          questId: quest.id, 
          appName: quest.gameName, 
          appId: quest.appId,
          platform: 'windows'
        })
      })
      
      if (!response.ok) throw new Error('Failed to generate script')
      
      // Get filename from headers or create one
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `complete_${quest.gameName.replace(/[^a-zA-Z0-9]/g, '_')}.bat`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }
      
      // Download file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      setSuccessMessage(`📥 Script downloaded! Run it locally with Discord open.`)
      setTimeout(() => setSuccessMessage(null), 8000)
    } catch (err) {
      setError('Failed to download script')
      setTimeout(() => setError(null), 5000)
    }
  }, [sessionId])

  // Cancel active quest
  const handleCancelQuest = useCallback(async () => {
    if (!sessionId) return

    try {
      const response = await fetch(`/api/quest/start?sessionId=${sessionId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        
        setAppState('ready')
        setActiveQuestId(null)
        setQuestStatus(null)
        setSessionId(null)
        setSuccessMessage(null)
        setError('Quest cancelled. Progress was lost.')
        setTimeout(() => setError(null), 5000)
      }
    } catch (err) {
      console.error('Cancel error:', err)
    }
  }, [sessionId])

  // Logout / Clear session
  const handleLogout = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    
    setToken('')
    setSessionId(null)
    setUserInfo(null)
    setQuests([])
    setAppState('idle') // Back to login state
    setError(null)
    setActiveQuestId(null)
    setQuestStatus(null)
    setSuccessMessage(null)
  }, [])

  // Refresh quests
  const handleRefresh = useCallback(() => {
    setError(null)
    fetchQuests()
  }, [fetchQuests])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      {/* Header */}
      <header className="border-b border-purple-800/30 backdrop-blur-sm bg-black/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Discord Quest Tool</h1>
              <p className="text-xs text-purple-300/70">Real Quest Completion Engine <span className="text-green-400">v1.0.2</span></p>
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
        <Alert className="mb-6 border-green-500/30 bg-green-950/20">
          <Activity className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-200/80 text-sm">
            <strong>✅ Real Discord Gateway:</strong> This tool connects to Discord&apos;s WebSocket Gateway and sends real PresenceUpdate events. 
            Quests complete in 15 minutes using actual game activity tracking - same method as desktop apps!
          </AlertDescription>
        </Alert>

        {/* Success Message */}
        {successMessage && (
          <Alert className="mb-4 border-green-500/30 bg-green-950/20">
            <Trophy className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-300">{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Token Input Section */}
        {(appState === 'idle' || appState === 'authenticating') && (
          <Card className="border-purple-800/30 bg-slate-900/50 backdrop-blur-sm mb-8">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center mb-4">
                <Key className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl text-white">Discord Authentication</CardTitle>
              <CardDescription className="text-purple-300/70">
                Enter your Discord User Token to access real quest completion
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
              
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-950/30 border border-green-800/30">
                <Wifi className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <p className="text-xs text-green-300/70">
                  <strong>Secure Connection:</strong> Token stored in memory only. Uses real Discord APIs for quest completion.
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
                    Connecting to Discord...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 mr-2" />
                    Connect & Load Quests
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
                    <Skeleton className="h-10 w-28 bg-purple-800/30" />
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
                    <p className="text-xs text-purple-300/70">Available</p>
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
                  <Zap className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">RPC</p>
                    <p className="text-xs text-blue-300/70">Real API</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-orange-800/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Timer className="w-8 h-8 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">15m</p>
                    <p className="text-xs text-orange-300/70">Real Time</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quest Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-purple-400" />
                Available Quests
                {quests.every(q => q.isReal) && quests.length > 0 && (
                  <Badge variant="secondary" className="bg-green-900/30 text-green-300 border-green-700 ml-2">
                    <Zap className="w-3 h-3 mr-1" />
                    REAL GAMES
                  </Badge>
                )}
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

            {/* Active Quest Progress - REAL TIME WITH DETAILS */}
            {appState === 'quest_active' && questStatus && (
              <Card className="mb-6 border-green-500/50 bg-gradient-to-br from-green-950/20 to-emerald-950/10 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-green-300 font-medium flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${questStatus.status === 'running' ? 'animate-pulse' : ''}`} />
                        {questStatus.phase}
                      </span>
                      <Badge variant="outline" className={
                        questStatus.rpcConnected 
                          ? 'bg-green-900/30 text-green-300 border-green-600' 
                          : 'bg-yellow-900/30 text-yellow-300 border-yellow-600'
                      }>
                        <Wifi className="w-3 h-3 mr-1" />
                        RPC: {questStatus.rpcConnected ? 'Connected' : 'Connecting...'}
                      </Badge>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleCancelQuest}
                      className="border-red-500/50 text-red-400 hover:bg-red-900/20"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <Progress value={questStatus.progress} className="h-4 mb-2" />
                    <div className="flex justify-between text-sm">
                      <span className="text-green-400 font-mono font-bold">{Math.round(questStatus.progress)}%</span>
                      <span className="text-green-400/70 font-mono">
                        {questStatus.formattedElapsed} elapsed → {questStatus.formattedRemaining} remaining
                      </span>
                    </div>
                  </div>

                  {/* Detailed Status Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg bg-black/30 mb-4">
                    <div className="text-center p-2 rounded bg-black/20">
                      <p className="text-[10px] text-purple-400/60 uppercase tracking-wider">Status</p>
                      <p className="text-sm font-semibold text-white capitalize mt-1">{questStatus.status}</p>
                    </div>
                    <div className="text-center p-2 rounded bg-black/20">
                      <p className="text-[10px] text-purple-400/60 uppercase tracking-wider">Elapsed</p>
                      <p className="text-lg font-mono text-blue-400 mt-1">{questStatus.formattedElapsed}</p>
                    </div>
                    <div className="text-center p-2 rounded bg-black/20">
                      <p className="text-[10px] text-purple-400/60 uppercase tracking-wider">Remaining</p>
                      <p className="text-lg font-mono text-orange-400 mt-1">{questStatus.formattedRemaining}</p>
                    </div>
                    <div className="text-center p-2 rounded bg-black/20">
                      <p className="text-[10px] text-purple-400/60 uppercase tracking-wider">Total</p>
                      <p className="text-lg font-mono text-white mt-1">15:00</p>
                    </div>
                  </div>

                  {/* Activity Status */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 text-xs">
                    <div className="flex items-center gap-4">
                      <span className={`flex items-center gap-1 ${questStatus.activitySent ? 'text-green-400' : 'text-yellow-400'}`}>
                        <Zap className="w-3 h-3" />
                        Activity: {questStatus.activitySent ? 'Active' : 'Pending'}
                      </span>
                    </div>
                    <span className="text-purple-400/50">
                      ⏱️ Real Discord API integration
                    </span>
                  </div>

                  <p className="text-xs text-green-400/60 mt-3 text-center">
                    ⚡ This uses REAL Discord Rich Presence APIs. Keep this tab open for 15 minutes.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && !successMessage && (
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
                    <Gamepad2 className="w-16 h-16 text-purple-500/50 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No Games Detected</h3>
                    <p className="text-sm text-purple-300/70 max-w-md mx-auto mb-4">
                      No verified games found for your account. Quest completion requires detectable games.
                    </p>
                    <div className="space-y-2 text-left max-w-sm mx-auto text-xs text-purple-400/50">
                      <p>• Try joining gaming Discord servers</p>
                      <p>• Verify game ownership in Discord settings</p>
                      <p>• Some games may not support quests</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleRefresh}
                      className="mt-4 border-purple-700/50 text-purple-300"
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Check Again
                    </Button>
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
                          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-2xl shrink-0 overflow-hidden shadow-lg">
                            {quest.gameIcon?.startsWith('http') ? (
                              <img src={quest.gameIcon} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span>{quest.gameIcon || '🎮'}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-semibold text-white truncate">{quest.name}</h3>
                              <StatusBadge status={quest.status} />
                              {quest.isReal && (
                                <Badge variant="secondary" className="bg-green-900/30 text-green-300 border-green-700 text-[10px] px-1.5 py-0">
                                  <Zap className="w-3 h-3 mr-0.5" />
                                  REAL
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-purple-300/70 line-clamp-1">{quest.gameName}</p>
                            <p className="text-xs text-purple-400/50 mt-1 line-clamp-2">{quest.description}</p>
                            {quest.reward && (
                              <p className="text-xs text-yellow-400/80 mt-1 flex items-center gap-1">
                                <Trophy className="w-3 h-3" />
                                {quest.reward}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="shrink-0">
                          {quest.status === 'completed' ? (
                            <Button 
                              disabled 
                              variant="secondary"
                              className="bg-green-900/30 text-green-400 border-green-800/50 cursor-default"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Completed ✓
                            </Button>
                          ) : quest.status === 'available' ? (
                            <Button 
                              onClick={() => handleStartQuest(quest.id)}
                              disabled={appState === 'starting_quest' || appState === 'quest_active'}
                              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-medium"
                            >
                              {activeQuestId === quest.id ? (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                  Starting...
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4 mr-1" />
                                  Complete (15 min)
                                </>
                              )}
                            </Button>
                          ) : quest.status === 'expired' ? (
                            <Button 
                              disabled 
                              variant="outline"
                              className="border-red-700 text-red-500 cursor-default"
                            >
                              <Clock className="w-4 h-4 mr-1" />
                              Expired
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
                      {(quest.status === 'completed' || quest.status === 'in_progress') && (
                        <div className="mt-4 pt-4 border-t border-purple-800/20">
                          <Progress value={quest.progress || 0} className="h-2" />
                          <p className="text-xs text-green-400/70 mt-1 text-right">
                            {quest.status === 'completed' ? '100% Complete' : `${Math.round(quest.progress || 0)}% Progress`}
                          </p>
                        </div>
                      )}
                      
                      {/* Instructions for available quests */}
                      {quest.status === 'available' && (
                        <div className="mt-4 pt-4 border-t border-green-800/20">
                          <p className="text-xs text-green-400/70 flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Click "Complete" → Website connects to Discord Gateway → Quest auto-completes in 15 min!
                          </p>
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
              <span>Your token never leaves memory. Auto-cleared on logout.</span>
            </div>
            <p className="text-xs text-purple-500/40">
              Educational project using Discord APIs. Not affiliated with Discord Inc.
            </p>
            <p className="text-xs text-purple-600/30">
              Private Hobby Project • MIT License © 2025
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
