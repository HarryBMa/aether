FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json src ./src/
RUN npx tsc

FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
VOLUME ["/certs"]
RUN addgroup -S siths && adduser -S siths -G siths
USER siths
EXPOSE 3401
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
