FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Explicitly install all deps including devDependencies for nest build
RUN npm install --include=dev

COPY . .

RUN npx prisma generate

# Use full path to nest CLI to avoid PATH issues
RUN ./node_modules/.bin/nest build

# Verify dist was created - will fail the build loudly if missing
RUN ls -la dist/ && ls dist/main.js

CMD ["node", "dist/main"]
