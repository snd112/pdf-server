from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import os
import uuid

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

UPLOAD = "uploads"
os.makedirs(UPLOAD, exist_ok=True)

@app.route("/")
def home():
    return app.send_static_file("index.html")


def save_file(file):
    ext = os.path.splitext(file.filename)[1]
    name = f"{uuid.uuid4()}{ext}"
    path = os.path.join(UPLOAD, name)
    file.save(path)
    return path


# ====== أدوات Demo (ترجع نفس الملف عشان السيرفر يقوم) ======

@app.route("/pdf-to-word", methods=["POST"])
@app.route("/word-to-pdf", methods=["POST"])
@app.route("/pdf-to-excel", methods=["POST"])
@app.route("/excel-to-pdf", methods=["POST"])
@app.route("/pdf-to-jpg", methods=["POST"])
@app.route("/jpg-to-pdf", methods=["POST"])
@app.route("/split", methods=["POST"])
@app.route("/compress", methods=["POST"])
@app.route("/protect", methods=["POST"])
@app.route("/unlock", methods=["POST"])
@app.route("/ocr", methods=["POST"])
def tools():
    if "files" not in request.files:
        return jsonify({"error": "no file"}), 400

    file = request.files.getlist("files")[0]
    path = save_file(file)

    return send_file(
        path,
        as_attachment=True,
        download_name=file.filename
    )
