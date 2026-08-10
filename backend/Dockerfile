# WikiCube analysis backend (Fastify + BullMQ). Build from the repo root so
# `shared/` is available for the @shared/* path alias:
#   docker build -f backend/Dockerfile .
FROM node:22-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci

COPY shared ./shared
COPY backend ./backend

WORKDIR /app/backend
EXPOSE 3031

# `npm run start` bundles with tsup (resolving @shared/*) and runs dist/server.js
CMD ["npm", "run", "start"]
