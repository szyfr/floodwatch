/* <pampanga-map> — Leaflet + Esri light-gray basemap over the Province of Pampanga.
   level="province": one bubble per city/municipality (size = report count, colour = worst
   reported level) + the Pampanga River corridor and its gauge stations.
   level="lgu": individual flood pins + safe zones for the focused city/municipality.
   Attributes: level, mode=dashboard|picker|mini, lgus, pins, zones, gauges, focus,
               selected, labels, loading
   Events (bubble, composed): flood-pin {id}, flood-lgu {id}, flood-pick {lat,lng} */
(function () {
  if (window.__pampangaMapDefined) return;
  window.__pampangaMapDefined = true;

  var PROVINCE = [15.03, 120.69];
  var PROVINCE_ZOOM = 10;
  var COLOR = { ANKLE: '#fbbf24', KNEE: '#f97316', CAR_DEEP: '#ef4444', IMPASSABLE: '#991b1b' };
  var FG = { ANKLE: '#422006', KNEE: '#ffffff', CAR_DEEP: '#ffffff', IMPASSABLE: '#ffffff' };
  var LETTER = { ANKLE: 'A', KNEE: 'K', CAR_DEEP: 'C', IMPASSABLE: 'X' };
  var ZONE_COLOR = { SHELTER: '#16a34a', EVACUATION_POINT: '#0d9488', HIGH_GROUND: '#0284c7' };
  var ALARM = { NORMAL: '#16a34a', FIRST: '#f59e0b', SECOND: '#ea580c', THIRD: '#dc2626' };

  /* Approximate course of the Pampanga River / Rio Grande de la Pampanga through the province. */
  var RIVER = [
    [15.216, 120.798], [15.170, 120.802], [15.120, 120.808], [15.062, 120.802],
    [15.010, 120.792], [14.978, 120.780], [14.950, 120.764], [14.922, 120.740],
    [14.898, 120.722], [14.874, 120.712], [14.848, 120.706]
  ];
  var RIO_CHICO = [[15.108, 120.860], [15.070, 120.824], [15.030, 120.800], [15.010, 120.792]];

  var style = document.createElement('style');
  style.textContent = [
    '@keyframes pm-pop{from{transform:scale(.35);opacity:0}to{transform:scale(1);opacity:1}}',
    '@keyframes pm-ring{0%{transform:scale(.9);opacity:.5}75%{transform:scale(2.3);opacity:0}100%{transform:scale(2.3);opacity:0}}',
    '@keyframes pm-shimmer{0%{background-position:-340px 0}100%{background-position:340px 0}}',
    '.pm-pin{position:relative;width:30px;height:30px;animation:pm-pop 220ms cubic-bezier(.4,0,.2,1) both}',
    '.pm-dot{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
    'border-radius:9999px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);',
    "font:700 12px/1 'Geist',Inter,system-ui,sans-serif;letter-spacing:.02em}",
    '.pm-halo{position:absolute;inset:0;border-radius:9999px;background:var(--pm-c);animation:pm-ring 1.9s ease-out infinite}',
    '.pm-sel .pm-dot{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.35),0 2px 6px rgba(0,0,0,.35)}',
    '.pm-bub{position:relative;animation:pm-pop 220ms cubic-bezier(.4,0,.2,1) both;cursor:pointer}',
    '.pm-bub b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:9999px;',
    "border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.28);font:700 13px/1 'Geist',Inter,system-ui,sans-serif}",
    '.pm-bub i{position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;',
    "font:600 11px/14px 'Geist',Inter,system-ui,sans-serif;color:#0a0a0a;text-shadow:0 1px 2px #fff,0 0 4px #fff,0 0 8px #fff;font-style:normal}",
    '.pm-bub:hover b{box-shadow:0 0 0 4px rgba(37,99,235,.3),0 2px 8px rgba(0,0,0,.28)}',
    '.pm-zone{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:7px;',
    'border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.3);color:#fff}',
    '.pm-zone svg{width:14px;height:14px}',
    '.pm-gauge{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:6px;',
    'border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.3);color:#fff}',
    '.pm-gauge svg{width:13px;height:13px}',
    '.pm-btn{width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:#fff;',
    'border:1px solid rgb(229,229,229);border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.08);cursor:pointer;',
    "color:rgb(10,10,10);font:500 16px/1 'Geist',system-ui,sans-serif;padding:0}",
    '.pm-btn:hover{background:rgb(245,245,245)}',
    '.pm-skel{position:absolute;inset:0;z-index:600;background:rgb(240,239,237)}',
    '.pm-skel::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,0) 0,rgba(255,255,255,.75) 50%,rgba(255,255,255,0) 100%);background-size:340px 100%;background-repeat:no-repeat;animation:pm-shimmer 1.4s ease-in-out infinite}',
    '.pm-attr{font-size:9px !important}',
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
  var DROP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l5 6.6a6.2 6.2 0 11-10 0z"/></svg>';

  class PampangaMap extends HTMLElement {
    static get observedAttributes() {
      return ['level', 'lgus', 'pins', 'zones', 'gauges', 'focus', 'selected', 'mode', 'labels', 'loading'];
    }

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
      if (name === 'focus' || name === 'level') this._applyFocus();
      this._draw();
    }

    get mode() { return this.getAttribute('mode') || 'dashboard'; }
    get level() { return this.getAttribute('level') || 'province'; }

    _buildSkeleton() {
      this._skel = document.createElement('div');
      this._skel.className = 'pm-skel';
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
        b.className = 'pm-btn';
        b.type = 'button';
        b.innerHTML = label;
        b.setAttribute('aria-label', title);
        b.title = title;
        return b;
      };
      var zin = mk('+', 'Zoom in');
      var zout = mk('\u2212', 'Zoom out');
      var home = mk('<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.2l5-2 6 2 5-2v13.6l-5 2-6-2-5 2z"/><path d="M9 4.2v13.6M15 6.2v13.6"/></svg>', 'Fit the whole province');
      var self = this;
      zin.onclick = function () { self._map && self._map.zoomIn(); };
      zout.onclick = function () { self._map && self._map.zoomOut(); };
      home.onclick = function () { self._map && self._map.flyTo(PROVINCE, PROVINCE_ZOOM, { duration: 0.8 }); };
      wrap.appendChild(zin); wrap.appendChild(zout);
      if (this.mode !== 'mini') wrap.appendChild(home);
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

    _focus() {
      var f = parse(this.getAttribute('focus'), null);
      if (f && typeof f.lat === 'number') return f;
      return { lat: PROVINCE[0], lng: PROVINCE[1], zoom: PROVINCE_ZOOM };
    }

    _init() {
      var self = this;
      var f = this._focus();
      var map = L.map(this._holder, {
        center: [f.lat, f.lng],
        zoom: f.zoom || PROVINCE_ZOOM,
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
      if (ac) ac.className += ' pm-attr';

      this._map = map;
      this._rivers = L.layerGroup().addTo(map);
      L.polyline(RIVER, { color: '#2563eb', weight: 4, opacity: 0.32, lineJoin: 'round', interactive: false }).addTo(this._rivers);
      L.polyline(RIO_CHICO, { color: '#2563eb', weight: 3, opacity: 0.26, lineJoin: 'round', interactive: false }).addTo(this._rivers);
      this._layer = L.layerGroup().addTo(map);
      this._ready = true;
      this._syncSkeleton();

      if (this.mode === 'picker') {
        map.on('click', function (e) {
          self._setPick(e.latlng.lat, e.latlng.lng);
          self.dispatchEvent(new CustomEvent('flood-pick', {
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

    _applyFocus() {
      if (!this._map) return;
      var f = this._focus();
      var key = f.lat + ',' + f.lng + ',' + (f.zoom || '');
      if (key === this._focusKey) return;
      this._focusKey = key;
      this._map.flyTo([f.lat, f.lng], f.zoom || PROVINCE_ZOOM, { duration: 0.8 });
    }

    _setPick(lat, lng) {
      if (!this._map) return;
      if (this._pick) this._map.removeLayer(this._pick);
      this._pick = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '', iconSize: [30, 30], iconAnchor: [15, 15],
          html: '<div class="pm-pin"><span class="pm-dot" style="background:#2563eb;color:#fff">\u2713</span></div>'
        })
      }).addTo(this._map);
      if (this._hint) this._hint.textContent = 'Pin placed \u2014 tap again to move it';
    }

    _syncSelection(selected) {
      var els = this._pinEls || {};
      Object.keys(els).forEach(function (id) {
        var el = els[id] && els[id].querySelector('.pm-pin');
        if (!el) return;
        var on = id === selected;
        if (on && el.className.indexOf('pm-sel') === -1) el.className += ' pm-sel';
        if (!on) el.className = el.className.replace(' pm-sel', '');
      });
    }

    _drawGauges(list) {
      var self = this;
      list.forEach(function (g) {
        var c = ALARM[g.alarm] || ALARM.NORMAL;
        L.marker([g.lat, g.lng], {
          icon: L.divIcon({
            className: '', iconSize: [24, 24], iconAnchor: [12, 12],
            html: '<div class="pm-gauge" style="background:' + c + '">' + DROP + '</div>'
          }),
          zIndexOffset: 150
        }).addTo(self._layer).bindTooltip(g.name + ' \u00b7 ' + g.reading, { direction: 'top', offset: [0, -12] });
      });
    }

    _draw() {
      if (!this._map || !this._layer) return;
      var self = this;
      var labels = this.getAttribute('labels') === '1';
      var selected = this.getAttribute('selected') || '';
      var sig = [this.level, this.getAttribute('lgus') || '', this.getAttribute('pins') || '',
        this.getAttribute('zones') || '', this.getAttribute('gauges') || '', labels].join('|');
      if (sig === this._sig) return this._syncSelection(selected);
      this._sig = sig;
      this._pinEls = {};
      this._layer.clearLayers();

      var gauges = parse(this.getAttribute('gauges'), []);

      if (this.level === 'province') {
        this._drawGauges(gauges);
        parse(this.getAttribute('lgus'), []).forEach(function (m) {
          var c = COLOR[m.worst] || '#a3a3a3';
          var n = m.count || 0;
          var d = n === 0 ? 26 : Math.min(56, 30 + Math.round(Math.sqrt(n) * 7));
          var html = '<div class="pm-bub" style="width:' + d + 'px;height:' + d + 'px">' +
            '<b style="background:' + c + ';color:' + (FG[m.worst] || '#fff') + '">' + (n || '\u00b7') + '</b>' +
            '<i style="top:' + (d + 3) + 'px">' + m.name + '</i></div>';
          var mk = L.marker([m.lat, m.lng], {
            icon: L.divIcon({ className: '', iconSize: [d, d], iconAnchor: [d / 2, d / 2], html: html }),
            zIndexOffset: 200 + n,
            title: m.name
          }).addTo(self._layer);
          mk.on('click', function () {
            self.dispatchEvent(new CustomEvent('flood-lgu', { bubbles: true, composed: true, detail: { id: m.id } }));
          });
        });
        return;
      }

      var f = this._focus();
      L.circle([f.lat, f.lng], {
        radius: 4200, color: '#2563eb', weight: 1.5, dashArray: '5 5',
        fillColor: '#2563eb', fillOpacity: 0.04, interactive: false
      }).addTo(this._layer);

      this._drawGauges(gauges);

      parse(this.getAttribute('zones'), []).forEach(function (z) {
        var c = ZONE_COLOR[z.type] || '#16a34a';
        L.marker([z.lat, z.lng], {
          icon: L.divIcon({
            className: '', iconSize: [26, 26], iconAnchor: [13, 13],
            html: '<div class="pm-zone" style="background:' + c + '">' + SHIELD + '</div>'
          }),
          zIndexOffset: 100
        }).addTo(self._layer).bindTooltip(z.name, { direction: 'top', offset: [0, -12] });
      });

      parse(this.getAttribute('pins'), []).forEach(function (p) {
        var c = COLOR[p.level] || '#6b7280';
        var html = '<div class="pm-pin' + (selected === p.id ? ' pm-sel' : '') + '" style="--pm-c:' + c + '">' +
          (p.isNew ? '<span class="pm-halo"></span>' : '') +
          '<span class="pm-dot" style="background:' + c + ';color:' + (FG[p.level] || '#fff') + '">' +
          (labels ? (LETTER[p.level] || '\u2022') : '') + '</span></div>';
        var m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: html }),
          zIndexOffset: 300,
          keyboard: true,
          title: p.name
        }).addTo(self._layer);
        self._pinEls[p.id] = m.getElement();
        m.on('click', function () {
          self.dispatchEvent(new CustomEvent('flood-pin', { bubbles: true, composed: true, detail: { id: p.id } }));
        });
      });
    }
  }

  customElements.define('pampanga-map', PampangaMap);
})();
