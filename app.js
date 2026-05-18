'use strict';

// ── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('drawing-canvas');
const ctx    = canvas.getContext('2d');

let currentTool  = 'pencil';
let currentColor = '#000000';
let brushSize    = 5;
let isDrawing    = false;
let sprayInterval = null;

const undoStack = [];
const MAX_UNDO  = 20;

function resizeCanvas() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth;
  const h = container.clientHeight;
  const imgData = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
  canvas.width  = w;
  canvas.height = h;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (imgData) ctx.putImageData(imgData, 0, 0);
}

window.addEventListener('resize', () => {
  resizeCanvas();
  if (!document.getElementById('color-popup').classList.contains('hidden')) {
    renderWheel();
  }
});
resizeCanvas();

// ── Undo ────────────────────────────────────────────────────────────────────
function saveState() {
  if (undoStack.length >= MAX_UNDO) undoStack.shift();
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function undo() {
  if (!undoStack.length) return;
  ctx.putImageData(undoStack.pop(), 0, 0);
}

// ── Tool selection ──────────────────────────────────────────────────────────
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mob-btn').forEach(b => b.classList.remove('active'));
  const d = document.getElementById('btn-' + tool);
  const m = document.getElementById('mob-' + tool);
  if (d) d.classList.add('active');
  if (m) m.classList.add('active');
}

function setColor(hex) {
  currentColor = hex;
  document.getElementById('current-color').style.background   = hex;
  document.getElementById('mob-color').style.background       = hex;
  document.getElementById('color-preview-swatch').style.background = hex;
  document.getElementById('color-hex-label').textContent      = hex.toUpperCase();
}

function setColorAndClose(hex) {
  setColor(hex);
  // Sync wheel state to this color
  syncWheelToColor(hex);
  closeColorPopup();
}

function setBrushSize(val) {
  brushSize = parseInt(val);
  document.getElementById('size-slider').value        = val;
  document.getElementById('size-label').textContent   = val;
  document.getElementById('popup-size-slider').value  = val;
  document.getElementById('popup-size-label').textContent = val;
}

function clearCanvas() {
  saveState();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function saveImage() {
  const a = document.createElement('a');
  a.download = 'ritning.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

// ── Color wheel ─────────────────────────────────────────────────────────────
const wheelCanvas = document.getElementById('color-wheel');
const wheelCtx    = wheelCanvas.getContext('2d');

let wheelHue       = 0;    // 0-360
let wheelSat       = 0;    // 0-1  (0 = center/gray, 1 = edge/vivid)
let wheelLightness = 0.5;  // 0-1

// Convert HSL (0-1 each) → RGB (0-255 each)
function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Convert RGB → hex string
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Draw the wheel using radial gradient segments (fast)
function renderWheel() {
  // Size the canvas to fit its container (square)
  const wrap = document.getElementById('wheel-wrap');
  const size = Math.min(wrap.clientWidth, 280);
  wheelCanvas.width  = size;
  wheelCanvas.height = size;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;

  wheelCtx.clearRect(0, 0, size, size);

  // Draw 360 pie slices, each with a radial gradient: gray center → hue edge
  for (let h = 0; h < 360; h++) {
    const startAngle = (h - 1) * Math.PI / 180;
    const endAngle   = (h + 1) * Math.PI / 180;

    const [cr, cg, cb] = hslToRgb(h / 360, 0, wheelLightness);
    const [er, eg, eb] = hslToRgb(h / 360, 1, wheelLightness);

    const grad = wheelCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgb(${cr},${cg},${cb})`);
    grad.addColorStop(1, `rgb(${er},${eg},${eb})`);

    wheelCtx.beginPath();
    wheelCtx.moveTo(cx, cy);
    wheelCtx.arc(cx, cy, radius, startAngle, endAngle);
    wheelCtx.closePath();
    wheelCtx.fillStyle = grad;
    wheelCtx.fill();
  }

  // Draw selector indicator
  const angle = wheelHue * Math.PI / 180;
  const r     = wheelSat * radius;
  const ix    = cx + r * Math.cos(angle);
  const iy    = cy + r * Math.sin(angle);

  wheelCtx.beginPath();
  wheelCtx.arc(ix, iy, 9, 0, 2 * Math.PI);
  wheelCtx.strokeStyle = wheelLightness < 0.5 ? '#fff' : '#000';
  wheelCtx.lineWidth   = 2.5;
  wheelCtx.stroke();
  wheelCtx.beginPath();
  wheelCtx.arc(ix, iy, 6, 0, 2 * Math.PI);
  wheelCtx.strokeStyle = wheelLightness >= 0.5 ? '#fff' : '#000';
  wheelCtx.lineWidth   = 1.5;
  wheelCtx.stroke();
}

function pickWheelColor(clientX, clientY) {
  const rect   = wheelCanvas.getBoundingClientRect();
  const cx     = rect.width  / 2;
  const cy     = rect.height / 2;
  const radius = Math.min(cx, cy) - 2;

  const dx = clientX - rect.left - cx;
  const dy = clientY - rect.top  - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > radius) return; // outside wheel

  wheelHue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
  wheelSat = Math.min(dist / radius, 1);

  const [r, g, b] = hslToRgb(wheelHue / 360, wheelSat, wheelLightness);
  const hex = rgbToHex(r, g, b);
  setColor(hex);
  renderWheel();
}

function onLightnessChange(val) {
  wheelLightness = parseInt(val) / 100;
  const [r, g, b] = hslToRgb(wheelHue / 360, wheelSat, wheelLightness);
  const hex = rgbToHex(r, g, b);
  setColor(hex);
  renderWheel();
}

// Sync wheel state when a preset color is picked
function syncWheelToColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0, h = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  wheelHue       = h * 360;
  wheelSat       = s;
  wheelLightness = l;
  document.getElementById('lightness-slider').value = Math.round(l * 100);
}

// Wheel mouse events
wheelCanvas.addEventListener('mousedown', e => {
  e.preventDefault();
  pickWheelColor(e.clientX, e.clientY);
});
wheelCanvas.addEventListener('mousemove', e => {
  if (e.buttons === 1) pickWheelColor(e.clientX, e.clientY);
});

// Wheel touch events
wheelCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  pickWheelColor(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
wheelCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  pickWheelColor(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

// ── Color popup open / close ────────────────────────────────────────────────
function openColorPopup() {
  document.getElementById('color-popup').classList.remove('hidden');
  // Small delay so layout is ready before measuring canvas size
  requestAnimationFrame(() => renderWheel());
}

function closeColorPopup() {
  document.getElementById('color-popup').classList.add('hidden');
}

// Tap backdrop (outside inner panel) to close
function handlePopupBackdropClick(e) {
  if (e.target === document.getElementById('color-popup')) closeColorPopup();
}

// ── Drawing helpers ─────────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches.length) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function applyTool(x, y) {
  switch (currentTool) {
    case 'pencil':
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentColor;
      ctx.lineWidth   = brushSize;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
      break;

    case 'brush':
      ctx.globalAlpha = 0.35;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentColor;
      ctx.lineWidth   = brushSize * 3;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
      break;

    case 'marker':
      ctx.globalAlpha = 0.65;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentColor;
      ctx.lineWidth   = brushSize * 2;
      ctx.lineCap     = 'square';
      ctx.lineJoin    = 'miter';
      ctx.lineTo(x, y);
      ctx.stroke();
      break;

    case 'eraser':
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth   = brushSize * 3;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
      // Keep white underneath
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      break;
  }
}

function doSpray(x, y) {
  const radius  = brushSize * 2;
  const density = Math.max(20, brushSize * 4);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = currentColor;
  for (let i = 0; i < density; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const r = Math.random() * radius;
    ctx.beginPath();
    ctx.arc(x + r * Math.cos(angle), y + r * Math.sin(angle), 0.7, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// ── Flood fill ──────────────────────────────────────────────────────────────
function floodFill(startX, startY, fillHex) {
  startX = Math.floor(startX);
  startY = Math.floor(startY);

  const fc = { r: parseInt(fillHex.slice(1,3),16), g: parseInt(fillHex.slice(3,5),16), b: parseInt(fillHex.slice(5,7),16) };
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const W = canvas.width, H = canvas.height;

  const idx0  = (startY * W + startX) * 4;
  const sr = data[idx0], sg = data[idx0+1], sb = data[idx0+2], sa = data[idx0+3];

  if (sr === fc.r && sg === fc.g && sb === fc.b && sa === 255) return;

  const match = i => Math.abs(data[i]-sr)<32 && Math.abs(data[i+1]-sg)<32 && Math.abs(data[i+2]-sb)<32 && Math.abs(data[i+3]-sa)<32;
  const paint = i => { data[i]=fc.r; data[i+1]=fc.g; data[i+2]=fc.b; data[i+3]=255; };

  const visited = new Uint8Array(W * H);
  const stack   = [idx0];
  visited[idx0 / 4] = 1;

  while (stack.length) {
    const i = stack.pop();
    if (!match(i)) continue;
    paint(i);
    const x = (i/4) % W, y = Math.floor((i/4) / W);
    const neighbors = [
      x > 0     ? i - 4        : -1,
      x < W - 1 ? i + 4        : -1,
      y > 0     ? i - W*4      : -1,
      y < H - 1 ? i + W*4      : -1,
    ];
    for (const ni of neighbors) {
      if (ni >= 0 && !visited[ni/4]) { visited[ni/4]=1; stack.push(ni); }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ── Drawing event flow ──────────────────────────────────────────────────────
function startDraw(x, y) {
  if (currentTool === 'fill') {
    saveState();
    floodFill(x, y, currentColor);
    return;
  }
  if (currentTool === 'spray') {
    saveState();
    doSpray(x, y);
    sprayInterval = setInterval(() => doSpray(x, y), 40);
    return;
  }
  saveState();
  ctx.beginPath();
  ctx.moveTo(x, y);
}

function moveDraw(x, y) {
  if (currentTool === 'fill') return;
  if (currentTool === 'spray') { doSpray(x, y); return; }
  applyTool(x, y);
}

function endDraw() {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (sprayInterval) { clearInterval(sprayInterval); sprayInterval = null; }
}

// Mouse
canvas.addEventListener('mousedown', e => {
  e.preventDefault(); isDrawing = true;
  const p = getPos(e); startDraw(p.x, p.y);
});
canvas.addEventListener('mousemove', e => {
  if (!isDrawing) return;
  e.preventDefault();
  const p = getPos(e); moveDraw(p.x, p.y);
});
canvas.addEventListener('mouseup',   () => { if (!isDrawing) return; isDrawing = false; endDraw(); });
canvas.addEventListener('mouseleave',() => { if (!isDrawing) return; isDrawing = false; endDraw(); });

// Touch
canvas.addEventListener('touchstart', e => {
  e.preventDefault(); isDrawing = true;
  const p = getPos(e); startDraw(p.x, p.y);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (!isDrawing) return;
  e.preventDefault();
  const p = getPos(e); moveDraw(p.x, p.y);
}, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); isDrawing = false; endDraw(); }, { passive: false });
canvas.addEventListener('touchcancel',() => { isDrawing = false; endDraw(); });

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); undo(); }
    if (e.key === 's') { e.preventDefault(); saveImage(); }
    return;
  }
  switch (e.key.toLowerCase()) {
    case 'p': setTool('pencil'); break;
    case 'b': setTool('brush');  break;
    case 'm': setTool('marker'); break;
    case 'y': setTool('spray');  break;
    case 'f': setTool('fill');   break;
    case 'e': setTool('eraser'); break;
  }
});

// ── Init ────────────────────────────────────────────────────────────────────
setColor('#000000');
setBrushSize(5);
setTool('pencil');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
