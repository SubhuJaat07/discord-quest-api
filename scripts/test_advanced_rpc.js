const WebSocket = require('ws');

const TOKEN = process.env.DISCORD_TOKEN || "YOUR_TOKEN_HERE";
const ROBLOX_APP_ID = "363445589247131668";

console.log("🎮 ADVANCED DISCORD RPC EMULATOR");
console.log("Mimicking REAL game behavior exactly\n");

async function runAdvancedTest() {
  return new Promise((resolve) => {
    // Use EXACT same headers as real Discord client
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json&compress=zlib-stream', {
      headers: {
        'User-Agent': 'Discord/1.0.9028 (Windows, 11.0.22631)',
        'Accept-Encoding': 'gzip, deflate, zlib',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    let seq = 0;
    let sessionId = null;
    let heartbeatInterval = null;
    
    function send(op, d) {
      const payload = { op, d, ...(seq > 0 && op !== 1 ? { t: null } : {}) };
      if (op === 1 || op === 2) {
        // Don't increment seq for heartbeat or identify
      } else {
        seq++;
      }
      ws.send(JSON.stringify(payload));
    }
    
    ws.on('open', () => {
      console.log("✅ Connected with real client User-Agent");
    });
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.op === 10) { // Hello
          console.log("📋 Hello received");
          sessionId = msg.d.session_id || `session_${Date.now()}`;
          
          // Identify as REAL Windows Discord client with game running
          send(2, {
            token: TOKEN,
            properties: {
              os: "Windows",
              browser: "Chrome",
              device: "Windows",
              system_locale: "en-US",
              client_version: "1.0.9028",
              os_version: "10.0.22631",
              native_binding_installed: true,
              client_build_number: 283638,
              release_channel: "stable"
            },
            compress: false,
            intents: 32767, // ALL intents (like real client)
            properties: {
              browser_user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              browser_version: "131.0.0.0",
              os_version: "10",
              referrer: "",
              referring_domain: "",
              referrer_current: "",
              referring_domain_current: "",
              release_channel: "stable",
              client_build_number: 283638,
              client_event_source: null
            },
            presence: {
              status: "online",
              since: Date.now(),
              activities: [{
                name: "Roblox",
                type: 0, // PLAYING = 0
                application_id: ROBLOX_APP_ID,
                url: null,
                state: "In Game", 
                details: "Playing Roblox",
                timestamps: {
                  start: Date.now()
                },
                assets: {
                  large_image: "363445589247131668",
                  large_text: "Roblox",
                  small_image: null,
                  small_text: null
                },
                party: {
                  id: `party_${Date.now()}`,
                  size: [1, 4]
                },
                secrets: {
                  join: null,
                  spectate: null,
                  match: null
                },
                instance: true,
                flags: 1 << 0 | 1 << 1 | 1 << 2 | 1 << 3 | 1 << 4,
                buttons: [],
                metadata: {
                  context_uri: `spotify:game:${ROBLOX_APP_ID}`,
                  session_id: `game_session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                  sync_id: `${ROBLOX_APP_ID}_${new Date().toISOString()}`
                }
              }],
              afk: false
            }
          });
          
          console.log("✅ Sent IDENTIFY with full game activity");
          
          // Start heartbeat
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          heartbeatInterval = setInterval(() => {
            send(1, Date.now()); // Heartbeat with timestamp
          }, msg.d.heartbeat_interval);
        }
        
        if (msg.t === "READY") {
          console.log("✅ READY! User:", msg.d.user?.username);
          console.log("   Session ID:", msg.d.session_id?.substring(0,20));
        }
        
        if (msg.t === "SESSIONS_REPLACE") {
          console.log("📱 Sessions replaced (normal for real client)");
        }
        
        // Send continuous presence updates like real game would
        setTimeout(() => {
          console.log("🔄 Sending PRESENCE_UPDATE (like real game does every 30s)");
          send(3, { // Presence Update
            since: Date.now(),
            activities: [{
              name: "Roblox",
              type: 0,
              application_id: ROBLOX_APP_ID,
              details: "Playing Roblox",
              state: "In Game",
              timestamps: { start: Date.now() },
              assets: {
                large_image: ROBLOX_APP_ID,
                large_text: "Roblox"
              },
              instance: true,
              flags: 1 << 0 | 1 << 1 | 1 << 2 | 1 << 3,
              metadata: {
                context_uri: `spotify:game:${ROBLOX_APP_ID}`,
                session_id: `game_${Date.now()}`,
                sync_id: `${ROBLOX_APP_ID}_${Date.now()}`
              }
            }],
            status: "online",
            afk: false
          });
          
          resolve(true);
        }, 5000);
        
      } catch(e) {}
    });
    
    ws.on('error', (err) => {
      console.log("❌ Error:", err.message);
      resolve(false);
    });
    
    setTimeout(() => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      resolve(false);
    }, 15000);
  });
}

runAdvancedTest().then(() => {
  console.log("\n" + "=".repeat(50));
  console.log("⏳ Now checking Discord for progress...");
});
