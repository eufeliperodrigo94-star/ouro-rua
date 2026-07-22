FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./
RUN npm install --include=dev

COPY . .

RUN npx prisma generate

RUN npm run build

RUN test -f dist/main.js || (echo "ERROR: dist/main.js missing" && exit 1)

# Push schema to DB on startup, then start server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]
