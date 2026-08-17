# syntax=docker/dockerfile:1.7

# Multi-stage build for the API.
#
# The runtime stage carries only production dependencies and compiled JavaScript
# — no TypeScript sources, no compiler, no dev tooling. That keeps the image
# small and, more importantly, shrinks the attack surface: nothing in the final
# image can compile or transpile arbitrary code.

# Pinned rather than :latest so a rebuild months from now produces the same
# runtime. Matches the Node version the team develops against.
ARG NODE_VERSION=22.17.0

# -----------------------------------------------------------------------------
# Stage 1 — install every dependency (including dev) needed to compile
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app

# Copied before the sources so this layer is reused whenever only application
# code changed. npm ci installs strictly from the lockfile, so builds are
# reproducible and cannot silently pick up a newer transitive version.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# -----------------------------------------------------------------------------
# Stage 2 — compile TypeScript to dist/
# -----------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app

COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3 — production dependencies only
# -----------------------------------------------------------------------------
# Built separately from stage 1 so the runtime never inherits a node_modules
# tree that once contained dev packages.
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# -----------------------------------------------------------------------------
# Stage 4 — runtime
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# Also read by config/env.ts, which applies stricter validation in production:
# a weak JWT_SECRET is fatal rather than a warning.
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# `node` (uid 1000) ships with the official image. Running as root would mean a
# remote-code-execution bug in a dependency gets root inside the container.
# --chown at copy time avoids a second layer just to fix ownership.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 3000

# Uses the API's own root route. Node 22 has a global fetch, so this needs no
# curl or wget in the image. start-period covers the initial DB connection.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so the signal sent by `docker stop` reaches node directly instead
# of a shell that would swallow it. Runs the compiled output — tsx is a dev
# dependency and is deliberately absent here.
CMD ["node", "dist/server.js"]
