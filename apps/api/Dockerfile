FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --include=dev

COPY . .

RUN npx prisma generate

# Compile TypeScript directly - bypasses nest-cli quirks in containers
RUN ./node_modules/.bin/tsc -p tsconfig.json

# Fail loudly if dist/main.js was not produced
RUN ls -la dist/ && test -f dist/main.js || (echo "ERROR: dist/main.js not found!" && exit 1)

CMD ["node", "dist/main"]
