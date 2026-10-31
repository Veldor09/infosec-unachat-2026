# UNA Chat en Node.js 24 (la misma version que Render, NODE_VERSION=24)
FROM node:24-alpine

WORKDIR /app

# dependencias de produccion, exactamente las de package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.html server.js instrument.js ./
COPY libs ./libs

ENV NODE_ENV=production \
    PORT=3000

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# el comando de inicio definido en package.json
CMD ["npm", "start"]
