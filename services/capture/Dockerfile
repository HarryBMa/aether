FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache tini

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Persistent volumes for SQLite DB and audit log
VOLUME ["/data"]

# Non-root user
RUN addgroup -S capture && adduser -S capture -G capture
USER capture

EXPOSE 3400

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
