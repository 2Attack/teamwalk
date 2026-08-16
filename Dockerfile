# Self-hosted TeamWalk. The app speaks Neon's SQL-over-HTTP protocol, so a
# plain Postgres is not enough — run this image via docker-compose.yml, which
# pairs it with Postgres + a Neon HTTP proxy (see README "Deploy with Docker").

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_LOCALE is inlined into the client bundle at build time:
# changing the language means rebuilding the image.
ARG NEXT_PUBLIC_LOCALE=en
ENV NEXT_PUBLIC_LOCALE=$NEXT_PUBLIC_LOCALE
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json next.config.ts ./
COPY scripts/db-migrate.mts ./scripts/
COPY drizzle ./drizzle
EXPOSE 3000
# Migrations are idempotent and need the DB, which exists only at run time.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
