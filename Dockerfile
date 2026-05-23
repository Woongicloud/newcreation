FROM node:22-alpine

# server는 ../shared 를 상대경로로 import함
# /app/shared + /app/server 구조로 배치
WORKDIR /app
COPY shared/ ./shared/

# server 의존성 설치
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev

# server 소스 복사
COPY server/ ./

EXPOSE 3001
CMD ["node", "index.js"]
