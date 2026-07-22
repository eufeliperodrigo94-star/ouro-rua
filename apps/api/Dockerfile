FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./
RUN npm install --include=dev

COPY . .

RUN npx prisma generate

RUN npm run build

RUN test -f dist/main.js || (echo "ERROR: dist/main.js missing after build" && find /app -name "*.js" -not -path "*/node_modules/*" | head -10 && exit 1)

CMD ["node", "dist/main"]
