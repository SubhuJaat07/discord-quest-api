# Discord Quest API

**Server-side Discord Quest Completion API with External Access**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Discord](https://img.shields.io/badge/Discord-API%20v10-5865F2)

## ✨ Features

- 🔐 **Secure Authentication** - Discord token → Session → API Key flow
- 🎮 **Real Quest Data** - Fetches actual Discord quests via official API
- ⚡ **Server-side Completion** - Uses Discord Gateway WebSocket (like desktop apps)
- 🔑 **External API System** - Third-party apps can integrate without Discord tokens
- 📊 **Rate Limiting** - Built-in protection against abuse
- 🚀 **Deployment Ready** - Works on Vercel, Railway, Docker, or any Node.js host

## 📡 API Endpoints

### Base URL
```
Production: https://your-domain.com/api/v1
Local: http://localhost:3000/api/v1
```

### Authentication

#### `POST /auth` - Get API Key
```bash
curl -X POST https://your-domain.com/api/v1/auth \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_DISCORD_USER_TOKEN",
    "appName": "My App"
  }'
```

**Response:**
```json
{
  "success": true,
  "apiKey": "dqt_abc123...",
  "sessionId": "sess_xyz...",
  "user": {
    "username": "YourUsername",
    "discriminator": "0000",
    "id": "123456789"
  },
  "endpoints": {
    "quests": "/api/v1/quests",
    "questStart": "/api/v1/quests/:id/start",
    "questStatus": "/api/v1/quests/:id/status",
    "questCancel": "/api/v1/quests/:id/cancel",
    "userInfo": "/api/v1/user",
    "manageKeys": "/api/v1/keys"
  }
}
```

### Quests

#### `GET /quests` - List All Quests
```bash
curl https://your-domain.com/api/v1/quests \
  -H "x-api-key: dqt_abc123..."
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filter` | string | `all` | `all`, `available`, `completed`, `expired` |
| `raw` | boolean | `false` | Include raw Discord data |

**Response:**
```json
{
  "success": true,
  "quests": [...],
  "summary": {
    "total": 24,
    "available": 12,
    "inProgress": 3,
    "completed": 8,
    "expired": 1
  },
  "fetchedAt": "2026-01-15T..."
}
```

#### `POST /quests/:id/start` - Start Quest Completion
```bash
curl -X POST https://your-domain.com/api/v1/quests/1421154726023532544/start \
  -H "x-api-key: dqt_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "1421154726023532544",
    "gameName": "EA SPORTS FC 26"
  }'
```

**Response:**
```json
{
  "success": true,
  "questSessionId": "v1_17053...",
  "estimatedTime": "15 minutes",
  "method": "Discord Gateway WebSocket",
  "status": "started",
  "endpoints": {
    "status": "/api/v1/quests/1421154726023532544/status",
    "cancel": "/api/v1/quests/1421154726023532544/cancel"
  },
  "phases": [
    "Connecting to Discord Gateway",
    "Authenticating with token",
    "Sending PresenceUpdate (game activity)",
    "Maintaining heartbeat connection",
    "Tracking gameplay time (15 min)",
    "Completing quest objectives"
  ]
}
```

#### `GET /quests/:id/status` - Check Quest Status
```bash
curl https://your-domain.com/api/v1/quests/1421154726023532544/status \
  -H "x-api-key: dqt_abc123..."
```

**Response:**
```json
{
  "success": true,
  "quest": {
    "questId": "1421154726023532544",
    "gameName": "EA SPORTS FC 26",
    "status": "running",
    "phase": "Tracking playtime actively...",
    "progress": 45,
    "timing": {
      "elapsedSeconds": 405,
      "elapsedFormatted": "06:45",
      "remainingSeconds": 495,
      "remainingFormatted": "08:15",
      "totalSeconds": 900
    },
    "connection": {
      "gatewayConnected": true,
      "method": "Discord Gateway WebSocket"
    }
  }
}
```

#### `DELETE /quests/:id/cancel` - Cancel Active Quest
```bash
curl -X DELETE https://your-domain.com/api/v1/quests/1421154726023532544/cancel \
  -H "x-api-key: dqt_abc123..."
```

### User & Keys

#### `GET /user` - Get User Info
```bash
curl https://your-domain.com/api/v1/user \
  -H "x-api-key: dqt_abc123..."
```

#### `GET /keys` - List Your API Keys
```bash
curl https://your-domain.com/api/v1/keys \
  -H "x-api-key: dqt_abc123..."
```

#### `POST /keys` - Create New API Key
```bash
curl -X POST https://your-domain.com/api/v1/keys \
  -H "x-api-key: dqt_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Key"}'
```

#### `DELETE /keys?key=KEY` - Revoke API Key
```bash
curl -X DELETE "https://your-domain.com/api/v1/keys?key=dqt_abc123..." \
  -H "x-api-key: dqt_abc123..."
```

## 🔐 Security Features

### API Key System
- **Format**: `dqt_` prefix + 64 hex characters
- **Lifetime**: 7 days auto-expire
- **Rate Limit**: 30 requests/minute per key
- **Max Keys**: 5 per session
- **Permissions**: Granular control per key

### Permissions
| Permission | Description |
|------------|-------------|
| `quests:read` | View available quests |
| `quests:start` | Start quest completion |
| `quests:cancel` | Cancel active quests |
| `quests:status` | Check quest progress |
| `user:read` | Read user information |

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Or connect GitHub repo in Vercel dashboard
```

**Environment Variables:**
```
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=Discord Quest API
```

### Railway
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Or connect your GitHub repository in Railway dashboard.

### Docker
```bash
# Build image
docker build -t discord-quest-api .

# Run container
docker run -p 3000:3000 discord-quest-api
```

### Manual (Node.js)
```bash
# Install dependencies
npm install

# Build
npm run build

# Start production server
npm start
```

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── v1/              # External API v1 endpoints
│   │   │   ├── auth/        # Authentication & API keys
│   │   │   ├── quests/      # Quest CRUD operations
│   │   │   │   └── [id]/
│   │   │   │       ├── start/   # Start completion
│   │   │   │       ├── status/  # Check progress
│   │   │   │       └── cancel/  # Stop quest
│   │   │   ├── user/        # User info endpoint
│   │   │   └── keys/        # API key management
│   │   ├── token/           # Internal auth (web UI)
│   │   └── quests/          # Internal quests (web UI)
│   ├── page.tsx             # Main web interface
│   └── layout.tsx
├── lib/
│   ├── session.ts           # Session/token management
│   └── api-keys.ts          # External API key system
└── components/ui/           # shadcn/ui components
```

## 🎯 How It Works

1. **Authentication**: User provides Discord token → Server validates with Discord → Creates session + API key
2. **Quest Fetching**: Server calls `discord.com/api/v10/quests/@me` with stored token
3. **Quest Completion**: 
   - Connects to Discord Gateway WebSocket (`wss://gateway.discord.gg`)
   - Sends Identify payload with user token
   - Sends PresenceUpdate (opcode 3) with game activity
   - Maintains heartbeat connection for 15 minutes
   - Discord tracks this as "gameplay time" and completes quest

## ⚠️ Important Notes

- **Educational Purpose Only**: This tool is for learning about Discord's API and quest system
- **Token Security**: Never share your Discord token publicly
- **Rate Limits**: Respect Discord's rate limits to avoid bans
- **Session Storage**: Tokens are stored in memory only (cleared on restart)
- **No Persistence**: Quest progress is lost if server restarts during active quest

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Real-time**: WebSocket (Discord Gateway)
- **Deployment**: Vercel/Railway/Docker ready

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

---

**Built with ❤️ using Next.js and Discord API v10**
