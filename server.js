
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

function sendDummy(res, filename, content='PDFStudio Server Running'){
  const tempPath = path.join(__dirname, filename);
  fs.writeFileSync(tempPath, content);
  res.download(tempPath, filename, () => {
    if(fs.existsSync(tempPath)){
      fs.unlinkSync(tempPath);
    }
  });
}

app.get('/', (req,res)=>{
  res.send('PDFStudio backend is running on port ' + PORT);
});

app.post('/merge', upload.array('files'), (req,res)=>{
  sendDummy(res, 'merged.pdf');
});

app.post('/split', upload.array('files'), (req,res)=>{
  sendDummy(res, 'split_pages.zip');
});

app.post('/compress', upload.array('files'), (req,res)=>{
  sendDummy(res, 'compressed.pdf');
});

app.post('/protect', upload.array('files'), (req,res)=>{
  sendDummy(res, 'protected.pdf');
});

app.post('/unlock', upload.array('files'), (req,res)=>{
  sendDummy(res, 'unlocked.pdf');
});

app.post('/ocr', upload.array('files'), (req,res)=>{
  sendDummy(res, 'ocr_output.pdf');
});

app.post('/pdf-to-word', upload.array('files'), (req,res)=>{
  sendDummy(res, 'converted.docx');
});

app.post('/word-to-pdf', upload.array('files'), (req,res)=>{
  sendDummy(res, 'converted.pdf');
});

app.post('/pdf-to-excel', upload.array('files'), (req,res)=>{
  sendDummy(res, 'converted.xlsx');
});

app.post('/excel-to-pdf', upload.array('files'), (req,res)=>{
  sendDummy(res, 'converted.pdf');
});

app.post('/pdf-to-powerpoint', upload.array('files'), (req,res)=>{
  sendDummy(res, 'converted.pptx');
});

app.post('/powerpoint-to-pdf', upload.array('files'), (req,res)=>{
  sendDummy(res, 'converted.pdf');
});

app.post('/pdf-to-jpg', upload.array('files'), (req,res)=>{
  sendDummy(res, 'images.zip');
});

app.listen(PORT, ()=>{
  console.log(`PDFStudio server running on ${PORT}`);
});
