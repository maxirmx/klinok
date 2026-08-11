# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY api-node/package.json api-node/package.json
RUN npm ci --workspace @klinok/contracts --workspace @klinok/api-node
COPY packages/contracts packages/contracts
COPY api-node api-node
RUN npm run build --workspace @klinok/contracts && npm run build --workspace @klinok/api-node
RUN npm prune --ignore-scripts --omit=dev --workspace @klinok/contracts --workspace @klinok/api-node

FROM node:24.18.0-bookworm-slim AS final
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/contracts packages/contracts
COPY --from=build --chown=node:node /app/api-node api-node
USER node
EXPOSE 8090
CMD ["node", "api-node/dist/server.js"]
