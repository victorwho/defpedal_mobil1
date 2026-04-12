FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages packages
COPY services/mobile-api/package.json services/mobile-api/package.json

RUN npm install --workspaces --include-workspace-root=false --legacy-peer-deps

COPY tsconfig.json tsconfig.json
COPY services/mobile-api services/mobile-api

RUN npm run build --workspace @defensivepedal/mobile-api

FROM node:22-alpine AS runtime
WORKDIR /app

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/mobile-api/package.json ./services/mobile-api/package.json
COPY --from=builder /app/services/mobile-api/dist ./services/mobile-api/dist

RUN npm install --workspaces --include-workspace-root=false --legacy-peer-deps --omit=dev

USER appuser

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "services/mobile-api/dist/server.js"]
