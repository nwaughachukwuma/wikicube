# WikiCube frontend (Next.js). Built from the repo root so `shared/` is
# available for the @shared/* path alias.
#
# `next build` runs at container start (see CMD) so NEXT_PUBLIC_* values are
# taken from the runtime environment instead of being baked into the image.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npm run build && npm run start"]
