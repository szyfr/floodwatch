/* <barangay-map> — Leaflet + OpenStreetMap view of Barangay Magliman,
   San Fernando, Pampanga (15.0286, 120.6682). Real street geometry.
   Mounted from a Design Component via <x-import component-from-global-scope="barangay-map">.
   Attributes: mode=dashboard|picker|mini, pins (JSON), zones (JSON),
               selected, labels, loading, zoom
   Events (bubble, composed): barangay-pin {id}, barangay-pick {lat,lng} */
(function () {
  if (window.__barangayMapDefined) return;
  window.__barangayMapDefined = true;

  var CENTER = [15.0286, 120.6682];
  var COLOR = { ANKLE: '#fbbf24', KNEE: '#f97316', CAR_DEEP: '#ef4444', IMPASSABLE: '#991b1b' };
  var FG = { ANKLE: '#422006', KNEE: '#ffffff', CAR_DEEP: '#ffffff', IMPASSABLE: '#ffffff' };
  var LETTER = { ANKLE: 'A', KNEE: 'K', CAR_DEEP: 'C', IMPASSABLE: 'X' };
  var ZONE_COLOR = { SHELTER: '#16a34a', EVACUATION_POINT: '#0d9488', HIGH_GROUND: '#0284c7' };

  var style = document.createElement('style');
  style.textContent = [
    '@keyframes bm-pop{from{transform:scale(.35);opacity:0}to{transform:scale(1);opacity:1}}',
    '@keyframes bm-ring{0%{transform:scale(.9);opacity:.5}75%{transform:scale(2.3);opacity:0}100%{transform:scale(2.3);opacity:0}}',
    '@keyframes bm-shimmer{0%{background-position:-340px 0}100%{background-position:340px 0}}',
    '.bm-pin{position:relative;width:30px;height:30px;animation:bm-pop 220ms cubic-bezier(.4,0,.2,1) both}',
    '.bm-dot{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
    'border-radius:9999px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);',
    "font:700 12px/1 'Geist',Inter,system-ui,sans-serif;letter-spacing:.02em}",
    '.bm-halo{position:absolute;inset:0;border-radius:9999px;background:var(--bm-c);animation:bm-ring 1.9s ease-out infinite}',
    '.bm-sel .bm-dot{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.35),0 2px 6px rgba(0,0,0,.35)}',
    '.bm-zone{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:7px;',
    'border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.3);color:#fff}',
    '.bm-zone svg{width:14px;height:14px}',
    '.bm-btn{width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:#fff;',
    'border:1px solid rgb(229,229,229);border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.08);cursor:pointer;',
    "color:rgb(10,10,10);font:500 16px/1 'Geist',system-ui,sans-serif;padding:0}",
    '.bm-btn:hover{background:rgb(245,245,245)}',
    '.bm-skel{position:absolute;inset:0;z-index:600;background:rgb(240,239,237)}',
    '.bm-skel::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,0) 0,rgba(255,255,255,.75) 50%,rgba(255,255,255,0) 100%);background-size:340px 100%;background-repeat:no-repeat;animation:bm-shimmer 1.4s ease-in-out infinite}',
    '.bm-attr{font-size:9px !important}',
    '.leaflet-container{background:rgb(237,235,232);font-family:"Geist",Inter,system-ui,sans-serif}'
  ].join('');
  document.head.appendChild(style);

  function waitForL(cb) {
    if (window.L) return cb();
    var t = setInterval(function () { if (window.L) { clearInterval(t); cb(); } }, 40);
  }
  function parse(v, fallback) {
    if (!v) return fallback;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }

  var SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg>';

  class BarangayMap extends HTMLElement {
    static get observedAttributes() { return ['pins', 'zones', 'selected', 'mode', 'labels', 'loading', 'zoom']; }

    connectedCallback() {
      this.style.display = 'block';
      this.style.position = 'absolute';
      this.style.inset = '0';
      this.style.overflow = 'hidden';
      if (this._map) { this._resize(); return; }
      this._holder = document.createElement('div');
      this._holder.style.cssText = 'position:absolute;inset:0';
      this.appendChild(this._holder);
      this._buildChrome();
      this._buildSkeleton();
      waitForL(this._init.bind(this));
    }

    disconnectedCallback() {
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      if (this._map) { this._map.remove(); this._map = null; }
      this.innerHTML = '';
    }

    attributeChangedCallback(name) {
      if (name === 'loading') return this._syncSkeleton();
      if (!this._map) return;
      if (name === 'zoom') this._map.setZoom(Number(this.getAttribute('zoom')) || 16);
      else this._draw();
    }

    get mode() { return this.getAttribute('mode') || 'dashboard'; }

    _buildSkeleton() {
      this._skel = document.createElement('div');
      this._skel.className = 'bm-skel';
      this.appendChild(this._skel);
      this._syncSkeleton();
    }
    _syncSkeleton() {
      if (!this._skel) return;
      var on = this.getAttribute('loading') === '1' || !this._ready;
      this._skel.style.display = on ? 'block' : 'none';
    }

    _buildChrome() {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;right:10px;bottom:10px;z-index:500;display:flex;flex-direction:column;gap:6px';
      var mk = function (label, title) {
        var b = document.createElement('button');
        b.className = 'bm-btn';
        b.type = 'button';
        b.innerHTML = label;
        b.setAttribute('aria-label', title);
        b.title = title;
        return b;
      };
      var zin = mk('+', 'Zoom in');
      var zout = mk('\u2212', 'Zoom out');
      var loc = mk('<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>', 'Center on my location');
      var self = this;
      zin.onclick = function () { self._map && self._map.zoomIn(); };
      zout.onclick = function () { self._map && self._map.zoomOut(); };
      loc.onclick = function () { self._map && self._map.flyTo(CENTER, 16, { duration: 0.7 }); };
      wrap.appendChild(zin); wrap.appendChild(zout);
      if (this.mode !== 'mini') wrap.appendChild(loc);
      this.appendChild(wrap);

      if (this.mode === 'picker') {
        var hint = document.createElement('div');
        hint.style.cssText = 'position:absolute;left:10px;top:10px;z-index:500;background:rgba(255,255,255,.94);' +
          'border:1px solid rgb(229,229,229);border-radius:8px;padding:6px 10px;box-shadow:0 1px 2px rgba(0,0,0,.08);' +
          "font:500 12px/16px 'Geist',system-ui,sans-serif;color:rgb(64,64,64)";
        hint.textContent = 'Tap the map to drop your pin';
        this._hint = hint;
        this.appendChild(hint);
      }
    }

    _init() {
      var self = this;
      var zoom = Number(this.getAttribute('zoom')) || (this.mode === 'picker' ? 16 : 16);
      var map = L.map(this._holder, {
        center: CENTER,
        zoom: zoom,
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: this.mode !== 'mini',
        dragging: this.mode !== 'mini',
        tap: true
      });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri, HERE, Garmin, \u00a9 OpenStreetMap contributors'
      }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, opacity: 0.9
      }).addTo(map);
      map.attributionControl.setPrefix('');
      var ac = map.attributionControl.getContainer();
      if (ac) ac.className += ' bm-attr';

      L.circle(CENTER, {
        radius: 780, color: '#2563eb', weight: 1.5, dashArray: '5 5',
        fillColor: '#2563eb', fillOpacity: 0.04, interactive: false
      }).addTo(map);

      this._map = map;
      this._layer = L.layerGroup().addTo(map);
      this._ready = true;
      this._syncSkeleton();

      if (this.mode === 'picker') {
        map.on('click', function (e) {
          self._setPick(e.latlng.lat, e.latlng.lng);
          self.dispatchEvent(new CustomEvent('barangay-pick', {
            bubbles: true, composed: true,
            detail: { lat: e.latlng.lat, lng: e.latlng.lng }
          }));
        });
      }

      this._ro = new ResizeObserver(function () { self._resize(); });
      this._ro.observe(this);
      this._draw();
      setTimeout(function () { self._resize(); }, 60);
    }

    _resize() { if (this._map) this._map.invalidateSize({ animate: false }); }

    _setPick(lat, lng) {
      if (!this._map) return;
      if (this._pick) this._map.removeLayer(this._pick);
      this._pick = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '', iconSize: [30, 30], iconAnchor: [15, 15],
          html: '<div class="bm-pin"><span class="bm-dot" style="background:#2563eb;color:#fff">\u2713</span></div>'
        })
      }).addTo(this._map);
      if (this._hint) this._hint.textContent = 'Pin placed \u2014 tap again to move it';
    }

    _syncSelection(selected) {
      var els = this._pinEls || {};
      Object.keys(els).forEach(function (id) {
        var el = els[id] && els[id].querySelector('.bm-pin');
        if (!el) return;
        var on = id === selected;
        if (on && el.className.indexOf('bm-sel') === -1) el.className += ' bm-sel';
        if (!on) el.className = el.className.replace(' bm-sel', '');
      });
    }

    _draw() {
      if (!this._map || !this._layer) return;
      var self = this;
      var labels = this.getAttribute('labels') === '1';
      var selected = this.getAttribute('selected') || '';
      var sig = (this.getAttribute('pins') || '') + '|' + (this.getAttribute('zones') || '') + '|' + labels;
      if (sig === this._sig) return this._syncSelection(selected);
      this._sig = sig;
      this._pinEls = {};
      this._layer.clearLayers();

      parse(this.getAttribute('zones'), []).forEach(function (z) {
        var c = ZONE_COLOR[z.type] || '#16a34a';
        L.marker([z.lat, z.lng], {
          icon: L.divIcon({
            className: '', iconSize: [26, 26], iconAnchor: [13, 13],
            html: '<div class="bm-zone" style="background:' + c + '">' + SHIELD + '</div>'
          }),
          zIndexOffset: 100
        }).addTo(self._layer).bindTooltip(z.name, { direction: 'top', offset: [0, -12] });
      });

      parse(this.getAttribute('pins'), []).forEach(function (p) {
        var c = COLOR[p.level] || '#6b7280';
        var html = '<div class="bm-pin' + (selected === p.id ? ' bm-sel' : '') + '" style="--bm-c:' + c + '">' +
          (p.isNew ? '<span class="bm-halo"></span>' : '') +
          '<span class="bm-dot" style="background:' + c + ';color:' + (FG[p.level] || '#fff') + '">' +
          (labels ? (LETTER[p.level] || '\u2022') : '') + '</span></div>';
        var m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: html }),
          zIndexOffset: 200,
          keyboard: true,
          title: p.name
        }).addTo(self._layer);
        self._pinEls[p.id] = m.getElement();
        m.on('click', function () {
          self.dispatchEvent(new CustomEvent('barangay-pin', {
            bubbles: true, composed: true, detail: { id: p.id }
          }));
        });
      });
    }
  }

  customElements.define('barangay-map', BarangayMap);
})();
