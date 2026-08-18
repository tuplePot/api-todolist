# ─── api-todolist-personal · Bun + Elysia ────────────────────────────────────
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5000

EXPOSE 5000

CMD ["bun", "run", "src/index.ts"]
