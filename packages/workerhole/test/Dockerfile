FROM node:24-bookworm-slim
WORKDIR /app
COPY dist/fixture-node.mjs /app/server.mjs
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
