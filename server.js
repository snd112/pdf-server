const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { fromPath } = require('pdf2pic');
const sharp = require('sharp');

const app = express();
const PORT = 8080;  // ✅ تم التعديل إلى المنفذ 8080

// Middleware
app.use(cors());
app.use(express.json());

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
        
        const officegen = require('officegen');
        const pptx = officegen('pptx');
        
        const pageCount = pdfData.numpages;
        for (let i = 1; i <= pageCount; i++) {
            const slide = pptx.makeNewSlide();
            slide.addText(pdfData.text.substring(0, 500), {
                x: '10%',
                y: '10%',
                w: '80%',
                h: '80%',
                fontSize: 14,
                color: '333333'
            });
            slide.addText(`Page ${i}`, {
                x: '10%',
                y: '85%',
                w: '80%',
                fontSize: 10,
                color: '888888'
            });
        }
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.pptx`);
        const outStream = fs.createWriteStream(outputPath);
        
        pptx.generate(outStream);
        
        outStream.on('finish', async () => {
            res.download(outputPath, 'converted.pptx', async (err) => {
                await cleanupFiles([filePath, outputPath]);
                if (err) console.error(err);
            });
        });
        
        outStream.on('error', async (err) => {
            throw err;
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
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 400]);
        
        page.drawText('Converted from PowerPoint', {
            x: 50,
            y: page.getHeight() - 50,
            size: 16
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
        
        const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.docx`);
        
        const officegen = require('officegen');
        const docx = officegen('docx');
        
        const pObj = docx.createP();
        pObj.addText(pdfData.text);
        
        const outStream = fs.createWriteStream(outputPath);
        
        docx.generate(outStream);
        
        outStream.on('finish', async () => {
            res.download(outputPath, 'converted.docx', async (err) => {
                await cleanupFiles([filePath, outputPath]);
                if (err) console.error(err);
            });
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
        
        const result = await mammoth.extractRawText({ path: filePath });
        const text = result.value;
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        const lines = text.split('\n');
        let y = page.getHeight() - 50;
        
        for (const line of lines) {
            if (y < 50) {
                const newPage = pdfDoc.addPage([600, 800]);
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
        
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([
            ['Extracted Text from PDF'],
            [''],
            [pdfData.text]
        ]);
        
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
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([800, 600]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        let y = page.getHeight() - 50;
        
        for (let i = 0; i < Math.min(data.length, 30); i++) {
            const row = data[i];
            const rowText = Array.isArray(row) ? row.join(' | ') : String(row);
            
            if (y < 50) {
                const newPage = pdfDoc.addPage([800, 600]);
                y = newPage.getHeight() - 50;
            }
            const currentPage = pdfDoc.getPages()[pdfDoc.getPages().length - 1];
            currentPage.drawText(rowText.substring(0, 150), {
                x: 50,
                y: y,
                size: 10,
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

// ===================== PDF to JPG =====================
app.post('/pdf-to-jpg', upload.array('files', 1), async (req, res) => {
    const filePath = req.files[0]?.path;
    try {
        if (!filePath) throw new Error('No file uploaded');
        
        const options = {
            density: 100,
            saveFilename: "page",
            savePath: TEMP_DIR,
            format: "jpg",
            width: 800,
            height: 600
        };
        
        const convert = fromPath(filePath, options);
        const pageCount = await convert.bulk(-1);
        
        const zipPath = path.join(TEMP_DIR, `images_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        
        for (let i = 1; i <= pageCount.length; i++) {
            const imagePath = path.join(TEMP_DIR, `page.${i}.jpg`);
            if (await fs.pathExists(imagePath)) {
                archive.file(imagePath, { name: `page_${i}.jpg` });
            }
        }
        
        await archive.finalize();
        
        output.on('close', async () => {
            res.download(zipPath, 'images.zip', async (err) => {
                const filesToClean = [filePath, zipPath];
                for (let i = 1; i <= pageCount.length; i++) {
                    const imgPath = path.join(TEMP_DIR, `page.${i}.jpg`);
                    if (await fs.pathExists(imgPath)) {
                        filesToClean.push(imgPath);
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

// ===================== JPG to PDF =====================
app.post('/jpg-to-pdf', upload.array('files'), async (req, res) => {
    const filePaths = req.files.map(f => f.path);
    try {
        if (!filePaths.length) throw new Error('No files uploaded');
        
        const pdfDoc = await PDFDocument.create();
        
        for (const imgPath of filePaths) {
            const imageBuffer = await fs.readFile(imgPath);
            let image;
            
            if (imgPath.endsWith('.png')) {
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
        
        for (let i = 0; i < pdf.getPageCount(); i++) {
            const page = pdf.getPage(i);
            const { width, height } = page.getSize();
            page.setSize(width * 0.8, height * 0.8);
        }
        
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
        
        pdf.encrypt({
            userPassword: 'protected123',
            ownerPassword: 'owner123',
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
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        const lines = pdfData.text.split('\n');
        let y = page.getHeight() - 50;
        
        for (const line of lines) {
            if (y < 50) {
                const newPage = pdfDoc.addPage([600, 800]);
                y = newPage.getHeight() - 50;
            }
            const currentPage = pdfDoc.getPages()[pdfDoc.getPages().length - 1];
            currentPage.drawText(line.substring(0, 100), {
                x: 50,
                y: y,
                size: 11,
                font: font
            });
            y -= 15;
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

// ===================== تشغيل السيرفر =====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PDF Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
});
