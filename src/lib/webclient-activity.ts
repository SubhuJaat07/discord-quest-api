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
import { findExecutablePath } from './chromium';

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
    console.log('[WebClient] Injecting authentication...');
    
    await page.evaluate((authToken) => {
      localStorage.setItem('token', `"${authToken}"`);
      
      localStorage.setItem('super_properties', JSON.stringify({
        os: "Windows",
        browser: "Chrome",
        release_channel: "stable",
        client_version: "1.0.9012",
        os_version: "10.0.19045",
        os_arch: "x64",
        system_locale: "en-US",
        client_build_number: 233868,
        client_event_source: null
      }));
    }, token);
    
    await page.reload({ waitUntil: 'networkidle2' });
    
    await page.waitForSelector('div[class*="app-"]', { timeout: 30000 }).catch(() => {
      console.log('[WebClient] App container not found, continuing anyway...');
    });
    
    session.status = 'setting_activity';
    console.log('[WebClient] Injecting activity script...');
    
    const activityInjected = await page.evaluate(async ({ applicationId, game, qId }) => {
      return new Promise((resolve) => {
        try {
          const originalSend = WebSocket.prototype.send;
          let wsInstance: WebSocket | null = null;
          let activitySet = false;
          
          const OriginalWS = window.WebSocket;
          window.WebSocket = function(url: string, protocols?: string | string[]) {
            const ws = new OriginalWS(url, protocols);
            
            ws.addEventListener('open', () => {
              console.log('[Hook] WebSocket opened:', url);
              if (url.includes('gateway.discord.gg') || url.includes('gateway')) {
                wsInstance = ws;
                console.log('[Hook] Captured Discord gateway!');
                (window as any)._discordWs = ws;
              }
            });
            
            const originalWSSend = ws.send.bind(ws);
            ws.send = function(data: any) {
              try {
                const parsed = JSON.parse(data);
                
                if (parsed.op === 2 || parsed.op === 6) {
                  console.log('[Hook] Client identifying/resuming');
                  setTimeout(() => injectActivity(ws), 2000);
                }
                
                if (parsed.op === 3) {
                  console.log('[Hook] Intercepting presence update');
                  parsed.d.activities = [{
                    name: game,
                    type: 0,
                    application_id: applicationId,
                    timestamps: { start: Date.now() },
                    assets: {
                      large_text: game,
                      large_image: undefined
                    },
                    instance: true
                  }] as any[];
                  data = JSON.stringify(parsed);
                  activitySet = true;
                  console.log('[Hook] Activity injected into presence update!');
                }
              } catch (e) {}
              
              return originalWSSend(data);
            };
            
            return ws;
          };
          
          function injectActivity(ws: WebSocket) {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
              console.error('[Hook] WebSocket not ready');
              resolve(false);
              return;
            }
            
            const presencePayload = {
              op: 3,
              d: {
                since: Date.now(),
                activities: [{
                  name: game,
                  type: 0,
                  application_id: applicationId,
                  timestamps: { start: Date.now() },
                  assets: { large_text: game },
                  instance: true
                }],
                status: 'online',
                afk: false
              }
            };
            
            console.log('[Hook] Sending activity injection:', JSON.stringify(presencePayload));
            ws.send(JSON.stringify(presencePayload));
            
            setTimeout(() => resolve(activitySet), 1000);
          }
          
          setTimeout(() => {
            if (!activitySet) {
              console.log('[Hook] No WS captured yet, trying direct approach...');
              
              window.dispatchEvent(new CustomEvent('setActivity', {
                detail: {
                  name: game,
                  application_id: applicationId,
                  type: 'PLAYING'
                }
              }));
              
              resolve(false);
            }
          }, 5000);
          
        } catch (err) {
          console.error('[Hook] Error:', err);
          resolve(false);
        }
      });
    }, { applicationId: appId, game: gameName, qId: questId });
    
    console.log(`[WebClient] Initial activity injection result: ${activityInjected}`);
    
    session.status = 'running';
    session.lastActivityUpdate = new Date();
    
    const activityInterval = setInterval(async () => {
      if (!session.page || !session.browser) {
        clearInterval(activityInterval);
        return;
      }
      
      try {
        const stillActive = await session.page.evaluate(({ applicationId, game }) => {
          return new Promise((resolve) => {
            let sent = false;
            
            const checkAndSend = () => {
              if ((window as any)._discordWs && (window as any)._discordWs.readyState === 1) {
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
                    status: 'online',
                    afk: false
                  }
                };
                
                (window as any)._discordWs.send(JSON.stringify(payload));
                sent = true;
                (window as any)._lastActivitySent = Date.now();
              }
              return sent;
            };
            
            if (checkAndSend()) {
              resolve(true);
            } else {
              fetch('/api/v10/users/@me/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ custom_status: null })
              }).then(() => resolve(false)).catch(() => resolve(false));
              
              setTimeout(() => resolve(sent), 2000);
            }
          });
        }, { applicationId: appId, game: gameName });
        
        if (stillActive) {
          session.lastActivityUpdate = new Date();
          const elapsed = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
          session.totalSeconds = elapsed;
          console.log(`[WebClient] Activity refreshed - ${elapsed}s elapsed`);
        }
        
      } catch (err) {
        console.error('[WebClient] Activity refresh error:', err);
      }
      
    }, config?.activityUpdateInterval ?? 25000);
    
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
