# syntax=docker/dockerfile:1

# Node is pinned to an exact patch so a security release is a deliberate rebuild,
# not whatever the floating tag pointed at on the last build. 22.23.4 carries the
# 21 Oct 2026 fixes, including the Brotli decoder bug that express.json() reaches
# through Content-Encoding: br.

# ---- Stage 1: build the React/Vite client -> ./public ----
FROM node:22.23.4-bookworm-slim AS client-build
WORKDIR /app
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci
COPY client/ ./client/
COPY shared/ ./shared/
RUN cd client && npm run build

# ---- Stage 2: runtime (Express + Socket.IO via tsx) ----
FROM node:22.23.4-bookworm-slim AS runtime
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=dev && npm cache clean --force
COPY tsconfig.json tsconfig.server.json ./
COPY server/ ./server/
COPY shared/ ./shared/
COPY --from=client-build /app/public ./public
RUN mkdir -p data
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]
