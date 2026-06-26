# ── Import Desk web (Vite SPA → nginx static) ──────────────────────────
# Build the static bundle, then serve it from nginx. VITE_API_URL is baked in
# at build time (the browser calls the API directly), so pass the PUBLIC api URL
# as a build arg in production.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
