# ============================================
# 🚀 Discord Quest API - Production Dockerfile
# With Chromium for real browser automation
# ============================================

# Stage 1: Base with system dependencies
FROM node:20-alpine AS base

# Install Chromium dependencies (Alpine package names)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont fontconfig dbus ffmpeg mesa-gbm pango cairo alsa-lib libxcomposite libxdamage libxfixes libxrandr

# Create non-root user early
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set working directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# ============================================
# Stage 2: Production runner (minimal image)
# ============================================
FROM node:20-alpine AS runner

# Install minimal runtime deps for Chromium (single line, no comments)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont fontconfig dbus mesa-gbm pango cairo alsa-lib libxcomposite libxdamage libxfixes libxrandr

# Set environment variables for Puppeteer/Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV puppeteer_skip_download=true

# Disable Chromium's sandbox (needed in containers)
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox"

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application from base stage
COPY --from=base --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=base --chown=nextjs:nodejs /app/public ./public

# Switch to non-root user
USER nextjs

# Expose the application port
EXPOSE 3000

# Set Node environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Enable stealth mode by default
ENV CHROMIUM_STEALTH_MODE="true"

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
