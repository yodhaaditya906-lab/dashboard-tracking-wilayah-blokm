/* ==========================================================================
   BANK MANDIRI REGION V - DASHBOARD TRACKING WILAYAH BLOK M
   Interactive Leaflet Map, GeoJSON Sub-Zonasi & Target KUR/KUM Cross-Selling
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
  let currentMode = 'all'; // Default to 'all' so all merchants and target prospects show immediately
  let searchQuery = '';
  let selectedMerchantId = null;
  let combinedBounds = null;
  let blockLayersMap = {};

  // DOM Elements
  const zoneSelect = document.getElementById('filter-zone');
  const categorySelect = document.getElementById('filter-category');
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

  // Initialize Application safely
  try { initMap(); } catch(e) { console.error("Error initMap:", e); }
  try { renderSubZones(); } catch(e) { console.error("Error renderSubZones:", e); }
  try { updateRibbonStats(); } catch(e) { console.error("Error updateRibbonStats:", e); }
  try { renderMapLayersAndList(); } catch(e) { console.error("Error renderMapLayersAndList:", e); }
  try { setupEventListeners(); } catch(e) { console.error("Error setupEventListeners:", e); }

  // 1. Initialize Map Focused Over Kebayoran Baru (Blok M, Blok C, Blok N)
  function initMap() {
    // Combined LatLngBounds covering Blok M, Blok C, and Blok N
    combinedBounds = L.latLngBounds(
      L.latLng(-6.2535, 106.7920), // South-West (Dharmawangsa / Barito / Blok N boundary)
      L.latLng(-6.2390, 106.8060)  // North-East (Mayestik / Trunojoyo / Melawai boundary)
    );

    map = L.map('map', {
      center: [-6.2445, 106.7990],
      zoom: 15,
      minZoom: 14,
      maxZoom: 19,
      maxBounds: combinedBounds.pad(0.10),
      maxBoundsViscosity: 0.90
    });

    // Create dedicated map pane for inverted masking layer below markers & subzones
    if (!map.getPane('maskPane')) {
      map.createPane('maskPane');
      map.getPane('maskPane').style.zIndex = 350; // Underneath overlayPane (400) and markerPane (600)
    }

    // 1. Google Maps Official Satellite Hybrid Tile Layer (Default)
    const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    });

    // 2. Google Maps Official Standard Roadmap Tile Layer
    const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    });

    // Set Google Hybrid as active default tile layer
    googleHybrid.addTo(map);

    L.control.layers({
      "🛰️ Google Maps Satelit Hibrida (Default)": googleHybrid,
      "🗺️ Google Maps Peta Jalan (Standard Roadmap)": googleRoadmap
    }, null, { position: 'topright' }).addTo(map);

    // Auto-Pan Handler: Restrict map panning to inside combined Kebayoran Baru bounds
    map.on('drag', function() {
      map.panInsideBounds(combinedBounds, { animate: false });
    });

    // Layer stack order: Map -> Inverted Mask -> Dashed Border -> SubZones -> Merchant Pins
    maskGroup.addTo(map);
    boundaryLineGroup.addTo(map);
    zonePolygonsGroup.addTo(map);
    merchantMarkersGroup.addTo(map);

    // Force map to recalculate container size
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 300);
  }

  // 2. Render Multi-Polygon Inverted Mask Layer (3 Holes: Blok M, Blok C, Blok N) & Perimeter Contours
  function renderSubZones() {
    maskGroup.clearLayers();
    boundaryLineGroup.clearLayers();
    zonePolygonsGroup.clearLayers();
    blockLayersMap = {};

    const geojsonDataset = window.BLOKM_ZONES_GEOJSON;
    if (!geojsonDataset || !geojsonDataset.features) return;

    // Outer Ring covering full world coordinates [Latitude, Longitude]
    const outerWorldRing = [
      L.latLng(-90, -180),
      L.latLng(-90, 180),
      L.latLng(90, 180),
      L.latLng(90, -180)
    ];

    // Find the 3 Outer Features: Blok M, Blok C, and Blok N
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

    mainBlocksList.forEach(item => {
      if (item.feature && item.feature.geometry && item.feature.geometry.coordinates) {
        const outerCoords = item.feature.geometry.coordinates[0];
        // Convert GeoJSON [lng, lat] (pt[0]=lng, pt[1]=lat) to Leaflet L.latLng(lat, lng)
        const latLngs = outerCoords.map(pt => L.latLng(pt[1], pt[0]));
        // Hole ring in opposite winding direction for SVG hole punch
        holesLatLngs.push(latLngs.slice().reverse());

        // B. Fine Perimeter Contour Line around each of the 3 Main Blocks
        const blockContourLine = L.polygon(latLngs, {
          color: item.color,      // Accent color per main block
          weight: 4,              // Fine sharp contour stroke
          opacity: 0.95,
          dashArray: '6, 4',     // Professional dashed pattern
          fillColor: item.color,
          fillOpacity: 0.05,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(boundaryLineGroup);

        // Tooltip on Perimeter Contour
        const countInBlock = (window.MASTER_BLOKM_MERCHANTS || []).filter(m => m.zonaUtama === item.label).length;
        blockContourLine.bindTooltip(`
          <div class="spotlight-tooltip-body">
            <div class="spotlight-tooltip-title">
              <i class="fa-solid fa-location-dot" style="color: ${item.color};"></i> ${item.feature.properties.name || item.label}
            </div>
            <div class="spotlight-tooltip-sub">
              <i class="fa-solid fa-store"></i> ${countInBlock} Merchant & Prospect Terdata
            </div>
          </div>
        `, {
          sticky: true,
          className: 'spotlight-boundary-tooltip',
          direction: 'top',
          offset: [0, -10]
        });

        // Hover Illumination Effects
        blockContourLine.on('mouseover', function() {
          this.setStyle({ color: '#FFB700', weight: 6, fillOpacity: 0.16 });
          if (darkMaskPoly) darkMaskPoly.setStyle({ fillOpacity: 0.65 });
        });

        blockContourLine.on('mouseout', function() {
          this.setStyle({ color: item.color, weight: 4, fillOpacity: 0.05 });
          if (darkMaskPoly) darkMaskPoly.setStyle({ fillOpacity: 0.85 });
        });

        blockContourLine.on('click', function() {
          selectBlockFilter(item.label);
        });
      }
    });

    // Create 3-Hole Inverted Mask Layer assigned to maskPane (zIndex 350)
    darkMaskPoly = L.polygon([outerWorldRing, ...holesLatLngs], {
      pane: 'maskPane',        // Placed in maskPane below overlayPane (400) and markerPane (600)
      color: '#0b1329',
      stroke: false,
      fillColor: '#0b1329',    // Sleek Dark Navy Blue matching UI theme
      fillOpacity: 0.85,       // High opacity isolating outer area
      fillRule: 'evenodd',
      interactive: false
    }).addTo(maskGroup);
  }

  // 3. Helper to Select Block Filter & Focus Map
  function selectBlockFilter(blockCode) {
    if (zoneSelect) {
      zoneSelect.value = blockCode;
      currentZoneFilter = blockCode;
      renderMapLayersAndList();
    }

    if (blockCode === 'ALL') {
      if (map && combinedBounds) {
        map.fitBounds(combinedBounds.pad(0.05), { animate: true, duration: 1.2 });
      }
      return;
    }

    let outerId = null;
    if (blockCode === 'Blok M') outerId = 'ZONE_BLOKM_OUTER';
    if (blockCode === 'Blok C') outerId = 'ZONE_BLOKC_OUTER';
    if (blockCode === 'Blok N') outerId = 'ZONE_BLOKN_OUTER';

    if (outerId) {
      const outerFeat = (window.BLOKM_ZONES_GEOJSON.features || []).find(f => f.properties && f.properties.id === outerId);
      if (outerFeat && outerFeat.geometry && outerFeat.geometry.coordinates) {
        const latLngs = outerFeat.geometry.coordinates[0].map(pt => L.latLng(pt[1], pt[0]));
        const bds = L.latLngBounds(latLngs);
        map.flyToBounds(bds.pad(0.08), { duration: 1.2 });
        return;
      }
    }

    const feature = (window.BLOKM_ZONES_GEOJSON.features || []).find(f => f.properties && (f.properties.code === blockCode || f.properties.id === blockCode || (f.properties.name && f.properties.name.includes(blockCode))));
    if (feature) {
      if (feature.geometry && feature.geometry.coordinates) {
        const latLngs = feature.geometry.coordinates[0].map(pt => L.latLng(pt[1], pt[0]));
        const bds = L.latLngBounds(latLngs);
        map.flyToBounds(bds.pad(0.12), { duration: 1.2 });
      } else if (feature.properties && feature.properties.centroid) {
        map.flyTo([feature.properties.centroid[0], feature.properties.centroid[1]], 16.5, { duration: 1.2 });
      }
    }
  }

  // 4. Update Header Stats Ribbon
  function updateRibbonStats() {
    const merchants = window.MASTER_BLOKM_MERCHANTS || [];
    const total = merchants.length;
    const targetKUR = merchants.filter(m => m.statusNasabah === 'TARGET_KUR').length;
    const debitur = merchants.filter(m => m.statusNasabah === 'DEBITUR_EKSISTING').length;

    const statTotal = document.getElementById('stat-total-merchant');
    const statTarget = document.getElementById('stat-target-kur');
    const statDebitur = document.getElementById('stat-debitur-eksisting');

    if (statTotal) statTotal.textContent = total;
    if (statTarget) statTarget.textContent = targetKUR;
    if (statDebitur) statDebitur.textContent = debitur;
  }

  // 5. Render Map Markers and Left Sidebar Cards
  function renderMapLayersAndList() {
    merchantMarkersGroup.clearLayers();
    if (cardsWrapper) cardsWrapper.innerHTML = '';

    const allMerchants = window.MASTER_BLOKM_MERCHANTS || [];

    // Filter Logic
    const filtered = allMerchants.filter(m => {
      // Zone Filter (Supports Main Blocks: Blok M, Blok C, Blok O, and SubZones)
      if (currentZoneFilter !== 'ALL') {
        const matchMain = (m.zonaUtama === currentZoneFilter);
        const matchSub = (m.subZona === currentZoneFilter);
        if (!matchMain && !matchSub) return false;
      }

      // Category Filter
      if (currentCategoryFilter !== 'ALL' && !m.kategori.toLowerCase().includes(currentCategoryFilter.toLowerCase())) return false;

      // Mode Segment Filter
      if (currentMode === 'target' && m.statusNasabah !== 'TARGET_KUR') return false;
      if (currentMode === 'debitur' && m.statusNasabah !== 'DEBITUR_EKSISTING') return false;

      // Search Query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchName = m.namaUsaha.toLowerCase().includes(q);
        const matchAddr = m.alamat.toLowerCase().includes(q);
        const matchCat = m.kategori.toLowerCase().includes(q);
        if (!matchName && !matchAddr && !matchCat) return false;
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
      const accentColor = isTarget ? '#DC2626' : '#059669';

      // A. Add Map Marker
      const markerIcon = L.divIcon({
        className: 'custom-merchant-marker',
        html: `
          <div style="
            width: 32px; height: 32px;
            background: ${accentColor};
            border: 2px solid #FFFFFF;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: #FFFFFF; font-size: 13px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
            cursor: pointer;
            transition: transform 0.2s ease;
          ">
            <i class="${isTarget ? 'fa-solid fa-bullseye' : 'fa-solid fa-building-columns'}"></i>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([m.lat, m.lng], { icon: markerIcon });

      marker.bindPopup(`
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px;">
          <div style="font-size: 13.5px; font-weight: 800; color: #003D79; margin-bottom: 4px;">
            ${m.namaUsaha}
          </div>
          <div style="font-size: 11px; color: #64748B; margin-bottom: 6px;">
            📍 ${m.alamat} (${m.subZona})
          </div>
          <div style="font-size: 11.5px; font-weight: 700; color: ${accentColor}; background: ${isTarget ? '#FEE2E2' : '#D1FAE5'}; padding: 4px 8px; border-radius: 6px; margin-bottom: 8px;">
            ${m.statusText}
          </div>
          <div style="font-size: 11px; color: #334155; margin-bottom: 8px;">
            <strong>Potensi:</strong> ${m.potensiKredit}
          </div>
          <button onclick="window.inspectMerchantDetails('${m.id}')" style="
            width: 100%; background: #003D79; color: #FFFFFF; border: none;
            padding: 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;
          ">Lihat Detail Profil</button>
        </div>
      `);

      marker.on('click', () => {
        showMerchantDetail(m);
      });

      merchantMarkersGroup.addLayer(marker);

      // B. Create Left Sidebar Card
      const card = document.createElement('div');
      card.className = `merchant-card ${selectedMerchantId === m.id ? 'selected' : ''}`;
      card.style.setProperty('--card-accent', accentColor);

      card.innerHTML = `
        <div class="card-top">
          <div class="card-title">${m.namaUsaha}</div>
          <span class="tag-badge ${isTarget ? 'target-kur' : 'debitur'}">
            ${isTarget ? 'Target KUR' : 'Debitur'}
          </span>
        </div>
        <div class="card-sub">
          <i class="fa-solid fa-location-dot"></i> ${m.subZona} • ${m.kategori}
        </div>
        <div class="card-footer-info">
          <div><i class="fa-solid fa-credit-card"></i> ${m.terminal}</div>
          <div class="potensi">${m.potensiKredit.split(' ')[0]} ${m.potensiKredit.split(' ')[1] || ''}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        selectedMerchantId = m.id;
        showMerchantDetail(m);
        map.flyTo([m.lat, m.lng], 17, { duration: 1.0 });
        marker.openPopup();
      });

      if (cardsWrapper) cardsWrapper.appendChild(card);
    });
  }

  // Global inspect helper
  window.inspectMerchantDetails = function(merchantId) {
    const m = (window.MASTER_BLOKM_MERCHANTS || []).find(item => item.id === merchantId);
    if (m) showMerchantDetail(m);
  };

  // 6. Show Merchant Detail Panel
  function showMerchantDetail(m) {
    if (!detailPanel || !panelContent) return;

    selectedMerchantId = m.id;
    const isTarget = (m.statusNasabah === 'TARGET_KUR');
    const waNumber = m.telepon.replace(/^0/, '62');

    panelContent.innerHTML = `
      <div class="detail-field">
        <label>Nama Usaha / Merchant</label>
        <div class="val" style="font-size: 16px; font-weight: 800; color: #003D79;">${m.namaUsaha}</div>
      </div>

      <div class="detail-field">
        <label>Status Nasabah Bank Mandiri</label>
        <div class="val" style="color: ${isTarget ? '#DC2626' : '#059669'}; font-weight: 800;">
          <i class="${isTarget ? 'fa-solid fa-bullseye' : 'fa-solid fa-building-columns'}"></i> ${m.statusText}
        </div>
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
        <label>Estimasi Omset Usaha Bulanan</label>
        <div class="val">${m.omsetBulanan}</div>
      </div>

      <div class="detail-field">
        <label>Volume Settlement EDC / QRIS</label>
        <div class="val">${m.volumeSettlement}</div>
      </div>

      <div class="detail-field">
        <label>Potensi Pembiayaan Kredit (KUR/KUM)</label>
        <div class="val-highlight">${m.potensiKredit}</div>
      </div>

      <div class="detail-field">
        <label>Fasilitas Terminal Transaksi</label>
        <div class="val">${m.terminal}</div>
      </div>

      <div class="detail-field">
        <label>Catatan Tim Sales / Relationship Manager</label>
        <div class="val" style="font-weight: 500; font-size: 12px; color: #475569;">${m.keterangan}</div>
      </div>

      <a href="https://wa.me/${waNumber}?text=Halo%20${encodeURIComponent(m.namaUsaha)},%20saya%20RM%20Micro%20Banking%20Bank%20Mandiri%20Region%20V..." target="_blank" class="btn-whatsapp-action">
        <i class="fa-brands fa-whatsapp"></i> Hubungi Pemilik via WhatsApp (${m.telepon})
      </a>
    `;

    detailPanel.classList.remove('hidden');
  }

  // 7. Render Database Table Modal
  function renderDatabaseTable() {
    if (!dbTableBody) return;
    dbTableBody.innerHTML = '';

    const merchants = window.MASTER_BLOKM_MERCHANTS || [];
    const q = (dbSearchInput ? dbSearchInput.value : '').toLowerCase().trim();

    const filtered = merchants.filter(m => {
      if (!q) return true;
      return m.namaUsaha.toLowerCase().includes(q) ||
             m.alamat.toLowerCase().includes(q) ||
             m.subZona.toLowerCase().includes(q) ||
             m.kategori.toLowerCase().includes(q);
    });

    filtered.forEach(m => {
      const isTarget = (m.statusNasabah === 'TARGET_KUR');
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td><strong>${m.id}</strong></td>
        <td><strong>${m.namaUsaha}</strong></td>
        <td>${m.subZona}</td>
        <td>${m.kategori}</td>
        <td>${m.omsetBulanan}</td>
        <td>${m.volumeSettlement}</td>
        <td><span class="tag-badge ${isTarget ? 'target-kur' : 'debitur'}">${m.statusText}</span></td>
        <td><strong style="color: #003D79;">${m.potensiKredit}</strong></td>
        <td>${m.terminal}</td>
      `;

      dbTableBody.appendChild(tr);
    });
  }

  // 8. Excel Export Handlers (SheetJS)
  function exportExcelTargetKUR() {
    const data = (window.MASTER_BLOKM_MERCHANTS || [])
      .filter(m => m.statusNasabah === 'TARGET_KUR')
      .map(m => ({
        "ID Merchant": m.id,
        "Nama Usaha": m.namaUsaha,
        "Sub-Zona": m.subZona,
        "Kategori": m.kategori,
        "Alamat": m.alamat,
        "Telepon": m.telepon,
        "Omset Bulanan": m.omsetBulanan,
        "Volume Settlement": m.volumeSettlement,
        "Potensi Kredit": m.potensiKredit,
        "Terminal": m.terminal,
        "Catatan Sales": m.keterangan
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
    const data = (window.MASTER_BLOKM_MERCHANTS || []).map(m => ({
      "ID Merchant": m.id,
      "Nama Usaha": m.namaUsaha,
      "Sub-Zona": m.subZona,
      "Kategori": m.kategori,
      "Status Nasabah": m.statusText,
      "Alamat": m.alamat,
      "Telepon": m.telepon,
      "Omset Bulanan": m.omsetBulanan,
      "Volume Settlement": m.volumeSettlement,
      "Potensi Kredit": m.potensiKredit,
      "Terminal": m.terminal
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
