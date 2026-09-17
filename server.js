const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8082;
const PUBLIC_DIR = __dirname;
const DOC_ID = '1GFk3Vkst77GPqNE5YzFmedWfEWJJvOi-jdZIy7QVGCU';

const tabsConfig = [
  { name: 'M Bloc Space', defaultZone: 'Blok M', subZona: 'M Bloc Space', defaultCat: 'Retail & Creative' },
  { name: 'Blok M Square', defaultZone: 'Blok M', subZona: 'Blok M Square', defaultCat: 'Perdagangan & Services' },
  { name: 'Gultik/Non-Gultik', defaultZone: 'Blok C', subZona: 'Gultik Bulungan & Non-Gultik', defaultCat: 'F&B / Kuliner' }
];

function fetchTabCSV(tabName) {
  return new Promise((resolve, reject) => {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${DOC_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    
    function makeReq(targetUrl) {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeReq(res.headers.location);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    }
    
    makeReq(csvUrl);
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

async function syncGoogleSheetData() {
  const allMerchants = [];
  let counter = 1;

  for (const cfg of tabsConfig) {
    try {
      const csvData = await fetchTabCSV(cfg.name);
      const lines = csvData.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) continue;

      const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      
      const colCoord = header.findIndex(h => h.includes('kordinat') || h.includes('koordinat'));
      const colToko = header.findIndex(h => h.includes('toko') || h.includes('usaha'));
      const colPic = header.findIndex(h => h.includes('pemilik') || h.includes('pic'));
      const colTelp = header.findIndex(h => h.includes('telpon') || h.includes('telepon') || h.includes('hp'));
      const colLvm = header.findIndex(h => h.includes('lvm') || h.includes('akuisisi'));
      const colDebitur = header.findIndex(h => h.includes('debitur') || h.includes('kredit'));
      const colGolongan = header.findIndex(h => h.includes('golongan'));

      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (!row || row.length < 3) continue;

        const namaToko = (row[colToko] || '').trim();
        if (!namaToko || namaToko.toLowerCase().includes('nama toko')) continue;

        const rawCoord = (row[colCoord] || '').trim();
        let lat = -6.2445;
        let lng = 106.7990;
        if (rawCoord.includes(',')) {
          const parts = rawCoord.split(',').map(p => parseFloat(p.trim()));
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            lat = parts[0];
            lng = parts[1];
          }
        }

        const namaPic = (row[colPic] || '').trim() || '-';
        const telp = (row[colTelp] || '').trim() || '-';
        const rawLvm = (row[colLvm] || '').trim();
        const rawDebitur = (row[colDebitur] || '').trim();
        const golongan = colGolongan !== -1 ? (row[colGolongan] || '').trim() : '';

        // Status LVM Mapping
        let statusLvm = 'Belum LVM';
        if (rawLvm.toLowerCase().includes('sudah') || rawLvm.toLowerCase().includes('active') || rawLvm.toLowerCase().includes('terdaftar')) {
          statusLvm = 'LVM Active';
        }

        // Status Debitur Mapping
        let statusNasabah = 'TARGET_KUR';
        let statusText = 'Target Cross-Selling KUR';
        if (rawDebitur.toLowerCase().includes('eksisting') || rawDebitur.toLowerCase().includes('sudah kredit') || rawDebitur.toLowerCase().includes('debitur')) {
          statusNasabah = 'DEBITUR_EKSISTING';
          statusText = 'Debitur Eksisting Mandiri';
        }

        let subZonaName = cfg.subZona;
        if (golongan) {
          subZonaName = `Gultik (${golongan})`;
        }

        let kategori = cfg.defaultCat;
        if (namaToko.toLowerCase().includes('kopi') || namaToko.toLowerCase().includes('bakso') || namaToko.toLowerCase().includes('mie') || namaToko.toLowerCase().includes('resto') || namaToko.toLowerCase().includes('warung') || namaToko.toLowerCase().includes('cafe') || namaToko.toLowerCase().includes('gultik')) {
          kategori = 'F&B / Kuliner';
        }

        const idStr = `MB-${String(counter).padStart(3, '0')}`;
        counter++;

        allMerchants.push({
          id: idStr,
          namaUsaha: namaToko,
          namaPic: namaPic,
          telepon: telp,
          kategori: kategori,
          zonaUtama: cfg.defaultZone,
          subZona: subZonaName,
          alamat: `Kawasan ${subZonaName}, Kebayoran Baru`,
          lat: lat,
          lng: lng,
          omsetBulanan: "Rp 0",
          volumeSettlement: "Rp 0",
          statusNasabah: statusNasabah,
          statusText: statusText,
          statusLvm: statusLvm,
          rawLvmSheet: rawLvm,
          potensiKredit: "Rp 0",
          terminal: statusLvm === 'LVM Active' ? "Livin' Merchant (QRIS Active)" : "Prospek LVM / EDC Mandiri",
          keterangan: `UMKM ${subZonaName}. PIC: ${namaPic}. Telp: ${telp}. Sheet Status: ${rawLvm || 'Belum'}.`
        });
      }
    } catch (e) {
      console.error(`Error syncing tab ${cfg.name}:`, e.message);
    }
  }

  // Update master_blokm_merchants.js file on disk
  if (allMerchants.length > 0) {
    const fileHeader = `/* ==========================================================================
   BANK MANDIRI REGION V - MASTER DATASET MERCHANT & DEBITUR KEBAYORAN BARU
   Auto-Imported from Official Google Sheet (M-Bloc Space, Blok M Square, Gultik)
   Total: ${allMerchants.length} UMKM Merchants
   ========================================================================== */

window.MASTER_BLOKM_MERCHANTS = `;
    fs.writeFileSync(path.join(PUBLIC_DIR, 'master_blokm_merchants.js'), fileHeader + JSON.stringify(allMerchants, null, 2) + ';\n', 'utf8');
  }

  return allMerchants;
}

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);

  // API Endpoint: Live Sync Google Sheet
  if (pathname === '/api/sync-sheet') {
    try {
      const merchants = await syncGoogleSheetData();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify({
        success: true,
        count: merchants.length,
        timestamp: new Date().toISOString(),
        merchants: merchants
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Dashboard Tracking Wilayah Blok M running at http://localhost:${PORT}/ and http://127.0.0.1:${PORT}/`);
});
