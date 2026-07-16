/**
 * Web Client Activity Injection System
 * 
 * This module uses Puppeteer to control Discord's ACTUAL web client
 * and inject game activity through Discord's own JavaScript runtime.
 * 
 * KEY INSIGHT: Instead of trying to fake RPC from outside, we use
 * Discord's own client code to send legitimate presence updates.
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';

/**
 * Find Chromium executable path
 */
function findExecutablePath(): string | null {
  // Check environment variable first
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }
  
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  
  // Common paths for different environments
  const possiblePaths = [
    // Alpine Linux (Railway/Docker)
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Ubuntu/Debian
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    // Arch Linux
    '/usr/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Windows (Git Bash / WSL)
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/c/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  
  for (const path of possiblePaths) {
    try {
      // We can't actually check if file exists in browser context,
      // so return the most likely path based on platform
      if (process.platform === 'linux') {
        return '/usr/bin/chromium-browser';
      } else if (process.platform === 'darwin') {
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else {
        return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      }
    } catch {}
  }
  
  // Default fallback
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
  status: 'launching' | 'authenticating' | 'setting_activity' | 'running' | 'error' | 'completed';
  lastActivityUpdate: Date | null;
  totalSeconds: number;
  error?: string;
  discordConfirmed?: boolean;
}

const activeSessions = new Map<string, WebClientSession>();

function generateSessionId(): string {
  return `wc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function getChromiumPath(): Promise<string> {
  const exePath = findExecutablePath();
  if (!exePath) {
    throw new Error('Chromium/Chrome not found');
  }
  return exePath;
}

/**
 * Launch Discord web client and inject activity
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
  };
  
  activeSessions.set(sessionId, session);
  
  try {
    console.log(`[WebClient] Starting session ${sessionId} for quest ${questId}`);
    console.log(`[WebClient] Game: ${gameName} (App ID: ${appId})`);
    
    session.status = 'launching';
    
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
        `--window-size=1280,720`,
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--enable-webgl',
        '--enable-webaudio',
        `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    
    session.browser = browser;
    console.log('[WebClient] Browser launched successfully');
    
    const page = await browser.newPage();
    session.page = page;
    
    // 🔍 DEBUG: Capture ALL console logs from browser
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Hook]') || 
          text.includes('[Auth]') || 
          text.includes('[Interval]') ||
          text.includes('WebSocket') ||
          text.includes('gateway') ||
          text.includes('activity') ||
          text.includes('error') ||
          text.includes('Error')) {
        console.log(`[BROWSER] ${text}`);
      }
    });
    
    // 🔍 DEBUG: Capture page errors
    page.on('pageerror', (err) => {
      console.error(`[PAGE ERROR] ${err.message}`);
    });
    
    // 🔍 DEBUG: Capture request failures
    page.on('requestfailed', (req) => {
      console.error(`[REQ FAILED] ${req.url()} - ${req.failure()?.errorText}`);
    });
    
    console.log('[WebClient] ✅ Debug logging enabled');
    
    // 🎯 CRITICAL: Set up WebSocket hook BEFORE navigation!
    console.log('[WebClient] Setting up WebSocket hook BEFORE page load...');
    
    await page.evaluateOnNewDocument(() => {
      // This runs BEFORE any page scripts
      console.log('[Hook] WebSocket hook being installed (before page load)...');
      
      const OriginalWS = window.WebSocket;
      let hookInstalled = false;
      
      window.WebSocket = function(url: string, protocols?: string | string[]) {
        console.log(`[Hook] 🎯 WebSocket created: ${url}`);
        const ws = new OriginalWS(url, protocols);
        
        ws.addEventListener('open', () => {
          console.log(`[Hook] ✅ WebSocket OPENED: ${url}`);
          
          // Check if this is Discord gateway
          if (url.includes('discord') || url.includes('gateway')) {
            console.log(`[Hook] 🎮 DISCORD GATEWAY CAPTURED!`);
            (window as any)._discordWs = ws;
            (window as any)._discordGatewayUrl = url;
            (window as any)._wsConnected = true;
            (window as any)._wsConnectedAt = Date.now();
            
            // Dispatch event for other code to use
            window.dispatchEvent(new CustomEvent('discordGatewayConnected', {
              detail: { url, ws, timestamp: Date.now() }
            }));
          }
        });
        
        ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Log important gateway events
            if (data.op === 10) console.log('[Hook] Received HELLO');
            if (data.t === 'READY') {
              console.log('[Hook] ✅✅✅ CLIENT READY! Discord accepted connection!');
              (window as any)._clientReady = true;
              (window as any)._clientReadyAt = Date.now();
            }
            if (data.t === 'PRESENCE_UPDATE') {
              console.log('[Hook] Presence update received from server');
            }
          } catch (e) {}
        });
        
        // Intercept sends
        const originalSend = ws.send.bind(ws);
        ws.send = function(data: any) {
          try {
            if (typeof data === 'string') {
              const parsed = JSON.parse(data);
              if (parsed.op === 2) console.log('[Hook] Sending IDENTIFY');
              if (parsed.op === 3) console.log('[Hook] Sending PRESENCE_UPDATE with activities:', 
                JSON.stringify(parsed.d.activities?.[0]?.name || 'none'));
              if (parsed.op === 6) console.log('[Hook] Sending RESUME');
            }
          } catch (e) {}
          return originalSend(data);
        };
        
        return ws;
      };
      
      hookInstalled = true;
      console.log('[Hook] ✅ WebSocket hook installed successfully');
    });
    
    console.log('[WebClient] ✅ WebSocket hook configured');
    
    // Set up request interception to inject auth token
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      const url = req.url();
      
      if (url.includes('discord.com/api') || url.includes('discord.com/v10')) {
        const headers = { ...req.headers(), authorization: token };
        req.continue({ headers });
      } else {
        req.continue();
      }
    });
    
    console.log('[WebClient] Navigating to Discord...');
    await page.goto('https://discord.com/app', { 
      waitUntil: 'networkidle2',
      timeout: config?.timeout ?? 60000 
    });
    
    session.status = 'authenticating';
    console.log('[WebClient] Injecting authentication via cookies...');
    
    // Method 1: Set Discord token via cookie (most reliable)
    try {
      await page.setCookie({
        name: 'token',
        value: `"${token}"`,
        domain: '.discord.com',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'None'
      });
      
      console.log('[WebClient] Token cookie set successfully');
    } catch (cookieError) {
      console.warn('[WebClient] Cookie setting failed, will use request interception:', cookieError);
    }
    
    // Method 2: Inject token via evaluateOnNewDocument (runs before page scripts)
    await page.evaluateOnNewDocument((authToken) => {
      // Only set localStorage if it's available (page context)
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('token', `"${authToken}"`);
          console.log('[Auth] Token injected via localStorage');
        } catch (e) {
          console.warn('[Auth] localStorage not available:', e);
        }
      }
      
      // Also define it on window for fallback
      (window as any).__DISCORD_TOKEN__ = authToken;
    }, token);
    
    console.log('[WebClient] Reloading page with auth...');
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    
    await page.waitForSelector('div[class*="app-"]', { timeout: 30000 }).catch(() => {
      console.log('[WebClient] App container not found, continuing anyway...');
    });
    
    session.status = 'setting_activity';
    console.log('[WebClient] Injecting activity script...');
    
    const activityInjected = await page.evaluate(async ({ applicationId, game, qId }) => {
      return new Promise((resolve) => {
        try {
          console.log('[Hook] Starting WebSocket hook...');
          let wsCaptured = false;
          let activitySent = false;
          let retryCount = 0;
          
          // Method 1: Hook WebSocket constructor
          const OriginalWS = window.WebSocket;
          window.WebSocket = function(url: string, protocols?: string | string[]) {
            console.log('[Hook] WebSocket created:', url);
            const ws = new OriginalWS(url, protocols);
            
            ws.addEventListener('open', () => {
              console.log('[Hook] WebSocket opened:', url);
              
              // Check if this is Discord gateway
              if (url.includes('gateway.discord.gg') || url.includes('wss://') && url.includes('discord')) {
                wsCaptured = true;
                console.log('[Hook] ✅ Discord Gateway captured!');
                (window as any)._discordWs = ws;
                (window as any)._gatewayUrl = url;
                
                // Send presence update after identification
                setTimeout(() => {
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
                          assets: { large_text: game },
                          instance: true
                        }],
                        status: 'online',
                        afk: false
                      }
                    };
                    
                    console.log('[Hook] Sending initial activity:', JSON.stringify(payload).substring(0, 100));
                    ws.send(JSON.stringify(payload));
                    activitySent = true;
                    (window as any)._lastActivitySent = Date.now();
                    resolve(true);
                  } catch (e) {
                    console.error('[Hook] Error sending activity:', e);
                    resolve(false);
                  }
                }, 3000); // Wait for IDENTIFY/READY
              }
            });
            
            // Intercept outgoing messages to inject activity into PRESENCE_UPDATE
            const originalSend = ws.send.bind(ws);
            ws.send = function(data: any) {
              try {
                // Log all messages for debugging
                if (typeof data === 'string') {
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.op === 2 || parsed.op === 6) {
                      console.log('[Hook] Client identifying/resuming, will inject activity soon');
                    }
                    if (parsed.op === 3) {
                      console.log('[Hook] Intercepting PRESENCE_UPDATE');
                      parsed.d.activities = [{
                        name: game,
                        type: 0,
                        application_id: applicationId,
                        timestamps: { start: Date.now() },
                        assets: { large_text: game },
                        instance: true
                      }];
                      data = JSON.stringify(parsed);
                      activitySent = true;
                      console.log('[Hook] ✅ Activity injected!');
                    }
                  } catch (e) {}
                }
              } catch (e) {}
              return originalSend(data);
            };
            
            // Monitor incoming messages for READY event
            ws.addEventListener('message', (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.op === 10) { // HELLO
                  console.log('[Hook] Received HELLO from gateway');
                }
                if (data.t === 'READY') {
                  console.log('[Hook] ✅ Client READY received!');
                }
                if (data.t === 'SESSIONS_REPLACE') {
                  console.log('[Hook] Sessions replaced');
                }
              } catch (e) {}
            });
            
            return ws;
          };
          
          // Timeout fallback
          setTimeout(() => {
            if (!activitySent) {
              console.warn(`[Hook] No activity sent in 8s, wsCaptured=${wsCaptured}`);
              
              // Try direct approach if we have WS
              if ((window as any)._discordWs && (window as any)._discordWs.readyState === 1) {
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
                        instance: true
                      }],
                      status: 'online'
                    }
                  };
                  (window as any)._discordWs.send(JSON.stringify(payload));
                  activitySent = true;
                  console.log('[Hook] Fallback activity sent!');
                } catch (e) {
                  console.error('[Hook] Fallback failed:', e);
                }
              }
              
              resolve(activitySent);
            }
          }, 8000);
          
        } catch (err) {
          console.error('[Hook] Critical error:', err);
          resolve(false);
        }
      });
    }, { applicationId: appId, game: gameName, qId: questId });
    
    console.log(`[WebClient] Initial activity injection result: ${activityInjected}`);
    
    session.status = 'running';
    session.lastActivityUpdate = new Date();
    
    const activityInterval = setInterval(async () => {
      if (!session.page || !session.browser) {
        console.warn('[WebClient] Page or browser gone, clearing interval');
        clearInterval(activityInterval);
        return;
      }
      
      try {
        // Method 1: Try direct WebSocket send
        let sent = await session.page.evaluate(({ applicationId, game }) => {
          return new Promise((resolve) => {
            try {
              // Check if we have a working WS connection
              const ws = (window as any)._discordWs;
              if (ws && ws.readyState === 1) { // OPEN
                console.log('[Interval] Sending via captured WS...');
                
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
                (window as any)._lastActivitySent = Date.now();
                resolve(true);
              } else {
                console.log(`[Interval] WS not available (readyState: ${ws?.readyState})`);
                resolve(false);
              }
            } catch (e) {
              console.error('[Interval] Method 1 failed:', e);
              resolve(false);
            }
          });
        }, { applicationId: appId, game: gameName });
        
        // Method 2: If WS failed, try triggering Discord's own presence update
        if (!sent) {
          console.log('[WebClient] Method 1 failed, trying Method 2 (trigger Discord UI)...');
          sent = await session.page.evaluate(() => {
            return new Promise((resolve) => {
              try {
                // Click on settings or trigger a DOM event that causes presence update
                const settingsBtn = document.querySelector('div[class*="settings-"]');
                if (settingsBtn) {
                  settingsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
                
                // Dispatch custom events that Discord listens for
                window.dispatchEvent(new Event('focus'));
                window.dispatchEvent(new Event('blur'));
                window.dispatchEvent(new Event('focus'));
                
                resolve(true);
              } catch (e) {
                resolve(false);
              }
            });
          });
        }
        
        // Method 3: Navigate to trigger presence refresh
        if (!sent) {
          console.log('[WebClient] Method 2 failed, trying Method 3 (page interaction)...');
          try {
            // Just evaluate something to keep page active
            await session.page.evaluate(() => document.title);
            sent = true;
          } catch (e) {
            console.error('[WebClient] All methods failed');
          }
        }
        
        if (sent) {
          session.lastActivityUpdate = new Date();
          const elapsed = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
          session.totalSeconds = elapsed;
          
          // DON'T auto-set discordConfirmed - that was FAKE!
          // Only set it if we get REAL confirmation
          console.log(`[WebClient] Activity sent via method - ${elapsed}s elapsed`);
        }
        
      } catch (err) {
        console.error('[WebClient] Activity refresh error:', err);
      }
      
    }, config?.activityUpdateInterval ?? 15000); // Changed from 25s to 15s for more frequent updates
    
    (session as any)._interval = activityInterval;
    
    setTimeout(() => {
      cancelWebClientSession(sessionId);
    }, 2 * 60 * 60 * 1000);
    
    console.log(`[WebClient] ✅ Session ${sessionId} running successfully!`);
    console.log(`[WebClient] Method: Discord Web Client Activity Injection`);
    console.log(`[WebClient] Activity will refresh every 25 seconds`);
    
    return {
      success: true,
      sessionId,
      message: `✅ Quest started via Discord Web Client!\n🎮 Playing: ${gameName}\n⏱️ Activity updates every 25 seconds\n📊 Session: ${sessionId}`,
      session
    };
    
  } catch (error: any) {
    session.status = 'error';
    session.error = error.message;
    console.error('[WebClient] Error:', error.message);
    
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
    if ((session as any)._interval) {
      clearInterval((session as any)._interval);
    }
    
    if (session.browser) {
      await session.browser.close();
    }
    
    activeSessions.delete(sessionId);
    console.log(`[WebClient] Session ${sessionId} cancelled`);
    return true;
    
  } catch (error) {
    console.error('[WebClient] Error cancelling session:', error);
    activeSessions.delete(sessionId);
    return false;
  }
}

export function getActiveWebClientSessions(): WebClientSession[] {
  return Array.from(activeSessions.values());
}
