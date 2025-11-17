# Multi-stage build for optimized production image

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Install dependencies needed for node-gyp and native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine

# Install dumb-init, postgresql-client (for pg_dump), bash, gzip (for database backups), and git (for auto-updates)
RUN apk add --no-cache dumb-init postgresql16-client bash gzip bc git

# Use existing node user (UID 1000) or create nodejs user
# node:20-alpine already has a 'node' user with UID 1000
# Remove existing node user/group and create nodejs user/group with same UID/GID
RUN deluser --remove-home node 2>/dev/null || true && \
    delgroup node 2>/dev/null || true && \
    addgroup -g 1000 -S nodejs && \
    adduser -S nodejs -u 1000 -G nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy built application from builder stage first
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy necessary files
COPY --chown=nodejs:nodejs shared ./shared
COPY --chown=nodejs:nodejs server ./server
COPY --chown=nodejs:nodejs scripts ./scripts
COPY --chown=nodejs:nodejs drizzle.config.ts ./

# Install ALL dependencies (including dev) because esbuild uses --packages=external
# This means the bundled code still imports packages from node_modules
RUN npm ci && npm cache clean --force

# Create directories for runtime assets, backups and ensure proper ownership
RUN mkdir -p /app/attached_assets/logos /app/logs /app/backups && \
    chown -R nodejs:nodejs /app/attached_assets /app/logs /app/backups

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
