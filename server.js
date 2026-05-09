const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: "uploads/" });

// ---------- folders ----------
["uploads", "output"].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d);
});

// ---------- helper ----------
const run = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout);
    });
  });

const latestFile = (dir) => {
  const files = fs.readdirSync(dir);
  if (!files.length) return null;

  return files
    .map(f => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime)[0];
};

// ---------- OFFICE ----------

app.post("/word-to-pdf", upload.single("file"), async (req, res) => {
  const file = req.file.path;
  await run(`libreoffice --headless --convert-to pdf "${file}" --outdir output`);
  res.download(latestFile("output"));
});

app.post("/pdf-to-word", upload.single("file"), async (req, res) => {
  const file = req.file.path;
  await run(`libreoffice --headless --convert-to docx "${file}" --outdir output`);
  res.download(latestFile("output"));
});

app.post("/excel-to-pdf", upload.single("file"), async (req, res) => {
  const file = req.file.path;
  await run(`libreoffice --headless --convert-to pdf "${file}" --outdir output`);
  res.download(latestFile("output"));
});

app.post("/pdf-to-excel", upload.single("file"), async (req, res) => {
  const file = req.file.path;
  await run(`libreoffice --headless --convert-to xlsx "${file}" --outdir output`);
  res.download(latestFile("output"));
});

app.post("/ppt-to-pdf", upload.single("file"), async (req, res) => {
  const file = req.file.path;
  await run(`libreoffice --headless --convert-to pdf "${file}" --outdir output`);
  res.download(latestFile("output"));
});

app.post("/pdf-to-ppt", upload.single("file"), async (req, res) => {
  const file = req.file.path;
  await run(`libreoffice --headless --convert-to pptx "${file}" --outdir output`);
  res.download(latestFile("output"));
});

// ---------- IMAGE ----------

app.post("/jpg-to-pdf", upload.single("file"), async (req, res) => {
  const out = `output/${Date.now()}.pdf`;
  await sharp(req.file.path).pdf().toFile(out);
  res.download(out);
});

app.post("/pdf-to-jpg", upload.single("file"), async (req, res) => {
  const base = `output/img_${Date.now()}`;
  await run(`pdftoppm "${req.file.path}" "${base}" -jpeg`);

  const files = fs.readdirSync("output").filter(f => f.includes("img_"));
  res.json({ done: true, files });
});

// ---------- PDF CORE ----------

app.post("/merge-pdf", upload.array("files"), async (req, res) => {
  const pdf = await PDFDocument.create();

  for (const f of req.files) {
    const src = await PDFDocument.load(fs.readFileSync(f.path));
    const pages = await pdf.copyPages(src, src.getPageIndices());
    pages.forEach(p => pdf.addPage(p));
  }

  const out = `output/merge_${Date.now()}.pdf`;
  fs.writeFileSync(out, await pdf.save());
  res.download(out);
});

app.post("/split-pdf", upload.single("file"), async (req, res) => {
  const src = await PDFDocument.load(fs.readFileSync(req.file.path));
  const pages = [];

  for (let i = 0; i < src.getPageCount(); i++) {
    const d = await PDFDocument.create();
    const [p] = await d.copyPages(src, [i]);
    d.addPage(p);

    const out = `output/page_${i + 1}_${Date.now()}.pdf`;
    fs.writeFileSync(out, await d.save());
    pages.push(out);
  }

  res.json({ pages });
});

app.post("/compress-pdf", upload.single("file"), async (req, res) => {
  const out = `output/compress_${Date.now()}.pdf`;
  await run(`gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -dNOPAUSE -dBATCH -sOutputFile="${out}" "${req.file.path}"`);
  res.download(out);
});

app.post("/protect-pdf", upload.single("file"), async (req, res) => {
  const pass = req.body.password || "1234";
  const out = `output/protect_${Date.now()}.pdf`;

  await run(`qpdf --encrypt ${pass} ${pass} 256 -- "${req.file.path}" "${out}"`);
  res.download(out);
});

app.post("/unlock-pdf", upload.single("file"), async (req, res) => {
  const pass = req.body.password || "";
  const out = `output/unlock_${Date.now()}.pdf`;

  await run(`qpdf --password=${pass} --decrypt "${req.file.path}" "${out}"`);
  res.download(out);
});

// ---------- OCR (FIXED) ----------

app.post("/ocr-pdf", upload.single("file"), async (req, res) => {
  const imgBase = `output/ocr_${Date.now()}`;
  await run(`pdftoppm "${req.file.path}" "${imgBase}" -png`);

  const img = fs.readdirSync("output").find(f => f.includes("ocr_") && f.endsWith(".png"));

  if (!img) return res.status(500).send("OCR failed: no image generated");

  const result = await Tesseract.recognize(
    path.join("output", img),
    "eng"
  );

  res.send(result.data.text);
});

// ---------- HEALTH CHECK ----------
app.get("/", (req, res) => {
  res.json({ status: "PDFStudio backend is running 🚀" });
});

// ---------- SERVER ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("PDFStudio backend running on port", PORT);
});
