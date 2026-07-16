/**
 * 🔥🔥🔥 v2.1.0 - ROBUST Quest System 🔥🔥🔥
 * 
 * Fixes for Railway/Server environment:
 * - No navigation after initial load (avoids detached frame)
 * - Single page approach - stay on discord.com/app
 * - Use client-side routing instead of page.goto()
 * - Better error handling for headless environments
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';

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
  status: 'launching' | 'authenticating' | 'setting_up' | 'running' | 'verifying' | 'error' | 'completed';
  lastActivityUpdate: Date | null;
  totalSeconds: number;
  error?: string;
  
  // REAL PROGRESS FIELDS
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
 * Query Discord's REAL quest API
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

    let targetQuest = null;
    
    if (Array.isArray(data)) {
      targetQuest = data.find(q => q.id === questId || q.quest_id === questId);
    } else if (data && typeof data === 'object') {
      const quests = data.quests || data.data || [];
      targetQuest = quests.find((q: any) => q.id === questId || q.quest_id === questId);
      
      if (!targetQuest && (data.id === questId || data.quest_id === questId)) {
        targetQuest = data;
      }
    }

    if (!targetQuest) {
      console.log(`[REAL API] Quest ${questId} not found in response`);
      return { hasProgress: false, progressValue: 0, status: 'not_found', rawData: data };
    }

    console.log(`[REAL API] Found quest! Keys: ${Object.keys(targetQuest).join(', ')}`);

    const progressFields = [
      targetQuest.progress,
      targetQuest.progress_seconds,
      targetQuest.current_progress,
      targetQuest.elapsed,
      targetQuest.time_played
    ].filter(v => v && typeof v === 'number' && v > 0);
    
    const maxProgress = progressFields.length > 0 ? Math.max(...progressFields) : 0;
    const status = targetQuest.status || targetQuest.user_status || 'unknown';
    const hasProgress = maxProgress > 0 || ['IN_PROGRESS', 'active', 'started'].includes(status);

    console.log(`[REAL API] VERDICT: hasProgress=${hasProgress}, value=${maxProgress}, status=${status}`);

    return { hasProgress, progressValue: maxProgress, status, rawData: targetQuest };

  } catch (error) {
    console.error(`[REAL API] Exception:`, error);
    return { hasProgress: false, progressValue: 0, status: 'error', rawData: null };
  }
}

/**
 * 🚀 START QUEST - SIMPLIFIED & ROBUST
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
  let chromiumPath: string;
  
  try {
    chromiumPath = await getChromiumPath();
  } catch (e) {
    return {
      success: false,
      message: `❌ Chromium not found: ${e instanceof Error ? e.message : 'Unknown error'}`
    };
  }
  
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
  
  let browser: Browser | null = null;
  let page: Page | null = null;
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[QUEST] Starting session ${sessionId}`);
    console.log(`[QUEST] Game: ${gameName} (App ID: ${appId})`);
    console.log(`${'='.repeat(60)}\n`);
    
    session.status = 'launching';
    
    // Launch browser
    browser = await puppeteer.launch({
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
        '--disable-site-isolation-trials',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    
    session.browser = browser;
    console.log('[QUEST] ✅ Browser launched');
    
    page = await browser.newPage();
    session.page = page;
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Logging
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Quest]') || text.includes('[Auth]') || 
          text.includes('[Activity]') || text.includes('[API]') ||
          text.includes('error') || text.includes('Error') || text.includes('progress')) {
        console.log(`[BROWSER] ${text}`);
      }
    });
    
    page.on('pageerror', (err) => {
      console.error(`[PAGE ERROR] ${err.message}`);
    });
    
    // ============================================
    // SINGLE NAVIGATION - Stay on one page!
    // ============================================
    session.status = 'authenticating';
    
    // Set up WebSocket hook BEFORE navigation
    await page.evaluateOnNewDocument(() => {
      console.log('[Hook] Installing WebSocket hook before page load...');
      
      const OriginalWS = window.WebSocket;
      window.WebSocket = function(url: string, protocols?: string | string[]) {
        console.log(`[Hook] WS created: ${url}`);
        const ws = new OriginalWS(url, protocols);
        
        ws.addEventListener('open', () => {
          console.log(`[Hook] WS opened: ${url}`);
          
          if (url.includes('discord') && (url.includes('gateway') || url.includes('wss://'))) {
            console.log(`[Hook] 🎯 Discord Gateway captured!`);
            (window as any)._discordWs = ws;
            (window as any)._gatewayUrl = url;
            
            window.dispatchEvent(new CustomEvent('discordGatewayConnected', {
              detail: { url, ws, timestamp: Date.now() }
            }));
          }
        });
        
        ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.op === 10) console.log('[Hook] Got HELLO');
            if (data.t === 'READY') {
              console.log('[Hook] ✅ CLIENT READY!');
              (window as any)._clientReady = true;
              window.dispatchEvent(new CustomEvent('discordClientReady'));
            }
          } catch (e) {}
        });
        
        const originalSend = ws.send.bind(ws);
        ws.send = function(data: any) {
          try {
            if (typeof data === 'string') {
              const parsed = JSON.parse(data);
              if (parsed.op === 2) console.log('[Hook] Client IDENTIFY');
              if (parsed.op === 3) console.log('[Hook] Sending PRESENCE');
              if (parsed.op === 6) console.log('[Hook] Client RESUME');
            }
          } catch (e) {}
          return originalSend(data);
        };
        
        return ws;
      };
      
      console.log('[Hook] ✅ WebSocket hook installed');
    });
    
    // Set cookies before navigation
    await page.setCookie({
      name: 'token',
      value: `"${token}"`,
      domain: '.discord.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'None'
    });
    
    // Inject token
    await page.evaluateOnNewDocument((authToken) => {
      try {
        localStorage.setItem('token', `"${authToken}"`);
      } catch (e) {}
      (window as any).__DISCORD_TOKEN__ = authToken;
    }, token);
    
    // Navigate ONCE to discord.com/app
    console.log('[QUEST] Navigating to discord.com/app (single navigation)...');
    await page.goto('https://discord.com/app', { 
      waitUntil: 'networkidle0',
      timeout: config?.timeout ?? 90000 
    }).catch(e => {
      console.error('[QUEST] Navigation error (continuing anyway):', e.message);
    });
    
    // Wait a bit for JS to settle
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if page is still valid
    if (page.isClosed()) {
      throw new Error('Page closed after navigation');
    }
    
    console.log('[QUEST] ✅ Page loaded successfully');
    
    // Now set up activity injection WITHOUT navigating again
    session.status = 'setting_up';
    
    // Inject activity script into current page
    const setupResult = await page.evaluate(({ applicationId, game }) => {
      return new Promise<boolean>((resolve) => {
        console.log('[Activity] Setting up activity injection...');
        
        let activitySent = false;
        
        // Function to send presence
        const sendPresence = () => {
          const ws = (window as any)._discordWs;
          if (ws && ws.readyState === 1) {
            try {
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
              
              console.log(`[Activity] Sending PRESENCE_UPDATE for: ${game}`);
              ws.send(JSON.stringify(payload));
              (window as any)._lastPresenceSent = Date.now();
              activitySent = true;
              return true;
            } catch (e) {
              console.error(`[Activity] Send error:`, e);
              return false;
            }
          }
          return false;
        };
        
        // Try to send immediately if WS is ready
        if ((window as any)._discordWs && (window as any)._discordWs.readyState === 1) {
          sendPresence();
        }
        
        // Listen for gateway connection
        window.addEventListener('discordGatewayConnected', () => {
          setTimeout(sendPresence, 2000);
          setTimeout(sendPresence, 5000);
        });
        
        // Listen for client ready
        window.addEventListener('discordClientReady', () => {
          setTimeout(sendPresence, 1000);
          setTimeout(sendPresence, 3000);
        });
        
        // Store send function for interval use
        (window as any)._sendActivityPresence = sendPresence;
        
        // Resolve after short timeout
        setTimeout(() => {
          console.log(`[Activity] Setup complete, sent=${activitySent}`);
          resolve(activitySent);
        }, 6000);
        
      });
    }, { applicationId: appId, game: gameName });
    
    console.log(`[QUEST] Activity setup result: ${setupResult}`);
    
    // Start running state
    session.status = 'running';
    session.lastActivityUpdate = new Date();
    
    console.log('\n[QUEST] Starting monitoring loops...\n');
    
    // Activity refresh interval
    const activityInterval = setInterval(async () => {
      if (!page || page.isClosed() || !browser) {
        console.warn('[QUEST] Page/browser gone, clearing activity interval');
        clearInterval(activityInterval);
        return;
      }
      
      try {
        const sent = await page.evaluate(() => {
          const sendFn = (window as any)._sendActivityPresence;
          if (typeof sendFn === 'function') {
            return sendFn();
          }
          return false;
        });
        
        if (sent) {
          session.lastActivityUpdate = new Date();
          session.totalSeconds = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
        }
      } catch (e) {
        // Page might be navigating or detached, that's ok
        console.warn('[QUEST] Activity refresh error (non-fatal):', e instanceof Error ? e.message : e);
      }
      
    }, 25000); // Every 25 seconds
    
    (session as any)._activityInterval = activityInterval;
    
    // Discord API check interval
    const apiCheckInterval = setInterval(async () => {
      if (!browser) {
        clearInterval(apiCheckInterval);
        return;
      }
      
      console.log(`[${new Date().toISOString()}] Checking Discord API...`);
      
      const result = await queryRealDiscordQuestProgress(token, questId);
      
      session.discordVerifiedProgress = result.progressValue;
      session.discordQuestStatus = result.status;
      session.lastDiscordCheck = new Date();
      session.discordApiRaw = result.rawData;
      
      if (result.hasProgress && !session.realProgressDetected) {
        session.realProgressDetected = true;
        session.firstProgressTime = new Date();
        
        console.log(`\n${'!'.repeat(60)}`);
        console.log(`🎉🎉🎉 REAL PROGRESS DETECTED! 🎉🎉🎉`);
        console.log(`Progress: ${result.progressValue}`);
        console.log(`${'!'.repeat(60)}\n`);
      }
      
      console.log(`[API CHECK] hasProgress=${result.hasProgress}, value=${result.progressValue}`);
      
    }, 45000); // Every 45 seconds
    
    (session as any)._apiInterval = apiCheckInterval;
    
    // Auto-stop after 2 hours
    setTimeout(() => {
      cancelWebClientSession(sessionId);
    }, 2 * 60 * 60 * 1000);
    
    console.log(`${'='.repeat(60)}`);
    console.log(`[QUEST] ✅ Session ${sessionId} RUNNING!`);
    console.log(`[QUEST] Method: Single-page + WS Hook + API Verification`);
    console.log(`${'='.repeat(60)}\n`);
    
    return {
      success: true,
      sessionId,
      message: `🚀 Quest Started!\n\n` +
               `🎮 Game: ${gameName}\n` +
               `📱 Method: Stable single-page approach\n` +
               `✅ Verification: Real Discord API polling\n\n` +
               `⏳ Waiting for Discord to detect progress...\n` +
               `📊 Check: /api/quest/discord-verify?questId=${questId}`,
      session
    };
    
  } catch (error: any) {
    session.status = 'error';
    session.error = error.message;
    console.error('[QUEST] Error:', error.message);
    
    // Cleanup
    if (browser) {
      try { await browser.close(); } catch {}
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
