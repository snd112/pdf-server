from flask import Flask, request, send_file
from flask_cors import CORS
import os, uuid, zipfile
from PyPDF2 import PdfMerger, PdfReader, PdfWriter
from pdf2docx import Converter
from pdf2image import convert_from_path
from docx import Document
import img2pdf
import pytesseract

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

UPLOAD = "uploads"
OUT = "output"
TEMP = "temp"

os.makedirs(UPLOAD, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
os.makedirs(TEMP, exist_ok=True)


@app.route("/")
def home():
    return app.send_static_file("index.html")


def save(file):
    path = os.path.join(UPLOAD, f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}")
    file.save(path)
    return path


# ===== MERGE =====
@app.route("/merge", methods=["POST"])
def merge():
    files = request.files.getlist("files")
    merger = PdfMerger()

    for f in files:
        merger.append(save(f))

    out = os.path.join(OUT, "merge.pdf")
    merger.write(out)
    merger.close()

    return send_file(out, as_attachment=True)


# ===== SPLIT =====
@app.route("/split", methods=["POST"])
def split():
    f = request.files["files"]
    path = save(f)

    reader = PdfReader(path)
    zip_path = os.path.join(OUT, "split.zip")

    with zipfile.ZipFile(zip_path, "w") as z:
        for i, page in enumerate(reader.pages):
            writer = PdfWriter()
            writer.add_page(page)

            p = os.path.join(TEMP, f"{i}.pdf")
            with open(p, "wb") as o:
                writer.write(o)

            z.write(p, f"{i}.pdf")

    return send_file(zip_path, as_attachment=True)


# ===== JPG TO PDF =====
@app.route("/jpg-to-pdf", methods=["POST"])
def jpg():
    files = request.files.getlist("files")
    paths = [save(f) for f in files]

    out = os.path.join(OUT, "images.pdf")
    with open(out, "wb") as f:
        f.write(img2pdf.convert(paths))

    return send_file(out, as_attachment=True)


# ===== PDF TO WORD =====
@app.route("/pdf-to-word", methods=["POST"])
def pdf_word():
    f = request.files["files"]
    path = save(f)

    out = os.path.join(OUT, "file.docx")

    cv = Converter(path)
    cv.convert(out)
    cv.close()

    return send_file(out, as_attachment=True)


# ===== WORD TO PDF =====
@app.route("/word-to-pdf", methods=["POST"])
def word_pdf():
    f = request.files["files"]
    path = save(f)

    os.system(f"libreoffice --headless --convert-to pdf {path} --outdir {OUT}")

    pdf = os.path.join(OUT, os.path.splitext(os.path.basename(path))[0] + ".pdf")
    return send_file(pdf, as_attachment=True)


# ===== PDF TO JPG =====
@app.route("/pdf-to-jpg", methods=["POST"])
def pdfjpg():
    f = request.files["files"]
    path = save(f)

    images = convert_from_path(path)
    zip_path = os.path.join(OUT, "jpg.zip")

    with zipfile.ZipFile(zip_path, "w") as z:
        for i, img in enumerate(images):
            p = os.path.join(TEMP, f"{i}.jpg")
            img.save(p, "JPEG")
            z.write(p, f"{i}.jpg")

    return send_file(zip_path, as_attachment=True)


# ===== OCR =====
@app.route("/ocr", methods=["POST"])
def ocr():
    f = request.files["files"]
    path = save(f)

    images = convert_from_path(path)
    doc = Document()

    for img in images:
        doc.add_paragraph(pytesseract.image_to_string(img))

    out = os.path.join(OUT, "ocr.docx")
    doc.save(out)

    return send_file(out, as_attachment=True)


# ===== COMPRESS (BASIC) =====
@app.route("/compress", methods=["POST"])
def compress():
    f = request.files["files"]
    path = save(f)

    out = os.path.join(OUT, "compressed.pdf")

    os.system(f"gs -sDEVICE=pdfwrite -dPDFSETTINGS=/screen -dNOPAUSE -dBATCH -sOutputFile={out} {path}")

    return send_file(out, as_attachment=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
