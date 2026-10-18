FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg python3 py3-pip poppler-utils ghostscript qpdf tesseract-ocr tesseract-ocr-data-spa tesseract-ocr-data-eng ocrmypdf libreoffice font-noto \
    && pip install --no-cache-dir --break-system-packages python-docx python-pptx openpyxl img2pdf

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build
RUN mkdir -p dist/config && cp src/config/email-templates.json dist/config/email-templates.json && mkdir -p dist/tools/pdf-converter/scripts && cp src/tools/pdf-converter/scripts/converter_worker.py dist/tools/pdf-converter/scripts/converter_worker.py

EXPOSE 3000

CMD ["npm", "start"]
