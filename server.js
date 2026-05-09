
const express=require('express');
const cors=require('cors');
const multer=require('multer');
const fs=require('fs');

const app=express();
const upload=multer({dest:'uploads/'});

app.use(cors());
app.use(express.json());

app.get('/',(req,res)=>{
res.send('PDFStudio Professional API Running');
});

const endpoints=[
'merge',
'split',
'compress',
'protect',
'unlock',
'ocr',
'pdf-to-word',
'word-to-pdf',
'pdf-to-excel',
'excel-to-pdf',
'pdf-to-powerpoint',
'powerpoint-to-pdf',
'pdf-to-jpg',
'jpg-to-pdf',
'rotate',
'watermark',
'html-to-pdf',
'pdf-to-text',
'esign',
'scan'
];

endpoints.forEach(endpoint=>{
app.post('/'+endpoint,upload.array('files'),(req,res)=>{
res.json({
success:true,
tool:endpoint,
message:endpoint+' endpoint ready'
});
});
});

app.listen(3000,()=>{
console.log('Server running on port 3000');
});
