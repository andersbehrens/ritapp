'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Drawing canvas
// ─────────────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('drawing-canvas');
const ctx    = canvas.getContext('2d');

let currentTool   = 'pencil';
let currentColor  = '#000000';
let brushSize     = 5;
let isDrawing     = false;
let sprayTimer    = null;
const undoStack   = [];

function resizeCanvas() {
  const c = document.getElementById('canvas-container');
  const w = c.clientWidth, h = c.clientHeight;
  const saved = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
  canvas.width = w; canvas.height = h;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  if (saved) ctx.putImageData(saved, 0, 0);

  // Keep lasso canvas in sync
  const lc = document.getElementById('lasso-canvas');
  if (lc) { lc.width = w; lc.height = h; }
}

window.addEventListener('resize', () => {
  resizeCanvas();
  if (!document.getElementById('color-popup').classList.contains('hidden')) drawWheel();
});
resizeCanvas();

// ─────────────────────────────────────────────────────────────────────────────
// Undo
// ─────────────────────────────────────────────────────────────────────────────
function saveState() {
  if (undoStack.length >= 20) undoStack.shift();
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}
function undo() {
  if (!undoStack.length) return;
  // Stamp any floating lasso selection first
  if (lassoState !== 'idle') lassoStamp();
  ctx.putImageData(undoStack.pop(), 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool / color / size
// ─────────────────────────────────────────────────────────────────────────────
function setTool(tool) {
  // Stamp floating lasso before switching tools
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
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function saveImage() {
  if (lassoState !== 'idle') lassoStamp();
  const a = document.createElement('a');
  a.download = 'ritning.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Color wheel
// ─────────────────────────────────────────────────────────────────────────────
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

  // Pixel-by-pixel HSL wheel
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

  // Selector: outer dark ring → white ring → current color fill
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

// Wheel events — set up after DOM is ready (called in init)
function setupWheelEvents() {
  const wc = document.getElementById('color-wheel');
  if (!wc) return;
  wc.addEventListener('mousedown', e => { e.preventDefault(); pickWheelColor(e.clientX, e.clientY); });
  wc.addEventListener('mousemove', e => { if (e.buttons===1) pickWheelColor(e.clientX, e.clientY); });
  wc.addEventListener('touchstart', e => { e.preventDefault(); pickWheelColor(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  wc.addEventListener('touchmove',  e => { e.preventDefault(); pickWheelColor(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
}

// ─────────────────────────────────────────────────────────────────────────────
// Color popup
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Brush drawing functions
// ─────────────────────────────────────────────────────────────────────────────

// Pencil — thin, precise, fully opaque
function applyPencil(x, y) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth   = brushSize;
  ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
  ctx.lineTo(x, y); ctx.stroke();
}

// Brush — soft, round, semi-transparent (builds up)
function applyBrush(x, y) {
  ctx.globalAlpha = 0.3;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth   = brushSize * 4;
  ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
  ctx.lineTo(x, y); ctx.stroke();
}

// Marker — flat, square, mostly opaque
function applyMarker(x, y) {
  ctx.globalAlpha = 0.8;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth   = brushSize * 2.5;
  ctx.lineCap     = 'square'; ctx.lineJoin = 'miter';
  ctx.lineTo(x, y); ctx.stroke();
}

// Soft / airbrush — radial gradient, very soft falloff
function applySoft(x, y) {
  const r = brushSize * 4;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0,   rgba(currentColor, 0.25));
  grad.addColorStop(0.4, rgba(currentColor, 0.12));
  grad.addColorStop(1,   rgba(currentColor, 0));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
}

// Watercolor — low-opacity wet blobs that build up naturally
function applyWatercolor(x, y) {
  const baseR = brushSize * 2.5;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
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
    grad.addColorStop(0.9,  rgba(currentColor, a * 1.8)); // wet edge
    grad.addColorStop(1,    rgba(currentColor, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI*2); ctx.fill();
  }
}

// Pastel / chalk — rough, granular texture with tiny marks
function applyPastel(x, y) {
  const r = brushSize * 2;
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

// Blend / smudge — blurs pixels under the brush
function applyBlend(x, y) {
  const r = Math.max(8, brushSize * 2);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.clip();
  ctx.filter = `blur(${Math.max(2, Math.round(brushSize * 0.8))}px)`;
  ctx.globalAlpha = 0.6;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

// Spray — scattered dots
function doSpray(x, y) {
  const r = brushSize * 2.5;
  const n = Math.max(20, brushSize * 5);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = currentColor;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    ctx.beginPath();
    ctx.arc(x + d*Math.cos(a), y + d*Math.sin(a), 0.8, 0, Math.PI*2);
    ctx.fill();
  }
}

// Eraser
function applyEraser(x, y) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  ctx.lineWidth   = brushSize * 4;
  ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
  ctx.lineTo(x, y); ctx.stroke();
  // Keep white underneath
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

// Flood fill
function floodFill(sx, sy, fillHex) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  const [fr,fg,fb] = hexRgb(fillHex);
  const id = ctx.getImageData(0,0,canvas.width,canvas.height);
  const d = id.data, W = canvas.width, H = canvas.height;
  const i0 = (sy*W+sx)*4;
  const sr=d[i0],sg=d[i0+1],sb=d[i0+2],sa=d[i0+3];
  if (sr===fr && sg===fg && sb===fb && sa===255) return;
  const match = i => Math.abs(d[i]-sr)<32 && Math.abs(d[i+1]-sg)<32 && Math.abs(d[i+2]-sb)<32 && Math.abs(d[i+3]-sa)<32;
  const paint = i => { d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255; };
  const vis = new Uint8Array(W*H); const stk = [i0]; vis[i0/4]=1;
  while (stk.length) {
    const i=stk.pop(); if (!match(i)) continue; paint(i);
    const x=(i/4)%W, y=Math.floor((i/4)/W);
    for (const ni of [x>0?i-4:-1, x<W-1?i+4:-1, y>0?i-W*4:-1, y<H-1?i+W*4:-1]) {
      if (ni>=0 && !vis[ni/4]) { vis[ni/4]=1; stk.push(ni); }
    }
  }
  ctx.putImageData(id,0,0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lasso tool
// ─────────────────────────────────────────────────────────────────────────────
let lassoState    = 'idle';   // idle | drawing | ready | moving
let lassoPoints   = [];       // [{x,y}] — current positions (updated after each commit)
let lassoBase     = null;     // ImageData: canvas with selection hole at current position
let lassoCut      = null;     // HTMLCanvasElement: the floating selection pixels
let lassoBBox     = null;     // {x,y,w,h} bounding box of lassoCut on canvas
let lassoOffset   = {x:0,y:0};// uncommitted drag delta
let lassoPrevPos  = {x:0,y:0};// last pointer position during drag
let lassoAnimId   = null;
let lassoDash     = 0;

function lassoBounds(pts) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const p of pts) {
    if (p.x<minX) minX=p.x; if (p.y<minY) minY=p.y;
    if (p.x>maxX) maxX=p.x; if (p.y>maxY) maxY=p.y;
  }
  return { x:Math.floor(minX), y:Math.floor(minY),
           w:Math.ceil(maxX)-Math.floor(minX)+1,
           h:Math.ceil(maxY)-Math.floor(minY)+1 };
}

function pointInLasso(px, py) {
  // Ray-casting algorithm (with current offset applied)
  const ox = lassoOffset.x, oy = lassoOffset.y;
  let inside = false;
  for (let i=0, j=lassoPoints.length-1; i<lassoPoints.length; j=i++) {
    const xi=lassoPoints[i].x+ox, yi=lassoPoints[i].y+oy;
    const xj=lassoPoints[j].x+ox, yj=lassoPoints[j].y+oy;
    const intersect = ((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
    if (intersect) inside = !inside;
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
  lctx.clearRect(0, 0, lc.width, lc.height);

  const ox = lassoOffset.x, oy = lassoOffset.y;
  const closed = lassoState === 'ready' || lassoState === 'moving';

  lctx.save();
  lctx.lineWidth = 1.5;

  // White dashes
  lctx.setLineDash([6,4]);
  lctx.lineDashOffset = -lassoDash;
  lctx.strokeStyle = '#fff';
  drawLassoPath(lctx, ox, oy, closed);
  lctx.stroke();

  // Black dashes (offset by half period)
  lctx.lineDashOffset = -lassoDash + 5;
  lctx.strokeStyle = 'rgba(0,0,0,0.7)';
  drawLassoPath(lctx, ox, oy, closed);
  lctx.stroke();

  lctx.restore();

  lassoDash = (lassoDash + 0.4) % 10;
  lassoAnimId = requestAnimationFrame(lassoAnimLoop);
}

function startLassoAnim() {
  if (lassoAnimId) return;
  lassoAnimLoop();
}

function stopLassoAnim() {
  if (lassoAnimId) { cancelAnimationFrame(lassoAnimId); lassoAnimId = null; }
  const lc = document.getElementById('lasso-canvas');
  if (lc) lc.getContext('2d').clearRect(0, 0, lc.width, lc.height);
}

function lassoComplete() {
  // Need at least a small path
  if (lassoPoints.length < 5) { lassoReset(); return; }

  const bb = lassoBounds(lassoPoints);
  // Clamp bbox to canvas
  bb.x = Math.max(0, bb.x); bb.y = Math.max(0, bb.y);
  bb.w = Math.min(canvas.width  - bb.x, bb.w);
  bb.h = Math.min(canvas.height - bb.y, bb.h);
  if (bb.w < 2 || bb.h < 2) { lassoReset(); return; }

  saveState(); // save before cut for undo

  // Create cut canvas: copy pixels clipped to lasso shape
  lassoCut = document.createElement('canvas');
  lassoCut.width = bb.w; lassoCut.height = bb.h;
  const cctx = lassoCut.getContext('2d');
  cctx.save();
  cctx.beginPath();
  cctx.moveTo(lassoPoints[0].x - bb.x, lassoPoints[0].y - bb.y);
  for (let i=1; i<lassoPoints.length; i++) cctx.lineTo(lassoPoints[i].x-bb.x, lassoPoints[i].y-bb.y);
  cctx.closePath();
  cctx.clip();
  cctx.drawImage(canvas, -bb.x, -bb.y);
  cctx.restore();

  lassoBBox = bb;

  // Erase selection area on main canvas (fill with white)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
  for (let i=1; i<lassoPoints.length; i++) ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
  ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();

  // Save the "base" (canvas with hole) for redraw during move
  lassoBase = ctx.getImageData(0, 0, canvas.width, canvas.height);

  lassoOffset = {x:0, y:0};
  lassoState  = 'ready';
  startLassoAnim();
}

function lassoRedraw() {
  // Restore base + draw floating selection at current offset
  ctx.putImageData(lassoBase, 0, 0);
  if (lassoCut) ctx.drawImage(lassoCut, lassoBBox.x + lassoOffset.x, lassoBBox.y + lassoOffset.y);
}

function lassoStamp() {
  // Commit the floating selection to canvas
  lassoRedraw();
  stopLassoAnim();
  lassoReset();
}

function lassoCommitOffset() {
  // After a move: update lassoPoints and base so further moves work correctly
  lassoPoints = lassoPoints.map(p => ({x: p.x+lassoOffset.x, y: p.y+lassoOffset.y}));
  lassoBBox   = { x: lassoBBox.x+lassoOffset.x, y: lassoBBox.y+lassoOffset.y, w:lassoBBox.w, h:lassoBBox.h };
  lassoOffset = {x:0, y:0};

  // Draw current state, then cut hole at new position for new base
  ctx.putImageData(lassoBase, 0, 0);
  ctx.drawImage(lassoCut, lassoBBox.x, lassoBBox.y);

  // Erase hole at new position
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
  for (let i=1; i<lassoPoints.length; i++) ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
  ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();

  lassoBase = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function lassoReset() {
  lassoState   = 'idle';
  lassoPoints  = [];
  lassoBase    = null;
  lassoCut     = null;
  lassoBBox    = null;
  lassoOffset  = {x:0, y:0};
}

// Lasso pointer handlers (called from startDraw / moveDraw / endDraw)
function lassoDown(x, y) {
  if (lassoState === 'idle' || lassoState === 'drawing') {
    // Start a new lasso (stamp any previous first)
    if (lassoState === 'ready') lassoStamp(); // shouldn't happen but guard
    stopLassoAnim();
    lassoReset();
    lassoState  = 'drawing';
    lassoPoints = [{x, y}];
    startLassoAnim();

  } else if (lassoState === 'ready') {
    if (pointInLasso(x, y)) {
      // Start dragging
      lassoState  = 'moving';
      lassoPrevPos = {x, y};
    } else {
      // Click outside → stamp and start new lasso
      lassoStamp();
      lassoState  = 'drawing';
      lassoPoints = [{x, y}];
      startLassoAnim();
    }
  } else if (lassoState === 'moving') {
    lassoPrevPos = {x, y};
  }
}

function lassoMove(x, y) {
  if (lassoState === 'drawing') {
    lassoPoints.push({x, y});
    // Thin out points to keep array manageable
    if (lassoPoints.length > 600) lassoPoints.splice(100, lassoPoints.length - 600);

  } else if (lassoState === 'moving') {
    lassoOffset.x += x - lassoPrevPos.x;
    lassoOffset.y += y - lassoPrevPos.y;
    lassoPrevPos   = {x, y};
    lassoRedraw();
  }
}

function lassoUp() {
  if (lassoState === 'drawing') {
    lassoComplete();
  } else if (lassoState === 'moving') {
    lassoCommitOffset();
    lassoState = 'ready';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing event dispatch
// ─────────────────────────────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches.length)
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function startDraw(x, y) {
  if (currentTool === 'lasso') { lassoDown(x, y); return; }
  if (currentTool === 'fill')  { saveState(); floodFill(x, y, currentColor); return; }
  if (currentTool === 'spray') { saveState(); doSpray(x, y); sprayTimer = setInterval(() => doSpray(x, y), 40); return; }
  saveState();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.moveTo(x, y);
}

function moveDraw(x, y) {
  if (currentTool === 'lasso')  { lassoMove(x, y); return; }
  if (currentTool === 'fill')   return;
  if (currentTool === 'spray')  { doSpray(x, y); return; }
  // Point-based tools (soft, watercolor, pastel, blend)
  if (currentTool === 'soft')       { applySoft(x, y); return; }
  if (currentTool === 'watercolor') { applyWatercolor(x, y); return; }
  if (currentTool === 'pastel')     { applyPastel(x, y); return; }
  if (currentTool === 'blend')      { applyBlend(x, y); return; }
  // Path-based tools
  if (currentTool === 'pencil')  applyPencil(x, y);
  else if (currentTool === 'brush')  applyBrush(x, y);
  else if (currentTool === 'marker') applyMarker(x, y);
  else if (currentTool === 'eraser') applyEraser(x, y);
}

function endDraw() {
  if (currentTool === 'lasso')  { lassoUp(); return; }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (sprayTimer) { clearInterval(sprayTimer); sprayTimer = null; }
}

// Mouse
canvas.addEventListener('mousedown', e => { e.preventDefault(); isDrawing=true; const p=getPos(e); startDraw(p.x,p.y); });
canvas.addEventListener('mousemove', e => { if (!isDrawing) return; e.preventDefault(); const p=getPos(e); moveDraw(p.x,p.y); });
canvas.addEventListener('mouseup',    () => { if (!isDrawing) return; isDrawing=false; endDraw(); });
canvas.addEventListener('mouseleave', () => { if (!isDrawing) return; isDrawing=false; endDraw(); });

// Touch
canvas.addEventListener('touchstart', e => { e.preventDefault(); isDrawing=true; const p=getPos(e); startDraw(p.x,p.y); }, {passive:false});
canvas.addEventListener('touchmove',  e => { if (!isDrawing) return; e.preventDefault(); const p=getPos(e); moveDraw(p.x,p.y); }, {passive:false});
canvas.addEventListener('touchend',   e => { e.preventDefault(); isDrawing=false; endDraw(); }, {passive:false});
canvas.addEventListener('touchcancel',() => { isDrawing=false; endDraw(); });

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard shortcuts
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key==='z') { e.preventDefault(); undo(); }
    if (e.key==='s') { e.preventDefault(); saveImage(); }
    return;
  }
  const map = {p:'pencil',b:'brush',m:'marker',a:'soft',w:'watercolor',
               t:'pastel',d:'blend',y:'spray',f:'fill',l:'lasso',e:'eraser'};
  if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
setColor('#000000');
setBrushSize(5);
setTool('pencil');
setupWheelEvents();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
