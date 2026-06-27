# Multi-stage: base → dev | builder → prod
# pnpm via corepack; node_modules in dev persisted by named volume in compose.

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# ---------- dev ----------
FROM base AS dev
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install
# Source is volume-mounted; node_modules persisted via web_node_modules volume.

# ---------- builder ----------
FROM base AS builder
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- prod ----------
# If next.config enables output:'standalone', replace the COPY block below with:
#   COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
#   COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
#   COPY --from=builder --chown=nextjs:nodejs /app/public ./public
FROM base AS prod
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system nodejs \
    && adduser --system --ingroup nodejs --no-create-home nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json ./

USER nextjs
EXPOSE 3000
