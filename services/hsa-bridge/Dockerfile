FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN addgroup -S hsa && adduser -S hsa -G hsa
USER hsa
EXPOSE 3402
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
