FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages packages
COPY services/mobile-api/package.json services/mobile-api/package.json

RUN npm install --workspaces --include-workspace-root=false

COPY tsconfig.json tsconfig.json
COPY services/mobile-api services/mobile-api

RUN npm run build --workspace @defensivepedal/mobile-api

CMD ["node", "services/mobile-api/dist/server.js"]
