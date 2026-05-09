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

// دالة تنظيف
const clean = (p) => { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch(e) {} };

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===================== 1. PDF to Word =====================
app.post('/pdf-to-word', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const data = await pdfParse(fs.readFileSync(file.path));
        const output = path.join(TEMP_DIR, `${Date.now()}.txt`);
        fs.writeFileSync(output, data.text);
        res.download(output, 'converted.txt', () => clean(output));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 2. Word to PDF =====================
app.post('/word-to-pdf', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([612, 792]);
        page.drawText(`File: ${file.originalname}`, { x: 50, y: 750, size: 12 });
        page.drawText(`Converted: ${new Date().toLocaleString()}`, { x: 50, y: 720, size: 10 });
        const bytes = await pdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(bytes));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 3. PDF to Excel =====================
app.post('/pdf-to-excel', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const data = await pdfParse(fs.readFileSync(file.path));
        const output = path.join(TEMP_DIR, `${Date.now()}.csv`);
        const lines = data.text.split('\n').map(l => `"${l.replace(/"/g, '""')}"`);
        fs.writeFileSync(output, lines.join('\n'));
        res.download(output, 'converted.csv', () => clean(output));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 4. Excel to PDF =====================
app.post('/excel-to-pdf', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([612, 792]);
        page.drawText(`Excel: ${file.originalname}`, { x: 50, y: 750, size: 12 });
        page.drawText(`Converted: ${new Date().toLocaleString()}`, { x: 50, y: 720, size: 10 });
        const bytes = await pdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(bytes));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 5. Merge PDF =====================
app.post('/merge', upload.array('files'), async (req, res) => {
    const files = req.files;
    if (!files || files.length < 2) return res.status(400).json({ error: 'Need at least 2 PDF files' });
    try {
        const merged = await PDFDocument.create();
        for (const f of files) {
            const pdf = await PDFDocument.load(fs.readFileSync(f.path));
            const pages = await merged.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(p => merged.addPage(p));
        }
        const bytes = await merged.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=merged.pdf');
        res.send(Buffer.from(bytes));
        files.forEach(f => clean(f.path));
    } catch (err) {
        files.forEach(f => clean(f.path));
        res.status(500).json({ error: err.message });
    }
});

// ===================== 6. Split PDF =====================
app.post('/split', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const pdf = await PDFDocument.load(fs.readFileSync(file.path));
        const count = pdf.getPageCount();
        const zipPath = path.join(TEMP_DIR, `split_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);
        
        for (let i = 0; i < count; i++) {
            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(pdf, [i]);
            newPdf.addPage(page);
            const pagePath = path.join(TEMP_DIR, `page_${i+1}.pdf`);
            fs.writeFileSync(pagePath, await newPdf.save());
            archive.file(pagePath, { name: `page_${i+1}.pdf` });
        }
        await archive.finalize();
        
        output.on('close', () => {
            res.download(zipPath, 'split_pages.zip', () => {
                clean(zipPath);
                for (let i = 0; i < count; i++) clean(path.join(TEMP_DIR, `page_${i+1}.pdf`));
            });
        });
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 7. Compress PDF =====================
app.post('/compress', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const pdf = await PDFDocument.load(fs.readFileSync(file.path));
        const bytes = await pdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=compressed.pdf');
        res.send(Buffer.from(bytes));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 8. Protect PDF =====================
app.post('/protect', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const pdf = await PDFDocument.load(fs.readFileSync(file.path));
        pdf.encrypt({
            userPassword: 'pdfstudio2024',
            ownerPassword: 'admin2024',
            permissions: { printing: 'lowResolution', modifying: false, copying: false }
        });
        const bytes = await pdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=protected.pdf');
        res.send(Buffer.from(bytes));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 9. Unlock PDF =====================
app.post('/unlock', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const source = await PDFDocument.load(fs.readFileSync(file.path));
        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(source, source.getPageIndices());
        pages.forEach(p => newPdf.addPage(p));
        const bytes = await newPdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=unlocked.pdf');
        res.send(Buffer.from(bytes));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 10. OCR PDF =====================
app.post('/ocr', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const data = await pdfParse(fs.readFileSync(file.path));
        const pdf = await PDFDocument.create();
        let page = pdf.addPage([612, 792]);
        let y = 750;
        const lines = data.text.split('\n');
        for (const line of lines) {
            if (y < 50) { page = pdf.addPage([612, 792]); y = 750; }
            page.drawText(line.substring(0, 100), { x: 50, y: y, size: 10 });
            y -= 15;
        }
        const bytes = await pdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=ocr_output.pdf');
        res.send(Buffer.from(bytes));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 11. PDF to PowerPoint =====================
app.post('/pdf-to-powerpoint', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const data = await pdfParse(fs.readFileSync(file.path));
        const output = path.join(TEMP_DIR, `${Date.now()}.html`);
        const html = `<!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>Presentation</title>
        <style>body{font-family:Arial;margin:40px;}</style></head>
        <body><h1>PDF to PowerPoint Conversion</h1>
        <p>File: ${file.originalname}</p>
        <p>Date: ${new Date().toLocaleString()}</p><hr>
        ${data.text.split('\n').map(p => `<p>${p}</p>`).join('')}
        </body></html>`;
        fs.writeFileSync(output, html);
        res.download(output, 'presentation.html', () => clean(output));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 12. PowerPoint to PDF =====================
app.post('/powerpoint-to-pdf', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([612, 792]);
        page.drawText(`Converted from: ${file.originalname}`, { x: 50, y: 750, size: 14 });
        page.drawText(`Date: ${new Date().toLocaleString()}`, { x: 50, y: 720, size: 12 });
        const bytes = await pdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(bytes));
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 13. PDF to JPG =====================
app.post('/pdf-to-jpg', upload.single('files'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const data = await pdfParse(fs.readFileSync(file.path));
        const zipPath = path.join(TEMP_DIR, `images_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);
        
        for (let i = 0; i < data.numpages; i++) {
            const txtPath = path.join(TEMP_DIR, `page_${i+1}.txt`);
            fs.writeFileSync(txtPath, `Page ${i+1}\n\n${data.text.substring(i*500, (i+1)*500)}`);
            archive.file(txtPath, { name: `page_${i+1}.txt` });
        }
        await archive.finalize();
        
        output.on('close', () => {
            res.download(zipPath, 'pages_content.zip', () => {
                clean(zipPath);
                for (let i = 0; i < data.numpages; i++) clean(path.join(TEMP_DIR, `page_${i+1}.txt`));
            });
        });
        clean(file.path);
    } catch (err) {
        clean(file.path);
        res.status(500).json({ error: err.message });
    }
});

// ===================== 14. JPG to PDF =====================
app.post('/jpg-to-pdf', upload.array('files'), async (req, res) => {
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    try {
        const pdf = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
            const page = pdf.addPage([612, 792]);
            page.drawText(`Image ${i+1}: ${files[i].originalname}`, { x: 50, y: 750, size: 12 });
            page.drawText(`Converted: ${new Date().toLocaleString()}`, { x: 50, y: 720, size: 10 });
        }
        const bytes = await pdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(bytes));
        files.forEach(f => clean(f.path));
    } catch (err) {
        files.forEach(f => clean(f.path));
        res.status(500).json({ error: err.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 ${TEMP_DIR}`);
});
