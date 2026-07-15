# Use Node 20 Alpine for smaller image
FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat openssl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use npm install instead of ci for better compatibility)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build Next.js app
RUN npm run build

# Production stage - minimal image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets from build stage
COPY --from=base --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=base --chown=nextjs:nodejs /app/public ./public

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]
