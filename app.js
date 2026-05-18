'use strict';

// ─── Canvas dimensions (fixed) ────────────────────────────────────────────────
const CANVAS_W = 1600;
const CANVAS_H = 1200;

// ─── Zoom & pan ───────────────────────────────────────────────────────────────
let zoom  = 1;
let panX  = 0;
let panY  = 0;
let spaceDown    = false;
let isPanning    = false;
let panStartX    = 0, panStartY = 0;
let panOriginX   = 0, panOriginY = 0;

// Pinch (mobile)
let pinchActive  = false;
let pinch0       = null; // {midX, midY, dist, zoom, panX, panY}

function clampZoom(z) { return Math.max(0.08, Math.min(12, z)); }

function applyViewport() {
  document.getElementById('viewport').style.transform =
    `translate(${panX}px,${panY}px) scale(${zoom})`;
  const lbl = document.getElementById('zoom-label');
  if (lbl) lbl.textContent = Math.round(zoom * 100) + '%';
}

function zoomAt(cx, cy, factor) {
  // cx,cy are in container-relative coords
  const newZoom = clampZoom(zoom * factor);
  panX = cx - (cx - panX) * (newZoom / zoom);
  panY = cy - (cy - panY) * (newZoom / zoom);
  zoom = newZoom;
  applyViewport();
}

function zoomStep(factor) {
  const c = document.getElementById('canvas-container');
  zoomAt(c.clientWidth / 2, c.clientHeight / 2, factor);
}

function zoomReset() {
  zoom = 1;
  const c = document.getElementById('canvas-container');
  panX = Math.max(0, (c.clientWidth  - CANVAS_W) / 2);
  panY = Math.max(0, (c.clientHeight - CANVAS_H) / 2);
  applyViewport();
}

// ─── Layers ───────────────────────────────────────────────────────────────────
let layers         = [];  // [{canvas, ctx, visible, name}]
let activeLayerIdx = 0;

function getCanvas() { return layers[activeLayerIdx].canvas; }
function getCtx()    { return layers[activeLayerIdx].ctx; }

function createLayerCanvas() {
  const c = document.createElement('canvas');
  c.width  = CANVAS_W;
  c.height = CANVAS_H;
  c.className = 'layer-canvas';
  return c;
}

function addNewLayer(name, fillWhite) {
  if (lassoState !== 'idle') lassoStamp();
  name = name || ('Lager ' + (layers.length + 1));
  const c   = createLayerCanvas();
  const ctx = c.getContext('2d');
  if (fillWhite) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }
  const vp    = document.getElementById('viewport');
  const lasso = document.getElementById('lasso-canvas');
  vp.insertBefore(c, lasso);
  layers.push({ canvas: c, ctx, visible: true, name });
  activeLayerIdx = layers.length - 1;
  undoStack.length = 0;
  renderLayersPanel();
}

function deleteLayer(idx) {
  if (layers.length <= 1) return;
  if (lassoState !== 'idle') lassoStamp();
  layers[idx].canvas.remove();
  layers.splice(idx, 1);
  if (activeLayerIdx >= layers.length) activeLayerIdx = layers.length - 1;
  undoStack.length = 0;
  renderLayersPanel();
}

function setActiveLayer(idx) {
  if (lassoState !== 'idle') lassoStamp();
  activeLayerIdx = idx;
  undoStack.length = 0;
  renderLayersPanel();
}

function toggleLayerVisibility(idx) {
  layers[idx].visible = !layers[idx].visible;
  layers[idx].canvas.style.display = layers[idx].visible ? 'block' : 'none';
  renderLayersPanel();
}

// ─── Pages ────────────────────────────────────────────────────────────────────
let pages       = []; // [{layerData:[{imageData,visible,name}]}]
let currentPage = 0;

function saveCurrentPageData() {
  pages[currentPage] = {
    layerData: layers.map(l => ({
      imageData: l.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H),
      visible: l.visible,
      name: l.name
    }))
  };
}

function restorePage(idx) {
  if (lassoState !== 'idle') lassoStamp();
  currentPage = idx;
  const saved = pages[idx];
  const vp    = document.getElementById('viewport');
  const lasso = document.getElementById('lasso-canvas');
  layers.forEach(l => l.canvas.remove());
  layers = [];
  for (const ld of saved.layerData) {
    const c   = createLayerCanvas();
    const ctx = c.getContext('2d');
    ctx.putImageData(ld.imageData, 0, 0);
    c.style.display = ld.visible ? 'block' : 'none';
    vp.insertBefore(c, lasso);
    layers.push({ canvas: c, ctx, visible: ld.visible, name: ld.name });
  }
  activeLayerIdx = 0;
  undoStack.length = 0;
  renderLayersPanel();
  renderPagesPanel();
}

function switchPage(idx) {
  saveCurrentPageData();
  restorePage(idx);
}

function addPage() {
  saveCurrentPageData();
  // Build a blank page with one white background layer
  const c   = createLayerCanvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  pages.push({
    layerData: [{
      imageData: ctx.getImageData(0, 0, CANVAS_W, CANVAS_H),
      visible: true,
      name: 'Bakgrund'
    }]
  });
  restorePage(pages.length - 1);
}

function deletePage(idx) {
  if (pages.length <= 1) return;
  pages.splice(idx, 1);
  const newIdx = Math.min(idx, pages.length - 1);
  restorePage(newIdx);
}

// ─── Panel UI ─────────────────────────────────────────────────────────────────
let panelOpen    = false;
let activeTab    = 'layers';

function togglePanel() {
  panelOpen = !panelOpen;
  document.getElementById('side-panel').classList.toggle('hidden', !panelOpen);
  if (panelOpen) { renderLayersPanel(); renderPagesPanel(); }
}

function showTab(tab) {
  activeTab = tab;
  document.getElementById('tab-layers').classList.toggle('tab-hidden', tab !== 'layers');
  document.getElementById('tab-pages').classList.toggle('tab-hidden',  tab !== 'pages');
  document.getElementById('tab-btn-layers').classList.toggle('active', tab === 'layers');
  document.getElementById('tab-btn-pages').classList.toggle('active',  tab === 'pages');
}

function renderLayersPanel() {
  const list = document.getElementById('layers-list');
  if (!list) return;
  list.innerHTML = '';
  // Show in reverse: top layer first in list
  for (let i = layers.length - 1; i >= 0; i--) {
    const l   = layers[i];
    const div = document.createElement('div');
    div.className = 'layer-item' + (i === activeLayerIdx ? ' active' : '');

    // Visibility button
    const visBtn = document.createElement('button');
    visBtn.className = 'layer-vis';
    visBtn.title = l.visible ? 'Dölj' : 'Visa';
    visBtn.innerHTML = l.visible
      ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="#555"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" fill="#aaa"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';
    visBtn.onclick = (e) => { e.stopPropagation(); toggleLayerVisibility(i); };

    // Thumbnail
    const thumb = document.createElement('canvas');
    thumb.className = 'layer-thumb';
    thumb.width  = 50;
    thumb.height = 38;
    const tctx = thumb.getContext('2d');
    // White bg then layer
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, 50, 38);
    tctx.drawImage(l.canvas, 0, 0, 50, 38);

    // Name (click to select)
    const nameEl = document.createElement('span');
    nameEl.className = 'layer-name';
    nameEl.textContent = l.name;
    nameEl.onclick = () => setActiveLayer(i);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'layer-del';
    delBtn.title = 'Ta bort';
    delBtn.disabled = layers.length <= 1;
    delBtn.innerHTML = '✕';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteLayer(i); };

    div.appendChild(visBtn);
    div.appendChild(thumb);
    div.appendChild(nameEl);
    div.appendChild(delBtn);
    div.onclick = () => setActiveLayer(i);
    list.appendChild(div);
  }
}

function renderPagesPanel() {
  const list = document.getElementById('pages-list');
  if (!list) return;
  list.innerHTML = '';
  pages.forEach((pg, idx) => {
    const div = document.createElement('div');
    div.className = 'page-item' + (idx === currentPage ? ' active' : '');

    const thumb = document.createElement('canvas');
    thumb.className = 'page-thumb';
    thumb.width  = 60;
    thumb.height = 45;
    const tctx = thumb.getContext('2d');
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, 60, 45);
    // composite all visible layers
    for (const ld of pg.layerData) {
      if (!ld.visible) continue;
      const tmp   = document.createElement('canvas');
      tmp.width   = CANVAS_W; tmp.height = CANVAS_H;
      tmp.getContext('2d').putImageData(ld.imageData, 0, 0);
      tctx.drawImage(tmp, 0, 0, 60, 45);
    }

    const lbl = document.createElement('span');
    lbl.className   = 'page-label';
    lbl.textContent = 'Sida ' + (idx + 1);

    const delBtn = document.createElement('button');
    delBtn.className = 'page-del';
    delBtn.disabled  = pages.length <= 1;
    delBtn.innerHTML = '✕';
    delBtn.onclick   = (e) => { e.stopPropagation(); deletePage(idx); };

    div.appendChild(thumb);
    div.appendChild(lbl);
    div.appendChild(delBtn);
    div.onclick = () => { if (idx !== currentPage) switchPage(idx); };
    list.appendChild(div);
  });
}

// ─── Undo ─────────────────────────────────────────────────────────────────────
const undoStack = [];

function saveState() {
  if (undoStack.length >= 20) undoStack.shift();
  undoStack.push(getCtx().getImageData(0, 0, CANVAS_W, CANVAS_H));
}

function undo() {
  if (!undoStack.length) return;
  if (lassoState !== 'idle') lassoStamp();
  getCtx().putImageData(undoStack.pop(), 0, 0);
  renderLayersPanel();
}

// ─── Tool / color / size ──────────────────────────────────────────────────────
let currentTool  = 'pencil';
let currentColor = '#000000';
let brushSize    = 5;
let isDrawing    = false;
let sprayTimer   = null;

function setTool(tool) {
  if (currentTool === 'lasso' && tool !== 'lasso' && lassoState !== 'idle') lassoStamp();
  currentTool = tool;
  document.querySelectorAll('.tool-btn,.mob-btn').forEach(b => b.classList.remove('active'));
  const d = document.getElementById('btn-' + tool);
  const m = document.getElementById('mob-' + tool);
  if (d) d.classList.add('active');
  if (m) m.classList.add('active');
}

function setColor(hex) {
  currentColor = hex;
  ['current-color','mob-color','color-preview-swatch'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.background = hex;
  });
  const lbl = document.getElementById('color-hex-label');
  if (lbl) lbl.textContent = hex.toUpperCase();
}

function pickPreset(hex) {
  setColor(hex);
  syncWheelToColor(hex);
  closeColorPopup();
}

function setBrushSize(val) {
  brushSize = parseInt(val);
  ['size-slider','popup-size-slider'].forEach(id => { const el = document.getElementById(id); if (el) el.value = val; });
  ['size-label','popup-size-label'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = val; });
}

function clearCanvas() {
  if (lassoState !== 'idle') lassoStamp();
  saveState();
  const ctx = getCtx();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  renderLayersPanel();
}

function saveImage() {
  if (lassoState !== 'idle') lassoStamp();
  // Composite all visible layers to a temp canvas
  const tmp   = document.createElement('canvas');
  tmp.width   = CANVAS_W; tmp.height = CANVAS_H;
  const tctx  = tmp.getContext('2d');
  tctx.fillStyle = '#fff';
  tctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (const l of layers) {
    if (l.visible) tctx.drawImage(l.canvas, 0, 0);
  }
  const a = document.createElement('a');
  a.download = 'ritning.png';
  a.href = tmp.toDataURL('image/png');
  a.click();
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function hexRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function rgbHex(r, g, b) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}
function rgba(hex, a) {
  const [r,g,b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`;
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l*255); return [v,v,v]; }
  const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const f = t => {
    if (t<0) t+=1; if (t>1) t-=1;
    if (t<1/6) return p+(q-p)*6*t;
    if (t<1/2) return q;
    if (t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  };
  return [Math.round(f(h+1/3)*255), Math.round(f(h)*255), Math.round(f(h-1/3)*255)];
}

// ─── Color wheel ──────────────────────────────────────────────────────────────
let wheelHue = 0, wheelSat = 0, wheelLightness = .5;

function drawWheel() {
  const wc = document.getElementById('color-wheel');
  if (!wc) return;
  const inner = document.getElementById('color-popup-inner');
  if (!inner || inner.offsetWidth === 0) { setTimeout(drawWheel, 80); return; }
  const size = Math.min(inner.offsetWidth - 38, 256);
  if (size < 30) { setTimeout(drawWheel, 80); return; }
  wc.width = wc.height = size;
  const wctx = wc.getContext('2d');
  const cx = size / 2, r = cx - 2;
  const img  = wctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cx;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const i = (y*size + x) * 4;
      if (dist <= r) {
        const hue = ((Math.atan2(dy, dx)*180/Math.PI) + 360) % 360;
        const [rv, gv, bv] = hslToRgb(hue/360, dist/r, wheelLightness);
        data[i]=rv; data[i+1]=gv; data[i+2]=bv; data[i+3]=255;
      }
    }
  }
  wctx.putImageData(img, 0, 0);
  const angle = wheelHue * Math.PI / 180;
  const sr    = wheelSat * r;
  const ix    = cx + sr * Math.cos(angle);
  const iy    = cx + sr * Math.sin(angle);
  wctx.beginPath(); wctx.arc(ix, iy, 13, 0, Math.PI*2);
  wctx.strokeStyle = 'rgba(0,0,0,.6)'; wctx.lineWidth = 3; wctx.stroke();
  wctx.beginPath(); wctx.arc(ix, iy, 11, 0, Math.PI*2);
  wctx.strokeStyle = '#fff'; wctx.lineWidth = 3; wctx.stroke();
  wctx.beginPath(); wctx.arc(ix, iy, 9, 0, Math.PI*2);
  wctx.fillStyle = currentColor; wctx.fill();
}

function pickWheelColor(clientX, clientY) {
  const wc = document.getElementById('color-wheel');
  if (!wc || wc.width === 0) return;
  const rect = wc.getBoundingClientRect();
  const sx = wc.width / rect.width, sy = wc.height / rect.height;
  const cx = wc.width / 2, r = cx - 2;
  const dx = (clientX - rect.left)*sx - cx;
  const dy = (clientY - rect.top)*sy  - cx;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist > cx) return;
  wheelHue = ((Math.atan2(dy, dx)*180/Math.PI) + 360) % 360;
  wheelSat = Math.min(dist / r, 1);
  const [rv,gv,bv] = hslToRgb(wheelHue/360, wheelSat, wheelLightness);
  setColor(rgbHex(rv, gv, bv));
  drawWheel();
}

function onLightnessChange(val) {
  wheelLightness = parseInt(val) / 100;
  const [rv,gv,bv] = hslToRgb(wheelHue/360, wheelSat, wheelLightness);
  setColor(rgbHex(rv, gv, bv));
  drawWheel();
}

function syncWheelToColor(hex) {
  const [r,g,b] = hexRgb(hex).map(v => v/255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max+min)/2;
  let s=0, h=0;
  if (max !== min) {
    const d = max-min;
    s = l>.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h=((g-b)/d+(g<b?6:0))/6; break;
      case g: h=((b-r)/d+2)/6; break;
      case b: h=((r-g)/d+4)/6; break;
    }
  }
  wheelHue=h*360; wheelSat=s; wheelLightness=l;
  const ls = document.getElementById('lightness-slider');
  if (ls) ls.value = Math.round(l*100);
}

function setupWheelEvents() {
  const wc = document.getElementById('color-wheel');
  if (!wc) return;
  wc.addEventListener('mousedown', e => { e.preventDefault(); pickWheelColor(e.clientX, e.clientY); });
  wc.addEventListener('mousemove', e => { if (e.buttons===1) pickWheelColor(e.clientX, e.clientY); });
  wc.addEventListener('touchstart', e => { e.preventDefault(); pickWheelColor(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  wc.addEventListener('touchmove',  e => { e.preventDefault(); pickWheelColor(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
}

// ─── Color popup ──────────────────────────────────────────────────────────────
function openColorPopup() {
  document.getElementById('color-popup').classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(drawWheel));
}
function closeColorPopup() {
  document.getElementById('color-popup').classList.add('hidden');
}
function handlePopupBackdrop(e) {
  if (e.target === document.getElementById('color-popup')) closeColorPopup();
}

// ─── Brushes ──────────────────────────────────────────────────────────────────
function applyPencil(x, y) {
  const ctx = getCtx();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor; ctx.lineWidth = brushSize;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineTo(x, y); ctx.stroke();
}

function applyBrush(x, y) {
  const ctx = getCtx();
  ctx.globalAlpha = 0.3; ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor; ctx.lineWidth = brushSize * 4;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineTo(x, y); ctx.stroke();
}

function applyMarker(x, y) {
  const ctx = getCtx();
  ctx.globalAlpha = 0.8; ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor; ctx.lineWidth = brushSize * 2.5;
  ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
  ctx.lineTo(x, y); ctx.stroke();
}

function applySoft(x, y) {
  const ctx = getCtx();
  const r   = brushSize * 4;
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0,   rgba(currentColor, 0.25));
  grad.addColorStop(0.4, rgba(currentColor, 0.12));
  grad.addColorStop(1,   rgba(currentColor, 0));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
}

function applyWatercolor(x, y) {
  const ctx    = getCtx();
  const baseR  = brushSize * 2.5;
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * brushSize;
    const bx    = x + Math.cos(angle) * dist;
    const by    = y + Math.sin(angle) * dist;
    const r     = baseR * (0.5 + Math.random() * 0.8);
    const grad  = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    const a     = 0.025 + Math.random() * 0.025;
    grad.addColorStop(0,    rgba(currentColor, a * 0.5));
    grad.addColorStop(0.65, rgba(currentColor, a));
    grad.addColorStop(0.9,  rgba(currentColor, a * 1.8));
    grad.addColorStop(1,    rgba(currentColor, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI*2); ctx.fill();
  }
}

function applyPastel(x, y) {
  const ctx = getCtx();
  const r   = brushSize * 2;
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < brushSize * 5 + 15; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * r;
    const px    = x + Math.cos(angle) * dist;
    const py    = y + Math.sin(angle) * dist;
    ctx.globalAlpha = Math.random() * 0.35 + 0.05;
    ctx.fillStyle   = currentColor;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillRect(0, 0, Math.random() * 3 + 0.8, Math.random() * 1.5 + 0.4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function applyBlend(x, y) {
  const canvas = getCanvas();
  const ctx    = getCtx();
  const r      = Math.max(8, brushSize * 2);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.clip();
  ctx.filter    = `blur(${Math.max(2, Math.round(brushSize * 0.8))}px)`;
  ctx.globalAlpha = 0.6;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

function doSpray(x, y) {
  const ctx = getCtx();
  const r   = brushSize * 2.5;
  const n   = Math.max(20, brushSize * 5);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = currentColor;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    ctx.beginPath();
    ctx.arc(x + d*Math.cos(a), y + d*Math.sin(a), 0.8, 0, Math.PI*2);
    ctx.fill();
  }
}

function applyEraser(x, y) {
  const ctx = getCtx();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  ctx.lineWidth   = brushSize * 4;
  ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
  ctx.lineTo(x, y); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function floodFill(sx, sy, fillHex) {
  const canvas = getCanvas();
  const ctx    = getCtx();
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= CANVAS_W || sy >= CANVAS_H) return;
  const [fr,fg,fb] = hexRgb(fillHex);
  const id = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const d  = id.data, W = CANVAS_W, H = CANVAS_H;
  const i0 = (sy*W+sx)*4;
  const sr=d[i0], sg=d[i0+1], sb=d[i0+2], sa=d[i0+3];
  if (sr===fr && sg===fg && sb===fb && sa===255) return;
  const match = i => Math.abs(d[i]-sr)<32 && Math.abs(d[i+1]-sg)<32 && Math.abs(d[i+2]-sb)<32 && Math.abs(d[i+3]-sa)<32;
  const paint = i => { d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255; };
  const vis   = new Uint8Array(W*H);
  const stk   = [i0]; vis[i0/4] = 1;
  while (stk.length) {
    const i = stk.pop(); if (!match(i)) continue; paint(i);
    const x = (i/4)%W, y = Math.floor((i/4)/W);
    for (const ni of [x>0?i-4:-1, x<W-1?i+4:-1, y>0?i-W*4:-1, y<H-1?i+W*4:-1]) {
      if (ni >= 0 && !vis[ni/4]) { vis[ni/4]=1; stk.push(ni); }
    }
  }
  ctx.putImageData(id, 0, 0);
}

// ─── Lasso tool ───────────────────────────────────────────────────────────────
let lassoState   = 'idle';
let lassoPoints  = [];
let lassoBase    = null;
let lassoCut     = null;
let lassoBBox    = null;
let lassoOffset  = {x:0, y:0};
let lassoPrevPos = {x:0, y:0};
let lassoAnimId  = null;
let lassoDash    = 0;

function lassoBounds(pts) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const p of pts) {
    if (p.x<minX) minX=p.x; if (p.y<minY) minY=p.y;
    if (p.x>maxX) maxX=p.x; if (p.y>maxY) maxY=p.y;
  }
  return { x:Math.floor(minX), y:Math.floor(minY),
           w:Math.ceil(maxX)-Math.floor(minX)+1,
           h:Math.ceil(maxY)-Math.floor(minY)+1 };
}

function pointInLasso(px, py) {
  const ox = lassoOffset.x, oy = lassoOffset.y;
  let inside = false;
  for (let i=0, j=lassoPoints.length-1; i<lassoPoints.length; j=i++) {
    const xi=lassoPoints[i].x+ox, yi=lassoPoints[i].y+oy;
    const xj=lassoPoints[j].x+ox, yj=lassoPoints[j].y+oy;
    if (((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi)) inside = !inside;
  }
  return inside;
}

function drawLassoPath(lctx, offsetX, offsetY, close) {
  if (lassoPoints.length < 2) return;
  lctx.beginPath();
  lctx.moveTo(lassoPoints[0].x+offsetX, lassoPoints[0].y+offsetY);
  for (let i=1; i<lassoPoints.length; i++) lctx.lineTo(lassoPoints[i].x+offsetX, lassoPoints[i].y+offsetY);
  if (close) lctx.closePath();
}

function lassoAnimLoop() {
  const lc = document.getElementById('lasso-canvas');
  if (!lc) return;
  const lctx = lc.getContext('2d');
  lctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const ox     = lassoOffset.x, oy = lassoOffset.y;
  const closed = lassoState === 'ready' || lassoState === 'moving';
  lctx.save();
  lctx.lineWidth = 1.5;
  lctx.setLineDash([6,4]); lctx.lineDashOffset = -lassoDash;
  lctx.strokeStyle = '#fff';
  drawLassoPath(lctx, ox, oy, closed); lctx.stroke();
  lctx.lineDashOffset = -lassoDash + 5;
  lctx.strokeStyle = 'rgba(0,0,0,0.7)';
  drawLassoPath(lctx, ox, oy, closed); lctx.stroke();
  lctx.restore();
  lassoDash = (lassoDash + 0.4) % 10;
  lassoAnimId = requestAnimationFrame(lassoAnimLoop);
}

function startLassoAnim() { if (!lassoAnimId) lassoAnimLoop(); }
function stopLassoAnim() {
  if (lassoAnimId) { cancelAnimationFrame(lassoAnimId); lassoAnimId = null; }
  const lc = document.getElementById('lasso-canvas');
  if (lc) lc.getContext('2d').clearRect(0, 0, CANVAS_W, CANVAS_H);
}

function lassoComplete() {
  if (lassoPoints.length < 5) { lassoReset(); return; }
  const bb = lassoBounds(lassoPoints);
  bb.x = Math.max(0, bb.x); bb.y = Math.max(0, bb.y);
  bb.w = Math.min(CANVAS_W - bb.x, bb.w);
  bb.h = Math.min(CANVAS_H - bb.y, bb.h);
  if (bb.w < 2 || bb.h < 2) { lassoReset(); return; }
  saveState();
  lassoCut = document.createElement('canvas');
  lassoCut.width = bb.w; lassoCut.height = bb.h;
  const cctx = lassoCut.getContext('2d');
  cctx.save();
  cctx.beginPath();
  cctx.moveTo(lassoPoints[0].x - bb.x, lassoPoints[0].y - bb.y);
  for (let i=1; i<lassoPoints.length; i++) cctx.lineTo(lassoPoints[i].x-bb.x, lassoPoints[i].y-bb.y);
  cctx.closePath(); cctx.clip();
  cctx.drawImage(getCanvas(), -bb.x, -bb.y);
  cctx.restore();
  lassoBBox = bb;
  const ctx = getCtx();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
  for (let i=1; i<lassoPoints.length; i++) ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  lassoBase   = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  lassoOffset = {x:0, y:0};
  lassoState  = 'ready';
  startLassoAnim();
}

function lassoRedraw() {
  const ctx = getCtx();
  ctx.putImageData(lassoBase, 0, 0);
  if (lassoCut) ctx.drawImage(lassoCut, lassoBBox.x + lassoOffset.x, lassoBBox.y + lassoOffset.y);
}

function lassoStamp() { lassoRedraw(); stopLassoAnim(); lassoReset(); renderLayersPanel(); }

function lassoCommitOffset() {
  lassoPoints = lassoPoints.map(p => ({x: p.x+lassoOffset.x, y: p.y+lassoOffset.y}));
  lassoBBox   = { x: lassoBBox.x+lassoOffset.x, y: lassoBBox.y+lassoOffset.y, w:lassoBBox.w, h:lassoBBox.h };
  lassoOffset = {x:0, y:0};
  const ctx = getCtx();
  ctx.putImageData(lassoBase, 0, 0);
  ctx.drawImage(lassoCut, lassoBBox.x, lassoBBox.y);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
  for (let i=1; i<lassoPoints.length; i++) ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
  ctx.closePath();
  ctx.globalCompositeOperation = 'destination-out'; ctx.fill();
  ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  lassoBase = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
}

function lassoReset() {
  lassoState = 'idle'; lassoPoints = []; lassoBase = null;
  lassoCut = null; lassoBBox = null; lassoOffset = {x:0,y:0};
}

function lassoDown(x, y) {
  if (lassoState === 'idle' || lassoState === 'drawing') {
    stopLassoAnim(); lassoReset();
    lassoState = 'drawing'; lassoPoints = [{x,y}]; startLassoAnim();
  } else if (lassoState === 'ready') {
    if (pointInLasso(x, y)) {
      lassoState = 'moving'; lassoPrevPos = {x,y};
    } else {
      lassoStamp(); lassoState = 'drawing'; lassoPoints = [{x,y}]; startLassoAnim();
    }
  } else if (lassoState === 'moving') {
    lassoPrevPos = {x,y};
  }
}

function lassoMove(x, y) {
  if (lassoState === 'drawing') {
    lassoPoints.push({x,y});
    if (lassoPoints.length > 600) lassoPoints.splice(100, lassoPoints.length - 600);
  } else if (lassoState === 'moving') {
    lassoOffset.x += x - lassoPrevPos.x;
    lassoOffset.y += y - lassoPrevPos.y;
    lassoPrevPos = {x,y};
    lassoRedraw();
  }
}

function lassoUp() {
  if (lassoState === 'drawing') { lassoComplete(); }
  else if (lassoState === 'moving') { lassoCommitOffset(); lassoState = 'ready'; }
}

// ─── Coordinate helper ────────────────────────────────────────────────────────
function getPos(clientX, clientY) {
  const rect = document.getElementById('canvas-container').getBoundingClientRect();
  return {
    x: (clientX - rect.left - panX) / zoom,
    y: (clientY - rect.top  - panY) / zoom
  };
}

// ─── Drawing dispatch ─────────────────────────────────────────────────────────
function startDraw(x, y) {
  if (currentTool === 'lasso') { lassoDown(x, y); return; }
  if (currentTool === 'fill')  { saveState(); floodFill(x, y, currentColor); renderLayersPanel(); return; }
  if (currentTool === 'spray') { saveState(); doSpray(x, y); sprayTimer = setInterval(() => doSpray(x, y), 40); return; }
  saveState();
  const ctx = getCtx();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.moveTo(x, y);
}

function moveDraw(x, y) {
  if (currentTool === 'lasso')     { lassoMove(x, y); return; }
  if (currentTool === 'fill')      return;
  if (currentTool === 'spray')     { doSpray(x, y); return; }
  if (currentTool === 'soft')      { applySoft(x, y); return; }
  if (currentTool === 'watercolor'){ applyWatercolor(x, y); return; }
  if (currentTool === 'pastel')    { applyPastel(x, y); return; }
  if (currentTool === 'blend')     { applyBlend(x, y); return; }
  if (currentTool === 'pencil')    applyPencil(x, y);
  else if (currentTool === 'brush')  applyBrush(x, y);
  else if (currentTool === 'marker') applyMarker(x, y);
  else if (currentTool === 'eraser') applyEraser(x, y);
}

function endDraw() {
  if (currentTool === 'lasso') { lassoUp(); return; }
  const ctx = getCtx();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (sprayTimer) { clearInterval(sprayTimer); sprayTimer = null; }
  renderLayersPanel();
}

// ─── Events on canvas-container ──────────────────────────────────────────────
const container = document.getElementById('canvas-container');

// Mouse
container.addEventListener('mousedown', e => {
  if (e.button === 1 || spaceDown) {
    // Pan
    isPanning = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panOriginX = panX; panOriginY = panY;
    container.classList.add('panning-active');
    e.preventDefault(); return;
  }
  e.preventDefault();
  isDrawing = true;
  const p = getPos(e.clientX, e.clientY);
  startDraw(p.x, p.y);
});

container.addEventListener('mousemove', e => {
  if (isPanning) {
    panX = panOriginX + (e.clientX - panStartX);
    panY = panOriginY + (e.clientY - panStartY);
    applyViewport(); return;
  }
  if (!isDrawing) return;
  e.preventDefault();
  const p = getPos(e.clientX, e.clientY);
  moveDraw(p.x, p.y);
});

container.addEventListener('mouseup', e => {
  if (isPanning) { isPanning = false; container.classList.remove('panning-active'); return; }
  if (!isDrawing) return;
  isDrawing = false; endDraw();
});

container.addEventListener('mouseleave', () => {
  isPanning = false; container.classList.remove('panning-active');
  if (isDrawing) { isDrawing = false; endDraw(); }
});

// Mouse wheel zoom
container.addEventListener('wheel', e => {
  e.preventDefault();
  const rect   = container.getBoundingClientRect();
  const cx     = e.clientX - rect.left;
  const cy     = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  zoomAt(cx, cy, factor);
}, {passive: false});

// Touch
container.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    // Start pinch
    if (isDrawing) { isDrawing = false; endDraw(); }
    const t0 = e.touches[0], t1 = e.touches[1];
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const rect = container.getBoundingClientRect();
    pinch0 = { midX: midX - rect.left, midY: midY - rect.top, dist, zoom, panX, panY };
    pinchActive = true;
    return;
  }
  if (e.touches.length === 1 && !pinchActive) {
    isDrawing = true;
    const p = getPos(e.touches[0].clientX, e.touches[0].clientY);
    startDraw(p.x, p.y);
  }
}, {passive: false});

container.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2 && pinchActive && pinch0) {
    const t0   = e.touches[0], t1 = e.touches[1];
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const rect = container.getBoundingClientRect();
    const curMidX = midX - rect.left;
    const curMidY = midY - rect.top;
    const newZoom = clampZoom(pinch0.zoom * (dist / pinch0.dist));
    // The canvas point under initial pinch midpoint:
    const px = (pinch0.midX - pinch0.panX) / pinch0.zoom;
    const py = (pinch0.midY - pinch0.panY) / pinch0.zoom;
    // After zoom, that point should sit under current midpoint:
    panX = curMidX - px * newZoom;
    panY = curMidY - py * newZoom;
    zoom = newZoom;
    applyViewport(); return;
  }
  if (!isDrawing) return;
  const p = getPos(e.touches[0].clientX, e.touches[0].clientY);
  moveDraw(p.x, p.y);
}, {passive: false});

container.addEventListener('touchend', e => {
  e.preventDefault();
  if (pinchActive && e.touches.length < 2) { pinchActive = false; pinch0 = null; return; }
  if (isDrawing) { isDrawing = false; endDraw(); }
}, {passive: false});

container.addEventListener('touchcancel', () => {
  pinchActive = false; pinch0 = null;
  if (isDrawing) { isDrawing = false; endDraw(); }
});

// ─── Keyboard ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === ' ' && !spaceDown) {
    spaceDown = true;
    container.classList.add('panning');
    e.preventDefault(); return;
  }
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 's') { e.preventDefault(); saveImage(); return; }
    if (e.key === '=') { e.preventDefault(); zoomStep(1.25); return; }
    if (e.key === '-') { e.preventDefault(); zoomStep(0.8);  return; }
    if (e.key === '0') { e.preventDefault(); zoomReset();    return; }
    return;
  }
  const map = {p:'pencil',b:'brush',m:'marker',a:'soft',w:'watercolor',
               t:'pastel',d:'blend',y:'spray',f:'fill',l:'lasso',e:'eraser'};
  if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  if (e.key === '+') zoomStep(1.25);
  if (e.key === '-') zoomStep(0.8);
  if (e.key === '0') zoomReset();
});

document.addEventListener('keyup', e => {
  if (e.key === ' ') {
    spaceDown = false;
    container.classList.remove('panning');
    if (isPanning) { isPanning = false; container.classList.remove('panning-active'); }
  }
});

// ─── Window resize ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (!document.getElementById('color-popup').classList.contains('hidden')) drawWheel();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  // Size the lasso canvas to match drawing canvases
  const lasso   = document.getElementById('lasso-canvas');
  lasso.width   = CANVAS_W;
  lasso.height  = CANVAS_H;

  // Size the viewport element
  const vp      = document.getElementById('viewport');
  vp.style.width  = CANVAS_W + 'px';
  vp.style.height = CANVAS_H + 'px';

  // Add initial background layer
  addNewLayer('Bakgrund', true);

  // Center the canvas
  const c = document.getElementById('canvas-container');
  panX = Math.max(0, (c.clientWidth  - CANVAS_W) / 2);
  panY = Math.max(0, (c.clientHeight - CANVAS_H) / 2);
  applyViewport();

  // Build initial pages array
  pages = [{
    layerData: layers.map(l => ({
      imageData: l.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H),
      visible: l.visible,
      name: l.name
    }))
  }];

  // Kick off panel (hidden)
  document.getElementById('side-panel').classList.add('hidden');

  setColor('#000000');
  setBrushSize(5);
  setTool('pencil');
  setupWheelEvents();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
