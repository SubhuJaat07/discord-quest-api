const WebSocket = require('ws');

// Discord GameSDK uses a specific protocol
// Real games connect to ws://127.0.0.1:6463 (or /tmp/discord-ipc-*)
// But from server, we need to use the Gateway differently

console.log("🎮 Testing DISCORD GAME ACTIVITY PROTOCOLS\n");

// Method 1: Try setting activity with SPECIFIC flags that Discord looks for
async function testSpecialPresence() {
  console.log("1️⃣ Testing SPECIAL ACTIVITY FLAGS...");
  
  const token = process.env.DISCORD_TOKEN || "YOUR_TOKEN_HERE";
  
  // Connect to Gateway
  const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json', {
    headers: { 'User-Agent': 'DiscordClient/2.0.0' }
  });
  
  return new Promise((resolve) => {
    let heartbeatInterval = null;
    
    ws.on('open', () => {
      console.log("   ✅ Connected to Gateway");
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.op === 10) { // Hello
        console.log("   📋 Received Hello, interval:", msg.d.heartbeat_interval);
        
        // Identify as REAL Discord client (not bot!)
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token,
            properties: {
              os: "Windows",
              browser: "Chrome", 
              device: "Windows",
              system_locale: "en-US",
              client_version: "1.0.9028",
              os_version: "10.0.22631",
              native_binding_installed: true
            },
            compress: false,
            intents: 1 << 8 | 1 << 12 | 1 << 15, // GUILD + DM + PRESENCE
            presence: {
              status: "online",
              since: Date.now(),
              activities: [{
                name: "Roblox",
                type: 0, // PLAYING
                application_id: "363445589247131668",
                details: "Playing Roblox",
                state: "In Game",
                timestamps: { start: Date.now() },
                assets: {
                  large_image: "363445589247131668",
                  large_text: "Roblox"
                },
                instance: true,
                flags: 1 << 0 | 1 << 1 | 1 << 2 | 1 << 3,
                // CRITICAL: Add metadata that mimics real game detection
                metadata: {
                  context_uri: "spotify:game:363445589247131668",
                  session_id: `game_session_${Date.now()}`,
                  sync_id: `roblox_${new Date().toISOString()}`
                }
              }],
              afk: false
            }
          }
        }));
        
        console.log("   ✅ Sent IDENTIFY with game activity");
        
        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          ws.send(JSON.stringify({ op: 1, d: Date.now() }));
        }, msg.d.heartbeat_interval);
      }
      
      if (msg.t === "READY") {
        console.log("   ✅ READY received!");
        console.log("   👤 User:", msg.d.user?.username);
        
        // Wait a bit then check progress
        setTimeout(() => resolve(true), 3000);
      }
      
      if (msg.op === 11) {
        // Heartbeat ACK
      }
      
      if (msg.t === "PRESENCE_UPDATE") {
        console.log("   📢 Presence update confirmed");
      }
    });
    
    ws.on('error', (err) => {
      console.log("   ❌ Error:", err.message);
      resolve(false);
    });
    
    setTimeout(() => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      resolve(false);
    }, 10000);
  });
}

testSpecialPresence().then(success => {
  console.log("\n" + "=".repeat(50));
  if (success) {
    console.log("✅ Test complete - check if Discord tracked activity!");
  } else {
    console.log("❌ Test failed");
  }
  process.exit(0);
});
