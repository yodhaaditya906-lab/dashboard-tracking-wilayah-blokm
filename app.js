/* ==========================================================================
   BANK MANDIRI REGION V - DASHBOARD TRACKING WILAYAH BLOK M
   Interactive Leaflet Map, GeoJSON Sub-Zonasi, POI Extracted GPS & LVM Tagging
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // App State
  let map = null;
  let maskGroup = L.layerGroup();
  let boundaryLineGroup = L.layerGroup();
  let zonePolygonsGroup = L.layerGroup();
  let merchantMarkersGroup = L.layerGroup();

  let currentZoneFilter = 'ALL';
  let currentCategoryFilter = 'ALL';
  let currentLvmFilter = 'ALL';
  let currentMode = 'all'; // Default to 'all' so all merchants and target prospects show immediately
  let searchQuery = '';
  let selectedMerchantId = null;
  let combinedBounds = null;
  let blockLayersMap = {};

  // DOM Elements
  const zoneSelect = document.getElementById('filter-zone');
  const categorySelect = document.getElementById('filter-category');
  const lvmSelect = document.getElementById('filter-lvm');
  const searchInput = document.getElementById('search-input');
  const cardsWrapper = document.getElementById('merchant-cards-wrapper');
  const merchantCounter = document.getElementById('merchant-counter');

  const btnModeTarget = document.getElementById('btn-mode-target');
  const btnModeDebitur = document.getElementById('btn-mode-debitur');
  const btnModeAll = document.getElementById('btn-mode-all');

  const detailPanel = document.getElementById('detail-panel');
  const panelTitle = document.getElementById('panel-title');
  const panelContent = document.getElementById('panel-content');
  const btnClosePanel = document.getElementById('btn-close-panel');

  const modalDbOverlay = document.getElementById('modal-db-overlay');
  const dbTableBody = document.getElementById('db-table-body');
  const dbSearchInput = document.getElementById('db-search-input');
  const btnOpenDb = document.getElementById('btn-open-db');
  const btnCloseDbModal = document.getElementById('btn-close-db-modal');
  const btnExportExcelTarget = document.getElementById('btn-export-excel-target');
  const btnExportExcelModal = document.getElementById('btn-export-excel-modal');

  // Helper to fetch combined dataset (Master dataset + Fetched GPS POIs + User Tagging localStorage)
  function getAllMerchants() {
    const master = (window.MASTER_BLOKM_MERCHANTS || []).map(m => ({
      ...m,
      statusLvm: m.statusLvm || 'Belum LVM'
    }));
    const fetched = window.FETCHED_BLOKM_POIS || [];
    
    const combined = [...master, ...fetched];

    return combined.map(m => {
      const savedLvm = localStorage.getItem('lvm_status_' + m.id);
      return {
        ...m,
        statusLvm: savedLvm ? savedLvm : (m.statusLvm || 'Belum LVM')
      };
    });
  }

  const btnSyncSheet = document.getElementById('btn-sync-sheet');

  const DOC_ID = '1GFk3Vkst77GPqNE5YzFmedWfEWJJvOi-jdZIy7QVGCU';
  const TABS_CONFIG = [
    { name: 'M Bloc Space', defaultZone: 'Blok M', subZona: 'M Bloc Space', defaultCat: 'Retail & Creative' },
    { name: 'Blok M Square', defaultZone: 'Blok M', subZona: 'Blok M Square', defaultCat: 'Perdagangan & Services' },
    { name: 'Gultik/Non-Gultik', defaultZone: 'Blok C', subZona: 'Gultik Bulungan & Non-Gultik', defaultCat: 'F&B / Kuliner' }
  ];

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

  async function fetchLiveGoogleSheetClientSide() {
    const allMerchants = [];
    let counter = 1;

    for (const cfg of TABS_CONFIG) {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${DOC_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cfg.name)}&t=${Date.now()}`;
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) continue;
        const csvData = await resp.text();
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

          let statusLvm = 'Belum LVM';
          if (rawLvm.toLowerCase().includes('sudah') || rawLvm.toLowerCase().includes('active') || rawLvm.toLowerCase().includes('terdaftar')) {
            statusLvm = 'LVM Active';
          }

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
        console.warn(`Client fetch error for tab ${cfg.name}:`, e);
      }
    }

    return allMerchants;
  }

  // Live Auto-Sync Engine from Google Sheet CSV API (Client-side & Server fallback)
  async function syncSheetDataLive(isManual = false) {
    const syncIcon = document.getElementById('sync-icon');
    if (syncIcon) syncIcon.classList.add('fa-spin');

    try {
      // Direct client-side fetch from Google Sheet (works on GitHub Pages & static hosts!)
      const liveMerchants = await fetchLiveGoogleSheetClientSide();
      if (liveMerchants && liveMerchants.length > 0) {
        window.MASTER_BLOKM_MERCHANTS = liveMerchants;
        updateRibbonStats();
        renderMapLayersAndList();
        if (modalDbOverlay && !modalDbOverlay.classList.contains('hidden')) {
          renderDatabaseTable();
        }
        if (isManual) {
          const lvmCount = liveMerchants.filter(m => m.statusLvm === 'LVM Active').length;
          alert(`✅ Live Sync Berhasil!\n\nSeluruh data terbaru dari 3 tab Google Sheet telah disinkronkan.\nTotal: ${liveMerchants.length} merchant (${lvmCount} LVM Active).`);
        }
        return;
      }

      // Server fallback if client fetch fails
      const resp = await fetch('/api/sync-sheet');
      const data = await resp.json();
      if (data && data.success && Array.isArray(data.merchants)) {
        window.MASTER_BLOKM_MERCHANTS = data.merchants;
        updateRibbonStats();
        renderMapLayersAndList();
        if (modalDbOverlay && !modalDbOverlay.classList.contains('hidden')) {
          renderDatabaseTable();
        }
        if (isManual) {
          const lvmCount = data.merchants.filter(m => m.statusLvm === 'LVM Active').length;
          alert(`✅ Live Sync Berhasil!\n\nSeluruh data terbaru dari 3 tab Google Sheet telah disinkronkan.\nTotal: ${data.count} merchant (${lvmCount} LVM Active).`);
        }
      }
    } catch (err) {
      console.warn("Live sync error, fallback to static dataset:", err);
    } finally {
      if (syncIcon) syncIcon.classList.remove('fa-spin');
    }
  }

  // Initialize Application safely
  try { initMap(); } catch(e) { console.error("Error initMap:", e); }
  try { renderSubZones(); } catch(e) { console.error("Error renderSubZones:", e); }
  try { updateRibbonStats(); } catch(e) { console.error("Error updateRibbonStats:", e); }
  try { renderMapLayersAndList(); } catch(e) { console.error("Error renderMapLayersAndList:", e); }
  try { setupEventListeners(); } catch(e) { console.error("Error setupEventListeners:", e); }
  
  // Auto-sync live Google Sheet data on page load
  try { syncSheetDataLive(false); } catch(e) { console.error("Error syncSheetDataLive:", e); }

  // Expose LVM Refresh Engine Globally
  window.refreshDashboardLvm = function(merchantId) {
    updateRibbonStats();
    renderMapLayersAndList();
    if (selectedMerchantId === merchantId) {
      const all = getAllMerchants();
      const updated = all.find(x => x.id === merchantId);
      if (updated) showMerchantDetail(updated);
    }
    if (modalDbOverlay && !modalDbOverlay.classList.contains('hidden')) {
      renderDatabaseTable();
    }
  };

  window.toggleLvmStatus = function(merchantId) {
    const all = getAllMerchants();
    const target = all.find(x => x.id === merchantId);
    if (!target) return;

    const isLvmActive = (target.statusLvm === 'LVM Active' || target.statusLvm === 'Sudah LVM');
    const newStatus = isLvmActive ? 'Belum LVM' : 'LVM Active';
    localStorage.setItem('lvm_status_' + merchantId, newStatus);
    window.refreshDashboardLvm(merchantId);
  };

  // 1. Initialize Map Focused Over Kebayoran Baru (Blok M, Blok C, Blok N)
  function initMap() {
    combinedBounds = L.latLngBounds(
      L.latLng(-6.2535, 106.7920), // South-West
      L.latLng(-6.2390, 106.8060)  // North-East
    );

    map = L.map('map', {
      center: [-6.2445, 106.7990],
      zoom: 15,
      minZoom: 14,
      maxZoom: 19,
      maxBounds: combinedBounds.pad(0.10),
      maxBoundsViscosity: 0.90
    });

    if (!map.getPane('maskPane')) {
      map.createPane('maskPane');
      map.getPane('maskPane').style.zIndex = 350;
    }

    const esriWorldStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
    });

    const esriGray = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
    ]);

    const osmHot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    });

    const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    });

    const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    // Set Esri World Street Clean (Clean base without built-in commercial POIs & 100% Free No API Key) as default
    esriWorldStreet.addTo(map);

    L.control.layers({
      "🗺️ Peta Clean Esri Mandiri (Bebas POI Bawaan - Default)": esriWorldStreet,
      "⚪ Peta Light Minimalist Gray (Esri)": esriGray,
      "🌍 Peta OSM Humanitarian (HOT)": osmHot,
      "🛰️ Google Maps Satelit Hibrida": googleHybrid,
      "📍 Google Maps Standard (Dengan POI Bawaan)": googleRoadmap,
      "🌐 OpenStreetMap Standard": osmStandard
    }, null, { position: 'topright' }).addTo(map);

    map.on('drag', function() {
      map.panInsideBounds(combinedBounds, { animate: false });
    });

    // Interactive Map Click GPS Coordinate Tracker with Precision Auto-Zoom IN
    map.on('click', function(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      // Auto Zoom IN to precision level 18.5 (never zoom out!)
      const targetZoom = Math.max(map.getZoom(), 18.5);
      map.flyTo(e.latlng, targetZoom, { duration: 0.8 });

      L.popup()
        .setLatLng(e.latlng)
        .setContent(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px; max-width: 250px;">
            <div style="font-size: 13px; font-weight: 800; color: #003D79; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-location-dot" style="color: #EA580C;"></i> Lacak Titik Koordinat GPS
            </div>
            <div style="font-size: 11.5px; color: #334155; margin-bottom: 8px; background: #F8FAFC; padding: 6px 8px; border-radius: 6px; border: 1px solid #E2E8F0;">
              <strong>Latitude:</strong> ${lat.toFixed(6)}<br>
              <strong>Longitude:</strong> ${lng.toFixed(6)}
            </div>
            <div style="display: flex; gap: 6px;">
              <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="
                flex: 1; background: #003D79; color: #FFFFFF; text-decoration: none; text-align: center;
                padding: 6px 8px; border-radius: 6px; font-weight: 700; font-size: 10.5px; display: inline-block;
              ">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Google Maps
              </a>
              <button onclick="navigator.clipboard.writeText('${lat.toFixed(6)}, ${lng.toFixed(6)}'); alert('Koordinat GPS disalin: ${lat.toFixed(6)}, ${lng.toFixed(6)}');" style="
                flex: 1; background: #059669; color: #FFFFFF; border: none;
                padding: 6px 8px; border-radius: 6px; font-weight: 700; font-size: 10.5px; cursor: pointer;
              ">
                <i class="fa-solid fa-copy"></i> Salin Titik
              </button>
            </div>
          </div>
        `)
        .openOn(map);
    });

    maskGroup.addTo(map);
    boundaryLineGroup.addTo(map);
    zonePolygonsGroup.addTo(map);
    merchantMarkersGroup.addTo(map);

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 300);
  }

  // 2. Render Multi-Polygon Inverted Mask Layer & Perimeter Contours
  function renderSubZones() {
    maskGroup.clearLayers();
    boundaryLineGroup.clearLayers();
    zonePolygonsGroup.clearLayers();
    blockLayersMap = {};

    const geojsonDataset = window.BLOKM_ZONES_GEOJSON;
    if (!geojsonDataset || !geojsonDataset.features) return;

    const outerWorldRing = [
      L.latLng(-90, -180),
      L.latLng(-90, 180),
      L.latLng(90, 180),
      L.latLng(90, -180)
    ];

    const outerBlokM = geojsonDataset.features.find(f => f.properties && f.properties.id === 'ZONE_BLOKM_OUTER');
    const outerBlokC = geojsonDataset.features.find(f => f.properties && f.properties.id === 'ZONE_BLOKC_OUTER');
    const outerBlokN = geojsonDataset.features.find(f => f.properties && f.properties.id === 'ZONE_BLOKN_OUTER');

    let darkMaskPoly = null;
    const holesLatLngs = [];

    const mainBlocksList = [
      { feature: outerBlokM, color: '#00E5FF', label: 'Blok M' },
      { feature: outerBlokC, color: '#3B82F6', label: 'Blok C' },
      { feature: outerBlokN, color: '#10B981', label: 'Blok N' }
    ];

    const allMerchants = getAllMerchants();

    mainBlocksList.forEach(item => {
      if (item.feature && item.feature.geometry && item.feature.geometry.coordinates) {
        const outerCoords = item.feature.geometry.coordinates[0];
        const latLngs = outerCoords.map(pt => L.latLng(pt[1], pt[0]));
        holesLatLngs.push(latLngs.slice().reverse());

        const blockContourLine = L.polygon(latLngs, {
          color: item.color,
          weight: 4,
          opacity: 0.95,
          dashArray: '6, 4',
          fillColor: item.color,
          fillOpacity: 0,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(boundaryLineGroup);

        const countInBlock = allMerchants.filter(m => m.zonaUtama === item.label).length;
        blockContourLine.bindTooltip(`
          <div class="spotlight-tooltip-body">
            <div class="spotlight-tooltip-title">
              <i class="fa-solid fa-location-dot" style="color: ${item.color};"></i> ${item.feature.properties.name || item.label}
            </div>
            <div class="spotlight-tooltip-sub">
              <i class="fa-solid fa-store"></i> ${countInBlock} Merchant & Prospek Terdata
            </div>
          </div>
        `, {
          sticky: true,
          className: 'spotlight-boundary-tooltip',
          direction: 'top',
          offset: [0, -10]
        });

        blockContourLine.on('mouseover', function() {
          this.setStyle({ color: '#FFB700', weight: 6, fillOpacity: 0 });
          if (darkMaskPoly) darkMaskPoly.setStyle({ fillOpacity: 0.65 });
        });

        blockContourLine.on('mouseout', function() {
          this.setStyle({ color: item.color, weight: 4, fillOpacity: 0 });
          if (darkMaskPoly) darkMaskPoly.setStyle({ fillOpacity: 0.85 });
        });

        blockContourLine.on('click', function() {
          selectBlockFilter(item.label);
        });
      }
    });

    darkMaskPoly = L.polygon([outerWorldRing, ...holesLatLngs], {
      pane: 'maskPane',
      color: '#0b1329',
      stroke: false,
      fillColor: '#0b1329',
      fillOpacity: 0.85,
      fillRule: 'evenodd',
      interactive: false
    }).addTo(maskGroup);

    // Render Inner Sub-Zone Polygons inside each main block
    geojsonDataset.features.forEach(feat => {
      const featId = feat.properties ? feat.properties.id : '';
      if (featId === 'ZONE_BLOKM_OUTER' || featId === 'ZONE_BLOKC_OUTER' || featId === 'ZONE_BLOKN_OUTER') return;

      if (feat.geometry && feat.geometry.coordinates) {
        const coords = feat.geometry.coordinates[0];
        const latLngs = coords.map(pt => L.latLng(pt[1], pt[0]));
        const subColor = feat.properties.color || '#38BDF8';

        const subPoly = L.polygon(latLngs, {
          color: subColor,
          weight: 2,
          opacity: 0.8,
          dashArray: '4, 4',
          fillColor: subColor,
          fillOpacity: 0.12,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(zonePolygonsGroup);

        subPoly.bindTooltip(`
          <div class="spotlight-tooltip-body">
            <div class="spotlight-tooltip-title" style="color: ${subColor}; font-weight: 800;">
              <i class="fa-solid fa-draw-polygon"></i> ${feat.properties.name || feat.properties.code}
            </div>
            <div class="spotlight-tooltip-sub">
              📍 Area Sub-Zona ${feat.properties.mainBlock || ''}
            </div>
          </div>
        `, { sticky: true, className: 'spotlight-boundary-tooltip' });

        subPoly.on('mouseover', function() {
          this.setStyle({ weight: 3.5, fillOpacity: 0.28, color: '#FFB700' });
        });

        subPoly.on('mouseout', function() {
          this.setStyle({ weight: 2, fillOpacity: 0.12, color: subColor });
        });
      }
    });
  }

  // 3. Helper to Select Block Filter & Focus Map with High Precision
  function selectBlockFilter(blockCode) {
    if (zoneSelect) {
      zoneSelect.value = blockCode;
      currentZoneFilter = blockCode;
      renderMapLayersAndList();
    }

    if (blockCode === 'ALL') {
      if (map && combinedBounds) {
        map.fitBounds(combinedBounds.pad(0.05), { animate: true, duration: 1.0 });
      }
      return;
    }

    // Maintain high detail precision zoom (minimum zoom level 17.5, never force zoom out to level 15)
    const currentZoom = map ? map.getZoom() : 16;
    const targetZoom = Math.max(currentZoom, 17.5);

    let outerId = null;
    if (blockCode === 'Blok M') outerId = 'ZONE_BLOKM_OUTER';
    if (blockCode === 'Blok C') outerId = 'ZONE_BLOKC_OUTER';
    if (blockCode === 'Blok N') outerId = 'ZONE_BLOKN_OUTER';

    if (outerId) {
      const outerFeat = (window.BLOKM_ZONES_GEOJSON.features || []).find(f => f.properties && f.properties.id === outerId);
      if (outerFeat && outerFeat.properties && outerFeat.properties.centroid) {
        map.flyTo([outerFeat.properties.centroid[0], outerFeat.properties.centroid[1]], targetZoom, { duration: 1.0 });
        return;
      }
    }

    const feature = (window.BLOKM_ZONES_GEOJSON.features || []).find(f => f.properties && (f.properties.code === blockCode || f.properties.id === blockCode || (f.properties.name && f.properties.name.includes(blockCode))));
    if (feature && feature.properties && feature.properties.centroid) {
      map.flyTo([feature.properties.centroid[0], feature.properties.centroid[1]], targetZoom, { duration: 1.0 });
    }
  }

  // 4. Update Header Stats Ribbon
  function updateRibbonStats() {
    const merchants = getAllMerchants();
    const total = merchants.length;
    const lvmCount = merchants.filter(m => m.statusLvm === 'LVM Active' || m.statusLvm === 'Sudah LVM').length;
    const targetKUR = merchants.filter(m => m.statusNasabah === 'TARGET_KUR').length;
    const debitur = merchants.filter(m => m.statusNasabah === 'DEBITUR_EKSISTING').length;

    const statTotal = document.getElementById('stat-total-merchant');
    const statTarget = document.getElementById('stat-target-kur');
    const statDebitur = document.getElementById('stat-debitur-eksisting');

    if (statTotal) statTotal.textContent = `${total} (${lvmCount} LVM)`;
    if (statTarget) statTarget.textContent = targetKUR;
    if (statDebitur) statDebitur.textContent = debitur;
  }

  // 5. Render Map Markers and Left Sidebar Cards
  function renderMapLayersAndList() {
    merchantMarkersGroup.clearLayers();
    if (cardsWrapper) cardsWrapper.innerHTML = '';

    const allMerchants = getAllMerchants();

    // Filter Logic
    const filtered = allMerchants.filter(m => {
      // Smart Zone & Sub-Zone Filtering
      if (currentZoneFilter !== 'ALL') {
        const z = currentZoneFilter.toLowerCase().trim();
        const main = (m.zonaUtama || '').toLowerCase();
        const sub = (m.subZona || '').toLowerCase();
        const addr = (m.alamat || '').toLowerCase();

        let matchesZone = false;
        if (z === 'blok c') {
          matchesZone = main.includes('blok c') || sub.includes('gultik') || sub.includes('non-gultik') || sub.includes('bulungan') || addr.includes('bulungan');
        } else if (z === 'blok m') {
          matchesZone = main.includes('blok m') || sub.includes('m bloc') || sub.includes('square');
        } else if (z === 'blok n') {
          matchesZone = main.includes('blok n') || sub.includes('lesehan') || sub.includes('kue subuh');
        } else if (z === 'gultik') {
          matchesZone = sub.includes('gultik') && !sub.includes('non-gultik');
        } else if (z === 'non-gultik') {
          matchesZone = sub.includes('non-gultik');
        } else {
          matchesZone = main.includes(z) || sub.includes(z) || addr.includes(z);
        }

        if (!matchesZone) return false;
      }

      // Category Filter
      if (currentCategoryFilter !== 'ALL') {
        const cat = (m.kategori || '').toLowerCase();
        const fc = currentCategoryFilter.toLowerCase().trim();
        let matchesCat = false;
        if (fc.includes('f&b') || fc.includes('kuliner') || fc.includes('food')) {
          matchesCat = cat.includes('f&b') || cat.includes('kuliner') || cat.includes('cafe') || cat.includes('resto') || cat.includes('makanan') || cat.includes('minuman');
        } else if (fc.includes('retail')) {
          matchesCat = cat.includes('retail') || cat.includes('perhiasan') || cat.includes('toko') || cat.includes('creative');
        } else if (fc.includes('kesehatan')) {
          matchesCat = cat.includes('kesehatan') || cat.includes('farmasi') || cat.includes('optik');
        } else if (fc.includes('fashion')) {
          matchesCat = cat.includes('fashion') || cat.includes('pakaian') || cat.includes('apparel') || cat.includes('craft');
        } else {
          matchesCat = cat.includes(fc);
        }

        if (!matchesCat) return false;
      }

      // LVM Status Filter
      if (currentLvmFilter !== 'ALL') {
        const lvm = (m.statusLvm || 'Belum LVM').toLowerCase();
        const isLvm = lvm.includes('active') || lvm.includes('sudah');
        if (currentLvmFilter === 'LVM Active' && !isLvm) return false;
        if (currentLvmFilter === 'Belum LVM' && isLvm) return false;
      }

      // Mode Segment Filter
      if (currentMode === 'target' && m.statusNasabah !== 'TARGET_KUR') return false;
      if (currentMode === 'debitur' && m.statusNasabah !== 'DEBITUR_EKSISTING') return false;

      // Search Query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (m.namaUsaha || '').toLowerCase().includes(q);
        const matchAddr = (m.alamat || '').toLowerCase().includes(q);
        const matchCat = (m.kategori || '').toLowerCase().includes(q);
        const matchSub = (m.subZona || '').toLowerCase().includes(q);
        const matchPic = (m.namaPic || '').toLowerCase().includes(q);
        if (!matchName && !matchAddr && !matchCat && !matchSub && !matchPic) return false;
      }

      return true;
    });

    // Update Counter
    if (merchantCounter) {
      merchantCounter.textContent = `${filtered.length} Merchant`;
    }

    // Render Each Merchant Card & Marker
    filtered.forEach(m => {
      const isTarget = (m.statusNasabah === 'TARGET_KUR');
      const isLvmActive = (m.statusLvm === 'LVM Active' || m.statusLvm === 'Sudah LVM');
      
      // Distinct Pin Color: Green/Gold for LVM Active, Orange/Red for Belum LVM
      const pinColor = isLvmActive ? '#059669' : '#EA580C';
      const pinBorder = isLvmActive ? '#F59E0B' : '#FFFFFF';
      const iconClass = isLvmActive ? 'fa-solid fa-qrcode' : (m.kategori.includes('F&B') ? 'fa-solid fa-utensils' : 'fa-solid fa-store');

      // A. Add Map Marker
      const markerIcon = L.divIcon({
        className: 'custom-merchant-marker',
        html: `
          <div style="
            width: 32px; height: 32px;
            background: ${pinColor};
            border: 2px solid ${pinBorder};
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: #FFFFFF; font-size: 13px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
            cursor: pointer;
            transition: transform 0.2s ease;
          " title="${m.namaUsaha} (${m.statusLvm})">
            <i class="${iconClass}"></i>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([m.lat, m.lng], { icon: markerIcon });

      marker.bindPopup(`
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px; max-width: 245px;">
          <div style="font-size: 13.5px; font-weight: 800; color: #003D79; margin-bottom: 4px;">
            ${m.namaUsaha}
          </div>
          <div style="font-size: 11px; color: #64748B; margin-bottom: 6px;">
            📍 ${m.alamat} (${m.subZona})
          </div>
          <div style="display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;">
            <span style="font-size: 10px; font-weight: 800; color: ${isLvmActive ? '#047857' : '#DC2626'}; background: ${isLvmActive ? '#D1FAE5' : '#FEE2E2'}; border: 1px solid ${isLvmActive ? '#6EE7B7' : '#FCA5A5'}; padding: 2px 8px; border-radius: 12px;">
              LVM
            </span>
            <span style="font-size: 10px; font-weight: 800; color: ${!isTarget ? '#047857' : '#DC2626'}; background: ${!isTarget ? '#D1FAE5' : '#FEE2E2'}; border: 1px solid ${!isTarget ? '#6EE7B7' : '#FCA5A5'}; padding: 2px 8px; border-radius: 12px;">
              Debitur
            </span>
          </div>
          <div style="font-size: 11px; color: #334155; margin-bottom: 8px;">
            <strong>Koordinat GPS:</strong> ${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}
          </div>
          <div style="display: flex; gap: 6px;">
            <button onclick="window.toggleLvmStatus('${m.id}')" style="
              flex: 1; background: ${isLvmActive ? '#475569' : '#059669'}; color: #FFFFFF; border: none;
              padding: 6px; border-radius: 6px; font-weight: 700; font-size: 10.5px; cursor: pointer;
            ">
              <i class="fa-solid fa-tag"></i> ${isLvmActive ? 'Tandai Belum LVM' : 'Tandai Sudah LVM'}
            </button>
            <button onclick="window.inspectMerchantDetails('${m.id}')" style="
              flex: 1; background: #003D79; color: #FFFFFF; border: none;
              padding: 6px; border-radius: 6px; font-weight: 700; font-size: 10.5px; cursor: pointer;
            ">Detail</button>
          </div>
        </div>
      `);

      marker.on('click', () => {
        showMerchantDetail(m);
      });

      merchantMarkersGroup.addLayer(marker);

      // B. Create Left Sidebar Card
      const card = document.createElement('div');
      card.className = `merchant-card ${selectedMerchantId === m.id ? 'selected' : ''}`;
      card.style.setProperty('--card-accent', pinColor);

      card.innerHTML = `
        <div class="card-top">
          <div class="card-title">${m.namaUsaha}</div>
          <div style="display: flex; gap: 4px; align-items: center; flex-shrink: 0;">
            <span class="tag-badge ${isLvmActive ? 'debitur' : 'target-kur'}">
              LVM
            </span>
            <span class="tag-badge ${!isTarget ? 'debitur' : 'target-kur'}">
              Debitur
            </span>
          </div>
        </div>
        <div class="card-sub">
          <i class="fa-solid fa-location-dot"></i> ${m.subZona} • ${m.kategori}
        </div>
        <div class="card-footer-info">
          <div><i class="fa-solid fa-map-pin"></i> ${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}</div>
          <div class="potensi">${m.potensiKredit ? m.potensiKredit.split(' ')[0] + ' ' + (m.potensiKredit.split(' ')[1] || '') : 'Prospek'}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        selectedMerchantId = m.id;
        showMerchantDetail(m);
        map.flyTo([m.lat, m.lng], 18.5, { duration: 0.8 });
        marker.openPopup();
      });

      if (cardsWrapper) cardsWrapper.appendChild(card);
    });

    if (filtered.length === 0 && cardsWrapper) {
      cardsWrapper.innerHTML = `
        <div style="text-align: center; padding: 40px 16px; color: #64748B;">
          <i class="fa-solid fa-store-slash" style="font-size: 32px; color: #94A3B8; margin-bottom: 12px;"></i>
          <p style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 4px;">Daftar Merchant Kosong</p>
          <p style="font-size: 11.5px; color: #94A3B8;">Belum ada merchant yang terdaftar dalam wilayah ini.</p>
        </div>
      `;
    }
  }

  // Global inspect helper
  window.inspectMerchantDetails = function(merchantId) {
    const all = getAllMerchants();
    const m = all.find(item => item.id === merchantId);
    if (m) showMerchantDetail(m);
  };

  // 6. Show Merchant Detail Panel
  function showMerchantDetail(m) {
    if (!detailPanel || !panelContent) return;

    selectedMerchantId = m.id;
    const isTarget = (m.statusNasabah === 'TARGET_KUR');
    const isLvmActive = (m.statusLvm === 'LVM Active' || m.statusLvm === 'Sudah LVM');
    const waNumber = (m.telepon || '081234567890').replace(/^0/, '62');

    panelContent.innerHTML = `
      <div class="detail-field">
        <label>Nama Usaha / Merchant</label>
        <div class="val" style="font-size: 16px; font-weight: 800; color: #003D79;">${m.namaUsaha}</div>
      </div>

      <div class="detail-field">
        <label>Status Livin' Merchant (LVM)</label>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; background: ${isLvmActive ? '#ECFDF5' : '#FFFBEB'}; padding: 8px 12px; border-radius: 8px; border: 1px solid ${isLvmActive ? '#A7F3D0' : '#FDE68A'};">
          <span style="font-size: 12.5px; font-weight: 800; color: ${isLvmActive ? '#047857' : '#B45309'};">
            <i class="${isLvmActive ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-question'}"></i> ${isLvmActive ? 'Sudah Menggunakan LVM' : 'Belum Menggunakan LVM'}
          </span>
          <button onclick="window.toggleLvmStatus('${m.id}')" style="
            background: ${isLvmActive ? '#475569' : '#059669'}; color: #FFFFFF; border: none;
            padding: 6px 10px; border-radius: 6px; font-weight: 700; font-size: 10.5px; cursor: pointer;
            display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          ">
            <i class="fa-solid fa-pen-to-square"></i> ${isLvmActive ? 'Tandai Belum LVM' : 'Tandai Sudah LVM'}
          </button>
        </div>
      </div>

      <div class="detail-field">
        <label>Status Nasabah Bank Mandiri</label>
        <div class="val" style="color: ${isTarget ? '#DC2626' : '#059669'}; font-weight: 800;">
          <i class="${isTarget ? 'fa-solid fa-bullseye' : 'fa-solid fa-building-columns'}"></i> ${m.statusText || 'Prospek Cross-Selling'}
        </div>
      </div>

      <div class="detail-field">
        <label>Koordinat GPS Google Maps</label>
        <div class="val" style="font-family: monospace; font-weight: 700; color: #0284C7;">
          📍 ${m.lat.toFixed(6)}, ${m.lng.toFixed(6)} 
          <a href="https://www.google.com/maps?q=${m.lat},${m.lng}" target="_blank" style="margin-left: 8px; font-size: 11px; text-decoration: underline; color: #003D79;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka Google Maps
          </a>
        </div>
      </div>

      <div class="detail-field">
        <label>Nama Pemilik / PIC Usaha</label>
        <div class="val" style="color: #003D79; font-weight: 800;">👤 ${m.namaPic || '-'}</div>
      </div>

      <div class="detail-field">
        <label>No Telepon / Kontak PIC</label>
        <div class="val" style="color: #059669; font-weight: 800;">📞 ${m.telepon || '-'}</div>
      </div>

      <div class="detail-field">
        <label>Sub-Zona & Alamat Lokasi</label>
        <div class="val">${m.alamat} (${m.subZona})</div>
      </div>

      <div class="detail-field">
        <label>Kategori Industri / MCC</label>
        <div class="val">${m.kategori}</div>
      </div>

      <div class="detail-field">
        <label>Estimasi Omset Bulanan</label>
        <div class="val">${m.omsetBulanan || 'Rp 0'}</div>
      </div>

      <div class="detail-field">
        <label>Volume Settlement EDC / QRIS</label>
        <div class="val">${m.volumeSettlement || 'Rp 0'}</div>
      </div>

      <div class="detail-field">
        <label>Potensi Pembiayaan Kredit (KUR/KUM)</label>
        <div class="val-highlight">${m.potensiKredit || 'Rp 0'}</div>
      </div>

      <div class="detail-field">
        <label>Fasilitas Terminal Transaksi</label>
        <div class="val">${m.terminal || 'Prospek LVM / EDC'}</div>
      </div>

      <div class="detail-field">
        <label>Catatan Tim Sales / Relationship Manager</label>
        <div class="val" style="font-weight: 500; font-size: 12px; color: #475569;">${m.keterangan || 'Titik lokasi merchant terverifikasi GPS OSM & Google Maps.'}</div>
      </div>

      <a href="https://wa.me/${waNumber}?text=Halo%20${encodeURIComponent(m.namaUsaha)},%20saya%20RM%20Micro%20Banking%20Bank%20Mandiri%20Region%20V..." target="_blank" class="btn-whatsapp-action">
        <i class="fa-brands fa-whatsapp"></i> Hubungi Pemilik via WhatsApp (${m.telepon || 'Contact'})
      </a>
    `;

    detailPanel.classList.remove('hidden');
  }

  // 7. Render Database Table Modal
  function renderDatabaseTable() {
    if (!dbTableBody) return;
    dbTableBody.innerHTML = '';

    const merchants = getAllMerchants();
    const q = (dbSearchInput ? dbSearchInput.value : '').toLowerCase().trim();

    const filtered = merchants.filter(m => {
      if (!q) return true;
      return m.namaUsaha.toLowerCase().includes(q) ||
             m.alamat.toLowerCase().includes(q) ||
             m.subZona.toLowerCase().includes(q) ||
             m.kategori.toLowerCase().includes(q) ||
             (m.statusLvm || '').toLowerCase().includes(q);
    });

    filtered.forEach(m => {
      const isTarget = (m.statusNasabah === 'TARGET_KUR');
      const isLvmActive = (m.statusLvm === 'LVM Active' || m.statusLvm === 'Sudah LVM');
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td><strong>${m.id}</strong></td>
        <td><strong>${m.namaUsaha}</strong></td>
        <td>
          <button onclick="window.toggleLvmStatus('${m.id}')" style="
            background: ${isLvmActive ? '#D1FAE5' : '#FEF3C7'};
            color: ${isLvmActive ? '#047857' : '#B45309'};
            border: 1px solid ${isLvmActive ? '#A7F3D0' : '#FDE68A'};
            padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;
            display: inline-flex; align-items: center; gap: 4px;
          " title="Klik untuk mengedit status LVM">
            <i class="${isLvmActive ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-question'}"></i>
            ${isLvmActive ? 'LVM Active' : 'Belum LVM'}
          </button>
        </td>
        <td style="font-family: monospace; font-size: 11px; color: #0284C7;">${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}</td>
        <td>${m.subZona}</td>
        <td>${m.kategori}</td>
        <td>${m.omsetBulanan || '-'}</td>
        <td>${m.volumeSettlement || '-'}</td>
        <td><span class="tag-badge ${isTarget ? 'target-kur' : 'debitur'}">${m.statusText || 'Target KUR'}</span></td>
        <td><strong style="color: #003D79;">${m.potensiKredit || '-'}</strong></td>
        <td>${m.terminal || 'Livin Merchant'}</td>
      `;

      dbTableBody.appendChild(tr);
    });
  }

  // 8. Excel Export Handlers (SheetJS)
  function exportExcelTargetKUR() {
    const data = getAllMerchants()
      .filter(m => m.statusNasabah === 'TARGET_KUR')
      .map(m => ({
        "ID Merchant": m.id,
        "Nama Usaha": m.namaUsaha,
        "Status LVM": m.statusLvm || 'Belum LVM',
        "Latitude": m.lat,
        "Longitude": m.lng,
        "Sub-Zona": m.subZona,
        "Kategori": m.kategori,
        "Alamat": m.alamat,
        "Telepon": m.telepon || '-',
        "Omset Bulanan": m.omsetBulanan || '-',
        "Volume Settlement": m.volumeSettlement || '-',
        "Potensi Kredit": m.potensiKredit || '-',
        "Terminal": m.terminal || '-',
        "Catatan Sales": m.keterangan || '-'
      }));

    if (typeof XLSX === 'undefined') {
      alert("Library Excel Export sedang dimuat, silakan coba sebentar lagi.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Target_KUR_BlokM");
    XLSX.writeFile(wb, "Mandiri_RegionV_Target_KUR_BlokM.xlsx");
  }

  function exportExcelAllMerchants() {
    const data = getAllMerchants().map(m => ({
      "ID Merchant": m.id,
      "Nama Usaha": m.namaUsaha,
      "Status LVM": m.statusLvm || 'Belum LVM',
      "Latitude": m.lat,
      "Longitude": m.lng,
      "Sub-Zona": m.subZona,
      "Kategori": m.kategori,
      "Status Nasabah": m.statusText || 'Prospek',
      "Alamat": m.alamat,
      "Telepon": m.telepon || '-',
      "Omset Bulanan": m.omsetBulanan || '-',
      "Volume Settlement": m.volumeSettlement || '-',
      "Potensi Kredit": m.potensiKredit || '-',
      "Terminal": m.terminal || '-'
    }));

    if (typeof XLSX === 'undefined') {
      alert("Library Excel Export sedang dimuat, silakan coba sebentar lagi.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master_Database_BlokM");
    XLSX.writeFile(wb, "Mandiri_RegionV_Master_Database_BlokM.xlsx");
  }

  // 9. DOM Event Listeners Setup
  function setupEventListeners() {
    if (zoneSelect) {
      zoneSelect.addEventListener('change', (e) => {
        selectBlockFilter(e.target.value);
      });
    }

    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        currentCategoryFilter = e.target.value;
        renderMapLayersAndList();
      });
    }

    if (lvmSelect) {
      lvmSelect.addEventListener('change', (e) => {
        currentLvmFilter = e.target.value;
        renderMapLayersAndList();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderMapLayersAndList();
      });
    }

    if (btnModeTarget) btnModeTarget.addEventListener('click', () => setMode('target', btnModeTarget));
    if (btnModeDebitur) btnModeDebitur.addEventListener('click', () => setMode('debitur', btnModeDebitur));
    if (btnModeAll) btnModeAll.addEventListener('click', () => setMode('all', btnModeAll));

    function setMode(mode, btn) {
      currentMode = mode;
      [btnModeTarget, btnModeDebitur, btnModeAll].forEach(b => {
        if (b) b.classList.remove('active');
      });
      if (btn) btn.classList.add('active');
      renderMapLayersAndList();
    }

    if (btnClosePanel) {
      btnClosePanel.addEventListener('click', () => {
        if (detailPanel) detailPanel.classList.add('hidden');
        selectedMerchantId = null;
      });
    }

    if (btnSyncSheet) {
      btnSyncSheet.addEventListener('click', () => {
        syncSheetDataLive(true);
      });
    }

    if (btnOpenDb) {
      btnOpenDb.addEventListener('click', () => {
        if (modalDbOverlay) modalDbOverlay.classList.remove('hidden');
        renderDatabaseTable();
      });
    }

    if (btnCloseDbModal) {
      btnCloseDbModal.addEventListener('click', () => {
        if (modalDbOverlay) modalDbOverlay.classList.add('hidden');
      });
    }

    if (dbSearchInput) {
      dbSearchInput.addEventListener('input', () => {
        renderDatabaseTable();
      });
    }

    if (btnExportExcelTarget) {
      btnExportExcelTarget.addEventListener('click', () => {
        exportExcelTargetKUR();
      });
    }

    if (btnExportExcelModal) {
      btnExportExcelModal.addEventListener('click', () => {
        exportExcelAllMerchants();
      });
    }

    // Sidebar Collapse Engine
    const sidebarLeft = document.getElementById('sidebar-left');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');

    if (sidebarToggleBtn && sidebarLeft) {
      sidebarToggleBtn.addEventListener('click', () => {
        const isCollapsed = sidebarLeft.classList.toggle('collapsed');
        if (sidebarToggleIcon) {
          sidebarToggleIcon.className = isCollapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
        }
        setTimeout(() => {
          if (map) map.invalidateSize();
        }, 310);
      });
    }
  }
});
