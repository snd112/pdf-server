
FROM node:18
RUN apt-get update && apt-get install -y  libreoffice  poppler-utils  ghostscript  qpdf  tesseract-ocr  tesseract-ocr-eng
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm","start"]
