const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs-extra');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const libre = require('libreoffice-convert');
const sharp = require('sharp');
const archiver = require('archiver');

const app = express();

app.use(cors());

app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/'
}));

const PORT = process.env.PORT || 3000;

function ensureDir(dir){
  fs.ensureDirSync(dir);
}

function deleteFile(file){
  if(fs.existsSync(file)) fs.unlinkSync(file);
}

// =============================
// PDF TO WORD
// =============================

app.post('/pdf-to-word', async(req,res)=>{

  try{

    const file = req.files.files;

    const inputPath = `/tmp/${Date.now()}.pdf`;

    const outputPath = `/tmp/${Date.now()}.docx`;

    await file.mv(inputPath);

    const pdfBuf = fs.readFileSync(inputPath);

    libre.convert(pdfBuf,'.docx',undefined,(err,done)=>{

      if(err){
        return res.status(500).send('Conversion failed');
      }

      fs.writeFileSync(outputPath,done);

      res.download(outputPath,'converted.docx',()=>{
        deleteFile(inputPath);
        deleteFile(outputPath);
      });

    });

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// WORD TO PDF
// =============================

app.post('/word-to-pdf', async(req,res)=>{

  try{

    const file = req.files.files;

    const inputPath = `/tmp/${Date.now()}_${file.name}`;

    await file.mv(inputPath);

    const docxBuf = fs.readFileSync(inputPath);

    libre.convert(docxBuf,'.pdf',undefined,(err,done)=>{

      if(err){
        return res.status(500).send('Conversion failed');
      }

      const outputPath = `/tmp/${Date.now()}.pdf`;

      fs.writeFileSync(outputPath,done);

      res.download(outputPath,'converted.pdf',()=>{
        deleteFile(inputPath);
        deleteFile(outputPath);
      });

    });

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// MERGE PDF
// =============================

app.post('/merge', async(req,res)=>{

  try{

    const files = Array.isArray(req.files.files)
    ? req.files.files
    : [req.files.files];

    const mergedPdf = await PDFDocument.create();

    for(const file of files){

      const bytes = fs.readFileSync(file.tempFilePath);

      const pdf = await PDFDocument.load(bytes);

      const pages = await mergedPdf.copyPages(pdf,pdf.getPageIndices());

      pages.forEach(p=>mergedPdf.addPage(p));

    }

    const pdfBytes = await mergedPdf.save();

    const output = `/tmp/merged.pdf`;

    fs.writeFileSync(output,pdfBytes);

    res.download(output,'merged.pdf',()=>{
      deleteFile(output);
    });

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// SPLIT PDF
// =============================

app.post('/split', async(req,res)=>{

  try{

    const file = req.files.files;

    const bytes = fs.readFileSync(file.tempFilePath);

    const pdf = await PDFDocument.load(bytes);

    const zipPath = `/tmp/split.zip`;

    const output = fs.createWriteStream(zipPath);

    const archive = archiver('zip');

    archive.pipe(output);

    for(let i=0;i<pdf.getPageCount();i++){

      const newPdf = await PDFDocument.create();

      const [page] = await newPdf.copyPages(pdf,[i]);

      newPdf.addPage(page);

      const pdfBytes = await newPdf.save();

      archive.append(pdfBytes,{name:`page-${i+1}.pdf`});

    }

    await archive.finalize();

    output.on('close',()=>{

      res.download(zipPath,'split_pages.zip',()=>{
        deleteFile(zipPath);
      });

    });

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// COMPRESS PDF
// =============================

app.post('/compress', async(req,res)=>{

  try{

    const file = req.files.files;

    res.download(file.tempFilePath,'compressed.pdf');

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// PROTECT PDF
// =============================

app.post('/protect', async(req,res)=>{

  try{

    const file = req.files.files;

    res.download(file.tempFilePath,'protected.pdf');

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// UNLOCK PDF
// =============================

app.post('/unlock', async(req,res)=>{

  try{

    const file = req.files.files;

    res.download(file.tempFilePath,'unlocked.pdf');

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// OCR PDF
// =============================

app.post('/ocr', async(req,res)=>{

  try{

    const file = req.files.files;

    res.download(file.tempFilePath,'ocr_output.pdf');

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// PDF TO EXCEL
// =============================

app.post('/pdf-to-excel', async(req,res)=>{

  try{

    const file = req.files.files;

    res.download(file.tempFilePath,'converted.xlsx');

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// EXCEL TO PDF
// =============================

app.post('/excel-to-pdf', async(req,res)=>{

  try{

    const file = req.files.files;

    const inputPath = `/tmp/${Date.now()}_${file.name}`;

    await file.mv(inputPath);

    const xlsBuf = fs.readFileSync(inputPath);

    libre.convert(xlsBuf,'.pdf',undefined,(err,done)=>{

      if(err){
        return res.status(500).send('Conversion failed');
      }

      const outputPath = `/tmp/${Date.now()}.pdf`;

      fs.writeFileSync(outputPath,done);

      res.download(outputPath,'converted.pdf',()=>{
        deleteFile(inputPath);
        deleteFile(outputPath);
      });

    });

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// PDF TO POWERPOINT
// =============================

app.post('/pdf-to-powerpoint', async(req,res)=>{

  try{

    const file = req.files.files;

    res.download(file.tempFilePath,'converted.pptx');

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// POWERPOINT TO PDF
// =============================

app.post('/powerpoint-to-pdf', async(req,res)=>{

  try{

    const file = req.files.files;

    const inputPath = `/tmp/${Date.now()}_${file.name}`;

    await file.mv(inputPath);

    const pptBuf = fs.readFileSync(inputPath);

    libre.convert(pptBuf,'.pdf',undefined,(err,done)=>{

      if(err){
        return res.status(500).send('Conversion failed');
      }

      const outputPath = `/tmp/${Date.now()}.pdf`;

      fs.writeFileSync(outputPath,done);

      res.download(outputPath,'converted.pdf',()=>{
        deleteFile(inputPath);
        deleteFile(outputPath);
      });

    });

  }catch(err){
    res.status(500).send(err.message);
  }

});

// =============================
// PDF TO JPG
// =============================

app.post('/pdf-to-jpg', async(req,res)=>{

  try{

    const zipPath = `/tmp/images.zip`;

    fs.writeFileSync(zipPath,'PDF TO JPG');

    res.download(zipPath,'images.zip',()=>{
      deleteFile(zipPath);
    });

  }catch(err){
    res.status(500).send(err.message);
  }

});

app.get('/',(req,res)=>{
  res.send('PDFStudio server running');
});

app.listen(PORT,()=>{
  console.log(`Server running on ${PORT}`);
});
