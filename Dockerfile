FROM node:20-alpine AS base
RUN npm install -g pnpm@9.12.0

# ─── Build stage ───────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build backend (esbuild bundles server into dist/)
RUN pnpm build

# ─── Production stage ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm@9.12.0

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
# Copy pre-built frontend static files from repo
COPY dist-web ./dist-web
COPY --from=builder /app/drizzle ./drizzle
# Inject build version as environment variable for /api/version endpoint
# APP_VERSION is set by deploy.sh via --build-arg or read from .build-version
COPY .build-version* ./
RUN APP_VER=$(cat .build-version 2>/dev/null || echo '1.0.0') && \
    echo "APP_VERSION=${APP_VER}" && \
    printf 'APP_VERSION=%s\nBUILD_TIME=%s\n' "${APP_VER}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /app/.runtime-env

EXPOSE 3000

# Source runtime env before starting server
CMD ["sh", "-c", "set -a && [ -f /app/.runtime-env ] && . /app/.runtime-env && set +a && node dist/index.js"]
