# Стадия сборки фронтенда
FROM node:22-alpine AS build-vue
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ .
RUN npm run build

# Продакшен-образ Nginx
FROM nginx:alpine
# Копируем собранную статику из предыдущей стадии
COPY --from=build-vue /app/dist /usr/share/nginx/html
# Копируем конфиг Nginx
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# Копируем SSL-сертификаты (как у вас уже настроено через volume, но для прода лучше встроить в образ или использовать secrets)
# ...