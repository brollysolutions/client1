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
# lib/auth.ts type-imports @contracts (tsconfig alias -> ../../packages/contracts,
# i.e. /packages/contracts from /app), which lives OUTSIDE this build context —
# without it `next build`'s typecheck fails. Supplied as a named context:
#   compose:  build.additional_contexts: { contracts: ./packages/contracts }
#   CLI:      --build-context contracts=packages/contracts
COPY --from=contracts . /packages/contracts
# NEXT_PUBLIC_* vars are inlined into the browser bundle at BUILD time, so the API
# base URL must be provided here — a runtime env_file is too late and the client
# would fall back to http://localhost:8000. Supplied via compose build.args.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
# Public identity is rendered into static pages and the browser bundle. Docker
# production builds are strict: sample contact/origin fallbacks remain useful
# for local `pnpm build`, but can never enter a deployable image.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CONTACT_PHONE
ARG NEXT_PUBLIC_CONTACT_EMAIL
ARG NEXT_PUBLIC_CONTACT_HOURS
ARG NEXT_PUBLIC_CONTACT_ADDRESS
ENV DHANADHARA_REQUIRE_PUBLIC_CONFIG=true \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_CONTACT_PHONE=${NEXT_PUBLIC_CONTACT_PHONE} \
    NEXT_PUBLIC_CONTACT_EMAIL=${NEXT_PUBLIC_CONTACT_EMAIL} \
    NEXT_PUBLIC_CONTACT_HOURS=${NEXT_PUBLIC_CONTACT_HOURS} \
    NEXT_PUBLIC_CONTACT_ADDRESS=${NEXT_PUBLIC_CONTACT_ADDRESS}
# Origin only (e.g. https://nyc3.digitaloceanspaces.com), no path -- next.config.ts
# builds a remotePattern from it so next/image will fetch banner images
# served from the public/ storage prefix. See docker-compose.prod.example.yml
# for why this is required in a real deploy: left unset, every banner image
# silently fails to render (lib/public-banners.ts's host guard only allows
# this value or dev's localhost:9000).
ARG NEXT_PUBLIC_ASSET_HOST
ENV NEXT_PUBLIC_ASSET_HOST=${NEXT_PUBLIC_ASSET_HOST}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- prod ----------
# next.config.ts sets output:'standalone': .next/standalone contains server.js
# plus only the runtime node_modules subset — the full builder node_modules
# (including devDependencies) never reaches this image.
FROM base AS prod
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CONTACT_PHONE
ARG NEXT_PUBLIC_CONTACT_EMAIL
ARG NEXT_PUBLIC_CONTACT_HOURS
ARG NEXT_PUBLIC_CONTACT_ADDRESS
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DHANADHARA_REQUIRE_PUBLIC_CONFIG=true \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_CONTACT_PHONE=${NEXT_PUBLIC_CONTACT_PHONE} \
    NEXT_PUBLIC_CONTACT_EMAIL=${NEXT_PUBLIC_CONTACT_EMAIL} \
    NEXT_PUBLIC_CONTACT_HOURS=${NEXT_PUBLIC_CONTACT_HOURS} \
    NEXT_PUBLIC_CONTACT_ADDRESS=${NEXT_PUBLIC_CONTACT_ADDRESS}

# The standalone server needs Node, not npm/Corepack/pnpm. Keep vulnerable or
# unnecessary package-manager code out of the runtime image, and apply current
# Alpine security updates before dropping privileges.
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

RUN addgroup --system --gid 101 nodejs \
    && adduser --system --uid 100 --ingroup nodejs --no-create-home nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
