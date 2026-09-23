FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --package-lock=false
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_SOCKET_URL
RUN test -n "$VITE_API_BASE_URL" && test -n "$VITE_SOCKET_URL" && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
