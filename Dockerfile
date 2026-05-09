FROM node:18

RUN apt-get update && apt-get install -y \
libreoffice \
poppler-utils \
ghostscript \
tesseract-ocr \
tesseract-ocr-ara

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]
