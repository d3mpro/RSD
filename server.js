const http = require('http');
const fs = require('fs');
const path = require('path');

// ==============================================================================
// KSUMC Safety & Inspection Platform - Local HTTP Server
// خادم منصة رصد الذكية المعتمد - دعم ملف شارك 7 والمسارات النظيفة
// ==============================================================================

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
};

// خريطة التوجيه الصريح للمسارات المختصرة وملف شارك
const ROUTE_ALIASES = {
  '/sharek': '/sharek-pitch.html',
  '/sharek-pitch': '/sharek-pitch.html',
  '/sharek.html': '/sharek-pitch.html',
  '/pitch': '/sharek-pitch.html',
  '/شارك': '/sharek-pitch.html',
  '/ملف-شارك': '/sharek-pitch.html',
  '/ملف_شارك': '/sharek-pitch.html',
  '/report': '/executive_report.html',
  '/executive-report': '/executive_report.html',
  '/field': '/field.html',
  '/head': '/head.html',
  '/admin': '/admin.html',
  '/quality': '/quality.html',
  '/dashboard': '/dashboard.html',
  '/profile': '/profile.html',
  '/developer': '/developer.html'
};

function serveFile(res, targetPath) {
  fs.stat(targetPath, (err, stats) => {
    if (err || !stats.isFile()) {
      send404(res);
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // رؤوس التخزين المؤقت والأمان
    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    };

    if (ext === '.html' || ext === '.js' || ext === '.json') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    } else {
      headers['Cache-Control'] = 'public, max-age=86400';
    }

    res.writeHead(200, headers);
    fs.createReadStream(targetPath).pipe(res);
  });
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <title>الصفحة غير موجودة | 404</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #f8fafc; color: #082B49; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .box { background: white; padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 450px; border: 1px solid #e2e8f0; }
        h1 { margin: 0 0 1rem; color: #082B49; font-size: 1.75rem; }
        p { color: #64748b; font-size: 0.95rem; margin-bottom: 1.5rem; }
        .links { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
        a { text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.75rem; font-size: 0.85rem; font-weight: bold; }
        .btn-primary { background: #082B49; color: white; }
        .btn-amber { background: #f59e0b; color: white; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>الصفحة غير موجودة (404)</h1>
        <p>عذراً، لم يتم العثور على المسار المطلوب في منصة رصد الذكية.</p>
        <div class="links">
          <a href="/" class="btn-primary">الرئيسية</a>
          <a href="/sharek" class="btn-amber">ملف شارك 7</a>
        </div>
      </div>
    </body>
    </html>
  `);
}

const server = http.createServer((req, res) => {
  let reqPath = '';
  try {
    reqPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    reqPath = req.url.split('?')[0];
  }

  // إزالة الشرطة المائلة من النهاية إذا لم تكن المسار الرئيسي
  if (reqPath.length > 1 && reqPath.endsWith('/')) {
    reqPath = reqPath.slice(0, -1);
  }

  // توجيه الصفحة الرئيسية
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // فحص الأسماء المستعارة (Aliases)
  if (ROUTE_ALIASES[reqPath.toLowerCase()]) {
    reqPath = ROUTE_ALIASES[reqPath.toLowerCase()];
  }

  const filePath = path.normalize(path.join(__dirname, reqPath));

  // منع هجمات Directory Traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Access Denied');
    return;
  }

  // التحقق من وجود الملف
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      serveFile(res, filePath);
      return;
    }

    // إذا لم يكن الملف موجوداً مباشرة، نجرب إضافة .html (Clean URLs)
    const htmlFilePath = filePath + '.html';
    fs.stat(htmlFilePath, (htmlErr, htmlStats) => {
      if (!htmlErr && htmlStats.isFile()) {
        serveFile(res, htmlFilePath);
        return;
      }

      // إذا كان المجلد يحتوي على index.html
      if (!err && stats && stats.isDirectory()) {
        const indexInDir = path.join(filePath, 'index.html');
        fs.stat(indexInDir, (dirErr, dirStats) => {
          if (!dirErr && dirStats.isFile()) {
            serveFile(res, indexInDir);
            return;
          }
          send404(res);
        });
        return;
      }

      send404(res);
    });
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=====================================================================`);
  console.log(`   منصة رصد الذكية - نظام السلامة والصحة المهنية (KSUMC)`);
  console.log(`   الخادم المحلي يعمل الآن بنجاح على: http://localhost:${PORT}`);
  console.log(`=====================================================================`);
  console.log(`- بوابة المنظومة الرئيسية:   http://localhost:${PORT}/`);
  console.log(`- ملف الترشيح في معرض شارك: http://localhost:${PORT}/sharek`);
  console.log(`- الرابط المباشر لملف شارك: http://localhost:${PORT}/sharek-pitch.html`);
  console.log(`- البوابات المتاحة مباشرة:   /field, /head, /admin, /quality, /dashboard`);
  console.log(`=====================================================================`);
});
