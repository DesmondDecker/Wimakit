# ─────────────────────────────────────────────────────────────────────────────
# WimaKit Backend – Dockerfile
# Multi-stage build for lean production image
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Build / Install deps
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install all deps
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY . .

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production image
FROM node:20-alpine AS production
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S wimakit -u 1001

# Copy deps and app from builder
COPY --from=builder --chown=wimakit:nodejs /app/node_modules ./node_modules
COPY --chown=wimakit:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown wimakit:nodejs logs

# Switch to non-root
USER wimakit

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Start
CMD ["node", "src/server.js"]
