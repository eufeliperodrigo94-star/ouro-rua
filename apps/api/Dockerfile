FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./
RUN npm install --include=dev && echo "=== TS VERSION: $(./node_modules/.bin/tsc --version) ===" && ls node_modules/.bin/nest && echo "=== nest exists ==="

COPY . .
RUN echo "=== SRC FILES ===" && ls -la src/ && echo "=== TSCONFIG ===" && cat tsconfig.json

RUN npx prisma generate || true

RUN echo "=== RUNNING NEST BUILD ===" && npm run build 2>&1; echo "=== NEST BUILD EXIT: $? ===" && find /app -name "*.js" -not -path "*/node_modules/*" | head -20 && echo "=== END FIND ==="

RUN test -f dist/main.js && echo "SUCCESS" || (echo "FAIL: dist/main.js not found" && exit 1)

CMD ["node", "dist/main"]
