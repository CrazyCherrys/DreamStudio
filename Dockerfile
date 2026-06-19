FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/db/prisma packages/db/prisma
COPY packages/queue/package.json packages/queue/package.json

RUN npm ci

COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV LOCAL_STORAGE_ROOT=/data
ENV WEB_PORT=3000
ENV API_PORT=3001

COPY --from=build /app /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && chmod +x scripts/docker-entrypoint.sh \
  && mkdir -p /data/image/input /data/image/output

EXPOSE 3000 3001
VOLUME ["/data"]

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
