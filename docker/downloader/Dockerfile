FROM node:20-alpine

RUN apk add --no-cache python3 ffmpeg curl bash ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

RUN mkdir -p /app/downloads

EXPOSE 4050

CMD ["node", "server.js"]
