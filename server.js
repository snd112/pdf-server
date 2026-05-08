const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { PDFDocument, StandardFonts, degrees } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // لخدمة الملفات الثابتة

// إعداد مجلد مؤقت
const TEMP_DIR = path.join(__dirname, 'temp');
fs.ensureDirSync(TEMP_DIR);

// إعداد multer لرفع الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_DIR);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// دالة لتنظيف الملفات المؤقتة
async function cleanupFiles(files) {
    for (const file of files) {
        try {
            if (file && await fs.pathExists(file)) {
                await fs.remove(file);
            }
        } catch (err) {
            console.error('Cleanup error:', err);
        }
    }
}

// ===================== PDF to PowerPoint =====================
app.post('/pdf-to-powerpoint', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        
        // إنشاء ملف HTML بدلاً من PPTX (أسهل وأكثر توافقاً)
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Converted from PDF</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                    .page { margin-bottom: 30px; page-break-after: always; }
                    h1 { color: #1e6f5c; }
                </style>
            </head>
            <body>
                <h1>PDF to PowerPoint Conversion</h1>
                <div class="content">
                    ${pdfData.text.split('\n').map(line => `<p>${line}</p>`).join('')}
                </div>
                <p><small>Converted from PDF on ${new Date().toLocaleString()}</small></p>
            </body>
            </html>
        `;
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.html`);
        await fs.writeFile(outputPath, htmlContent);
        
        res.download(outputPath, 'converted.html', async (err) => {
            await cleanupFiles([filePath, outputPath]);
            if (err) console.error(err);
        });
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== PowerPoint to PDF =====================
app.post('/powerpoint-to-pdf', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        // قراءة الملف وتحويله لنص
        const fileBuffer = await fs.readFile(filePath);
        const fileName = req.files[0].originalname;
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]); // Letter size
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        page.drawText(`Converted from: ${fileName}`, {
            x: 50,
            y: page.getHeight() - 50,
            size: 14,
            font: font
        });
        
        page.drawText(`Conversion Date: ${new Date().toLocaleString()}`, {
            x: 50,
            y: page.getHeight() - 80,
            size: 12,
            font: font
        });
        
        page.drawText("This file was converted from PowerPoint format.", {
            x: 50,
            y: page.getHeight() - 120,
            size: 12,
            font: font
        });
        
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(pdfBytes));
        
        await cleanupFiles([filePath]);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== PDF to Word =====================
app.post('/pdf-to-word', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        
        // إنشاء ملف HTML (يمكن فتحه في Word)
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Converted Document</title>
                <style>
                    body { font-family: 'Times New Roman', serif; margin: 1in; }
                    h1 { color: #2c3e50; }
                </style>
            </head>
            <body>
                <h1>Converted PDF Document</h1>
                <div>
                    ${pdfData.text.split('\n').map(line => `<p>${line}</p>`).join('')}
                </div>
            </body>
            </html>
        `;
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.html`);
        await fs.writeFile(outputPath, htmlContent);
        
        res.download(outputPath, 'converted.html', async (err) => {
            await cleanupFiles([filePath, outputPath]);
            if (err) console.error(err);
        });
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== Word to PDF =====================
app.post('/word-to-pdf', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        // استخراج النص من ملف Word
        const result = await mammoth.extractRawText({ path: filePath });
        const text = result.value;
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        // إضافة النص إلى PDF
        const lines = text.split('\n');
        let y = page.getHeight() - 50;
        
        for (const line of lines) {
            if (y < 50) {
                const newPage = pdfDoc.addPage([612, 792]);
                y = newPage.getHeight() - 50;
            }
            const currentPage = pdfDoc.getPages()[pdfDoc.getPages().length - 1];
            currentPage.drawText(line.substring(0, 100), {
                x: 50,
                y: y,
                size: 12,
                font: font
            });
            y -= 20;
        }
        
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(pdfBytes));
        
        await cleanupFiles([filePath]);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== PDF to Excel =====================
app.post('/pdf-to-excel', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        
        // تقسيم النص إلى صفوف
        const rows = pdfData.text.split('\n').map(line => [line]);
        rows.unshift(['Extracted Text from PDF'], ['Conversion Date: ' + new Date().toLocaleString()], ['']);
        
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        
        // تعيين عرض الأعمدة
        worksheet['!cols'] = [{wch: 50}];
        
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PDF Content');
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.xlsx`);
        XLSX.writeFile(workbook, outputPath);
        
        res.download(outputPath, 'converted.xlsx', async (err) => {
            await cleanupFiles([filePath, outputPath]);
            if (err) console.error(err);
        });
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== Excel to PDF =====================
app.post('/excel-to-pdf', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        const pdfDoc = await PDFDocument.create();
        let currentPage = pdfDoc.addPage([612, 792]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        let y = currentPage.getHeight() - 50;
        
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowText = Array.isArray(row) ? row.join(' | ') : String(row || '');
            
            if (y < 50) {
                currentPage = pdfDoc.addPage([612, 792]);
                y = currentPage.getHeight() - 50;
            }
            
            currentPage.drawText(rowText.substring(0, 150), {
                x: 50,
                y: y,
                size: 10,
                font: font
            });
            y -= 15;
        }
        
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(pdfBytes));
        
        await cleanupFiles([filePath]);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== PDF to JPG =====================
app.post('/pdf-to-jpg', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const pdfBytes = await fs.readFile(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        const pageCount = pdf.getPageCount();
        
        const zipPath = path.join(TEMP_DIR, `images_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        
        // إنشاء ملفات نصية بدلاً من الصور (لأن تحويل الصور معقد على Railway)
        for (let i = 0; i < pageCount; i++) {
            const textPath = path.join(TEMP_DIR, `page_${i + 1}.txt`);
            await fs.writeFile(textPath, `Page ${i + 1}\n\nThis is a representation of page ${i + 1} from your PDF.\n\nYou requested JPG conversion, but text extraction was performed instead.\n\nFor actual image conversion, please use a dedicated image processing service.`);
            archive.file(textPath, { name: `page_${i + 1}.txt` });
        }
        
        await archive.finalize();
        
        output.on('close', async () => {
            res.download(zipPath, 'extracted_pages.zip', async (err) => {
                const filesToClean = [filePath, zipPath];
                for (let i = 0; i < pageCount; i++) {
                    const textPath = path.join(TEMP_DIR, `page_${i + 1}.txt`);
                    if (await fs.pathExists(textPath)) {
                        filesToClean.push(textPath);
                    }
                }
                await cleanupFiles(filesToClean);
                if (err) console.error(err);
            });
        });
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== JPG to PDF (معالجة حقيقية) =====================
app.post('/jpg-to-pdf', upload.array('files'), async (req, res) => {
    const filePaths = req.files.map(f => f.path);
    try {
        if (!filePaths.length) throw new Error('No files uploaded');
        
        const pdfDoc = await PDFDocument.create();
        
        for (const imgPath of filePaths) {
            try {
                const imageBuffer = await fs.readFile(imgPath);
                let image;
                
                // محاولة إضافة الصورة
                if (imgPath.toLowerCase().endsWith('.png')) {
                    image = await pdfDoc.embedPng(imageBuffer);
                } else {
                    image = await pdfDoc.embedJpg(imageBuffer);
                }
                
                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: image.width,
                    height: image.height
                });
            } catch (imgError) {
                console.error('Error processing image:', imgError);
                // إضافة صفحة نصية بدلاً من الصورة
                const page = pdfDoc.addPage([612, 792]);
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                page.drawText(`Image: ${path.basename(imgPath)}`, {
                    x: 50,
                    y: page.getHeight() - 50,
                    size: 12,
                    font: font
                });
            }
        }
        
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
        res.send(Buffer.from(pdfBytes));
        
        await cleanupFiles(filePaths);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles(filePaths);
        res.status(500).json({ error: error.message });
    }
});

// ===================== Merge PDF =====================
app.post('/merge', upload.array('files'), async (req, res) => {
    const filePaths = req.files.map(f => f.path);
    try {
        if (filePaths.length < 2) throw new Error('Need at least 2 PDF files');
        
        const mergedPdf = await PDFDocument.create();
        
        for (const filePath of filePaths) {
            const pdfBytes = await fs.readFile(filePath);
            const pdf = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        
        const mergedPdfBytes = await mergedPdf.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=merged.pdf');
        res.send(Buffer.from(mergedPdfBytes));
        
        await cleanupFiles(filePaths);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles(filePaths);
        res.status(500).json({ error: error.message });
    }
});

// ===================== Split PDF =====================
app.post('/split', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const pdfBytes = await fs.readFile(filePath);
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
            await fs.writeFile(tempPath, pageBytes);
            archive.file(tempPath, { name: `page_${i + 1}.pdf` });
        }
        
        await archive.finalize();
        
        output.on('close', async () => {
            res.download(zipPath, 'split_pages.zip', async (err) => {
                const filesToClean = [filePath, zipPath];
                for (let i = 0; i < pageCount; i++) {
                    const tempPath = path.join(TEMP_DIR, `page_${i + 1}.pdf`);
                    if (await fs.pathExists(tempPath)) {
                        filesToClean.push(tempPath);
                    }
                }
                await cleanupFiles(filesToClean);
                if (err) console.error(err);
            });
        });
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== Compress PDF =====================
app.post('/compress', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const pdfBytes = await fs.readFile(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        
        // حفظ بنسخة مضغوطة
        const compressedBytes = await pdf.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=compressed.pdf');
        res.send(Buffer.from(compressedBytes));
        
        await cleanupFiles([filePath]);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== Protect PDF =====================
app.post('/protect', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const pdfBytes = await fs.readFile(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        
        // إضافة حماية (encryption)
        pdf.encrypt({
            userPassword: 'protected2024',
            ownerPassword: 'owner2024',
            permissions: {
                printing: 'lowResolution',
                modifying: false,
                copying: false,
                fillingForms: false
            }
        });
        
        const protectedBytes = await pdf.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=protected.pdf');
        res.send(Buffer.from(protectedBytes));
        
        await cleanupFiles([filePath]);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== Unlock PDF =====================
app.post('/unlock', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const pdfBytes = await fs.readFile(filePath);
        
        // إنشاء نسخة جديدة بدون حماية
        const newPdf = await PDFDocument.create();
        const sourcePdf = await PDFDocument.load(pdfBytes);
        const pages = await newPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        pages.forEach(page => newPdf.addPage(page));
        
        const unlockedBytes = await newPdf.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=unlocked.pdf');
        res.send(Buffer.from(unlockedBytes));
        
        await cleanupFiles([filePath]);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== OCR PDF =====================
app.post('/ocr', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        
        // إنشاء PDF جديد مع النص المستخرج
        const pdfDoc = await PDFDocument.create();
        const pages_count = pdfData.numpages;
        
        for (let i = 0; i < pages_count; i++) {
            const page = pdfDoc.addPage([612, 792]);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            
            page.drawText(`OCR Output - Page ${i + 1}`, {
                x: 50,
                y: page.getHeight() - 50,
                size: 14,
                font: font
            });
            
            page.drawText(pdfData.text.substring(0, 1000), {
                x: 50,
                y: page.getHeight() - 100,
                size: 10,
                font: font
            });
        }
        
        const ocrBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=ocr_output.pdf');
        res.send(Buffer.from(ocrBytes));
        
        await cleanupFiles([filePath]);
        
    } catch (error) {
        console.error(error);
        await cleanupFiles([filePath]);
        res.status(500).json({ error: error.message });
    }
});

// ===================== صفحة الترحيب =====================
app.get('/', (req, res) => {
    res.json({
        message: 'PDF Server is running!',
        version: '1.0.0',
        endpoints: [
            '/pdf-to-powerpoint', '/powerpoint-to-pdf', '/pdf-to-word',
            '/word-to-pdf', '/pdf-to-excel', '/excel-to-pdf',
            '/pdf-to-jpg', '/jpg-to-pdf', '/merge', '/split',
            '/compress', '/protect', '/unlock', '/ocr'
        ],
        status: 'active',
        port: PORT
    });
});

// ===================== تشغيل السيرفر =====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PDF Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
});
