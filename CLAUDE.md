# RitApp — Projektbeskrivning

En ritapplikation i MS Paint-stil byggd som **Progressive Web App (PWA)**.
Gjord för ett barn. Fungerar i webbläsaren och kan installeras som app på mobil och dator.

## Live-URL
**https://andersbehrens.github.io/ritapp/**

## GitHub-repo
`andersbehrens/ritapp` — GitHub Pages servar direkt från `main`-branchen.

För att deploya: `git add -A && git commit -m "..." && git push`
GitHub Pages uppdateras automatiskt inom ~1 minut.

## Teknik
- Ren HTML/CSS/JavaScript — inga ramverk, inga beroenden
- PWA: `manifest.json` + `sw.js` (service worker med cache-busting via version i `CACHE`-konstanten)
- Canvas API för all ritning — fast storlek `CANVAS_W = 1600, CANVAS_H = 1200`
- CSS `transform: translate + scale` på `#viewport` för zoom och panorering
- Fungerar offline efter första laddning
- Ritningen sparas automatiskt i `localStorage` och återladdas vid nästa start

## Filstruktur
```
index.html    — Hela UI:t (toolbar, canvas, mobilbar, sidopanel, färgpopup)
style.css     — All styling (desktop + mobil responsiv)
app.js        — All logik (borstar, lasso, lager, sidor, zoom, sparning)
manifest.json — PWA-manifest (start_url: "./", scope: "./")
sw.js         — Service worker (byt CACHE-version vid varje deploy!)
icons/        — icon-192.png och icon-512.png
```

## Verktyg i appen
| ID | Namn | Tangent | Teknik |
|---|---|---|---|
| pencil | Penna | P | `ctx.stroke()` med `lineWidth = brushSize` |
| brush | Mjuk pensel | B | `stroke()` med 30% alpha, bred |
| marker | Markör | M | `stroke()` med `lineCap: square`, 80% alpha |
| soft | Airbrush | A | `createRadialGradient()` per punkt |
| watercolor | Vattenfärg | W | 10 slumpmässiga blob-gradienter per punkt |
| pastel | Pastell/Krita | T | Slumpmässiga små rektanglar, kornig textur |
| blend | Blanda | D | `ctx.filter = blur + drawImage(canvas)` i clip-region |
| spray | Spray | Y | Slumpmässiga punkter i cirkelyta |
| fill | Fyll | F | Flood fill (stack-baserad, tolerans 32) |
| lasso | Lasso | L | Välj + flytta område på aktivt lager |
| eraser | Suddgummi | E | `destination-out` composite operation |

## Lager (Layers)
- `layers[]` — array av `{canvas, ctx, visible, name}` — alla `position: absolute` i `#viewport`
- `activeLayerIdx` — vilket lager all ritning går till
- Sidopanelen (knapp längst till höger i toolbar) visar lagerlistan
- Funktioner: `addNewLayer()`, `deleteLayer(idx)`, `setActiveLayer(idx)`, `toggleLayerVisibility(idx)`
- Lasso-verktyget opererar bara på aktivt lager
- Suddgummi på ett lager avslöjar lagren under (transparent, inte vit)

## Sidor (Pages)
- `pages[]` — array av `{layerData: [{imageData, visible, name}]}`
- `currentPage` — aktuell sida
- Sidopanelens "Sidor"-flik visar miniatyrbilder av alla sidor
- `saveCurrentPageData()` — sparar alla lager som `ImageData` till `pages[currentPage]`
- `restorePage(idx)` — tar bort gamla layer-canvases från DOM, återskapar från `pages[idx]`
- `switchPage(idx)` — kör save + restore
- `addPage()` — ny blank sida med ett vitt bakgrundslager

## Zoom & panorering
- `zoom`, `panX`, `panY` — styr `#viewport` via `transform: translate(panX px, panY px) scale(zoom)`
- `transform-origin: 0 0`
- Koordinater: `getPos(clientX, clientY)` → `{ x: (clientX - rect.left - panX) / zoom, y: ... }`
- **Desktop:** mushjul zoomar vid pekaren; Mellanknapp eller Mellanslag+drag panorerar
- **Mobil:** nyp med två fingrar zoomar och panorerar simultant
- Knappar: `zoomStep(factor)`, `zoomReset()` (återgår till 100% centrerat)
- Tangenter: `+` / `-` / `0`, `Ctrl+=` / `Ctrl+-` / `Ctrl+0`

## Lasso-verktyget — så fungerar det
1. Rita fritt runt ett område → prickad linje animeras (marching ants)
2. Klicka inuti → drag för att flytta urvalet
3. Klicka utanför → klistrar fast, börja nytt lasso
4. Byt verktyg → klistrar fast automatiskt

**State machine:** `idle → drawing → ready → moving → ready → ...`

**Viktiga variabler:**
- `lassoBase` — `ImageData` med transparent "lucka" där urvalet ursprungligen var
- `lassoCut` — offscreen canvas med urvalets pixlar (klippt till lasso-formen)
- `lassoBBox` — `{x,y,w,h}` position för `lassoCut` på canvas
- `lassoOffset` — `{x,y}` uncommittad drag-delta

## Färghjulet
- Ritas pixel-för-pixel med `createImageData()` → HSL-konvertering
- Indikator: filled cirkel med vald färg + vit+svart ring
- Ljusstyrka-slider justerar `wheelLightness` (0–1) och ritar om
- `syncWheelToColor(hex)` konverterar hex→HSL och placerar indikatorn rätt

## Sparning i localStorage
- Nyckel: `ritapp-state-v1`
- Format: `{v:1, pages:[{layerData:[{dataURL, visible, name}]}], currentPage, zoom, panX, panY}`
- Lager sparas som WebP data-URL (`toDataURL('image/webp', 0.85)`) för kompakt storlek
- `scheduleSave()` — debounced 1,5s, anropas efter varje ritaktion
- Sparas även direkt vid `beforeunload` och `visibilitychange → hidden`
- Laddas vid uppstart via `loadFromStorage()` (asynkron, använder `Image` för att avkoda data-URL)

## Service worker — viktigt!
När du ändrar filer, **byt CACHE-version** i `sw.js` (t.ex. `ritapp-v7` → `ritapp-v8`).
Annars kan browsers fortsätta visa gamla cachade filer.

Användare kan force-refresha: Chrome → tre prickar → "Hård omladdning"
Eller: Inställningar → Webbplatsinformation → Rensa data.

Nuvarande version: `ritapp-v7`

## Mobilanpassning
- Under 640px bredd: desktop-toolbar döljs, mobilbar visas istället
- Mobilbaren scrollar horisontellt (overflow-x: auto, dold scrollbar)
- Sidopanelen glider upp från botten på mobil (55vh)
- Touch-events hanteras med `passive: false` och `e.preventDefault()`
- PWA installerbar i Chrome (Android) och via Safari (iPhone)

## Tangentbordsgenvägar (desktop)
`P` Penna · `B` Pensel · `M` Markör · `A` Airbrush · `W` Vattenfärg
`T` Pastell · `D` Blanda · `Y` Spray · `F` Fyll · `L` Lasso · `E` Suddgummi
`Mellanslag` + drag: Panorera · `+`/`-`/`0`: Zoom in/ut/återställ
`Ctrl+Z` Ångra · `Ctrl+S` Spara bild · `Ctrl+=`/`Ctrl+-`/`Ctrl+0` Zoom

## Idéer för framtida utveckling
- Fler borstformer (stjärna, hjärta, mönster)
- Textverktyg
- Byta namn på lager (dubbelklick på lagernamnet)
- Dela bild direkt (Web Share API)
- Fler färger i paletten eller möjlighet att lägga till egna
- Dra och släpp för att ändra lagerordning
