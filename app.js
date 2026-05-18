'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');

let currentTool = 'pencil';
let currentColor = '#000000';
let brushSize = 5;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let sprayInterval = null;

const undoStack = [];
const MAX_UNDO = 20;

// ── Canvas resize ──────────────────────────────────────────────────────────
function resizeCanvas() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  // Save current drawing
  const imgData = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;

  canvas.width = w;
  canvas.height = h;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Restore drawing
  if (imgData) ctx.putImageData(imgData, 0, 0);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Undo ───────────────────────────────────────────────────────────────────
function saveState() {
  if (undoStack.length >= MAX_UNDO) undoStack.shift();
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function undo() {
  if (undoStack.length === 0) return;
  const state = undoStack.pop();
  ctx.putImageData(state, 0, 0);
}

// ── Tools ──────────────────────────────────────────────────────────────────
function setTool(tool) {
  currentTool = tool;

  // Desktop buttons
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + tool);
  if (btn) btn.classList.add('active');

  // Mobile buttons
  document.querySelectorAll('.mob-btn').forEach(b => b.classList.remove('active'));
  const mobBtn = document.getElementById('mob-' + tool);
  if (mobBtn) mobBtn.classList.add('active');
}

function setColor(color) {
  currentColor = color;
  document.getElementById('current-color').style.background = color;
  document.getElementById('mob-color').style.background = color;
  document.getElementById('color-picker-input').value = color;
  document.getElementById('popup-color-input').value = color;
}

function setColorFromPicker(color) {
  setColor(color);
}

function setBrushSize(val) {
  brushSize = parseInt(val);
  document.getElementById('size-slider').value = val;
  document.getElementById('size-label').textContent = val;
  document.getElementById('popup-size-slider').value = val;
  document.getElementById('popup-size-label').textContent = val;
}

function toggleColorPicker() {
  const isMobile = window.innerWidth <= 600;
  if (isMobile) {
    document.getElementById('color-popup').classList.remove('hidden');
  } else {
    document.getElementById('color-picker-input').click();
  }
}

function closeColorPicker() {
  document.getElementById('color-popup').classList.add('hidden');
}

function clearCanvas() {
  saveState();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function saveImage() {
  const link = document.createElement('a');
  link.download = 'ritning.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Drawing helpers ────────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches.length > 0) {
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top
    };
  }
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function drawPencil(x, y) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = brushSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineTo(x, y);
  ctx.stroke();
}

function drawBrush(x, y) {
  ctx.globalAlpha = 0.35;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = brushSize * 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineTo(x, y);
  ctx.stroke();
}

function drawMarker(x, y) {
  ctx.globalAlpha = 0.7;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = brushSize * 2;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.lineTo(x, y);
  ctx.stroke();
}

function drawEraser(x, y) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  ctx.lineWidth = brushSize * 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineTo(x, y);
  ctx.stroke();
  // Restore white underneath erased areas
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

function doSpray(x, y) {
  const radius = brushSize * 2;
  const density = Math.max(20, brushSize * 4);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = currentColor;
  for (let i = 0; i < density; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const r = Math.random() * radius;
    const sx = x + r * Math.cos(angle);
    const sy = y + r * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(sx, sy, 0.7, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// ── Flood fill ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function floodFill(startX, startY, fillColor) {
  startX = Math.floor(startX);
  startY = Math.floor(startY);
  const fc = hexToRgb(fillColor);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  const idx = (x, y) => (y * width + x) * 4;
  const startIdx = idx(startX, startY);

  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  if (sr === fc.r && sg === fc.g && sb === fc.b && sa === 255) return;

  const colorMatch = (i) =>
    Math.abs(data[i] - sr) < 32 &&
    Math.abs(data[i + 1] - sg) < 32 &&
    Math.abs(data[i + 2] - sb) < 32 &&
    Math.abs(data[i + 3] - sa) < 32;

  const setColor = (i) => {
    data[i] = fc.r;
    data[i + 1] = fc.g;
    data[i + 2] = fc.b;
    data[i + 3] = 255;
  };

  const stack = [startIdx];
  const visited = new Uint8Array(data.length / 4);
  visited[startIdx / 4] = 1;

  while (stack.length > 0) {
    const i = stack.pop();
    if (!colorMatch(i)) continue;
    setColor(i);

    const x = (i / 4) % width;
    const y = Math.floor((i / 4) / width);

    const neighbors = [
      x > 0 ? i - 4 : -1,
      x < width - 1 ? i + 4 : -1,
      y > 0 ? i - width * 4 : -1,
      y < height - 1 ? i + width * 4 : -1,
    ];

    for (const ni of neighbors) {
      if (ni >= 0 && !visited[ni / 4]) {
        visited[ni / 4] = 1;
        stack.push(ni);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ── Stroke dispatch ────────────────────────────────────────────────────────
function startStroke(x, y) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

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

function continueStroke(x, y) {
  if (currentTool === 'fill') return;

  if (currentTool === 'spray') {
    doSpray(x, y);
    return;
  }

  if (currentTool === 'pencil') drawPencil(x, y);
  else if (currentTool === 'brush') drawBrush(x, y);
  else if (currentTool === 'marker') drawMarker(x, y);
  else if (currentTool === 'eraser') drawEraser(x, y);
}

function endStroke() {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (sprayInterval) {
    clearInterval(sprayInterval);
    sprayInterval = null;
  }
}

// ── Mouse events ───────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isDrawing = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;
  startStroke(pos.x, pos.y);
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  e.preventDefault();
  const pos = getPos(e);
  continueStroke(pos.x, pos.y);
  lastX = pos.x;
  lastY = pos.y;
});

canvas.addEventListener('mouseup', () => {
  if (!isDrawing) return;
  isDrawing = false;
  endStroke();
});

canvas.addEventListener('mouseleave', () => {
  if (!isDrawing) return;
  isDrawing = false;
  endStroke();
});

// ── Touch events ───────────────────────────────────────────────────────────
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isDrawing = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;
  startStroke(pos.x, pos.y);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!isDrawing) return;
  e.preventDefault();
  const pos = getPos(e);
  continueStroke(pos.x, pos.y);
  lastX = pos.x;
  lastY = pos.y;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!isDrawing) return;
  isDrawing = false;
  endStroke();
}, { passive: false });

canvas.addEventListener('touchcancel', () => {
  isDrawing = false;
  endStroke();
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); undo(); }
    if (e.key === 's') { e.preventDefault(); saveImage(); }
    return;
  }
  switch (e.key.toLowerCase()) {
    case 'p': setTool('pencil'); break;
    case 'b': setTool('brush'); break;
    case 'm': setTool('marker'); break;
    case 'y': setTool('spray'); break;
    case 'f': setTool('fill'); break;
    case 'e': setTool('eraser'); break;
  }
});

// ── Initial setup ──────────────────────────────────────────────────────────
setColor('#000000');
setBrushSize(5);
setTool('pencil');

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
