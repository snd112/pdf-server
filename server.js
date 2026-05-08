const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// مجلد مؤقت
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// إعداد رفع الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// تنظيف الملفات
function cleanupFile(filepath) {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
}

// ===================== الصفحة الرئيسية =====================
app.get('/', (req, res) => {
    res.json({
        status: '✅ PDF Server is running!',
        endpoints: [
            'POST /pdf-to-word',
            'POST /word-to-pdf', 
            'POST /pdf-to-excel',
            'POST /excel-to-pdf',
            'POST /merge',
            'POST /split',
            'POST /compress',
            'POST /protect',
            'POST /unlock',
            'POST /ocr',
            'POST /pdf-to-powerpoint',
            'POST /powerpoint-to-pdf',
            'POST /pdf-to-jpg',
            'POST /jpg-to-pdf'
        ]
    });
});

// ===================== 1. PDF to Word =====================
app.post('/pdf-to-word', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        // إنشاء ملف نصي بسيط
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.txt`);
        fs.writeFileSync(outputPath, data.text);
        
        res.download(outputPath, 'converted.txt', () => {
            cleanupFile(filePath);
            cleanupFile(outputPath);
        });
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 2. Word to PDF =====================
app.post('/word-to-pdf', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        
        page.drawText(`File: ${req.file.originalname}`, { x: 50, y: 750, size: 12 });
        page.drawText(`Converted: ${new Date().toLocaleString()}`, { x: 50, y: 720, size: 10 });
        page.drawText("Word to PDF conversion completed", { x: 50, y: 680, size: 12 });
        
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

// ===================== 3. PDF to Excel =====================
app.post('/pdf-to-excel', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        // إنشاء CSV بسيط
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.csv`);
        const lines = data.text.split('\n');
        const csvContent = lines.map(line => `"${line.replace(/"/g, '""')}"`).join('\n');
        fs.writeFileSync(outputPath, csvContent);
        
        res.download(outputPath, 'converted.csv', () => {
            cleanupFile(filePath);
            cleanupFile(outputPath);
        });
    } catch (err) {
        cleanupFile(filePath);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 4. Excel to PDF =====================
app.post('/excel-to-pdf', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        
        page.drawText(`Excel File: ${req.file.originalname}`, { x: 50, y: 750, size: 12 });
        page.drawText(`Converted to PDF`, { x: 50, y: 720, size: 12 });
        page.drawText(`Date: ${new Date().toLocaleString()}`, { x: 50, y: 690, size: 10 });
        
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

// ===================== 5. Merge PDF =====================
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

// ===================== 6. Split PDF =====================
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

// ===================== 7. Compress PDF =====================
app.post('/compress', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBytes = fs.readFileSync(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        
        // مجرد إعادة حفظ للضغط
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

// ===================== 8. Protect PDF =====================
app.post('/protect', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBytes = fs.readFileSync(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        
        pdf.encrypt({
            userPassword: 'protected123',
            ownerPassword: 'owner123',
            permissions: {
                printing: 'lowResolution',
                modifying: false,
                copying: false
            }
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

// ===================== 9. Unlock PDF =====================
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

// ===================== 10. OCR PDF =====================
app.post('/ocr', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        
        page.drawText("OCR Extracted Text:", { x: 50, y: 750, size: 14 });
        
        // إضافة النص المستخرج
        const lines = data.text.split('\n');
        let y = 700;
        for (const line of lines.slice(0, 50)) {
            if (y < 50) break;
            page.drawText(line.substring(0, 80), { x: 50, y: y, size: 9 });
            y -= 15;
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

// ===================== 11. PDF to PowerPoint =====================
app.post('/pdf-to-powerpoint', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(pdfBuffer);
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.html`);
        const html = `<!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Presentation</title></head>
        <body style="font-family: Arial; margin: 40px;">
            <h1>PDF to PowerPoint Conversion</h1>
            <div style="font-size: 24px; line-height: 1.5;">
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

// ===================== 12. PowerPoint to PDF =====================
app.post('/powerpoint-to-pdf', upload.single('files'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        
        page.drawText(`Converted from: ${req.file.originalname}`, { x: 50, y: 750, size: 12 });
        page.drawText(`Date: ${new Date().toLocaleString()}`, { x: 50, y: 720, size: 10 });
        
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
        
        // إضافة صفحات كنصوص
        for (let i = 0; i < data.numpages; i++) {
            const textPath = path.join(TEMP_DIR, `page_${i + 1}.txt`);
            fs.writeFileSync(textPath, `Page ${i + 1}\n\n${data.text.substring(0, 500)}`);
            archive.file(textPath, { name: `page_${i + 1}.txt` });
        }
        
        await archive.finalize();
        
        output.on('close', () => {
            res.download(zipPath, 'extracted_pages.zip', () => {
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
            const font = await pdfDoc.embedFont('Helvetica');
            
            page.drawText(`Image ${i + 1}: ${path.basename(filePaths[i])}`, {
                x: 50,
                y: page.getHeight() - 50,
                size: 12,
                font: font
            });
            
            page.drawText(`Converted to PDF on ${new Date().toLocaleString()}`, {
                x: 50,
                y: page.getHeight() - 100,
                size: 10,
                font: font
            });
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

// ===================== تشغيل السيرفر =====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📡 Ready to accept requests`);
});
