/* ─── OR-planerare: utrustningsbibliotek, standardlayout och geometri ───
 * Alla mått i millimeter. w = längd längs lokal x-axel, d = djup längs lokal y-axel
 * (vid rot 0). Personer "tittar" mot +y. Operationsbordets huvudände ligger mot −x.
 *
 * src: "mfr"    = tillverkardata (ref anger källa)
 *      "mfr-ca" = tillverkarens måttritning, avläst cirkamått
 *      "typ"    = typiskt mått för kategorin — ska verifieras mot salens utrustning
 *      "schablon" = schablon för personer
 */

export const SRC_LABEL = {
  mfr: "Tillverkardata",
  "mfr-ca": "Tillverkardata (ca)",
  typ: "Typiskt mått, verifiera",
  schablon: "Schablon",
};

export const EQUIPMENT = {
  table: { name: "Operationsbord", model: "Getinge Maquet, Magnus-typ", w: 2050, d: 600, cat: "sterile", sterile: true, src: "typ", ref: "Bordsskiva inkl. skenor. Mät salens eget bord." },
  backtable: { name: "Instrumentbord", model: "Rostfritt bakbord", w: 1400, d: 700, cat: "sterile", sterile: true, src: "typ" },
  mayo: { name: "Mayobord", model: "Mayostativ med bricka", w: 630, d: 480, cat: "sterile", sterile: true, over: true, src: "typ", ref: "Får stå över operationsbordet." },
  anesthesia: { name: "Anestesiapparat", model: "Dräger Perseus A500", w: 1150, d: 790, cat: "anesthesia", src: "mfr", ref: "B 115 × D 79 × H 148 cm, 150 kg (Dräger/Soma Tech)" },
  microscope: { name: "Operationsmikroskop", model: "ZEISS KINEVO 900", w: 850, d: 850, cat: "imaging", reach: 1760, sterileOk: true, src: "mfr-ca", ref: "Fot ca 850 × 850 mm, armräckvidd max ca 1760 mm (ZEISS måttritning). Draperas sterilt, undantas från marginalkontrollen." },
  carm: { name: "C-båge", model: "Siemens Cios Select", w: 1795, d: 800, cat: "imaging", src: "mfr", ref: "L 179,5 × B 80 × H 173,5 cm (Siemens)" },
  carmMonitor: { name: "C-bågsmonitor", model: "Cios monitorvagn", w: 686, d: 736, cat: "imaging", src: "mfr", ref: "68,6 × 73,6 cm (Siemens)" },
  warming: { name: "Varmluftsvärmare", model: "3M Bair Hugger 675", w: 270, d: 280, cat: "support", src: "mfr", ref: "27 × 28 × 36 cm, 4,5 kg (3M/Solventum)" },
  esu: { name: "Diatermi", model: "Diatermiaggregat på vagn", w: 600, d: 600, cat: "support", src: "typ" },
  suction: { name: "Sugvagn", model: "Sug med behållare", w: 500, d: 500, cat: "support", src: "typ" },
  tower: { name: "Utrustningstorn", model: "Video-/navigationstorn", w: 650, d: 650, cat: "support", src: "typ" },
  bed: { name: "Vårdsäng", model: "Standard vårdsäng, parkerad", w: 2180, d: 1000, cat: "support", src: "typ" },
  stool: { name: "Pall", model: "Kirurgpall", w: 450, d: 450, round: true, seat: true, sterileOk: true, cat: "support", src: "typ" },
  kick: { name: "Sparkhink", model: "Hink på hjul", w: 400, d: 400, round: true, cat: "support", src: "typ" },
  pendantAn: { name: "Anestesipendel", model: "Takmonterad", w: 600, d: 600, ceiling: true, cat: "ceiling", src: "typ" },
  pendantSurg: { name: "Kirurgpendel", model: "Takmonterad", w: 600, d: 600, ceiling: true, cat: "ceiling", src: "typ" },
  light: { name: "Operationslampa", model: "Takmonterad, Ø 700", w: 700, d: 700, round: true, ceiling: true, cat: "ceiling", src: "typ" },
  hn: { name: "H&H-kirurg", person: true, team: "hn", scrubbed: true, w: 550, d: 350, src: "schablon" },
  hnAssist: { name: "H&H-assistent", person: true, team: "hn", scrubbed: true, w: 550, d: 350, src: "schablon" },
  plastic: { name: "Plastikkirurg", person: true, team: "plastic", scrubbed: true, w: 550, d: 350, src: "schablon" },
  plasticAssist: { name: "Plastikassistent", person: true, team: "plastic", scrubbed: true, w: 550, d: 350, src: "schablon" },
  scrub: { name: "Op-ssk, instrumenterande", person: true, team: "op", scrubbed: true, w: 550, d: 350, src: "schablon" },
  circ: { name: "Op-ssk, koordinerande", person: true, team: "op", w: 550, d: 350, src: "schablon" },
  anesthetist: { name: "Anestesiolog", person: true, team: "an", w: 550, d: 350, src: "schablon" },
  anNurse: { name: "Anestesisjuksköterska", person: true, team: "an", w: 550, d: 350, src: "schablon" },
};

export const LIBRARY_GROUPS = [
  { label: "Sterilt", kinds: ["table", "backtable", "mayo"] },
  { label: "Anestesi", kinds: ["anesthesia"] },
  { label: "Bild & optik", kinds: ["microscope", "carm", "carmMonitor"] },
  { label: "Stödutrustning", kinds: ["esu", "suction", "warming", "tower", "stool", "kick", "bed"] },
  { label: "Tak", kinds: ["light", "pendantAn", "pendantSurg"] },
  { label: "Personal", kinds: ["hn", "hnAssist", "plastic", "plasticAssist", "scrub", "circ", "anesthetist", "anNurse"] },
];

export const PHASES = [
  { id: "resection", label: "Resektion", short: "Fas 1" },
  { id: "harvest", label: "Lambåuttag", short: "Fas 2" },
  { id: "inset", label: "Anastomos", short: "Fas 3" },
];

export const PHASE_NOTES = {
  resection: "H&H-teamet vid huvudet. Anestesin står vid bålen med lång andningskrets. Mikroskopet är parkerat, och benet hålls fritt för plastikteamet.",
  harvest: "Plastikteamet tar fibulalambån vid benet parallellt med halsdissektionen. Instrumentbord 2 och en andra instrumenterande op-ssk kommer in.",
  inset: "Mikroskopet flyttas till huvudet, båda kirurgerna sitter. Lambån bärs från benet till halsen, så transportvägen ska vara fri.",
};

export const PHASE_CHECKLIST = {
  resection: ["Fri väg från dörr till bordets fotände", "Mikroskop parkerat utanför arbetsytan", "Andningskrets når huvudet utan dragning"],
  harvest: ["Instrumentbord 2 sterilt uppdukat vid benet", "Värmare flyttad från benet", "Två sterila fält hålls åtskilda"],
  inset: ["Mikroskopets räckvidd täcker halsen", "Pallar på plats för båda kirurgerna", "Lambåns transportväg fri"],
};

export const DEFAULT_ROOM = {
  name: "Sal 4",
  w: 7200,
  d: 6400,
  doors: [
    { wall: "bottom", at: 3600, width: 1400, label: "Huvudentré" },
    { wall: "right", at: 2300, width: 1000, label: "Sterilkärna" },
  ],
};

export const DEFAULT_ITEMS = [
  { id: "table", kind: "table" },
  { id: "light1", kind: "light", label: "Lampa 1" },
  { id: "light2", kind: "light", label: "Lampa 2" },
  { id: "pendantAn", kind: "pendantAn" },
  { id: "pendantSurg", kind: "pendantSurg" },
  { id: "anesthesia", kind: "anesthesia" },
  { id: "anNurse", kind: "anNurse" },
  { id: "hn", kind: "hn" },
  { id: "hnAssist", kind: "hnAssist" },
  { id: "scrub", kind: "scrub" },
  { id: "circ", kind: "circ" },
  { id: "mayo1", kind: "mayo" },
  { id: "backtable1", kind: "backtable", label: "Instrumentbord 1 · H&H" },
  { id: "backtable2", kind: "backtable", label: "Instrumentbord 2 · Lambå" },
  { id: "esu", kind: "esu" },
  { id: "suction", kind: "suction" },
  { id: "microscope", kind: "microscope" },
  { id: "warming", kind: "warming" },
  { id: "plastic", kind: "plastic" },
  { id: "plasticAssist", kind: "plasticAssist" },
  { id: "scrub2", kind: "scrub", label: "Op-ssk 2, instrumenterande" },
  { id: "stool1", kind: "stool", label: "Pall · H&H" },
  { id: "stool2", kind: "stool", label: "Pall · Plastik" },
];

const P = (x, y, rot = 0) => ({ x, y, rot });

const resection = {
  table: P(3500, 3200),
  light1: P(2850, 3200), light2: P(3900, 3200),
  pendantAn: P(5500, 1050), pendantSurg: P(1250, 1300),
  anesthesia: P(4400, 1800),
  anNurse: P(3700, 2420),
  hn: P(2050, 3200, -90),
  hnAssist: P(2900, 2550),
  scrub: P(2900, 3850, 180),
  circ: P(1000, 4400),
  mayo1: P(3600, 3550),
  backtable1: P(2500, 4800),
  esu: P(1450, 2350),
  suction: P(1450, 3050),
  microscope: P(6450, 4700),
  warming: P(5000, 3900),
};

const harvest = {
  ...resection,
  plastic: P(4300, 3850, 180),
  plasticAssist: P(4300, 2550),
  scrub2: P(5000, 4300, 180),
  backtable2: P(5000, 4900),
  warming: P(5500, 2900),
};

const inset = {
  ...harvest,
  microscope: P(2300, 1750),
  plastic: P(2700, 3850, 180),
  scrub: P(3650, 4200, 180),
  plasticAssist: P(4300, 3850, 180),
  stool1: P(2050, 3200),
  stool2: P(2700, 3850),
};

export const DEFAULT_LAYOUTS = { resection, harvest, inset };

/* ─── Geometri ─── */
export function corners(pos, spec, pad = 0) {
  const hw = spec.w / 2 + pad, hd = spec.d / 2 + pad;
  const a = (pos.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [pos.x + x * c - y * s, pos.y + x * s + y * c]);
}

function axes(poly) {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return [-(q[1] - p[1]), q[0] - p[0]];
  });
}
function project(poly, [ax, ay]) {
  let min = Infinity, max = -Infinity;
  for (const [x, y] of poly) { const v = x * ax + y * ay; if (v < min) min = v; if (v > max) max = v; }
  return [min, max];
}
export function intersects(A, B) {
  for (const ax of [...axes(A), ...axes(B)]) {
    const [a0, a1] = project(A, ax), [b0, b1] = project(B, ax);
    if (a1 <= b0 + 0.5 || b1 <= a0 + 0.5) return false;
  }
  return true;
}
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function polyDistance(A, B) {
  if (intersects(A, B)) return 0;
  let m = Infinity;
  for (const [P1, P2] of [[A, B], [B, A]])
    for (const p of P1) for (let i = 0; i < P2.length; i++) m = Math.min(m, segDist(p, P2[i], P2[(i + 1) % P2.length]));
  return m;
}
export function bbox(poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

export const STERILE_MARGIN = 300; // mm — osterila personer/utrustning håller avstånd till sterilt fält (AORN: ≥ 12 in / 30 cm)

export function runChecks(items, layout, room) {
  const present = items.filter(it => layout[it.id]);
  const out = [];
  const polys = Object.fromEntries(present.map(it => [it.id, corners(layout[it.id], EQUIPMENT[it.kind])]));
  for (const it of present) {
    const b = bbox(polys[it.id]);
    if (b.x0 < -1 || b.y0 < -1 || b.x1 > room.w + 1 || b.y1 > room.d + 1) out.push({ level: "warn", ids: [it.id], kind: "outside", text: "utanför salens väggar" });
  }
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const a = present[i], b = present[j];
      const sa = EQUIPMENT[a.kind], sb = EQUIPMENT[b.kind];
      if (sa.ceiling || sb.ceiling) continue;
      const dist = polyDistance(polys[a.id], polys[b.id]);
      if (dist === 0) {
        const allowed = (sa.over && b.kind === "table") || (sb.over && a.kind === "table") || (sa.seat && sb.person) || (sb.seat && sa.person);
        if (!allowed) out.push({ level: "error", ids: [a.id, b.id], kind: "collision", text: "överlappar" });
        continue;
      }
      const sterileA = sa.sterile, sterileB = sb.sterile;
      if (sterileA === sterileB) continue;
      const other = sterileA ? sb : sa;
      if (other.scrubbed || other.sterileOk) continue;
      if (dist < STERILE_MARGIN) out.push({ level: "warn", ids: [a.id, b.id], kind: "margin", text: `${Math.round(dist)} mm från sterilt fält`, dist });
    }
  }
  return out;
}

export function fmtM(mm) {
  return `${(mm / 1000).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}
export function fmtMM(mm) {
  return `${Math.round(mm).toLocaleString("sv-SE")} mm`;
}
