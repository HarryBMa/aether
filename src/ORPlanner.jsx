import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { RotateCw, RotateCcw, Copy, Trash2, ZoomIn, ZoomOut, Maximize2, AlertTriangle, LogOut as LeaveIcon, LogIn } from "lucide-react";
import {
  EQUIPMENT, LIBRARY_GROUPS, PHASES, PHASE_NOTES, PHASE_CHECKLIST, DEFAULT_ROOM, DEFAULT_ITEMS, DEFAULT_LAYOUTS,
  SRC_LABEL, STERILE_MARGIN, corners, bbox, runChecks, fmtM, fmtMM,
} from "./orPlannerData.js";

/* ─── Samarbete ───
 * Varje ändring är en händelse med Matrix-liknande typ ("se.aether.or.*") så att
 * transporten senare kan bytas mot ett Matrix-rum. I prototypen går händelserna
 * över BroadcastChannel: öppna OR-planeringen i två flikar för att se live-synk.
 */
const ROSTER = [
  { name: "Dr. A. Bergström", role: "H&H-kirurgi" },
  { name: "Dr. K. Johansson", role: "Plastikkirurgi" },
  { name: "Dr. L. Svensson", role: "Anestesi" },
  { name: "L. Strand", role: "Op-ssk" },
  { name: "S. Berg", role: "Koordinator" },
];
const PEER_COLORS = ["oklch(45% 0.15 250)", "oklch(50% 0.15 30)", "oklch(48% 0.13 150)", "oklch(50% 0.14 310)", "oklch(52% 0.13 75)"];
const SNAP = 50;
const uid = () => Math.random().toString(36).slice(2, 10);
const snap = (v, free) => (free ? Math.round(v) : Math.round(v / SNAP) * SNAP);
const normRot = (r) => ((Math.round(r) % 360) + 540) % 360 - 180;
const initials = (name) => name.replace(/^Dr\.\s*/, "").split(/[\s.]+/).filter(Boolean).map(s => s[0]).join("").slice(0, 2).toUpperCase();
const PERSON_TAG = { hn: "HN", hnAssist: "HA", plastic: "PK", plasticAssist: "PA", scrub: "OP", circ: "KO", anesthetist: "AL", anNurse: "AS" };

function freshDoc() {
  return {
    rev: 0,
    room: DEFAULT_ROOM,
    items: DEFAULT_ITEMS,
    layouts: JSON.parse(JSON.stringify(DEFAULT_LAYOUTS)),
    checks: {},
    log: [],
  };
}

function labelOf(item) {
  return item.label || EQUIPMENT[item.kind].name;
}

function applyOp(doc, op) {
  const d = { ...doc, rev: doc.rev + 1 };
  const c = op.content;
  const item = c.id ? doc.items.find(i => i.id === c.id) : null;
  let logText = null;
  switch (op.type) {
    case "se.aether.or.move": {
      const prev = doc.layouts[c.phase]?.[c.id];
      d.layouts = { ...doc.layouts, [c.phase]: { ...doc.layouts[c.phase], [c.id]: { x: c.x, y: c.y, rot: c.rot } } };
      if (c.final && item && c.from) {
        const dist = Math.hypot(c.x - c.from.x, c.y - c.from.y);
        const dr = normRot(c.rot - c.from.rot);
        logText = `flyttade ${labelOf(item)}${dist >= 1 ? ` ${fmtM(dist)}` : ""}${dr ? ` · roterade ${dr > 0 ? "+" : ""}${dr}°` : ""}`;
      } else if (!prev && item) logText = `placerade ${labelOf(item)}`;
      break;
    }
    case "se.aether.or.place": {
      const layout = { ...doc.layouts[c.phase] };
      if (c.pos) layout[c.id] = c.pos; else delete layout[c.id];
      d.layouts = { ...doc.layouts, [c.phase]: layout };
      if (item) logText = c.pos ? `tog in ${labelOf(item)}` : `tog ut ${labelOf(item)} ur salen`;
      break;
    }
    case "se.aether.or.add": {
      d.items = [...doc.items, c.item];
      d.layouts = { ...doc.layouts };
      for (const [ph, pos] of Object.entries(c.positions)) d.layouts[ph] = { ...d.layouts[ph], [c.item.id]: pos };
      logText = `lade till ${labelOf(c.item)}`;
      break;
    }
    case "se.aether.or.remove": {
      d.items = doc.items.filter(i => i.id !== c.id);
      d.layouts = Object.fromEntries(Object.entries(doc.layouts).map(([ph, l]) => { const n = { ...l }; delete n[c.id]; return [ph, n]; }));
      if (item) logText = `tog bort ${labelOf(item)}`;
      break;
    }
    case "se.aether.or.label": {
      d.items = doc.items.map(i => (i.id === c.id ? { ...i, label: c.label } : i));
      break;
    }
    case "se.aether.or.room": {
      d.room = { ...doc.room, w: c.w, d: c.d };
      logText = `ändrade salens mått till ${fmtMM(c.w)} × ${fmtMM(c.d)}`;
      break;
    }
    case "se.aether.or.check": {
      d.checks = { ...doc.checks, [c.phase]: { ...(doc.checks[c.phase] || {}), [c.index]: c.done } };
      logText = `${c.done ? "bockade av" : "öppnade"} "${PHASE_CHECKLIST[c.phase][c.index]}"`;
      break;
    }
    case "se.aether.or.reset": {
      const f = freshDoc();
      Object.assign(d, { room: f.room, items: f.items, layouts: f.layouts, checks: {} });
      logText = "återställde standardlayouten";
      break;
    }
    default:
      return doc;
  }
  if (logText) d.log = [{ id: op.id, ts: op.ts, sender: op.sender, text: logText, phase: c.phase }, ...doc.log].slice(0, 120);
  return d;
}

/* ─── Plansymboler (ovanifrån, lokala mm-koordinater, centrerade) ─── */
function Symbol({ kind, spec, col, fill, C }) {
  const { w, d } = spec;
  const ns = { vectorEffect: "non-scaling-stroke" };
  const sw = 1.5;
  const hatch = spec.sterile ? "url(#or-hatch)" : "none";
  const base = { stroke: col, strokeWidth: sw, ...ns };
  if (spec.person) {
    return (
      <g>
        <ellipse cx={0} cy={0} rx={w / 2} ry={d / 2} fill={fill} {...base} />
        <path d={`M ${-70} ${d / 2 - 20} L 0 ${d / 2 + 70} L 70 ${d / 2 - 20}`} fill="none" {...base} />
        <circle cx={0} cy={0} r={105} fill={C.bg} {...base} />
      </g>
    );
  }
  if (spec.ceiling) {
    const dash = { strokeDasharray: "6 5" };
    if (kind === "light") return (<g><circle r={w / 2} fill="none" {...base} {...dash} /><circle r={w / 2 - 120} fill="none" {...base} {...dash} /><circle r={40} fill={col} stroke="none" /></g>);
    return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={60} fill="none" {...base} {...dash} /><path d={`M ${-w / 2 + 80} ${-d / 2 + 80} L ${w / 2 - 80} ${d / 2 - 80} M ${w / 2 - 80} ${-d / 2 + 80} L ${-w / 2 + 80} ${d / 2 - 80}`} fill="none" {...base} {...dash} /></g>);
  }
  switch (kind) {
    case "table":
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={40} fill={fill} {...base} />
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={40} fill={hatch} stroke="none" />
          {[-w / 2 + 380, -w / 2 + 1100, -w / 2 + 1600].map(x => <line key={x} x1={x} y1={-d / 2} x2={x} y2={d / 2} stroke={col} strokeWidth={1} opacity={0.6} {...ns} />)}
          <circle cx={-w / 2 + 190} cy={0} r={115} fill={C.bg} {...base} strokeDasharray="4 3" />
          <rect x={-w / 2 + 330} y={-200} width={w - 480} height={400} rx={180} fill="none" stroke={col} strokeWidth={1} strokeDasharray="4 3" {...ns} />
        </g>
      );
    case "backtable":
      return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={20} fill={fill} {...base} /><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={20} fill={hatch} stroke="none" /><rect x={-w / 2 + 60} y={-d / 2 + 60} width={w - 120} height={d - 120} rx={10} fill="none" stroke={col} strokeWidth={1} opacity={0.7} {...ns} /></g>);
    case "mayo":
      return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={30} fill={fill} {...base} /><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={30} fill={hatch} stroke="none" /><circle cx={0} cy={d / 2 - 70} r={45} fill="none" stroke={col} strokeWidth={1} {...ns} /></g>);
    case "anesthesia":
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={50} fill={fill} {...base} />
          <rect x={-w / 2 + 170} y={-d / 2 + 60} width={w - 340} height={d * 0.55} rx={20} fill={C.bg} {...base} />
          <line x1={-w / 2 + 170} y1={d / 2 - 150} x2={w / 2 - 170} y2={d / 2 - 150} {...base} />
          <circle cx={-w / 2 + 85} cy={-d / 6} r={55} fill="none" {...base} />
          <circle cx={-w / 2 + 85} cy={d / 6} r={55} fill="none" {...base} />
          <rect x={w / 2 - 140} y={-d / 2 + 60} width={90} height={d - 120} rx={20} fill="none" {...base} />
        </g>
      );
    case "microscope":
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={90} fill={fill} {...base} />
          {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => <circle key={`${sx}${sy}`} cx={sx * (w / 2 - 90)} cy={sy * (d / 2 - 90)} r={45} fill="none" {...base} />)}
          <circle r={150} fill={C.bg} {...base} />
          <line x1={0} y1={0} x2={0} y2={d / 2 + 650} {...base} strokeDasharray="7 4" />
          <circle cx={0} cy={d / 2 + 650} r={130} fill="none" {...base} strokeDasharray="7 4" />
        </g>
      );
    case "carm":
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w * 0.48} height={d} rx={60} fill={fill} {...base} />
          <rect x={-w / 2 + w * 0.48} y={-90} width={w * 0.25} height={180} fill={fill} {...base} />
          <path d={`M ${w / 2 - 330} ${-d / 2 + 30} A ${d / 2 - 30} ${d / 2 - 30} 0 0 1 ${w / 2 - 330} ${d / 2 - 30}`} fill="none" stroke={col} strokeWidth={4} {...ns} />
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={60} fill="none" stroke={col} strokeWidth={1} strokeDasharray="4 4" {...ns} />
        </g>
      );
    case "carmMonitor":
      return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={40} fill={fill} {...base} /><rect x={-w / 2 + 70} y={-d / 2 + 90} width={w / 2 - 100} height={60} fill={C.bg} {...base} /><rect x={30} y={-d / 2 + 90} width={w / 2 - 100} height={60} fill={C.bg} {...base} /></g>);
    case "suction":
      return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={40} fill={fill} {...base} /><circle cx={-w / 4 + 10} cy={0} r={85} fill={C.bg} {...base} /><circle cx={w / 4 - 10} cy={0} r={85} fill={C.bg} {...base} /></g>);
    case "esu":
      return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={40} fill={fill} {...base} /><rect x={-w / 2 + 80} y={-d / 2 + 80} width={w - 160} height={d / 2 - 80} rx={14} fill={C.bg} {...base} /></g>);
    case "warming":
      return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={30} fill={fill} {...base} /><circle r={55} fill={C.bg} {...base} /></g>);
    case "bed":
      return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={90} fill={fill} {...base} /><rect x={-w / 2 + 90} y={-d / 2 + 160} width={420} height={d - 320} rx={70} fill={C.bg} {...base} /><line x1={-w / 2 + 600} y1={-d / 2 + 50} x2={w / 2 - 300} y2={-d / 2 + 50} {...base} /><line x1={-w / 2 + 600} y1={d / 2 - 50} x2={w / 2 - 300} y2={d / 2 - 50} {...base} /></g>);
    case "stool":
      return (<g><circle r={w / 2} fill={fill} {...base} /><circle r={w / 2 - 90} fill="none" stroke={col} strokeWidth={1} {...ns} /></g>);
    case "kick":
      return (<g><circle r={w / 2} fill={fill} {...base} /><circle r={w / 2 - 70} fill="none" stroke={col} strokeWidth={1} strokeDasharray="3 3" {...ns} /></g>);
    default:
      return (<g><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={40} fill={fill} {...base} /><rect x={-w / 2 + 70} y={-d / 2 + 70} width={w - 140} height={d - 140} rx={20} fill="none" stroke={col} strokeWidth={1} {...ns} /></g>);
  }
}

export default function ORPlanner({ patient, authUser, theme }) {
  const { C, T, font, mono } = theme;
  const storageKey = `aether-or-plan-${patient.id}`;
  const channelName = `aether-or-${patient.id}`;

  const [doc, setDoc] = useState(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) return JSON.parse(raw); } catch { /* ingen lagring */ }
    return freshDoc();
  });
  const docRef = useRef(doc);
  docRef.current = doc;

  const [phase, setPhase] = useState("resection");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("object");
  const [show, setShow] = useState({ labels: true, moves: true, grid: true, ceiling: true });
  const [view, setView] = useState(null);
  const [pxPerMm, setPxPerMm] = useState(0.1);
  const [peers, setPeers] = useState({});
  const [me, setMe] = useState(() => {
    const idx = Math.max(0, ROSTER.findIndex(r => r.name === authUser?.name));
    return { id: uid(), ...ROSTER[idx], color: PEER_COLORS[idx % PEER_COLORS.length] };
  });
  const meRef = useRef(me);
  meRef.current = me;
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const interaction = useRef(null);
  const channel = useRef(null);
  const lastCursorSend = useRef(0);
  const lastMoveSend = useRef(0);
  const myCursor = useRef(null);

  const room = doc.room;
  const layout = doc.layouts[phase] || {};
  const phaseIdx = PHASES.findIndex(p => p.id === phase);
  const prevLayout = phaseIdx > 0 ? doc.layouts[PHASES[phaseIdx - 1].id] || {} : null;
  const itemsById = useMemo(() => Object.fromEntries(doc.items.map(i => [i.id, i])), [doc.items]);
  const presentItems = doc.items.filter(i => layout[i.id]);
  const absentItems = doc.items.filter(i => !layout[i.id]);
  const sel = selected && itemsById[selected] ? itemsById[selected] : null;
  const selPos = sel ? layout[sel.id] : null;
  const selSpec = sel ? EQUIPMENT[sel.kind] : null;

  /* ─── persistens ─── */
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(doc)); } catch { /* ignoreras */ } }, 250);
    return () => clearTimeout(t);
  }, [doc, storageKey]);

  /* ─── transport ─── */
  const post = useCallback((msg) => { try { channel.current?.postMessage(msg); } catch { /* ignoreras */ } }, []);

  const dispatch = useCallback((type, content, { broadcast = true } = {}) => {
    const m = meRef.current;
    const op = { id: uid(), type, content, ts: Date.now(), sender: { id: m.id, name: m.name, color: m.color } };
    setDoc(d => applyOp(d, op));
    if (broadcast) post({ t: "op", op });
  }, [post]);

  const sendPresence = useCallback((extra = {}) => {
    post({ t: "presence", peer: meRef.current, phase: extra.phase, cursor: myCursor.current, dragging: interaction.current?.id || null, ts: Date.now() });
  }, [post]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    const ch = new BroadcastChannel(channelName);
    channel.current = ch;
    let synced = false;
    ch.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.peer?.id === meRef.current.id) return;
      if (msg.t === "op") setDoc(d => applyOp(d, msg.op));
      else if (msg.t === "hello") {
        ch.postMessage({ t: "sync", doc: docRef.current, peer: meRef.current });
        ch.postMessage({ t: "presence", peer: meRef.current, cursor: myCursor.current, ts: Date.now() });
      } else if (msg.t === "sync") {
        if (!synced && msg.doc && msg.doc.rev > docRef.current.rev) { synced = true; setDoc(msg.doc); }
        setPeers(p => ({ ...p, [msg.peer.id]: { ...(p[msg.peer.id] || {}), peer: msg.peer, seen: Date.now() } }));
      } else if (msg.t === "presence") {
        setPeers(p => ({ ...p, [msg.peer.id]: { peer: msg.peer, cursor: msg.cursor, dragging: msg.dragging, phase: msg.phase ?? p[msg.peer.id]?.phase, seen: Date.now() } }));
      } else if (msg.t === "bye") {
        setPeers(p => { const n = { ...p }; delete n[msg.peer.id]; return n; });
      }
    };
    ch.postMessage({ t: "hello", peer: meRef.current });
    // Välj en ledig roll om samma namn redan planerar i en annan flik
    const pick = setTimeout(() => {
      const taken = new Set(Object.values(peersRef.current).map(p => p.peer.name));
      if (taken.has(meRef.current.name)) {
        const idx = ROSTER.findIndex(r => !taken.has(r.name));
        if (idx >= 0) setMe(m => ({ ...m, ...ROSTER[idx], color: PEER_COLORS[idx % PEER_COLORS.length] }));
      }
    }, 500);
    const beat = setInterval(() => {
      ch.postMessage({ t: "presence", peer: meRef.current, cursor: myCursor.current, dragging: interaction.current?.id || null, ts: Date.now() });
      setPeers(p => {
        const now = Date.now();
        const n = Object.fromEntries(Object.entries(p).filter(([, v]) => now - v.seen < 7000));
        return Object.keys(n).length === Object.keys(p).length ? p : n;
      });
    }, 2000);
    const bye = () => ch.postMessage({ t: "bye", peer: meRef.current });
    window.addEventListener("pagehide", bye);
    return () => { bye(); clearTimeout(pick); clearInterval(beat); window.removeEventListener("pagehide", bye); ch.close(); channel.current = null; };
  }, [channelName]);

  useEffect(() => { sendPresence({ phase }); }, [phase, me, sendPresence]);

  /* ─── vy, zoom, skala ─── */
  const fitView = useCallback(() => {
    const m = 900;
    setView({ x: -m, y: -m, w: room.w + 2 * m, h: room.d + 2 * m });
  }, [room.w, room.d]);
  useEffect(() => { fitView(); }, [fitView]);

  const measure = useCallback(() => {
    const ctm = svgRef.current?.getScreenCTM();
    if (ctm && ctm.a) setPxPerMm(ctm.a);
  }, []);
  useLayoutEffect(() => { measure(); }, [view, measure]);
  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const toMm = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  }, []);

  const zoomBy = useCallback((f, center) => {
    setView(v => {
      if (!v) return v;
      const nw = Math.min(32000, Math.max(1200, v.w * f));
      const k = nw / v.w;
      const cx = center ? center.x : v.x + v.w / 2, cy = center ? center.y : v.y + v.h / 2;
      return { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w: v.w * k, h: v.h * k };
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0015), toMm(e.clientX, e.clientY)); };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomBy, toMm]);

  /* ─── interaktion ─── */
  const startDrag = (e, id) => {
    e.stopPropagation();
    if (e.button !== undefined && e.button !== 0) return;
    const p = toMm(e.clientX, e.clientY);
    const pos = layout[id];
    setSelected(id);
    setTab("object");
    interaction.current = { mode: "drag", id, off: { x: p.x - pos.x, y: p.y - pos.y }, from: { ...pos }, last: { ...pos } };
    svgRef.current.setPointerCapture?.(e.pointerId);
  };
  const startRotate = (e, id) => {
    e.stopPropagation();
    const pos = layout[id];
    interaction.current = { mode: "rotate", id, from: { ...pos }, last: { ...pos } };
    svgRef.current.setPointerCapture?.(e.pointerId);
  };
  const startPan = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    setSelected(null);
    interaction.current = { mode: "pan", sx: e.clientX, sy: e.clientY, v: view };
    svgRef.current.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const p = toMm(e.clientX, e.clientY);
    myCursor.current = { x: p.x, y: p.y };
    const now = performance.now();
    const it = interaction.current;
    if (!it) {
      if (now - lastCursorSend.current > 60) { lastCursorSend.current = now; sendPresence({ phase }); }
      return;
    }
    if (it.mode === "pan") {
      const k = 1 / pxPerMm;
      setView({ ...it.v, x: it.v.x - (e.clientX - it.sx) * k, y: it.v.y - (e.clientY - it.sy) * k });
      return;
    }
    let next;
    if (it.mode === "drag") next = { x: snap(p.x - it.off.x, e.altKey), y: snap(p.y - it.off.y, e.altKey), rot: it.last.rot };
    else {
      const ang = (Math.atan2(p.y - it.from.y, p.x - it.from.x) * 180) / Math.PI + 90;
      const step = e.shiftKey ? 1 : 15;
      next = { ...it.last, rot: normRot(Math.round(ang / step) * step) };
    }
    if (next.x === it.last.x && next.y === it.last.y && next.rot === it.last.rot) return;
    it.last = next;
    const throttled = now - lastMoveSend.current > 40;
    if (throttled) lastMoveSend.current = now;
    dispatch("se.aether.or.move", { phase, id: it.id, ...next }, { broadcast: throttled });
    if (now - lastCursorSend.current > 60) { lastCursorSend.current = now; sendPresence({ phase }); }
  };

  const onPointerUp = () => {
    const it = interaction.current;
    interaction.current = null;
    if (!it || it.mode === "pan") return;
    const moved = it.last.x !== it.from.x || it.last.y !== it.from.y || it.last.rot !== it.from.rot;
    if (moved) dispatch("se.aether.or.move", { phase, id: it.id, ...it.last, from: it.from, final: true });
    sendPresence({ phase });
  };

  const onPointerLeave = () => { myCursor.current = null; sendPresence({ phase }); };

  const moveSelected = (patch, log = true) => {
    if (!sel) return;
    const from = layout[sel.id];
    const next = { ...from, ...patch };
    if (next.rot !== undefined) next.rot = normRot(next.rot);
    dispatch("se.aether.or.move", { phase, id: sel.id, ...next, ...(log ? { from, final: true } : {}) });
  };

  const onItemKey = (e, id) => {
    const pos = layout[id];
    const step = e.shiftKey ? 250 : SNAP;
    const k = e.key;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[k]) {
      e.preventDefault();
      dispatch("se.aether.or.move", { phase, id, x: pos.x + map[k][0], y: pos.y + map[k][1], rot: pos.rot, from: pos, final: true });
    } else if (k === "r" || k === "R") {
      e.preventDefault();
      dispatch("se.aether.or.move", { phase, id, ...pos, rot: normRot(pos.rot + (e.shiftKey ? 90 : 15)), from: pos, final: true });
    } else if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      dispatch("se.aether.or.place", { phase, id, pos: null });
      setSelected(null);
    } else if (k === "Escape") setSelected(null);
  };

  const addItem = (kind) => {
    const id = `${kind}-${uid()}`;
    const v = view || { x: 0, y: 0, w: room.w, h: room.d };
    const pos = { x: snap(Math.min(room.w - 400, Math.max(400, v.x + v.w / 2)), false), y: snap(Math.min(room.d - 400, Math.max(400, v.y + v.h / 2)), false), rot: 0 };
    const positions = {};
    PHASES.slice(phaseIdx).forEach(p => { positions[p.id] = pos; });
    dispatch("se.aether.or.add", { item: { id, kind }, positions });
    setSelected(id);
    setTab("object");
  };

  const duplicate = () => {
    if (!sel) return;
    const id = `${sel.kind}-${uid()}`;
    const pos = { ...selPos, x: selPos.x + 300, y: selPos.y + 300 };
    const positions = {};
    PHASES.slice(phaseIdx).forEach(p => { positions[p.id] = pos; });
    dispatch("se.aether.or.add", { item: { id, kind: sel.kind, label: sel.label }, positions });
    setSelected(id);
  };

  /* ─── kontroller och förflyttningar ─── */
  const checks = useMemo(() => runChecks(doc.items, layout, room), [doc.items, layout, room]);
  const flagged = useMemo(() => {
    const m = {};
    for (const c of checks) for (const id of c.ids) if (m[id] !== "error") m[id] = c.level;
    return m;
  }, [checks]);
  const moves = useMemo(() => {
    if (!prevLayout) return [];
    return doc.items.map(it => {
      const a = prevLayout[it.id], b = layout[it.id];
      if (!a && !b) return null;
      if (!a) return { it, kind: "in" };
      if (!b) return { it, kind: "out" };
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const dr = Math.abs(normRot(b.rot - a.rot));
      if (dist < 100 && dr < 5) return null;
      return { it, kind: "move", dist, dr, a, b };
    }).filter(Boolean).sort((x, y) => (y.dist || 0) - (x.dist || 0));
  }, [doc.items, layout, prevLayout]);

  const colorOf = (spec) => {
    if (spec.person) return { hn: C.rose, plastic: C.amber, op: C.sage, an: C.blue }[spec.team] || C.fg2;
    return { sterile: C.sage, anesthesia: C.blue, imaging: C.mauve, support: C.fg2, ceiling: C.fg3 }[spec.cat] || C.fg2;
  };

  const peerList = Object.values(peers);
  const peerDragging = Object.fromEntries(peerList.filter(p => p.dragging && p.phase === phase).map(p => [p.dragging, p.peer]));
  const px = (n) => n / pxPerMm; // skärmpixlar → mm

  /* ─── rendering: sal ─── */
  const wallT = 160;
  const doorGaps = room.doors.map((dr, i) => {
    const half = dr.width / 2;
    if (dr.wall === "bottom") return (
      <g key={i}>
        <rect x={dr.at - half} y={room.d - 2} width={dr.width} height={wallT + 4} fill={C.bg} />
        <path d={`M ${dr.at - half} ${room.d} L ${dr.at - half} ${room.d - half} A ${half} ${half} 0 0 1 ${dr.at} ${room.d}`} fill="none" stroke={C.fg3} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <path d={`M ${dr.at + half} ${room.d} L ${dr.at + half} ${room.d - half} A ${half} ${half} 0 0 0 ${dr.at} ${room.d}`} fill="none" stroke={C.fg3} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <text x={dr.at} y={room.d + wallT + px(16)} textAnchor="middle" fontSize={px(11)} fill={C.fg3} fontFamily={mono}>{dr.label}</text>
      </g>
    );
    if (dr.wall === "right") return (
      <g key={i}>
        <rect x={room.w - 2} y={dr.at - half} width={wallT + 4} height={dr.width} fill={C.bg} />
        <path d={`M ${room.w} ${dr.at - half} L ${room.w - dr.width} ${dr.at - half} A ${dr.width} ${dr.width} 0 0 0 ${room.w} ${dr.at + half}`} fill="none" stroke={C.fg3} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <text x={room.w + wallT + px(8)} y={dr.at} fontSize={px(11)} fill={C.fg3} fontFamily={mono} dominantBaseline="middle">{dr.label}</text>
      </g>
    );
    return null;
  });

  const gridLines = [];
  if (show.grid) {
    for (let x = 500; x < room.w; x += 500) gridLines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={room.d} stroke={C.border} strokeWidth={x % 1000 ? 0.5 : 1} vectorEffect="non-scaling-stroke" />);
    for (let y = 500; y < room.d; y += 500) gridLines.push(<line key={`gy${y}`} x1={0} y1={y} x2={room.w} y2={y} stroke={C.border} strokeWidth={y % 1000 ? 0.5 : 1} vectorEffect="non-scaling-stroke" />);
  }

  const renderItem = (it) => {
    const spec = EQUIPMENT[it.kind];
    const pos = layout[it.id];
    const col = colorOf(spec);
    const fill = `color-mix(in oklch, ${col} 12%, ${C.bg})`;
    const isSel = selected === it.id;
    const flag = flagged[it.id];
    const remote = peerDragging[it.id];
    const box = bbox(corners(pos, spec));
    return (
      <g key={it.id}>
        <g
          role="button"
          tabIndex={0}
          aria-label={`${labelOf(it)}, ${spec.w} × ${spec.d} mm, x ${fmtM(pos.x)}, y ${fmtM(pos.y)}, rotation ${pos.rot} grader${flag === "error" ? ", överlappar" : flag === "warn" ? ", varning" : ""}`}
          className="or-plan-item"
          onPointerDown={(e) => startDrag(e, it.id)}
          onFocus={() => { setSelected(it.id); }}
          onKeyDown={(e) => onItemKey(e, it.id)}
          transform={`translate(${pos.x} ${pos.y}) rotate(${pos.rot})`}
          style={{ cursor: interaction.current?.id === it.id ? "grabbing" : "grab", outline: "none" }}
        >
          {(flag || isSel || remote) && (
            <rect x={-spec.w / 2 - px(5)} y={-spec.d / 2 - px(5)} width={spec.w + px(10)} height={spec.d + px(10)} rx={spec.round || spec.person ? Math.max(spec.w, spec.d) / 2 : px(6)}
              fill="none" stroke={remote ? remote.color : flag === "error" ? C.rose : flag === "warn" ? C.amber : C.fg} strokeWidth={isSel || flag === "error" ? 2 : 1.5}
              strokeDasharray={isSel && !flag && !remote ? "none" : flag === "warn" && !remote ? "5 3" : "none"} vectorEffect="non-scaling-stroke" />
          )}
          <Symbol kind={it.kind} spec={spec} col={col} fill={fill} C={C} />
          {spec.person && (
            <text x={0} y={0} transform={`rotate(${-pos.rot})`} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(px(10), 120)} fontFamily={mono} fontWeight={600} fill={col} style={{ pointerEvents: "none" }}>{PERSON_TAG[it.kind] || "··"}</text>
          )}
        </g>
        {remote && (
          <text x={box.x0} y={box.y0 - px(6)} fontSize={px(11)} fontFamily={font} fontWeight={600} fill={remote.color} stroke={C.bg} strokeWidth={px(3)} paintOrder="stroke" style={{ pointerEvents: "none" }}>{remote.name} flyttar…</text>
        )}
      </g>
    );
  };

  const renderLabel = (it) => {
    const spec = EQUIPMENT[it.kind];
    if (spec.person || (it.kind === "light" && selected !== it.id)) return null;
    const pos = layout[it.id];
    const text = labelOf(it);
    const textW = text.length * 6.3;
    const shortSide = Math.min(spec.w, spec.d) * pxPerMm;
    const longSide = Math.max(spec.w, spec.d) * pxPerMm;
    const inside = !spec.ceiling && !spec.round && longSide > textW + 12 && shortSide > 26;
    if (inside) {
      const vertical = spec.d > spec.w;
      const rot = vertical ? (Math.abs(normRot(pos.rot)) > 90 ? 90 : -90) : (Math.abs(normRot(pos.rot)) > 90 ? 180 : 0);
      const textRot = normRot(pos.rot + rot);
      return (
        <text key={`l-${it.id}`} x={pos.x} y={pos.y} transform={`rotate(${textRot} ${pos.x} ${pos.y})`} textAnchor="middle" dominantBaseline="central" fontSize={px(11)} fontFamily={font} fontWeight={600}
          fill={C.fg} stroke={C.bg} strokeWidth={px(3.5)} paintOrder="stroke" style={{ pointerEvents: "none" }}>{text}</text>
      );
    }
    const box = bbox(corners(pos, spec));
    return (
      <text key={`l-${it.id}`} x={pos.x} y={box.y1 + px(13)} textAnchor="middle" fontSize={px(11)} fontFamily={font} fontWeight={500} fill={spec.ceiling ? C.fg3 : C.fg2}
        stroke={C.bg} strokeWidth={px(3)} paintOrder="stroke" style={{ pointerEvents: "none" }}>{text}</text>
    );
  };

  /* mått till väggar för valt objekt */
  const renderSelectionOverlay = () => {
    if (!sel || !selPos) return null;
    const box = bbox(corners(selPos, selSpec));
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    const toLeft = box.x0, toRight = room.w - box.x1, toTop = box.y0, toBottom = room.d - box.y1;
    const hx = toLeft <= toRight ? [0, box.x0, toLeft] : [box.x1, room.w, toRight];
    const vy = toTop <= toBottom ? [0, box.y0, toTop] : [box.y1, room.d, toBottom];
    const dim = { stroke: C.blue, strokeWidth: 1, vectorEffect: "non-scaling-stroke" };
    const lbl = { fontSize: px(11), fontFamily: mono, fill: C.blue, stroke: C.bg, strokeWidth: px(3), paintOrder: "stroke", style: { pointerEvents: "none" } };
    const handleDist = Math.max(selSpec.w, selSpec.d) / 2 + px(26);
    const a = (selPos.rot * Math.PI) / 180;
    const hxp = selPos.x + Math.sin(a) * handleDist, hyp = selPos.y - Math.cos(a) * handleDist;
    return (
      <g>
        {selSpec.reach && <circle cx={selPos.x} cy={selPos.y} r={selSpec.reach} fill={`color-mix(in oklch, ${C.mauve} 5%, transparent)`} stroke={C.mauve} strokeWidth={1} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />}
        {hx[2] > 0 && <g style={{ pointerEvents: "none" }}><line x1={hx[0]} y1={cy} x2={hx[1]} y2={cy} {...dim} markerStart="url(#or-tick)" markerEnd="url(#or-tick)" /><text x={(hx[0] + hx[1]) / 2} y={cy - px(6)} textAnchor="middle" {...lbl}>{fmtM(hx[2])}</text></g>}
        {vy[2] > 0 && <g style={{ pointerEvents: "none" }}><line x1={cx} y1={vy[0]} x2={cx} y2={vy[1]} {...dim} markerStart="url(#or-tick)" markerEnd="url(#or-tick)" /><text x={cx + px(6)} y={(vy[0] + vy[1]) / 2} dominantBaseline="middle" {...lbl}>{fmtM(vy[2])}</text></g>}
        <line x1={selPos.x + Math.sin(a) * (Math.max(selSpec.w, selSpec.d) / 2)} y1={selPos.y - Math.cos(a) * (Math.max(selSpec.w, selSpec.d) / 2)} x2={hxp} y2={hyp} stroke={C.fg} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
        <circle cx={hxp} cy={hyp} r={px(8)} fill={C.bg} stroke={C.fg} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: "grab" }} onPointerDown={(e) => startRotate(e, sel.id)}>
          <title>Dra för att rotera (Shift = 1°)</title>
        </circle>
      </g>
    );
  };

  const renderMoves = () => {
    if (!show.moves || !prevLayout) return null;
    return moves.filter(m => m.kind === "move").map(m => {
      const spec = EQUIPMENT[m.it.kind];
      return (
        <g key={`mv-${m.it.id}`} style={{ pointerEvents: "none" }}>
          <g transform={`translate(${m.a.x} ${m.a.y}) rotate(${m.a.rot})`}>
            {spec.round || spec.person
              ? <ellipse rx={spec.w / 2} ry={spec.d / 2} fill="none" stroke={C.fg3} strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              : <rect x={-spec.w / 2} y={-spec.d / 2} width={spec.w} height={spec.d} rx={30} fill="none" stroke={C.fg3} strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          </g>
          {m.dist >= 100 && <line x1={m.a.x} y1={m.a.y} x2={m.b.x} y2={m.b.y} stroke={C.fg3} strokeWidth={1.25} strokeDasharray="6 4" markerEnd="url(#or-arrow)" vectorEffect="non-scaling-stroke" />}
        </g>
      );
    });
  };

  const renderCursors = () => peerList.filter(p => p.cursor && p.phase === phase).map(p => (
    <g key={`c-${p.peer.id}`} transform={`translate(${p.cursor.x} ${p.cursor.y}) scale(${1 / pxPerMm})`} style={{ pointerEvents: "none" }}>
      <path d="M0 0 L0 15 L4 11 L7 18 L10 17 L7 10 L12 10 Z" fill={p.peer.color} stroke={C.bg} strokeWidth={1.2} />
      <rect x={12} y={14} width={p.peer.name.length * 6.4 + 12} height={18} rx={9} fill={p.peer.color} />
      <text x={18} y={26.5} fontSize={11} fontFamily={font} fill="white" fontWeight={600}>{p.peer.name}</text>
    </g>
  ));

  /* skalstock */
  const scaleBar = (() => {
    const target = 120 / pxPerMm;
    const steps = [250, 500, 1000, 2000, 5000];
    const mm = steps.find(s => s >= target * 0.6) || 5000;
    return { mm, px: mm * pxPerMm };
  })();

  /* ─── UI-hjälpare ─── */
  const chip = (active) => ({ padding: "5px 10px", minHeight: 32, border: `1px solid ${active ? C.fg3 : C.border}`, borderRadius: 6, background: active ? C.s2 : "transparent", color: active ? C.fg : C.fg2, ...T.meta, fontFamily: font, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });
  const iconBtn = { width: 34, height: 34, border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, color: C.fg2, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
  const sectionLabel = { ...T.eyebrow, fontWeight: 600, letterSpacing: "0.04em", color: C.fg3, margin: "16px 0 6px" };
  const numInput = { width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, color: C.fg, ...T.meta, fontFamily: mono, fontVariantNumeric: "tabular-nums" };
  const errors = checks.filter(c => c.level === "error").length;
  const warns = checks.length - errors;
  const time = (ts) => new Date(ts).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  const describeCheck = (c) => {
    const names = c.ids.map(id => labelOf(itemsById[id]));
    if (c.kind === "collision") return `${names[0]} överlappar ${names[1]}`;
    if (c.kind === "margin") return `${names.join(" ↔ ")}: ${fmtMM(c.dist)} till sterilt fält (min ${STERILE_MARGIN} mm)`;
    return `${names[0]} står utanför salens väggar`;
  };

  return (
    <div style={{ height: "calc(100vh - 110px)", minHeight: 560, display: "flex", flexDirection: "column", fontFamily: font }}>
      {/* verktygsrad */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, marginRight: "auto" }}>
          <div style={{ ...T.label, fontWeight: 600, color: C.fg }}>OR-planering</div>
          <div style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>{patient.name} · {room.name} · {fmtMM(room.w)} × {fmtMM(room.d)}</div>
        </div>
        <div role="tablist" aria-label="Operationsfas" style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, padding: 2, background: C.s1 }}>
          {PHASES.map(p => (
            <button key={p.id} role="tab" aria-selected={phase === p.id} onClick={() => setPhase(p.id)}
              style={{ padding: "5px 12px", minHeight: 32, border: "none", borderRadius: 6, background: phase === p.id ? C.bg : "transparent", boxShadow: phase === p.id ? C.shadowSm : "none", color: phase === p.id ? C.fg : C.fg3, ...T.meta, fontFamily: font, fontWeight: phase === p.id ? 600 : 400, cursor: "pointer" }}>
              <span style={{ fontFamily: mono, fontSize: "0.75rem", color: C.fg3, marginRight: 6 }}>{p.short}</span>{p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {[["labels", "Etiketter"], ["moves", "Förflyttningar"], ["grid", "Rutnät"]].map(([k, l]) => (
            <button key={k} aria-pressed={show[k]} onClick={() => setShow(s => ({ ...s, [k]: !s[k] }))} style={chip(show[k])}>{l}</button>
          ))}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }} aria-label="Personer i planeringen">
          <div style={{ display: "flex" }}>
            {[{ peer: me, self: true }, ...peerList].map((p, i) => (
              <span key={p.peer.id} title={`${p.peer.name} · ${p.peer.role}${p.self ? " (du)" : ""}`}
                style={{ width: 30, height: 30, borderRadius: "50%", background: p.peer.color, color: "white", border: `2px solid ${C.bg}`, marginLeft: i ? -8 : 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, fontFamily: mono }}>
                {initials(p.peer.name)}
              </span>
            ))}
          </div>
          <span style={{ ...T.meta, color: C.fg3, whiteSpace: "nowrap" }}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.sage, marginRight: 5 }} />Live · {peerList.length + 1}</span>
        </div>
      </div>

      <div className="or-layout-shell" style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
        {/* rityta */}
        <div ref={wrapRef} style={{ flex: 1, minWidth: 0, minHeight: 360, position: "relative", background: C.s1, overflow: "hidden" }}>
          {view && (
            <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet"
              style={{ width: "100%", height: "100%", display: "block", touchAction: "none", userSelect: "none", cursor: interaction.current?.mode === "pan" ? "grabbing" : "default" }}
              onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerLeave}
              role="application" aria-label={`Skalenlig planritning av ${room.name}, ${PHASES[phaseIdx].label}. Välj objekt med Tab, flytta med piltangenter, R roterar.`}>
              <defs>
                <pattern id="or-hatch" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="120" stroke={C.sage} strokeWidth="14" opacity="0.18" />
                </pattern>
                <marker id="or-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill={C.fg3} />
                </marker>
                <marker id="or-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                  <line x1="5" y1="0" x2="5" y2="10" stroke={C.blue} strokeWidth="1.5" />
                </marker>
              </defs>
              <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={C.s1} onPointerDown={startPan} />
              <rect x={-wallT} y={-wallT} width={room.w + 2 * wallT} height={room.d + 2 * wallT} fill={C.s3} onPointerDown={startPan} />
              <rect x={0} y={0} width={room.w} height={room.d} fill={C.bg} stroke={C.fg2} strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPointerDown={startPan} />
              <g style={{ pointerEvents: "none" }}>{gridLines}</g>
              {doorGaps}
              {/* salens mått */}
              <g style={{ pointerEvents: "none" }}>
                <line x1={0} y1={-wallT - px(18)} x2={room.w} y2={-wallT - px(18)} stroke={C.fg3} strokeWidth={1} vectorEffect="non-scaling-stroke" markerStart="url(#or-tick)" markerEnd="url(#or-tick)" />
                <text x={room.w / 2} y={-wallT - px(24)} textAnchor="middle" fontSize={px(11)} fontFamily={mono} fill={C.fg3}>{fmtMM(room.w)}</text>
                <line x1={-wallT - px(18)} y1={0} x2={-wallT - px(18)} y2={room.d} stroke={C.fg3} strokeWidth={1} vectorEffect="non-scaling-stroke" markerStart="url(#or-tick)" markerEnd="url(#or-tick)" />
                <text x={-wallT - px(24)} y={room.d / 2} textAnchor="middle" fontSize={px(11)} fontFamily={mono} fill={C.fg3} transform={`rotate(-90 ${-wallT - px(24)} ${room.d / 2})`}>{fmtMM(room.d)}</text>
              </g>
              {renderMoves()}
              {show.ceiling && presentItems.filter(i => EQUIPMENT[i.kind].ceiling).map(renderItem)}
              {presentItems.filter(i => { const sp = EQUIPMENT[i.kind]; return !sp.ceiling && !sp.person; }).sort((a, b) => (EQUIPMENT[b.kind].seat ? 1 : 0) - (EQUIPMENT[a.kind].seat ? 1 : 0)).map(renderItem)}
              {presentItems.filter(i => EQUIPMENT[i.kind].person).map(renderItem)}
              {show.labels && <g>{presentItems.filter(i => show.ceiling || !EQUIPMENT[i.kind].ceiling).map(renderLabel)}</g>}
              {renderSelectionOverlay()}
              {renderCursors()}
            </svg>
          )}
          {/* skalstock och zoom */}
          <div style={{ position: "absolute", left: 12, bottom: 12, padding: "6px 10px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, pointerEvents: "none" }}>
            <div>
              <div style={{ width: scaleBar.px, height: 6, borderLeft: `1.5px solid ${C.fg}`, borderRight: `1.5px solid ${C.fg}`, borderBottom: `1.5px solid ${C.fg}` }} />
              <div style={{ ...T.meta, fontSize: "0.75rem", fontFamily: mono, color: C.fg2, marginTop: 2 }}>{fmtM(scaleBar.mm)}</div>
            </div>
            <div style={{ ...T.meta, fontSize: "0.75rem", fontFamily: mono, color: C.fg3, lineHeight: 1.35 }}>Ruta 0,5 m<br />Fäst 50 mm · Alt = fritt</div>
          </div>
          <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", gap: 4 }}>
            <button aria-label="Zooma ut" onClick={() => zoomBy(1.25)} style={iconBtn}><ZoomOut size={16} /></button>
            <button aria-label="Anpassa till salen" onClick={fitView} style={iconBtn}><Maximize2 size={16} /></button>
            <button aria-label="Zooma in" onClick={() => zoomBy(0.8)} style={iconBtn}><ZoomIn size={16} /></button>
          </div>
          {(errors > 0 || warns > 0) && (
            <button onClick={() => setTab("checks")} style={{ position: "absolute", left: 12, top: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, border: `1px solid ${errors ? C.rose : C.amber}55`, background: errors ? C.roseBg : C.amberBg, color: errors ? C.rose : C.amber, ...T.meta, fontFamily: font, cursor: "pointer" }}>
              <AlertTriangle size={14} />{errors ? `${errors} kollision${errors > 1 ? "er" : ""}` : ""}{errors && warns ? " · " : ""}{warns ? `${warns} varning${warns > 1 ? "ar" : ""}` : ""}
            </button>
          )}
        </div>

        {/* sidopanel */}
        <aside className="or-layout-sidebar" style={{ width: 320, flexShrink: 0, background: C.bg, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div role="tablist" aria-label="Panel" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: `1px solid ${C.border}` }}>
            {[["object", "Objekt"], ["library", "Bibliotek"], ["checks", `Kontroll${checks.length ? ` (${checks.length})` : ""}`], ["log", "Logg"]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                style={{ padding: "10px 4px", minHeight: 40, border: "none", borderBottom: `2px solid ${tab === k ? C.fg : "transparent"}`, background: "transparent", color: tab === k ? C.fg : C.fg3, ...T.meta, fontSize: "0.85rem", fontFamily: font, fontWeight: tab === k ? 600 : 400, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px 16px" }}>
            {tab === "object" && (sel && selPos ? (
              <div>
                <div style={sectionLabel}>Valt objekt</div>
                <input aria-label="Namn" value={labelOf(sel)} onChange={(e) => dispatch("se.aether.or.label", { id: sel.id, label: e.target.value })}
                  style={{ ...numInput, fontFamily: font, fontWeight: 600, fontSize: "1rem" }} />
                <div style={{ ...T.meta, color: C.fg3, marginTop: 4 }}>{selSpec.model || selSpec.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", marginTop: 12, ...T.meta }}>
                  <span style={{ color: C.fg3 }}>Fotavtryck</span>
                  <span style={{ fontFamily: mono, color: C.fg }}>{fmtMM(selSpec.w)} × {fmtMM(selSpec.d)}</span>
                  {selSpec.reach && <><span style={{ color: C.fg3 }}>Räckvidd</span><span style={{ fontFamily: mono, color: C.fg }}>ca {fmtMM(selSpec.reach)}</span></>}
                  <span style={{ color: C.fg3 }}>Källa</span>
                  <span style={{ color: selSpec.src === "typ" ? C.amber : C.fg2 }}>{SRC_LABEL[selSpec.src]}</span>
                </div>
                {selSpec.ref && <div style={{ ...T.meta, fontSize: "0.82rem", color: C.fg3, marginTop: 6, lineHeight: 1.45 }}>{selSpec.ref}</div>}
                <div style={sectionLabel}>Position · {PHASES[phaseIdx].label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {[["x", "X (mm)"], ["y", "Y (mm)"], ["rot", "Rotation °"]].map(([k, l]) => (
                    <label key={k} style={{ ...T.meta, fontSize: "0.78rem", color: C.fg3 }}>{l}
                      <input type="number" step={k === "rot" ? 15 : SNAP} value={Math.round(selPos[k])}
                        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) moveSelected({ [k]: v }, false); }}
                        style={{ ...numInput, marginTop: 2 }} />
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <button aria-label="Rotera −15°" onClick={() => moveSelected({ rot: selPos.rot - 15 })} style={iconBtn}><RotateCcw size={16} /></button>
                  <button aria-label="Rotera +15°" onClick={() => moveSelected({ rot: selPos.rot + 15 })} style={iconBtn}><RotateCw size={16} /></button>
                  <button onClick={() => moveSelected({ rot: selPos.rot + 90 })} style={{ ...chip(false), fontFamily: mono }}>+90°</button>
                  <button aria-label="Duplicera" onClick={duplicate} style={iconBtn}><Copy size={16} /></button>
                  <button aria-label="Ta bort helt" onClick={() => { dispatch("se.aether.or.remove", { id: sel.id }); setSelected(null); }} style={{ ...iconBtn, color: C.rose }}><Trash2 size={16} /></button>
                </div>
                <button onClick={() => { dispatch("se.aether.or.place", { phase, id: sel.id, pos: null }); setSelected(null); }} style={{ ...chip(false), marginTop: 8, width: "100%", justifyContent: "center" }}>
                  <LeaveIcon size={14} /> Ej i salen under {PHASES[phaseIdx].label.toLowerCase()}
                </button>
                <div style={{ ...T.meta, fontSize: "0.8rem", color: C.fg3, marginTop: 12, lineHeight: 1.5 }}>
                  Piltangenter flyttar 50 mm (Shift 250). R roterar 15° (Shift 90°). Dra i handtaget ovanför objektet för att rotera fritt.
                </div>
              </div>
            ) : (
              <div>
                <div style={sectionLabel}>I salen · {PHASES[phaseIdx].label} ({presentItems.length})</div>
                <div style={{ display: "grid", gap: 2 }}>
                  {presentItems.map(it => {
                    const spec = EQUIPMENT[it.kind];
                    return (
                      <button key={it.id} onClick={() => setSelected(it.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", minHeight: 34, border: "none", borderRadius: 6, background: "transparent", textAlign: "left", cursor: "pointer", ...T.meta, color: C.fg2 }}>
                        <span style={{ width: 8, height: 8, borderRadius: spec.person || spec.round ? "50%" : 2, background: colorOf(spec), flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf(it)}</span>
                        {flagged[it.id] && <AlertTriangle size={13} color={flagged[it.id] === "error" ? C.rose : C.amber} />}
                        <span style={{ fontFamily: mono, fontSize: "0.75rem", color: C.fg3 }}>{spec.w}×{spec.d}</span>
                      </button>
                    );
                  })}
                </div>
                {absentItems.length > 0 && (
                  <>
                    <div style={sectionLabel}>Utanför salen denna fas</div>
                    {absentItems.map(it => (
                      <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", ...T.meta, color: C.fg3 }}>
                        <span style={{ flex: 1 }}>{labelOf(it)}</span>
                        <button onClick={() => {
                          const fromOther = PHASES.map(p => doc.layouts[p.id]?.[it.id]).find(Boolean) || { x: room.w / 2, y: room.d / 2, rot: 0 };
                          dispatch("se.aether.or.place", { phase, id: it.id, pos: fromOther });
                          setSelected(it.id);
                        }} style={chip(false)}><LogIn size={13} /> Ta in</button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}

            {tab === "library" && (
              <div>
                <div style={{ ...T.meta, color: C.fg3, margin: "12px 0 4px", lineHeight: 1.5 }}>
                  Objekten ritas i verkligt fotavtryck. <span style={{ color: C.amber }}>Typiska mått</span> bör mätas upp på salen innan planen används skarpt.
                </div>
                {LIBRARY_GROUPS.map(g => (
                  <div key={g.label}>
                    <div style={sectionLabel}>{g.label}</div>
                    {g.kinds.map(k => {
                      const s = EQUIPMENT[k];
                      return (
                        <button key={k} onClick={() => addItem(k)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 8px", minHeight: 44, border: `1px solid transparent`, borderRadius: 8, background: "transparent", textAlign: "left", cursor: "pointer" }}>
                          <svg width="30" height="30" viewBox={`${-Math.max(s.w, s.d) / 2 - 60} ${-Math.max(s.w, s.d) / 2 - 60} ${Math.max(s.w, s.d) + 120} ${Math.max(s.w, s.d) + 120}`} aria-hidden="true" style={{ flexShrink: 0 }}>
                            <Symbol kind={k} spec={s} col={colorOf(s)} fill={`color-mix(in oklch, ${colorOf(s)} 12%, ${C.bg})`} C={C} />
                          </svg>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", ...T.meta, color: C.fg, fontWeight: 500 }}>{s.name}</span>
                            <span style={{ display: "block", ...T.meta, fontSize: "0.78rem", color: C.fg3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.model || SRC_LABEL[s.src]}</span>
                          </span>
                          <span style={{ fontFamily: mono, fontSize: "0.72rem", color: s.src === "typ" ? C.amber : C.fg3, textAlign: "right", flexShrink: 0 }}>{s.w}×{s.d}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {tab === "checks" && (
              <div>
                <div style={sectionLabel}>{PHASES[phaseIdx].short} · {PHASES[phaseIdx].label}</div>
                <div style={{ ...T.meta, color: C.fg2, lineHeight: 1.6 }}>{PHASE_NOTES[phase]}</div>
                <div style={sectionLabel}>Checklista (delad)</div>
                {PHASE_CHECKLIST[phase].map((label, i) => {
                  const done = !!doc.checks[phase]?.[i];
                  return (
                    <label key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 8px", borderRadius: 8, background: C.s1, marginBottom: 4, cursor: "pointer", ...T.meta, color: done ? C.fg3 : C.fg2, textDecoration: done ? "line-through" : "none" }}>
                      <input type="checkbox" checked={done} onChange={(e) => dispatch("se.aether.or.check", { phase, index: i, done: e.target.checked })} style={{ marginTop: 4, accentColor: C.sage }} />
                      {label}
                    </label>
                  );
                })}
                <div style={sectionLabel}>Konflikter ({checks.length})</div>
                {checks.length === 0 && <div style={{ ...T.meta, color: C.sage }}>Inga överlapp eller marginalbrott i den här fasen.</div>}
                {checks.map((c, i) => (
                  <button key={i} onClick={() => { setSelected(c.ids[0]); }} style={{ display: "flex", gap: 8, alignItems: "flex-start", width: "100%", padding: "7px 8px", marginBottom: 4, border: `1px solid ${c.level === "error" ? C.rose : C.amber}33`, borderRadius: 8, background: c.level === "error" ? C.roseBg : C.amberBg, textAlign: "left", cursor: "pointer", ...T.meta, color: c.level === "error" ? C.rose : C.amber }}>
                    <AlertTriangle size={14} style={{ marginTop: 3, flexShrink: 0 }} />{describeCheck(c)}
                  </button>
                ))}
                <div style={{ ...T.meta, fontSize: "0.8rem", color: C.fg3, marginTop: 4, lineHeight: 1.5 }}>
                  Marginal: osterila personer och utrustning varnas inom {STERILE_MARGIN} mm från bord markerade som sterila. Takmonterat räknas inte.
                </div>
                {prevLayout && (
                  <>
                    <div style={sectionLabel}>Förflyttningar från {PHASES[phaseIdx - 1].label.toLowerCase()}</div>
                    {moves.length === 0 && <div style={{ ...T.meta, color: C.fg3 }}>Inget flyttas.</div>}
                    {moves.map(m => (
                      <button key={m.it.id} onClick={() => setSelected(m.it.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "5px 8px", border: "none", borderRadius: 6, background: "transparent", textAlign: "left", cursor: "pointer", ...T.meta, color: C.fg2 }}>
                        <span style={{ flex: 1 }}>{labelOf(m.it)}</span>
                        <span style={{ fontFamily: mono, fontSize: "0.8rem", color: m.kind === "in" ? C.sage : m.kind === "out" ? C.rose : C.fg3 }}>
                          {m.kind === "in" ? "kommer in" : m.kind === "out" ? "går ut" : `${fmtM(m.dist)}${m.dr ? ` · ${m.dr}°` : ""}`}
                        </span>
                      </button>
                    ))}
                  </>
                )}
                <div style={sectionLabel}>Salens mått</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[["w", "Bredd (mm)"], ["d", "Djup (mm)"]].map(([k, l]) => (
                    <label key={k} style={{ ...T.meta, fontSize: "0.78rem", color: C.fg3 }}>{l}
                      <input type="number" step={100} min={3000} max={15000} defaultValue={room[k]} key={`${k}-${room[k]}`}
                        onBlur={(e) => { const v = Number(e.target.value); if (v >= 3000 && v <= 15000 && v !== room[k]) dispatch("se.aether.or.room", { ...{ w: room.w, d: room.d }, [k]: v }); }}
                        style={{ ...numInput, marginTop: 2 }} />
                    </label>
                  ))}
                </div>
                <button onClick={() => { dispatch("se.aether.or.reset", {}); setSelected(null); }} style={{ ...chip(false), marginTop: 12, width: "100%", justifyContent: "center", color: C.fg3 }}>Återställ standardlayout</button>
              </div>
            )}

            {tab === "log" && (
              <div>
                <div style={sectionLabel}>Du planerar som</div>
                <select value={me.name} onChange={(e) => { const idx = ROSTER.findIndex(r => r.name === e.target.value); setMe(m => ({ ...m, ...ROSTER[idx], color: PEER_COLORS[idx % PEER_COLORS.length] })); }}
                  style={{ ...numInput, fontFamily: font }}>
                  {ROSTER.map(r => <option key={r.name} value={r.name}>{r.name} · {r.role}</option>)}
                </select>
                <div style={{ ...T.meta, fontSize: "0.8rem", color: C.fg3, marginTop: 6, lineHeight: 1.5 }}>
                  Prototyp: ändringar synkas live mellan flikar i samma webbläsare. Händelserna är formade som Matrix-händelser (<span style={{ fontFamily: mono }}>se.aether.or.*</span>) inför ett riktigt delat rum.
                </div>
                <div style={sectionLabel}>Ändringslogg</div>
                {doc.log.length === 0 && <div style={{ ...T.meta, color: C.fg3 }}>Inga ändringar ännu.</div>}
                {doc.log.map(l => (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.s2}`, ...T.meta }}>
                    <span style={{ fontFamily: mono, fontSize: "0.75rem", color: C.fg3, paddingTop: 2 }}>{time(l.ts)}</span>
                    <span style={{ color: C.fg2 }}>
                      <span style={{ color: l.sender.color, fontWeight: 600 }}>{l.sender.name}</span> {l.text}
                      {l.phase && <span style={{ color: C.fg3 }}> · {PHASES.find(p => p.id === l.phase)?.short}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
