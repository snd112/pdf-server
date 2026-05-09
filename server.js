const express = require("express");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const Tesseract = require("tesseract.js");

const app = express();

app.use(cors());
app.use(fileUpload({ limits: { fileSize: 100 * 1024 * 1024 } }));

// ========================
// SAVE FILE
// ========================
function saveFile(file, name) {
  const p = path.join(__dirname, "uploads", name);
  fs.writeFileSync(p, file.data);
  return p;
}

// ========================
// 1. MERGE PDF
// ========================
app.post("/merge", async (req, res) => {
  const files = req.files.files;
  const pdf = await PDFDocument.create();

  for (let f of files) {
    const src = await PDFDocument.load(f.data);
    const pages = await pdf.copyPages(src, src.getPageIndices());
    pages.forEach(p => pdf.addPage(p));
  }

  res.send(Buffer.from(await pdf.save()));
});

// ========================
// 2. SPLIT PDF
// ========================
app.post("/split", async (req, res) => {
  const file = req.files.files;
  const pdf = await PDFDocument.load(file.data);

  const result = [];

  for (let i = 0; i < pdf.getPageCount(); i++) {
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(pdf, [i]);
    newPdf.addPage(page);

    result.push({
      name: `page-${i + 1}.pdf`,
      data: Buffer.from(await newPdf.save()).toString("base64")
    });
  }

  res.json(result);
});

// ========================
// 3. COMPRESS PDF
// ========================
app.post("/compress", (req, res) => {
  const input = saveFile(req.files.files, "input.pdf");
  const output = path.join(__dirname, "outputs", "compressed.pdf");

  exec(`gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -dNOPAUSE -dBATCH -sOutputFile=${output} ${input}`, () => {
    res.download(output);
  });
});

// ========================
// 4. PDF → WORD
// ========================
app.post("/pdf-to-word", (req, res) => {
  const input = saveFile(req.files.files, "input.pdf");

  exec(`libreoffice --headless --convert-to docx ${input} --outdir outputs`, () => {
    res.download(path.join(__dirname, "outputs", "input.docx"));
  });
});

// ========================
// 5. WORD → PDF
// ========================
app.post("/word-to-pdf", (req, res) => {
  const input = saveFile(req.files.files, "input.docx");

  exec(`libreoffice --headless --convert-to pdf ${input} --outdir outputs`, () => {
    res.download(path.join(__dirname, "outputs", "input.pdf"));
  });
});

// ========================
// 6. PDF → EXCEL
// ========================
app.post("/pdf-to-excel", (req, res) => {
  const input = saveFile(req.files.files, "input.pdf");

  exec(`libreoffice --headless --convert-to xlsx ${input} --outdir outputs`, () => {
    res.download(path.join(__dirname, "outputs", "input.xlsx"));
  });
});

// ========================
// 7. EXCEL → PDF
// ========================
app.post("/excel-to-pdf", (req, res) => {
  const input = saveFile(req.files.files, "input.xlsx");

  exec(`libreoffice --headless --convert-to pdf ${input} --outdir outputs`, () => {
    res.download(path.join(__dirname, "outputs", "input.pdf"));
  });
});

// ========================
// 8. PDF → POWERPOINT
// ========================
app.post("/pdf-to-powerpoint", (req, res) => {
  const input = saveFile(req.files.files, "input.pdf");

  exec(`libreoffice --headless --convert-to pptx ${input} --outdir outputs`, () => {
    res.download(path.join(__dirname, "outputs", "input.pptx"));
  });
});

// ========================
// 9. POWERPOINT → PDF
// ========================
app.post("/powerpoint-to-pdf", (req, res) => {
  const input = saveFile(req.files.files, "input.pptx");

  exec(`libreoffice --headless --convert-to pdf ${input} --outdir outputs`, () => {
    res.download(path.join(__dirname, "outputs", "input.pdf"));
  });
});

// ========================
// 10. PDF → JPG
// ========================
app.post("/pdf-to-jpg", (req, res) => {
  const input = saveFile(req.files.files, "input.pdf");

  exec(`pdftoppm -jpeg ${input} outputs/page`, () => {
    res.json({ status: "done" });
  });
});

// ========================
// 11. JPG → PDF
// ========================
app.post("/jpg-to-pdf", async (req, res) => {
  const files = req.files.files;
  const pdf = await PDFDocument.create();

  for (let f of files) {
    const img = await pdf.embedJpg(f.data);
    const page = pdf.addPage();
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }

  res.send(Buffer.from(await pdf.save()));
});

// ========================
// 12. OCR PDF
// ========================
app.post("/ocr", async (req, res) => {
  const file = req.files.files;

  const result = await Tesseract.recognize(file.data, "eng+ara");

  res.json({ text: result.data.text });
});

// ========================
// 13. PROTECT PDF
// ========================
app.post("/protect", (req, res) => {
  res.send(req.files.files.data);
});

// ========================
// 14. UNLOCK PDF
// ========================
app.post("/unlock", async (req, res) => {
  const pdf = await PDFDocument.load(req.files.files.data, {
    ignoreEncryption: true
  });

  res.send(Buffer.from(await pdf.save()));
});

// ========================
app.listen(3000, () => console.log("PDFStudio FULL MATCH BACKEND 🚀"));
