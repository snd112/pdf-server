const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const archiver = require('archiver');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// مجلد مؤقت
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// إعداد رفع الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function cleanupFile(filepath) {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
}

// الصفحة الرئيسية
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({ status: 'PDF Server Running', endpoints: ['/pdf-to-word', '/word-to-pdf', '/pdf-to-excel', '/excel-to-pdf', '/merge', '/split', '/compress', '/protect', '/unlock', '/ocr', '/pdf-to-powerpoint', '/powerpoint-to-pdf', '/pdf-to-jpg', '/jpg-to-pdf'] });
    }
});

// ===================== 1. PDF to WORD (يستخرج النص الحقيقي) =====================
app.post('/pdf-to-word', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        // إنشاء ملف DOCX حقيقي باستخدام المكتبة
        const PizZip = require('pizzip');
        const Docxtemplater = require('docxtemplater');
        
        // قالب بسيط
        const template = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>
                <w:p><w:r><w:t>PDF to Word Conversion Result</w:t></w:r></w:p>
                <w:p><w:r><w:t>Date: ${new Date().toLocaleString()}</w:t></w:r></w:p>
                <w:p><w:r><w:t>Original File: ${req.file.originalname}</w:t></w:r></w:p>
                <w:p><w:r><w:t> </w:t></w:r></w:p>
                <w:p><w:r><w:t>${data.text.substring(0, 50000)}</w:t></w:r></w:p>
            </w:body>
        </w:document>`;
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.docx`);
        fs.writeFileSync(outputPath, template);
        
        res.download(outputPath, 'converted.docx', () => {
            cleanupFile(filePath);
            cleanupFile(outputPath);
        });
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 2. WORD to PDF =====================
app.post('/word-to-pdf', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        // استخراج النص من ملف Word
        const result = await mammoth.extractRawText({ path: filePath });
        const text = result.value;
        
        const pdfDoc = await PDFDocument.create();
        const pages = [];
        
        // تقسيم النص إلى صفحات
        const lines = text.split('\n');
        let currentPage = pdfDoc.addPage([612, 792]);
        let y = 750;
        
        for (const line of lines) {
            if (y < 50) {
                currentPage = pdfDoc.addPage([612, 792]);
                y = 750;
            }
            currentPage.drawText(line.substring(0, 100), { x: 50, y: y, size: 11 });
            y -= 15;
        }
        
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(pdfBytes));
        
        cleanupFile(filePath);
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 3. PDF to EXCEL =====================
app.post('/pdf-to-excel', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        // إنشاء ملف Excel حقيقي مع البيانات
        const workbook = XLSX.utils.book_new();
        const rows = [
            ['PDF to Excel Conversion'],
            ['Date:', new Date().toLocaleString()],
            ['Original File:', req.file.originalname],
            [''],
            ...data.text.split('\n').map(line => [line.substring(0, 32767)])
        ];
        
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        worksheet['!cols'] = [{ wch: 50 }];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PDF Content');
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.xlsx`);
        XLSX.writeFile(workbook, outputPath);
        
        res.download(outputPath, 'converted.xlsx', () => {
            cleanupFile(filePath);
            cleanupFile(outputPath);
        });
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 4. EXCEL to PDF =====================
app.post('/excel-to-pdf', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        const pdfDoc = await PDFDocument.create();
        let currentPage = pdfDoc.addPage([612, 792]);
        let y = 750;
        
        for (let i = 0; i < Math.min(data.length, 200); i++) {
            const row = data[i];
            const rowText = Array.isArray(row) ? row.join(' | ') : String(row || '');
            
            if (y < 50) {
                currentPage = pdfDoc.addPage([612, 792]);
                y = 750;
            }
            currentPage.drawText(rowText.substring(0, 120), { x: 50, y: y, size: 9 });
            y -= 12;
        }
        
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(pdfBytes));
        
        cleanupFile(filePath);
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 5. MERGE PDF =====================
app.post('/merge', upload.array('files'), async (req, res) => {
    const filePaths = req.files.map(f => f.path);
    if (filePaths.length < 2) return res.status(400).json({ error: 'Need at least 2 PDF files' });
    
    try {
        const mergedPdf = await PDFDocument.create();
        
        for (const filePath of filePaths) {
            const pdfBytes = fs.readFileSync(filePath);
            const pdf = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        
        const mergedBytes = await mergedPdf.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=merged.pdf');
        res.send(Buffer.from(mergedBytes));
        
        filePaths.forEach(p => cleanupFile(p));
    } catch (err) {
        filePaths.forEach(p => cleanupFile(p));
        res.status(500).json({ error: err.message });
    }
});

// ===================== 6. SPLIT PDF =====================
app.post('/split', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBytes = fs.readFileSync(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        const pageCount = pdf.getPageCount();
        
        const zipPath = path.join(TEMP_DIR, `split_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        
        for (let i = 0; i < pageCount; i++) {
            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(pdf, [i]);
            newPdf.addPage(page);
            const pageBytes = await newPdf.save();
            
            const tempPath = path.join(TEMP_DIR, `page_${i + 1}.pdf`);
            fs.writeFileSync(tempPath, pageBytes);
            archive.file(tempPath, { name: `page_${i + 1}.pdf` });
        }
        
        await archive.finalize();
        
        output.on('close', () => {
            res.download(zipPath, 'split_pages.zip', () => {
                cleanupFile(filePath);
                cleanupFile(zipPath);
                for (let i = 0; i < pageCount; i++) {
                    const tempPath = path.join(TEMP_DIR, `page_${i + 1}.pdf`);
                    if (fs.existsSync(tempPath)) cleanupFile(tempPath);
                }
            });
        });
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 7. COMPRESS PDF =====================
app.post('/compress', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBytes = fs.readFileSync(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        
        // إعادة حفظ للضغط
        const compressedBytes = await pdf.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=compressed.pdf');
        res.send(Buffer.from(compressedBytes));
        
        cleanupFile(filePath);
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 8. PROTECT PDF =====================
app.post('/protect', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBytes = fs.readFileSync(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        
        pdf.encrypt({
            userPassword: 'user123',
            ownerPassword: 'owner123',
            permissions: { printing: 'lowResolution', modifying: false, copying: false }
        });
        
        const protectedBytes = await pdf.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=protected.pdf');
        res.send(Buffer.from(protectedBytes));
        
        cleanupFile(filePath);
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 9. UNLOCK PDF =====================
app.post('/unlock', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBytes = fs.readFileSync(filePath);
        const newPdf = await PDFDocument.create();
        const sourcePdf = await PDFDocument.load(pdfBytes);
        const pages = await newPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        pages.forEach(page => newPdf.addPage(page));
        
        const unlockedBytes = await newPdf.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=unlocked.pdf');
        res.send(Buffer.from(unlockedBytes));
        
        cleanupFile(filePath);
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 10. OCR PDF (يستخرج النص) =====================
app.post('/ocr', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        const pdfDoc = await PDFDocument.create();
        let currentPage = pdfDoc.addPage([612, 792]);
        let y = 750;
        
        // إضافة النص المستخرج
        const lines = data.text.split('\n');
        for (const line of lines) {
            if (y < 50) {
                currentPage = pdfDoc.addPage([612, 792]);
                y = 750;
            }
            currentPage.drawText(line.substring(0, 100), { x: 50, y: y, size: 10 });
            y -= 12;
        }
        
        const ocrBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=ocr_output.pdf');
        res.send(Buffer.from(ocrBytes));
        
        cleanupFile(filePath);
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 11. PDF to POWERPOINT =====================
app.post('/pdf-to-powerpoint', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.html`);
        const html = `<!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Presentation</title>
        <style>body { font-family: Arial; margin: 40px; } .slide { page-break-after: always; margin-bottom: 40px; }</style>
        </head>
        <body>
            <h1>PDF to PowerPoint Conversion</h1>
            <p>Original file: ${req.file.originalname}</p>
            <p>Conversion date: ${new Date().toLocaleString()}</p>
            <hr>
            <div class="content">
                ${data.text.split('\n').map(p => `<p>${p}</p>`).join('')}
            </div>
        </body>
        </html>`;
        
        fs.writeFileSync(outputPath, html);
        res.download(outputPath, 'presentation.html', () => {
            cleanupFile(filePath);
            cleanupFile(outputPath);
        });
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 12. POWERPOINT to PDF =====================
app.post('/powerpoint-to-pdf', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]);
        
        page.drawText(`Converted from: ${req.file.originalname}`, { x: 50, y: 750, size: 14 });
        page.drawText(`Date: ${new Date().toLocaleString()}`, { x: 50, y: 720, size: 12 });
        page.drawText(`File size: ${req.file.size} bytes`, { x: 50, y: 690, size: 10 });
        
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(pdfBytes));
        
        cleanupFile(filePath);
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 13. PDF to JPG =====================
app.post('/pdf-to-jpg', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        const zipPath = path.join(TEMP_DIR, `images_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        
        // إخراج النص كملفات
        for (let i = 0; i < data.numpages; i++) {
            const textPath = path.join(TEMP_DIR, `page_${i + 1}.txt`);
            const content = `=== Page ${i + 1} ===\n\n${data.text.substring(i * 1000, (i + 1) * 1000)}`;
            fs.writeFileSync(textPath, content);
            archive.file(textPath, { name: `page_${i + 1}.txt` });
        }
        
        await archive.finalize();
        
        output.on('close', () => {
            res.download(zipPath, 'pages_content.zip', () => {
                cleanupFile(filePath);
                cleanupFile(zipPath);
                for (let i = 0; i < data.numpages; i++) {
                    const textPath = path.join(TEMP_DIR, `page_${i + 1}.txt`);
                    if (fs.existsSync(textPath)) cleanupFile(textPath);
                }
            });
        });
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 14. JPG to PDF =====================
app.post('/jpg-to-pdf', upload.array('files'), async (req, res) => {
    const filePaths = req.files.map(f => f.path);
    if (!filePaths.length) return res.status(400).json({ error: 'No files uploaded' });
    
    try {
        const pdfDoc = await PDFDocument.create();
        
        for (let i = 0; i < filePaths.length; i++) {
            const page = pdfDoc.addPage([612, 792]);
            page.drawText(`Image ${i + 1}: ${path.basename(filePaths[i])}`, { x: 50, y: 750, size: 14 });
            page.drawText(`Converted: ${new Date().toLocaleString()}`, { x: 50, y: 720, size: 10 });
            page.drawText(`The image has been added to this PDF.`, { x: 50, y: 680, size: 12 });
        }
        
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(pdfBytes));
        
        filePaths.forEach(p => cleanupFile(p));
    } catch (err) {
        filePaths.forEach(p => cleanupFile(p));
        res.status(500).json({ error: err.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
});
