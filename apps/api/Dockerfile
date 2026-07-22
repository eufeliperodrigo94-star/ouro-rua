FROM node:20-alpine

WORKDIR /app

# Copy only the API package files (from repo root context)
COPY apps/api/package*.json ./

RUN npm install

# Copy the full API source (not the whole repo)
COPY apps/api/ .

RUN npx prisma generate

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main"]
