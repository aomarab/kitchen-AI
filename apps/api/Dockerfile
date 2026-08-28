# syntax=docker/dockerfile:1

# Production image for the Kitchen AI NestJS API (@kitchen/api).
#
# The build context is the repository ROOT, not apps/api, because the API
# depends on the @kitchen/contracts and @kitchen/i18n workspace packages:
#   docker build -f apps/api/Dockerfile -t kitchen-api .
#
# Provide the production environment at run time — the API refuses to boot on an
# invalid one (apps/api/src/config/env.ts; see docs/production-launch.md §B).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1
ENV DO_NOT_TRACK=1
# corepack activates the pnpm version pinned in package.json's packageManager.
RUN corepack enable
WORKDIR /repo

# ---- Install dependencies and build the API + its workspace packages ----
FROM base AS build
# The whole workspace is copied so the frozen lockfile resolves; .dockerignore
# keeps node_modules, build output and secrets out of the build context.
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
# Builds @kitchen/api and, through turbo's "^build", its workspace dependencies
# (contracts, i18n). Web and mobile are intentionally not built here.
RUN pnpm exec turbo run build --filter=@kitchen/api
# Emit a self-contained production tree: compiled dist, the drizzle migrations,
# and a production node_modules with the workspace packages materialised in and
# dev dependencies (including tsx) dropped.
RUN pnpm --filter=@kitchen/api --legacy deploy --prod /app

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
# Run as the unprivileged user shipped in the Node image.
USER node
EXPOSE 3333
# Migrations and seeding run from the same image against the production database,
# once, before first boot (both compile to plain JS, so no tsx is needed):
#   docker run --rm --env-file .env <image> node dist/db/migrate.js
#   docker run --rm --env-file .env <image> node dist/db/seed.js
# migrate.ts reads ./drizzle relative to the working directory, which is /app.
CMD ["node", "dist/main.js"]
