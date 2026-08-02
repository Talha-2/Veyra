FROM node:22-alpine AS deps
WORKDIR /app
# npm fetch retries + a cache mount: registry ECONNRESETs on a flaky network
# would otherwise fail the whole `npm ci`; retries + cached tarballs make it
# resumable instead of all-or-nothing
ENV NPM_CONFIG_FETCH_RETRIES=6 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
# NEXT_PUBLIC_* is inlined at build time — the browser calls the API on the
# host-mapped port, so localhost:8000 is the right default for compose.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# "Book a demo" target — your Google Calendar / Calendly link (inlined at build)
ARG NEXT_PUBLIC_CALENDAR_URL=
ENV NEXT_PUBLIC_CALENDAR_URL=$NEXT_PUBLIC_CALENDAR_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
