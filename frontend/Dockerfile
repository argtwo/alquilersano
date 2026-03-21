# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# VITE_API_URL vacío = rutas relativas (nginx proxy); en Vercel apunta al backend externo
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev=false
COPY . .
RUN npm run build

# ── Stage 2: serve con nginx ───────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
