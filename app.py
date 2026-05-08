from flask import Flask,request,send_file
from flask_cors import CORS
import os,uuid
from PyPDF2 import PdfReader,PdfWriter
from docx import Document
from docx2pdf import convert
import pdfplumber
from pdf2image import convert_from_path
from reportlab.pdfgen import canvas
import pytesseract
from PIL import Image
import pandas as pd

app=Flask(__name__)
CORS(app)

UPLOAD='uploads'
OUTPUT='outputs'
os.makedirs(UPLOAD,exist_ok=True)
os.makedirs(OUTPUT,exist_ok=True)

@app.route('/')
def home():
    return 'PDFStudio API running'

@app.route('/pdf-to-word',methods=['POST'])
def p2w():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    out=os.path.join(OUTPUT,str(uuid.uuid4())+'.docx')
    doc=Document()
    with pdfplumber.open(p) as pdf:
        for page in pdf.pages:
            t=page.extract_text()
            if t: doc.add_paragraph(t)
    doc.save(out);return send_file(out,as_attachment=True)

@app.route('/word-to-pdf',methods=['POST'])
def w2p():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    out=os.path.join(OUTPUT,str(uuid.uuid4())+'.pdf')
    convert(p,out);return send_file(out,as_attachment=True)

@app.route('/pdf-to-excel',methods=['POST'])
def p2e():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    rows=[]
    with pdfplumber.open(p) as pdf:
        for pg in pdf.pages:
            tb=pg.extract_table()
            if tb: rows+=tb
    df=pd.DataFrame(rows)
    out=os.path.join(OUTPUT,str(uuid.uuid4())+'.xlsx')
    df.to_excel(out,index=False);return send_file(out,as_attachment=True)

@app.route('/excel-to-pdf',methods=['POST'])
def e2p():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    df=pd.read_excel(p)
    out=os.path.join(OUTPUT,str(uuid.uuid4())+'.pdf')
    c=canvas.Canvas(out);y=800
    for r in df.values:
        c.drawString(40,y,' | '.join(map(str,r)));y-=15
        if y<40:c.showPage();y=800
    c.save();return send_file(out,as_attachment=True)

@app.route('/merge',methods=['POST'])
def merge():
    fs=request.files.getlist('files')
    w=PdfWriter();out=os.path.join(OUTPUT,'merged.pdf')
    for f in fs:
        p=os.path.join(UPLOAD,f.filename);f.save(p)
        r=PdfReader(p)
        for pg in r.pages:w.add_page(pg)
    with open(out,'wb') as o:w.write(o)
    return send_file(out,as_attachment=True)

@app.route('/split',methods=['POST'])
def split():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    r=PdfReader(p);w=PdfWriter()
    w.add_page(r.pages[0])
    out=os.path.join(OUTPUT,'split.pdf')
    with open(out,'wb') as o:w.write(o)
    return send_file(out,as_attachment=True)

@app.route('/compress',methods=['POST'])
def compress():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    r=PdfReader(p);w=PdfWriter()
    for pg in r.pages:w.add_page(pg)
    out=os.path.join(OUTPUT,str(uuid.uuid4())+'.pdf')
    with open(out,'wb') as o:w.write(o)
    return send_file(out,as_attachment=True)

@app.route('/protect',methods=['POST'])
def protect():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    r=PdfReader(p);w=PdfWriter()
    for pg in r.pages:w.add_page(pg)
    w.encrypt('1234')
    out=os.path.join(OUTPUT,str(uuid.uuid4())+'.pdf')
    with open(out,'wb') as o:w.write(o)
    return send_file(out,as_attachment=True)

@app.route('/unlock',methods=['POST'])
def unlock():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    r=PdfReader(p,password='1234');w=PdfWriter()
    for pg in r.pages:w.add_page(pg)
    out=os.path.join(OUTPUT,str(uuid.uuid4())+'.pdf')
    with open(out,'wb') as o:w.write(o)
    return send_file(out,as_attachment=True)

@app.route('/pdf-to-jpg',methods=['POST'])
def p2j():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    imgs=convert_from_path(p)
    out=os.path.join(OUTPUT,'page.jpg')
    imgs[0].save(out,'JPEG')
    return send_file(out,as_attachment=True)

@app.route('/ocr',methods=['POST'])
def ocr():
    f=request.files['files']
    p=os.path.join(UPLOAD,f.filename);f.save(p)
    imgs=convert_from_path(p)
    out=os.path.join(OUTPUT,str(uuid.uuid4())+'.pdf')
    c=canvas.Canvas(out)
    for img in imgs:
        text=pytesseract.image_to_string(img,lang='eng')
        c.drawString(40,800,text)
        c.showPage()
    c.save()
    return send_file(out,as_attachment=True)

app.run(host='0.0.0.0',port=8080)
