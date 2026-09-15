FROM node:24-alpine
WORKDIR /app
COPY server/index.mjs ./server/index.mjs
ENV PORT=8787 DB_PATH=/data/rooms.sqlite
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
CMD ["node", "server/index.mjs"]
