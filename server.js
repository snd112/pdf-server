const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");

const app = express();
const upload = multer({ dest: "uploads/" });

["uploads","output"].forEach(d=>!fs.existsSync(d)&&fs.mkdirSync(d));

// ---- OFFICE ----
app.post("/word-to-pdf", upload.single("file"), (req,res)=>{
  exec(`libreoffice --headless --convert-to pdf ${req.file.path} --outdir output`,()=>{
    const f=fs.readdirSync("output").pop(); res.download("output/"+f);
  });
});

app.post("/pdf-to-word", upload.single("file"), (req,res)=>{
  exec(`libreoffice --headless --convert-to docx ${req.file.path} --outdir output`,()=>{
    const f=fs.readdirSync("output").pop(); res.download("output/"+f);
  });
});

app.post("/excel-to-pdf", upload.single("file"), (req,res)=>{
  exec(`libreoffice --headless --convert-to pdf ${req.file.path} --outdir output`,()=>{
    const f=fs.readdirSync("output").pop(); res.download("output/"+f);
  });
});

app.post("/pdf-to-excel", upload.single("file"), (req,res)=>{
  exec(`libreoffice --headless --convert-to xlsx ${req.file.path} --outdir output`,()=>{
    const f=fs.readdirSync("output").pop(); res.download("output/"+f);
  });
});

app.post("/ppt-to-pdf", upload.single("file"), (req,res)=>{
  exec(`libreoffice --headless --convert-to pdf ${req.file.path} --outdir output`,()=>{
    const f=fs.readdirSync("output").pop(); res.download("output/"+f);
  });
});

app.post("/pdf-to-ppt", upload.single("file"), (req,res)=>{
  exec(`libreoffice --headless --convert-to pptx ${req.file.path} --outdir output`,()=>{
    const f=fs.readdirSync("output").pop(); res.download("output/"+f);
  });
});

// ---- IMAGE ----
app.post("/jpg-to-pdf", upload.single("file"), async (req,res)=>{
  const out="output/"+Date.now()+".pdf";
  await sharp(req.file.path).pdf().toFile(out);
  res.download(out);
});

app.post("/pdf-to-jpg", upload.single("file"), (req,res)=>{
  exec(`pdftoppm ${req.file.path} output/img -jpeg`,()=>{
    res.json({done:true, files: fs.readdirSync("output").filter(f=>f.endsWith(".jpg"))});
  });
});

// ---- PDF CORE ----
app.post("/merge-pdf", upload.array("files"), async (req,res)=>{
  const pdf = await PDFDocument.create();
  for (const f of req.files){
    const p = await PDFDocument.load(fs.readFileSync(f.path));
    const pages = await pdf.copyPages(p, p.getPageIndices());
    pages.forEach(pg=>pdf.addPage(pg));
  }
  const out="output/merge_"+Date.now()+".pdf";
  fs.writeFileSync(out, await pdf.save());
  res.download(out);
});

app.post("/split-pdf", upload.single("file"), async (req,res)=>{
  const src = await PDFDocument.load(fs.readFileSync(req.file.path));
  const pages=[];
  for (let i=0;i<src.getPageCount();i++){
    const d=await PDFDocument.create();
    const [p]=await d.copyPages(src,[i]);
    d.addPage(p);
    const o=`output/page_${i+1}.pdf`;
    fs.writeFileSync(o, await d.save());
    pages.push(o);
  }
  res.json({pages});
});

app.post("/compress-pdf", upload.single("file"), (req,res)=>{
  const out="output/compress_"+Date.now()+".pdf";
  exec(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile=${out} ${req.file.path}`,()=>{
    res.download(out);
  });
});

app.post("/protect-pdf", upload.single("file"), (req,res)=>{
  const pass=req.body.password||"1234";
  const out="output/protect_"+Date.now()+".pdf";
  exec(`qpdf --encrypt ${pass} ${pass} 256 -- ${req.file.path} ${out}`,()=>{
    res.download(out);
  });
});

app.post("/unlock-pdf", upload.single("file"), (req,res)=>{
  const pass=req.body.password||"";
  const out="output/unlock_"+Date.now()+".pdf";
  exec(`qpdf --password=${pass} --decrypt ${req.file.path} ${out}`,()=>{
    res.download(out);
  });
});

// ---- OCR ----
app.post("/ocr-pdf", upload.single("file"), async (req,res)=>{
  const r = await Tesseract.recognize(req.file.path,"eng");
  res.send(r.data.text);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("PDFStudio backend running on port", PORT);
});
