FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    && ln -sf python3 /usr/bin/python

COPY package*.json ./



RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]