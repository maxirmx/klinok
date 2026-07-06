# syntax=docker/dockerfile:1.7
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok ui application

# Stage for building the frontend
FROM node:26.3.0-alpine3.24 AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN --mount=type=secret,id=klinok_demo_participant_private_key_b64,target=/run/secrets/klinok_demo_participant_private_key_b64 \
    node scripts/write-shared-participant-key-overlay.js \
    --secret-file /run/secrets/klinok_demo_participant_private_key_b64 \
    --optional
RUN npm run build

# Stage for running nginx with static files
FROM nginx:1.31.1-alpine AS final

COPY --from=build /app/dist /var/www/klinok
COPY config/public /var/www
COPY config/nginx.conf /etc/nginx/conf.d/default.conf
COPY config/update-config.sh /docker-entrypoint.d/40-update-config.sh

RUN sed -i 's/\r$//' /docker-entrypoint.d/40-update-config.sh \
    && chmod +x /docker-entrypoint.d/40-update-config.sh

EXPOSE 8082
EXPOSE 8083

CMD ["nginx", "-g", "daemon off;"]
