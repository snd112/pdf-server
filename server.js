
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(fileUpload());

app.get('/', (req,res)=>{
  res.send('PDFStudio Professional Server Running');
});

function ok(res,name){
  res.json({
    success:true,
    file:name,
    message:'Conversion endpoint connected successfully'
  });
}

app.post('/merge',(req,res)=> ok(res,'merged.pdf'));
app.post('/split',(req,res)=> ok(res,'split.zip'));
app.post('/compress',(req,res)=> ok(res,'compressed.pdf'));
app.post('/protect',(req,res)=> ok(res,'protected.pdf'));
app.post('/unlock',(req,res)=> ok(res,'unlocked.pdf'));
app.post('/ocr',(req,res)=> ok(res,'ocr.pdf'));
app.post('/pdf-to-word',(req,res)=> ok(res,'converted.docx'));
app.post('/word-to-pdf',(req,res)=> ok(res,'converted.pdf'));
app.post('/pdf-to-excel',(req,res)=> ok(res,'converted.xlsx'));
app.post('/excel-to-pdf',(req,res)=> ok(res,'converted.pdf'));
app.post('/pdf-to-powerpoint',(req,res)=> ok(res,'converted.pptx'));
app.post('/powerpoint-to-pdf',(req,res)=> ok(res,'converted.pdf'));
app.post('/pdf-to-jpg',(req,res)=> ok(res,'images.zip'));

app.listen(PORT,()=>{
  console.log('Running on port '+PORT);
});
