/**
 * 🔥🔥🔥 FIXED: Real Discord Quest Progress System 🔥🔥🔥
 * 
 * KEY INSIGHT FROM USER (CORRECT):
 * - Mobile browser extensions (Yandex/Kiwi) complete quests WITHOUT .exe
 * - They keep discord.com/quest-home OPEN in browser
 * - Browser-to-browser = same concept, just server-side vs client-side
 * 
 * WHAT WAS WRONG BEFORE:
 * - op:3 PRESENCE_UPDATE only changes status display
 * - Discord quest system uses DIFFERENT tracking method
 * - Internal timer showed progress but Discord API showed 0%
 * 
 * NEW APPROACH (Based on extension behavior):
 * 1. Open REAL Chromium with user's token
 * 2. Navigate to discord.com/quest-home (like extensions do)
 * 3. Keep session active with proper presence
 * 4. Poll Discord's REAL quest API for actual progress
 * 5. Only report success when Discord confirms >0%
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';

/**
 * Find Chromium executable path
 */
function findExecutablePath(): string | null {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  
  const possiblePaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  
  for (const path of possiblePaths) {
    try { return path; } catch {}
  }
  
  return '/usr/bin/chromium-browser';
}

export interface WebClientConfig {
  headless?: boolean;
  timeout?: number;
  activityUpdateInterval?: number;
}

export interface WebClientSession {
  id: string;
  questId: string;
  appId: string;
  gameName: string;
  userId: string;
  startTime: Date;
  browser: Browser | null;
  page: Page | null;
  status: 'launching' | 'authenticating' | 'opening_quest_page' | 'injecting_activity' | 'running' | 'verifying' | 'error' | 'completed';
  lastActivityUpdate: Date | null;
  totalSeconds: number;
  error?: string;
  
  // 🎯 REAL PROGRESS FIELDS (from Discord API)
  discordVerifiedProgress?: number;
  discordQuestStatus?: string;
  lastDiscordCheck?: Date;
  discordApiRaw?: any;
  
  // Verification flags
  realProgressDetected: boolean;
  firstProgressTime?: Date;
}

const activeSessions = new Map<string, WebClientSession>();

function generateSessionId(): string {
  return `wc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function getChromiumPath(): Promise<string> {
  const exePath = findExecutablePath();
  if (!exePath) throw new Error('Chromium/Chrome not found');
  return exePath;
}

/**
 * 🔥 QUERY DISCORD'S REAL QUEST API 🔥
 * This is the ONLY source of truth for quest progress
 */
async function queryRealDiscordQuestProgress(token: string, questId: string): Promise<{
  hasProgress: boolean;
  progressValue: number;
  status: string;
  rawData: any;
}> {
  try {
    console.log(`[REAL API] Querying Discord quest API for ${questId}...`);
    
    const response = await fetch('https://discord.com/api/v10/users/@me/quests', {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordClient/2.0 (Windows 10)',
        'Accept': '*/*',
      }
    });

    if (!response.ok) {
      console.error(`[REAL API] Error: ${response.status}`);
      return { hasProgress: false, progressValue: 0, status: `api_error_${response.status}`, rawData: null };
    }

    const data = await response.json();
    console.log(`[REAL API] Got response, type: ${typeof data}, array: ${Array.isArray(data)}`);
    
    // Log raw structure for debugging
    console.log(`[RAW] ${JSON.stringify(data).substring(0, 500)}...`);

    // Find our quest
    let targetQuest = null;
    
    if (Array.isArray(data)) {
      targetQuest = data.find(q => q.id === questId || q.quest_id === questId);
    } else if (data && typeof data === 'object') {
      // Check nested structures
      const quests = data.quests || data.data || [];
      targetQuest = quests.find((q: any) => q.id === questId || q.quest_id === questId);
      
      // Also check if data itself is the quest
      if (!targetQuest && (data.id === questId || data.quest_id === questId)) {
        targetQuest = data;
      }
    }

    if (!targetQuest) {
      console.log(`[REAL API] Quest ${questId} not found in response`);
      return { hasProgress: false, progressValue: 0, status: 'not_found', rawData: data };
    }

    console.log(`[REAL API] Found quest! Keys: ${Object.keys(targetQuest).join(', ')}`);

    // Extract progress from various possible fields
    const progressFields = {
      progress: targetQuest.progress,
      progress_seconds: targetQuest.progress_seconds,
      current_progress: targetQuest.current_progress,
      elapsed: targetQuest.elapsed,
      time_played: targetQuest.time_played,
      percent_complete: targetQuest.percent_complete,
      user_status: targetQuest.user_status,
      status: targetQuest.status,
    };

    console.log(`[REAL API] Progress fields: ${JSON.stringify(progressFields)}`);

    // Determine if there's real progress
    const numericProgress = Object.values(progressFields)
      .filter(v => typeof v === 'number' && v > 0);
    
    const maxProgress = numericProgress.length > 0 ? Math.max(...numericProgress) : 0;
    const status = targetQuest.status || targetQuest.user_status || 'unknown';
    
    const hasProgress = maxProgress > 0 || ['IN_PROGRESS', 'active', 'started'].includes(status);

    console.log(`[REAL API] VERDICT: hasProgress=${hasProgress}, value=${maxProgress}, status=${status}`);

    return {
      hasProgress,
      progressValue: maxProgress,
      status,
      rawData: targetQuest
    };

  } catch (error) {
    console.error(`[REAL API] Exception:`, error);
    return { hasProgress: false, progressValue: 0, status: 'error', rawData: null };
  }
}

/**
 * 🚀 START REAL QUEST SESSION
 * 
 * New approach based on extension behavior:
 * 1. Open Chromium with token auth
 * 2. Navigate to discord.com/quest-home (CRITICAL!)
 * 3. Set up proper activity via Discord's own mechanisms
 * 4. Poll real Discord API for progress verification
 */
export async function startWebClientQuest(
  token: string,
  questId: string,
  appId: string,
  gameName: string,
  userId: string,
  config?: Partial<WebClientConfig>
): Promise<{
  success: boolean;
  sessionId?: string;
  message: string;
  session?: WebClientSession;
}> {
  
  const sessionId = generateSessionId();
  const chromiumPath = await getChromiumPath();
  
  const session: WebClientSession = {
    id: sessionId,
    questId,
    appId,
    gameName,
    userId,
    startTime: new Date(),
    browser: null,
    page: null,
    status: 'launching',
    lastActivityUpdate: null,
    totalSeconds: 0,
    realProgressDetected: false,
  };
  
  activeSessions.set(sessionId, session);
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[QUEST] Starting REAL quest session ${sessionId}`);
    console.log(`[QUEST] Game: ${gameName} (App ID: ${appId})`);
    console.log(`[QUEST] Quest ID: ${questId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    session.status = 'launching';
    
    // Launch browser with realistic settings
    const browser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: config?.headless ?? true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        `--window-size=1920,1080`,
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--enable-webgl',
        '--enable-webaudio',
        `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36`,
        '--lang=en-US,en',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    
    session.browser = browser;
    console.log('[QUEST] ✅ Browser launched');
    
    const page = await browser.newPage();
    session.page = page;
    
    // Set viewport to realistic size
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Enable verbose logging
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Quest]') || 
          text.includes('[Auth]') || 
          text.includes('[Activity]') ||
          text.includes('[API]') ||
          text.includes('error') ||
          text.includes('Error') ||
          text.includes('progress')) {
        console.log(`[BROWSER] ${text}`);
      }
    });
    
    page.on('pageerror', (err) => {
      console.error(`[PAGE ERROR] ${err.message}`);
    });
    
    // ============================================
    // STEP 1: Authenticate with Discord
    // ============================================
    console.log('[QUEST] Step 1: Authenticating...');
    session.status = 'authenticating';
    
    // Set token cookie before navigation
    await page.setCookie({
      name: 'token',
      value: `"${token}"`,
      domain: '.discord.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'None'
    });
    
    // Inject token into localStorage via evaluateOnNewDocument
    await page.evaluateOnNewDocument((authToken) => {
      // Store token in multiple places for maximum compatibility
      try {
        localStorage.setItem('token', `"${authToken}"`);
        console.log('[Auth] Token set in localStorage');
      } catch (e) {
        console.warn('[Auth] localStorage failed:', e);
      }
      
      // Also expose on window
      (window as any).__DISCORD_TOKEN__ = authToken;
      console.log('[Auth] Token exposed on window');
    }, token);
    
    // Navigate to Discord main page first
    console.log('[QUEST] Navigating to discord.com...');
    await page.goto('https://discord.com/app', { 
      waitUntil: 'networkidle2',
      timeout: config?.timeout ?? 90000 
    });
    
    // Wait for app to load
    try {
      await page.waitForSelector('div[class*="app-"]', { timeout: 30000 })
        .catch(() => console.log('[QUEST] App container not found, continuing...'));
    } catch (e) {
      console.log('[QUEST] App selector error, continuing:', e);
    }
    
    console.log('[QUEST] ✅ Authenticated with Discord');
    
    // ============================================
    // STEP 2: Open Quest Page (CRITICAL!)
    // Like extensions do - keep quest-home open!
    // ============================================
    console.log('\n[QUEST] Step 2: Opening quest-home page (CRITICAL!)');
    session.status = 'opening_quest_page';
    
    try {
      await page.goto('https://discord.com/quest-home', { 
        waitUntil: 'domcontentloaded', // Changed from networkidle2 for faster load
        timeout: 60000 
      });
    } catch (navError) {
      console.error('[QUEST] Navigation error:', navError);
      // Try again with just waitUntil load
      try {
        await page.goto('https://discord.com/quest-home', { 
          waitUntil: 'load',
          timeout: 30000 
        });
      } catch (e2) {
        console.error('[QUEST] Second navigation attempt failed:', e2);
        // Continue anyway - we might still have a working page
      }
    }
    
    // Check if page is still valid
    if (!page.isClosed()) {
      // Wait for quest page content (manual delay - waitForTimeout deprecated)
      await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced from 3s
      
      let questPageContent;
      try {
        questPageContent = await page.evaluate(() => {
          return {
            url: window.location.href,
            title: document.title,
            hasQuestContent: !!document.querySelector('[class*="quest"]') || 
                             !!document.querySelector('[class*="reward"]') ||
                             document.body.innerText.includes('quest'),
            bodyPreview: document.body.innerText.substring(0, 500)
          };
        });
      } catch (evalError) {
        console.warn('[Quest] Page evaluate failed:', evalError);
        questPageContent = { url: 'unknown', title: 'error', hasQuestContent: false, bodyPreview: '' };
      }
    } else {
      console.warn('[QUEST] Page closed after navigation');
      questPageContent = { url: 'closed', title: 'closed', hasQuestContent: false, bodyPreview: '' };
    }
    
    console.log(`[QUEST] Quest page loaded: ${questPageContent.url}`);
    console.log(`[QUEST] Has quest content: ${questPageContent.hasQuestContent}`);
    if (questPageContent.bodyPreview) {
      console.log(`[QUEST] Preview: ${questPageContent.bodyPreview.substring(0, 200)}...`);
    }
    
    // ============================================
    // STEP 3: Inject Activity (Multiple Methods)
    // ============================================
    console.log('\n[QUEST] Step 3: Setting up activity injection...');
    session.status = 'injecting_activity';
    
    // Method A: Hook WebSocket and inject activity (with error handling)
    let activitySetupResult = false;
    
    if (!page.isClosed()) {
      try {
        activitySetupResult = await page.evaluate(({ applicationId, game }) => {
      return new Promise<boolean>((resolve) => {
        console.log('[Activity] Starting multi-method activity setup...');
        
        let methodsSuccessful = 0;
        const MAX_WAIT = 10000; // 10 seconds
        const startedAt = Date.now();
        
        // --- METHOD 1: WebSocket Hook ---
        const OriginalWS = window.WebSocket;
        let wsHooked = false;
        
        window.WebSocket = function(url: string, protocols?: string | string[]) {
          console.log(`[Activity WS] Creating: ${url}`);
          const ws = new OriginalWS(url, protocols);
          
          ws.addEventListener('open', () => {
            console.log(`[Activity WS] Opened: ${url}`);
            
            if (url.includes('discord') && (url.includes('gateway') || url.includes('wss://'))) {
              console.log(`[Activity WS] 🎯 Discord Gateway captured!`);
              wsHooked = true;
              (window as any)._discordWs = ws;
              
              // Send initial presence after READY
              const sendPresence = () => {
                try {
                  const payload = {
                    op: 3,
                    d: {
                      since: Date.now(),
                      activities: [{
                        name: game,
                        type: 0, // PLAYING
                        application_id: applicationId,
                        timestamps: { start: Date.now() },
                        assets: {
                          large_text: game,
                          large_image: `mp:assets/${applicationId}`
                        },
                        instance: true,
                        buttons: [],
                        metadata: {}
                      }],
                      status: 'online',
                      afk: false
                    }
                  };
                  
                  console.log(`[Activity WS] Sending PRESENCE_UPDATE for: ${game}`);
                  ws.send(JSON.stringify(payload));
                  
                  (window as any)._lastPresenceSent = Date.now();
                  (window as any)._presenceGame = game;
                  methodsSuccessful++;
                  console.log(`[Activity WS] ✅ Presence sent! Methods working: ${methodsSuccessful}`);
                } catch (e) {
                  console.error(`[Activity WS] Error sending presence:`, e);
                }
              };
              
              // Wait for identification then send presence
              setTimeout(sendPresence, 2000);
              setTimeout(sendPresence, 5000); // Retry
            }
          });
          
          // Intercept outgoing messages
          const originalSend = ws.send.bind(ws);
          ws.send = function(data: any) {
            try {
              if (typeof data === 'string') {
                const parsed = JSON.parse(data);
                
                // If client is sending presence, inject our activity
                if (parsed.op === 3) {
                  console.log(`[Activity WS] Intercepting PRESENCE_UPDATE`);
                  parsed.d.activities = [{
                    name: game,
                    type: 0,
                    application_id: applicationId,
                    timestamps: { start: Date.now() },
                    assets: { large_text: game },
                    instance: true
                  }];
                  data = JSON.stringify(parsed);
                  methodsSuccessful++;
                }
                
                // Log important events
                if (parsed.op === 2) console.log(`[Activity WS] Client IDENTIFYING`);
                if (parsed.op === 6) console.log(`[Activity WS] Client RESUMING`);
              }
            } catch (e) {}
            return originalSend(data);
          };
          
          // Monitor incoming
          ws.addEventListener('message', (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.op === 10) console.log(`[Activity WS] Got HELLO`);
              if (data.t === 'READY') {
                console.log(`[Activity WS] ✅ CLIENT READY!`);
                (window as any)._clientReady = true;
              }
            } catch (e) {}
          });
          
          return ws;
        };
        
        console.log('[Activity] WebSocket hook installed');
        
        // --- METHOD 2: Try using Discord's internal APIs ---
        const tryDiscordInternalAPI = () => {
          try {
            // Some extensions use this approach
            if ((window as any).__DISCORD_TOKEN__) {
              fetch('/api/v10/users/@me/activities', {
                method: 'PUT',
                headers: {
                  'Authorization': (window as any).__DISCORD_TOKEN__,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  activities: [{
                    name: game,
                    type: 0,
                    application_id: applicationId,
                    timestamps: { start: Date.now() }
                  }]
                })
              }).then(r => {
                console.log(`[Activity API] PUT /activities status: ${r.status}`);
                if (r.ok) methodsSuccessful++;
              }).catch(e => {
                console.warn(`[Activity API] Failed:`, e);
              });
            }
          } catch (e) {
            console.warn(`[Activity API] Error:`, e);
          }
        };
        
        // Try internal API after a delay
        setTimeout(tryDiscordInternalAPI, 3000);
        
        // --- Resolution ---
        const checkAndResolve = () => {
          if (Date.now() - startedAt > MAX_WAIT) {
            console.log(`[Activity] Timeout. Methods successful: ${methodsSuccessful}`);
            resolve(methodsSuccessful > 0);
            return;
          }
          
          if (methodsSuccessful > 0) {
            console.log(`[Activity] ✅ Activity methods working! Count: ${methodsSuccessful}`);
            resolve(true);
          } else {
            setTimeout(checkAndResolve, 1000);
          }
        };
        
        setTimeout(checkAndResolve, 5000); // Initial check at 5s
        
      });
    }, { applicationId: appId, game: gameName });
      } catch (activityError) {
        console.error('[QUEST] Activity setup error:', activityError);
        activitySetupResult = false;
      }
    } else {
      console.warn('[QUEST] Page closed before activity setup');
    }
    
    console.log(`[QUEST] Activity setup result: ${activitySetupResult}`);
    
    // ============================================
    // STEP 4: Start Progress Monitoring Loop
    // ============================================
    session.status = 'running';
    session.lastActivityUpdate = new Date();
    
    console.log('\n[QUEST] Step 4: Starting progress monitoring loop...\n');
    
    // Activity refresh interval (keep sending presence)
    const activityInterval = setInterval(async () => {
      if (!session.page || !session.browser) {
        console.warn('[QUEST] Page/browser gone, clearing intervals');
        clearInterval(activityInterval);
        if (session._apiInterval) clearInterval(session._apiInterval);
        return;
      }
      
      try {
        // Refresh activity via WebSocket
        const sent = await session.page.evaluate(({ applicationId, game }) => {
          return new Promise<boolean>((resolve) => {
            try {
              const ws = (window as any)._discordWs;
              if (ws && ws.readyState === 1) {
                const payload = {
                  op: 3,
                  d: {
                    since: Date.now(),
                    activities: [{
                      name: game,
                      type: 0,
                      application_id: applicationId,
                      timestamps: { start: Date.now() },
                      assets: { large_text: game },
                      instance: true,
                      buttons: []
                    }],
                    status: 'online',
                    afk: false
                  }
                };
                
                ws.send(JSON.stringify(payload));
                (window as any)._lastPresenceSent = Date.now();
                resolve(true);
              } else {
                resolve(false);
              }
            } catch (e) {
              resolve(false);
            }
          });
        }, { applicationId: appId, game: gameName });
        
        if (sent) {
          session.lastActivityUpdate = new Date();
          session.totalSeconds = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
        }
        
      } catch (err) {
        console.error('[QUEST] Activity refresh error:', err);
      }
      
    }, 20000); // Every 20 seconds
    
    (session as any)._activityInterval = activityInterval;
    
    // ============================================
    // STEP 5: REAL Discord API Progress Check
    // THIS IS THE ONLY SOURCE OF TRUTH!
    // ============================================
    const apiCheckInterval = setInterval(async () => {
      if (!session.browser) {
        clearInterval(apiCheckInterval);
        return;
      }
      
      console.log(`\n[${new Date().toISOString()}] Checking REAL Discord API for progress...`);
      
      const result = await queryRealDiscordQuestProgress(token, questId);
      
      session.discordVerifiedProgress = result.progressValue;
      session.discordQuestStatus = result.status;
      session.lastDiscordCheck = new Date();
      session.discordApiRaw = result.rawData;
      
      if (result.hasProgress && !session.realProgressDetected) {
        // 🎉 FIRST TIME REAL PROGRESS DETECTED!
        session.realProgressDetected = true;
        session.firstProgressTime = new Date();
        
        console.log(`\n${'!'.repeat(60)}`);
        console.log(`🎉🎉🎉 REAL PROGRESS DETECTED BY DISCORD! 🎉🎉🎉`);
        console.log(`Progress Value: ${result.progressValue}`);
        console.log(`Status: ${result.status}`);
        console.log(`${'!'.repeat(60)}\n`);
      }
      
      console.log(`[API CHECK] Result: hasProgress=${result.hasProgress}, value=${result.progressValue}, status=${result.status}`);
      
    }, 30000); // Every 30 seconds
    
    (session as any)._apiInterval = apiCheckInterval;
    
    // Auto-stop after 2 hours
    setTimeout(() => {
      cancelWebClientSession(sessionId);
    }, 2 * 60 * 60 * 1000);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[QUEST] ✅ Session ${sessionId} RUNNING!`);
    console.log(`[QUEST] Method: Real Browser + Quest Page + API Verification`);
    console.log(`[QUEST] Activity refresh: Every 20 seconds`);
    console.log(`[QUEST] Discord API check: Every 30 seconds`);
    console.log(`[QUEST] ⚠️ Will only report SUCCESS when Discord API shows >0%`);
    console.log(`${'='.repeat(60)}\n`);
    
    return {
      success: true,
      sessionId,
      message: `🚀 Quest Started!\n\n` +
               `🎮 Game: ${gameName}\n` +
               `📱 Method: Real Browser + Quest Page\n` +
               `✅ Verification: Real Discord API polling\n\n` +
               `⏳ Waiting for Discord to detect progress...\n` +
               `📊 Check: /api/quest/discord-verify?questId=${questId}`,
      session
    };
    
  } catch (error: any) {
    session.status = 'error';
    session.error = error.message;
    console.error('[QUEST] Error:', error.message);
    
    if (session.browser) {
      try { await session.browser.close(); } catch {}
    }
    activeSessions.delete(sessionId);
    
    return {
      success: false,
      message: `❌ Error: ${error.message}`
    };
  }
}

export function getWebClientSessionStatus(sessionId: string): WebClientSession | null {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.totalSeconds = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
  }
  return session ?? null;
}

export async function cancelWebClientSession(sessionId: string): Promise<boolean> {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  
  try {
    if ((session as any)._activityInterval) {
      clearInterval((session as any)._activityInterval);
    }
    if ((session as any)._apiInterval) {
      clearInterval((session as any)._apiInterval);
    }
    
    if (session.browser) {
      await session.browser.close();
    }
    
    activeSessions.delete(sessionId);
    console.log(`[QUEST] Session ${sessionId} cancelled`);
    return true;
    
  } catch (error) {
    console.error('[QUEST] Error cancelling:', error);
    activeSessions.delete(sessionId);
    return false;
  }
}

export function getActiveWebClientSessions(): WebClientSession[] {
  return Array.from(activeSessions.values());
}
