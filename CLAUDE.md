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
- Canvas API för all ritning
- Fungerar offline efter första laddning

## Filstruktur
```
index.html   — Hela UI:t (toolbar, canvas, mobilbar, färgpopup)
style.css    — All styling (desktop + mobil responsiv)
app.js       — All logik (borstar, lasso, färghjul, händelser)
manifest.json — PWA-manifest (start_url: "./", scope: "./")
sw.js        — Service worker (byt CACHE-version vid uppdatering!)
icons/       — icon-192.png och icon-512.png (genererade med PIL)
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
| fill | Fyll | F | Flood fill (ray-casting + stack, tolerans 32) |
| lasso | Lasso | L | Välj + flytta område (se nedan) |
| eraser | Suddgummi | E | `destination-out` composite operation |

## Lasso-verktyget — så fungerar det
1. Rita fritt runt ett område → prickad linje animeras (marching ants)
2. Klicka inuti → drag för att flytta urvalet
3. Klicka utanför → klistrar fast, börja nytt lasso
4. Byt verktyg → klistrar fast automatiskt

**State machine:** `idle → drawing → ready → moving → ready → ...`

**Viktiga variabler:**
- `lassoBase` — ImageData med vit "lucka" där urvalet ursprungligen var
- `lassoCut` — offscreen canvas med urvalets pixlar (klippt till lasso-formen)
- `lassoBBox` — `{x,y,w,h}` position för `lassoCut` på canvas
- `lassoOffset` — `{x,y}` uncommittad drag-delta (nollställs efter varje drag)

## Färghjulet
- Ritas pixel-för-pixel med `createImageData()` → HSL-konvertering
- Indikator: filled cirkel med vald färg + vit+svart ring
- Ljusstyrka-slider justerar `wheelLightness` (0–1) och ritar om
- `syncWheelToColor(hex)` konverterar hex→HSL och placerar indikatorn rätt

## Service worker — viktigt!
När du ändrar filer, **byt CACHE-version** i `sw.js` (t.ex. `ritapp-v5` → `ritapp-v6`).
Annars kan browsers fortsätta visa gamla cachade filer.

Användare kan force-refresha: Chrome → tre prickar → "Hård omladdning"
Eller: Inställningar → Webbplatsinformation → Rensa data.

## Mobilanpassning
- Under 640px bredd: desktop-toolbar döljs, mobilbar visas istället
- Mobilbaren scrollar horisontellt (overflow-x: auto, dold scrollbar)
- Alla verktyg tillgängliga på mobil
- Touch-events hanteras med `passive: false` och `e.preventDefault()`
- PWA installerbar i Chrome (Android) och via Safari (iPhone)

## Tangentbordsgenvägar (desktop)
`P` Penna · `B` Pensel · `M` Markör · `A` Airbrush · `W` Vattenfärg
`T` Pastell · `D` Blanda · `Y` Spray · `F` Fyll · `L` Lasso · `E` Suddgummi
`Ctrl+Z` Ångra · `Ctrl+S` Spara bild

## Idéer för framtida utveckling
- Fler borstformer (stjärna, hjärta, mönster)
- Textverktyg
- Lager (layers)
- Zooma in/ut på canvas
- Dela bild direkt (Web Share API)
- Spara i localStorage så ritningen bevaras vid reload
- Fler färger i paletten eller möjlighet att lägga till egna
