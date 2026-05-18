'use strict';

// ── Drawing canvas ──────────────────────────────────────────────────────────
const canvas = document.getElementById('drawing-canvas');
const ctx    = canvas.getContext('2d');

let currentTool   = 'pencil';
let currentColor  = '#000000';
let brushSize     = 5;
let isDrawing     = false;
let sprayInterval = null;
const undoStack   = [];

function resizeCanvas() {
  const el = document.getElementById('canvas-container');
  const w = el.clientWidth, h = el.clientHeight;
  const img = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
  canvas.width = w; canvas.height = h;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  if (img) ctx.putImageData(img, 0, 0);
}
window.addEventListener('resize', () => {
  resizeCanvas();
  if (!document.getElementById('color-popup').classList.contains('hidden')) drawWheel();
});
resizeCanvas();

// ── Undo ────────────────────────────────────────────────────────────────────
function saveState() {
  if (undoStack.length >= 20) undoStack.shift();
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}
function undo() {
  if (undoStack.length) ctx.putImageData(undoStack.pop(), 0, 0);
}

// ── Tools ───────────────────────────────────────────────────────────────────
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn,.mob-btn').forEach(b => b.classList.remove('active'));
  const a = document.getElementById('btn-' + tool);
  const b = document.getElementById('mob-' + tool);
  if (a) a.classList.add('active');
  if (b) b.classList.add('active');
}

function setColor(hex) {
  currentColor = hex;
  const els = ['current-color','mob-color','color-preview-swatch'];
  els.forEach(id => { const el = document.getElementById(id); if (el) el.style.background = hex; });
  const lbl = document.getElementById('color-hex-label');
  if (lbl) lbl.textContent = hex.toUpperCase();
}

function setColorAndClose(hex) {
  setColor(hex);
  syncWheelToColor(hex);
  closeColorPopup();
}

function setBrushSize(val) {
  brushSize = parseInt(val);
  ['size-slider','popup-size-slider'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = val;
  });
  ['size-label','popup-size-label'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = val;
  });
}

function clearCanvas() {
  saveState();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function saveImage() {
  const a = document.createElement('a');
  a.download = 'ritning.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

// ── Color helpers ────────────────────────────────────────────────────────────
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l*255); return [v,v,v]; }
  const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const f = t => {
    if (t<0) t+=1; if (t>1) t-=1;
    if (t<1/6) return p+(q-p)*6*t;
    if (t<1/2) return q;
    if (t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  };
  return [Math.round(f(h+1/3)*255), Math.round(f(h)*255), Math.round(f(h-1/3)*255)];
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

// ── Color wheel ──────────────────────────────────────────────────────────────
// Accessed lazily — no crash if HTML version mismatches during cache transition
let wheelHue = 0, wheelSat = 0, wheelLightness = 0.5;

function getWheelCanvas() {
  return document.getElementById('color-wheel');
}

function drawWheel() {
  const wc = getWheelCanvas();
  if (!wc) return;
  const inner = document.getElementById('color-popup-inner');
  if (!inner || inner.offsetWidth === 0) { setTimeout(drawWheel, 80); return; }

  const size   = Math.min(inner.offsetWidth - 40, 260);
  if (size < 30) { setTimeout(drawWheel, 80); return; }

  wc.width = wc.height = size;
  const wctx   = wc.getContext('2d');
  const cx     = size / 2;
  const radius = size / 2 - 2;

  // Pixel-by-pixel HSL wheel — guaranteed to render in all browsers
  const img  = wctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cx;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const i = (y * size + x) * 4;
      if (dist <= radius) {
        const hue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
        const sat = dist / radius;
        const [r,g,b] = hslToRgb(hue/360, sat, wheelLightness);
        data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=255;
      }
    }
  }
  wctx.putImageData(img, 0, 0);

  // Draw selector: filled circle showing current color + white+black rings
  const angle = wheelHue * Math.PI / 180;
  const rr    = wheelSat * radius;
  const ix    = cx + rr * Math.cos(angle);
  const iy    = cx + rr * Math.sin(angle);

  // Outer dark ring
  wctx.beginPath();
  wctx.arc(ix, iy, 13, 0, Math.PI*2);
  wctx.strokeStyle = 'rgba(0,0,0,0.6)';
  wctx.lineWidth   = 3;
  wctx.stroke();

  // White ring
  wctx.beginPath();
  wctx.arc(ix, iy, 11, 0, Math.PI*2);
  wctx.strokeStyle = '#fff';
  wctx.lineWidth   = 3;
  wctx.stroke();

  // Filled with current color so you can see what's selected
  wctx.beginPath();
  wctx.arc(ix, iy, 9, 0, Math.PI*2);
  wctx.fillStyle = currentColor;
  wctx.fill();
}

function pickWheelColor(clientX, clientY) {
  const wc = getWheelCanvas();
  if (!wc) return;
  const rect   = wc.getBoundingClientRect();
  const scaleX = wc.width  / rect.width;
  const scaleY = wc.height / rect.height;
  const cx     = wc.width  / 2;
  const radius = cx - 2;
  const dx     = (clientX - rect.left) * scaleX - cx;
  const dy     = (clientY - rect.top)  * scaleY - cx;
  const dist   = Math.sqrt(dx*dx + dy*dy);
  if (dist > cx) return;

  wheelHue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
  wheelSat = Math.min(dist / radius, 1);
  const [r,g,b] = hslToRgb(wheelHue/360, wheelSat, wheelLightness);
  setColor(rgbToHex(r, g, b));
  drawWheel();
}

function onLightnessChange(val) {
  wheelLightness = parseInt(val) / 100;
  const [r,g,b] = hslToRgb(wheelHue/360, wheelSat, wheelLightness);
  setColor(rgbToHex(r, g, b));
  drawWheel();
}

function syncWheelToColor(hex) {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max+min)/2;
  let s=0, h=0;
  if (max !== min) {
    const d = max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
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

// Wheel mouse
function setupWheelEvents() {
  const wc = getWheelCanvas();
  if (!wc) return;
  wc.addEventListener('mousedown', e => { e.preventDefault(); pickWheelColor(e.clientX, e.clientY); });
  wc.addEventListener('mousemove', e => { if (e.buttons===1) pickWheelColor(e.clientX, e.clientY); });
  wc.addEventListener('touchstart', e => { e.preventDefault(); pickWheelColor(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  wc.addEventListener('touchmove',  e => { e.preventDefault(); pickWheelColor(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
}

// ── Color popup ──────────────────────────────────────────────────────────────
function openColorPopup() {
  document.getElementById('color-popup').classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(drawWheel));
}
function closeColorPopup() {
  document.getElementById('color-popup').classList.add('hidden');
}
function handlePopupBackdropClick(e) {
  if (e.target === document.getElementById('color-popup')) closeColorPopup();
}

// ── Drawing ──────────────────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches.length)
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function applyTool(x, y) {
  switch (currentTool) {
    case 'pencil':
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentColor; ctx.lineWidth = brushSize;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineTo(x, y); ctx.stroke();
      break;
    case 'brush':
      ctx.globalAlpha = 0.35;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentColor; ctx.lineWidth = brushSize * 3;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineTo(x, y); ctx.stroke();
      break;
    case 'marker':
      ctx.globalAlpha = 0.7;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentColor; ctx.lineWidth = brushSize * 2;
      ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      ctx.lineTo(x, y); ctx.stroke();
      break;
    case 'eraser':
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = brushSize * 3;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineTo(x, y); ctx.stroke();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      break;
  }
}

function doSpray(x, y) {
  const r = brushSize * 2, n = Math.max(20, brushSize * 4);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = currentColor;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 2 * Math.PI, d = Math.random() * r;
    ctx.beginPath(); ctx.arc(x + d*Math.cos(a), y + d*Math.sin(a), 0.7, 0, Math.PI*2); ctx.fill();
  }
}

function floodFill(sx, sy, fillHex) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  const fc = { r:parseInt(fillHex.slice(1,3),16), g:parseInt(fillHex.slice(3,5),16), b:parseInt(fillHex.slice(5,7),16) };
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = id.data, W = canvas.width, H = canvas.height;
  const i0 = (sy*W+sx)*4;
  const sr=d[i0], sg=d[i0+1], sb=d[i0+2], sa=d[i0+3];
  if (sr===fc.r && sg===fc.g && sb===fc.b && sa===255) return;
  const match = i => Math.abs(d[i]-sr)<32 && Math.abs(d[i+1]-sg)<32 && Math.abs(d[i+2]-sb)<32 && Math.abs(d[i+3]-sa)<32;
  const paint = i => { d[i]=fc.r; d[i+1]=fc.g; d[i+2]=fc.b; d[i+3]=255; };
  const visited = new Uint8Array(W*H);
  const stack = [i0]; visited[i0/4]=1;
  while (stack.length) {
    const i = stack.pop();
    if (!match(i)) continue;
    paint(i);
    const x=(i/4)%W, y=Math.floor((i/4)/W);
    for (const ni of [x>0?i-4:-1, x<W-1?i+4:-1, y>0?i-W*4:-1, y<H-1?i+W*4:-1]) {
      if (ni>=0 && !visited[ni/4]) { visited[ni/4]=1; stack.push(ni); }
    }
  }
  ctx.putImageData(id, 0, 0);
}

function startDraw(x, y) {
  if (currentTool==='fill') { saveState(); floodFill(x, y, currentColor); return; }
  if (currentTool==='spray') { saveState(); doSpray(x,y); sprayInterval=setInterval(()=>doSpray(x,y),40); return; }
  saveState(); ctx.beginPath(); ctx.moveTo(x, y);
}
function moveDraw(x, y) {
  if (currentTool==='fill') return;
  if (currentTool==='spray') { doSpray(x,y); return; }
  applyTool(x, y);
}
function endDraw() {
  ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  if (sprayInterval) { clearInterval(sprayInterval); sprayInterval=null; }
}

canvas.addEventListener('mousedown', e => { e.preventDefault(); isDrawing=true; const p=getPos(e); startDraw(p.x,p.y); });
canvas.addEventListener('mousemove', e => { if (!isDrawing) return; e.preventDefault(); const p=getPos(e); moveDraw(p.x,p.y); });
canvas.addEventListener('mouseup',    () => { if (!isDrawing) return; isDrawing=false; endDraw(); });
canvas.addEventListener('mouseleave', () => { if (!isDrawing) return; isDrawing=false; endDraw(); });
canvas.addEventListener('touchstart', e => { e.preventDefault(); isDrawing=true; const p=getPos(e); startDraw(p.x,p.y); }, {passive:false});
canvas.addEventListener('touchmove',  e => { if (!isDrawing) return; e.preventDefault(); const p=getPos(e); moveDraw(p.x,p.y); }, {passive:false});
canvas.addEventListener('touchend',   e => { e.preventDefault(); isDrawing=false; endDraw(); }, {passive:false});
canvas.addEventListener('touchcancel',() => { isDrawing=false; endDraw(); });

// ── Keyboard ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey||e.metaKey) {
    if (e.key==='z') { e.preventDefault(); undo(); }
    if (e.key==='s') { e.preventDefault(); saveImage(); }
    return;
  }
  const map = {p:'pencil',b:'brush',m:'marker',y:'spray',f:'fill',e:'eraser'};
  if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
});

// ── Init ─────────────────────────────────────────────────────────────────────
setColor('#000000');
setBrushSize(5);
setTool('pencil');
setupWheelEvents();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
