FROM node:20-alpine

WORKDIR /app

# 루트 workspace 설정 복사
COPY package.json ./

# shared 모듈 복사 (server가 ../shared 참조)
COPY shared/ ./shared/

# server 의존성 설치
COPY server/package.json ./server/
RUN npm install --workspace=server --ignore-scripts

# server 소스 복사
COPY server/ ./server/

WORKDIR /app/server

EXPOSE 3001

CMD ["node", "index.js"]
