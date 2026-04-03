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

# Build frontend (Expo web static export into dist-web/)
RUN EXPO_PUBLIC_API_BASE_URL=__API_BASE_URL_PLACEHOLDER__ \
    npx expo export --platform web --output-dir dist-web || true

# ─── Production stage ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm@9.12.0

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-web ./dist-web
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000

CMD ["node", "dist/index.js"]
