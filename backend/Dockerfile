FROM node:24-alpine

# Production by default; docker-compose.override.yml builds with
# NODE_ENV=development to get devDependencies (nodemon, jest).
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Pick up Alpine security patches newer than the base image.
RUN apk upgrade --no-cache

COPY package.json package-lock.json ./
RUN if [ "$NODE_ENV" = "development" ]; then npm ci; else npm ci --omit=dev; fi \
 && npm cache clean --force

# Code stays root-owned (read-only for the runtime user); only uploads/ is writable.
COPY . .
RUN mkdir -p uploads && chown node:node uploads

# Never run the API as root.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/v1/health >/dev/null || exit 1

CMD ["node", "src/index.js"]
