FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages packages
COPY services/mobile-api/package.json services/mobile-api/package.json
# Root postinstall wrapper: tolerates patch-package being absent in this
# image (root devDependencies are never installed here; the patches/ dir only
# targets React Native libraries). Without it, npm install exits 127.
COPY scripts/run-patch-package.cjs scripts/run-patch-package.cjs

RUN npm install --workspaces --include-workspace-root=false --legacy-peer-deps

COPY tsconfig.json tsconfig.json
COPY services/mobile-api services/mobile-api

RUN npm run build --workspace @defensivepedal/mobile-api

FROM node:22-alpine AS runtime
WORKDIR /app

# Set NODE_ENV so the dev-auth-bypass gate (lib/auth.ts) refuses to honour
# DEV_AUTH_BYPASS_ENABLED on Cloud Run even if it's set by mistake.
ENV NODE_ENV=production

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/mobile-api/package.json ./services/mobile-api/package.json
COPY --from=builder /app/services/mobile-api/dist ./services/mobile-api/dist
COPY --from=builder /app/scripts/run-patch-package.cjs ./scripts/run-patch-package.cjs

RUN npm install --workspaces --include-workspace-root=false --legacy-peer-deps --omit=dev

USER appuser

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "services/mobile-api/dist/server.js"]
