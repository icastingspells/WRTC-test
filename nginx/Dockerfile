# Стадия сборки фронтенда
FROM node:22-alpine AS build-vue
WORKDIR /app
# Копируем package.json и package-lock.json (или yarn.lock)
COPY frontend/package*.json ./
# Устанавливаем ВСЕ зависимости (включая devDependencies)
RUN npm ci
# Копируем исходники
COPY frontend/ .
# Собираем production-билд
RUN npm run build

# Продакшен-образ Nginx
FROM nginx:alpine
# Копируем собранную статику из предыдущей стадии
COPY --from=build-vue /app/dist /usr/share/nginx/html
# Копируем конфиг Nginx
COPY nginx/default.conf /etc/nginx/conf.d/default.conf