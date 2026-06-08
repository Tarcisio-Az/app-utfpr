FROM ghcr.io/puppeteer/puppeteer:latest

# Define o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copia os arquivos de dependência (como package.json)
COPY package*.json ./

# Instala as dependências do Node (express, cors, etc)
RUN npm ci

# Copia o restante dos arquivos do backend (server.js, etc)
COPY . .

# Expõe a porta 3001 (Render usa a variável de ambiente PORT)
EXPOSE 3001

# Comando para iniciar o servidor
CMD ["node", "server.js"]
