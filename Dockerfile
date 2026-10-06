# syntax = docker/dockerfile:1

# Small Node/TypeScript server (see docs/decisions/001-stack.md). Must serve
# HTTP on 0.0.0.0:$PORT (fly.toml sets PORT) and publish README.md at /readme/
# (spec/README.md says what's checked).

FROM node:24.21.0-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm exec tsc -p tsconfig.build.json

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY README.md ./README.md

EXPOSE 8080
CMD ["node", "dist/server.js"]
