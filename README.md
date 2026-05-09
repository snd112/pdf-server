
# PDFStudio Backend Server

## تشغيل السيرفر

```bash
npm install
npm start
```

السيرفر يعمل على:

http://localhost:8080

## رفع على Railway

1- ارفع الملفات على GitHub  
2- اعمل Deploy من Railway  
3- Railway هيشغل السيرفر تلقائي

## تعديل رابط الـ API

داخل ملف index1.html ابحث عن:

```js
const API_URL='https://your-server-url';
```

واستبدله برابط Railway الخاص بك.
