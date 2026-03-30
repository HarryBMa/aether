import { useState, useRef, useEffect, useCallback } from "react";

const C = {
  bg: "oklch(13% 0.008 55)", s1: "oklch(16% 0.006 55)", s2: "oklch(19% 0.006 55)", s3: "oklch(23% 0.005 55)",
  fg: "oklch(90% 0.01 55)", fg2: "oklch(68% 0.01 55)", fg3: "oklch(48% 0.012 55)", border: "oklch(22% 0.008 55)",
  ink: "oklch(8% 0.005 55)", ink2: "oklch(10% 0.005 55)",
  sage: "oklch(65% 0.1 155)", sageBg: "oklch(20% 0.03 155)",
  blue: "oklch(65% 0.12 245)", blueBg: "oklch(20% 0.03 245)",
  amber: "oklch(72% 0.14 75)", amberBg: "oklch(22% 0.04 75)",
  rose: "oklch(65% 0.12 15)", roseBg: "oklch(20% 0.03 15)",
  mauve: "oklch(65% 0.1 310)", mauveBg: "oklch(20% 0.03 310)",
  shadowSm: "0 1px 3px color-mix(in oklch, oklch(0% 0 0) 12%, transparent)",
};
const font = "'Instrument Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', monospace";
const T = {
  eyebrow: { fontSize: "0.72rem", lineHeight: 1.4, letterSpacing: "0.08em" },
  meta: { fontSize: "0.8rem", lineHeight: 1.45 },
  body: { fontSize: "1rem", lineHeight: 1.65 },
  bodySm: { fontSize: "0.92rem", lineHeight: 1.6 },
  label: { fontSize: "0.88rem", lineHeight: 1.45 },
  titleSm: { fontSize: "1rem", lineHeight: 1.35 },
  title: { fontSize: "1.15rem", lineHeight: 1.25 },
  section: { fontSize: "1.3rem", lineHeight: 1.2 },
};
const patient = { name: "Erik Lindström", id: "EL-2026-0847", age: 58 };

const Tag = ({ text, color, bg }) => (
  <span style={{ ...T.meta, fontWeight: 500, fontFamily: mono, color, background: bg, padding: "2px 8px", borderRadius: 4 }}>{text}</span>
);
const Btn = ({ children, primary, onClick, small, style: s }) => (
  <button onClick={onClick} style={{ padding: small ? "5px 11px" : "8px 16px", border: primary ? "none" : `1px solid ${C.border}`, background: primary ? C.sage : "transparent", color: primary ? C.bg : C.fg2, borderRadius: 6, fontSize: small ? "0.84rem" : "0.92rem", lineHeight: 1.2, fontWeight: 500, cursor: "pointer", fontFamily: mono, ...s }}>{children}</button>
);
const Badge = ({ n, color }) => n > 0 ? <span style={{ ...T.meta, fontWeight: 600, fontFamily: mono, background: color, color: C.bg, borderRadius: 10, padding: "1px 6px" }}>{n}</span> : null;
const Label = ({ children }) => (
  <div style={{ ...T.eyebrow, fontFamily: mono, color: C.fg3, textTransform: "uppercase", marginBottom: 6 }}>{children}</div>
);

const rooms = [
  { icon: "🏥", name: "Kirurgplanering", unread: 3, color: C.sage },
  { icon: "💉", name: "Anestesi", unread: 0, color: C.blue },
  { icon: "📡", name: "Radiologi", unread: 1, color: C.amber },
  { icon: "🔬", name: "Onkologi", unread: 0, color: C.mauve },
  { icon: "🦴", name: "Maxillofacial", unread: 2, color: C.amber },
  { icon: "🗣️", name: "Rehab & Tal", unread: 0, color: C.sage },
  { icon: "💊", name: "Apotek", unread: 0, color: C.blue },
  { icon: "📅", name: "Vårdsamordning", unread: 1, color: C.rose },
];

const messages = [
  { from: "Dr. A. Bergström", role: "H&H Kirurgi", time: "09:14", text: "CTA visar adekvat peroneal kärlkaliber bilateralt. Vänster sida föredras — bättre pedikellängd för denna defekt." },
  { from: "Dr. K. Johansson", role: "Plastikkirurgi", time: "09:22", text: "Överens om vänster. 3D-modell beställd. Kan vi få DICOM till labbet idag?" },
  { from: "Dr. M. Eriksson", role: "Maxillofacial", time: "09:31", text: "DICOM vidarebefordrat. Tandextraktioner i strålningsfältet måste göras först — lagt till i uppgiftstavlan, 2 veckors tidslinje." },
  { from: "Dr. A. Bergström", role: "H&H Kirurgi", time: "09:45", text: "Bra noterat. Protetik behöver den kirurgiska planen innan extraktionerna. Skickar konsultation nu." },
];

const timelineEvents = [
  { date: "01-15", label: "Remiss mottagen", dept: "H&H Kirurgi", done: true },
  { date: "01-22", label: "Inledande MDT-diskussion", dept: "MDT", done: true },
  { date: "02-03", label: "Staging CT + MRI", dept: "Radiologi", done: true },
  { date: "02-10", label: "CTA nedre extremiteter", dept: "Radiologi", done: true },
  { date: "02-14", label: "Tumorkonferens — plan bekräftad", dept: "MDT", done: true },
  { date: "02-20", label: "Tandextraktioner", dept: "Maxillofacial", done: true },
  { date: "03-05", label: "Preoperativ anestesibedömning", dept: "Anestesi", done: true },
  { date: "03-12", label: "3D-modell mottagen", dept: "Plastikkirurgi", done: true },
  { date: "03-19", label: "MDT — slutlig plangranskning", dept: "MDT", done: false, current: true },
  { date: "04-02", label: "Operation: resektion + lambå", dept: "H&H / Plastik", done: false },
  { date: "04-09", label: "Överflyttning till avdelning", dept: "Avdelning", done: false },
  { date: "04-16", label: "Talterapi börjar", dept: "Rehab", done: false },
  { date: "05-01", label: "Strålbehandling börjar", dept: "Onkologi", done: false },
  { date: "06-15", label: "Strålbehandling avslutad", dept: "Onkologi", done: false },
  { date: "07-01", label: "Protetisk rehabilitering börjar", dept: "Maxillofacial", done: false },
  { date: "09-01", label: "3-månaders postoperativ kontroll", dept: "H&H Kirurgi", done: false },
];

const calendarAppts = [
  { day: "Mån 24", items: [{ t: "08:30", n: "Sårvård", l: "Södersjukhuset", c: C.rose }] },
  { day: "Tis 25", items: [{ t: "10:00", n: "Strålning (14/33)", l: "Karolinska Solna", c: C.mauve }, { t: "14:00", n: "Dietist", l: "Karolinska Solna", c: C.sage }] },
  { day: "Ons 26", items: [{ t: "08:30", n: "Sårvård", l: "Södersjukhuset", c: C.rose }, { t: "13:00", n: "Logoped", l: "Danderyds sjukhus", c: C.sage }] },
  { day: "Tor 27", items: [{ t: "10:00", n: "Strålning (15/33)", l: "Karolinska Solna", c: C.mauve }] },
  { day: "Fre 28", items: [{ t: "08:30", n: "Sårvård", l: "Södersjukhuset", c: C.rose }, { t: "11:00", n: "Plastikkirurgi uppföljning", l: "Karolinska", c: C.blue }, { t: "14:30", n: "Protetik", l: "Eastmaninstitutet", c: C.amber }] },
];

const mdtData = {
  decisions: [
    "Segmentell mandibulektomi + fibula lambå (vänster)",
    "Operation först, adjuvant strålning postoperativt",
    "Tandextraktioner läkta — godkänd för operation",
    "Fiberoptisk intubation, artärlinje, cell saver i beredskap",
  ],
  actions: [
    { t: "Bekräfta OR 2 apr — 10h plats", o: "Koordinator", d: "21 mar" },
    { t: "Slutlig 3D-modellgranskning", o: "Dr. Johansson", d: "26 mar" },
    { t: "Pre-op blodprover + korsblodprövning", o: "Avdelningen", d: "31 mar" },
    { t: "Patientinformation", o: "Dr. Bergström", d: "25 mar" },
  ],
  patientSv: "Ert vårdteam träffades den 19 mars för att diskutera er behandlingsplan. Teamet har beslutat att gå vidare med operation den 2 april. Kirurgen tar bort den sjuka delen av käkbenet och återuppbygger det med ben och vävnad från ert ben. Operationen tar cirka 10 timmar. Ni vårdas på intensiven efteråt och strålbehandling startar ca 4 veckor senare.",
};

/* ─── 1. ÄRENDEYTA ─── */
function CaseSpace({ nav }) {
  const [room, setRoom] = useState(0);
  return (
    <div className="case-space" style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 48px)" }}>
      <div className="case-space-sidebar" style={{ width: 220, background: C.s1, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ ...T.titleSm, fontWeight: 600, color: C.fg }}>{patient.name}</div>
          <div style={{ ...T.meta, fontFamily: mono, color: C.fg3, marginTop: 4 }}>{patient.id} · {patient.age}å · <Tag text="H&H Lambå" color={C.sage} bg={C.sageBg} /></div>
        </div>
        <div style={{ flex: 1, padding: "6px 0", overflowY: "auto" }}>
          {rooms.map((r, i) => (
            <div key={i} onClick={() => setRoom(i)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", cursor: "pointer", background: room === i ? C.s2 : "transparent", borderLeft: room === i ? `2px solid ${r.color}` : "2px solid transparent" }}>
              <span style={{ fontSize: 12 }}>{r.icon}</span>
              <span style={{ ...T.label, color: room === i ? C.fg : C.fg2, flex: 1, fontWeight: room === i ? 500 : 400 }}>{r.name}</span>
              <Badge n={r.unread} color={r.color} />
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
          <Btn onClick={() => nav("consult")} small style={{ width: "100%", textAlign: "left" }}>+ Konsultation</Btn>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "9px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...T.label, fontWeight: 500, color: C.fg }}>{rooms[room].icon} {rooms[room].name} <span style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>· 4 deltagare</span></span>
        </div>
        <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
                <span style={{ ...T.label, fontWeight: 600, color: C.fg }}>{m.from}</span>
                <span style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>{m.role} · {m.time}</span>
              </div>
              <p style={{ ...T.body, color: C.fg2, margin: 0, maxWidth: "60ch" }}>{m.text}</p>
            </div>
          ))}
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, maxWidth: 340, marginTop: 4 }}>
            <Label>FHIR · Observation</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px" }}>
              {[["Hb", "138 g/L", "130–175"], ["K+", "4,1 mmol/L", "3,5–5,0"], ["Albumin", "34 g/L ↓", "36–45"], ["eGFR", ">90", ">60"]].map(([l, v, r], i) => (
                <div key={i}>
                  <div style={{ ...T.meta, color: C.fg3, fontFamily: mono }}>{l}</div>
                  <div style={{ ...T.label, fontWeight: 600, color: v.includes("↓") ? C.amber : C.fg }}>{v}</div>
                  <div style={{ ...T.meta, color: C.fg3, fontFamily: mono }}>{r}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
          <input aria-label={`Meddelande till ${rooms[room].name}`} placeholder={`Meddelande #${rooms[room].name.toLowerCase()}...`} style={{ flex: 1, minWidth: 0, padding: "8px 12px", background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, color: C.fg, fontSize: "1rem", lineHeight: 1.45, fontFamily: font, outline: "none" }} />
          <Btn primary>Skicka</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── 2. TIDSLINJE ─── */
function Timeline() {
  return (
    <div style={{ padding: "24px 20px", maxWidth: 600, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ ...T.section, fontWeight: 600, color: C.fg }}>{patient.name}</div>
        <div style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>Vårdtidslinje · Jan → Sep 2026</div>
      </div>
      <div style={{ paddingLeft: 20, position: "relative" }}>
        <div style={{ position: "absolute", left: 6, top: 3, bottom: 3, width: 2, background: C.border }} />
        {timelineEvents.map((e, i) => (
          <div key={i} style={{ marginBottom: 14, position: "relative" }}>
            <div style={{ position: "absolute", left: -17, top: 3, width: 10, height: 10, borderRadius: "50%", background: e.current ? C.sage : e.done ? C.s3 : C.s1, border: `2px solid ${e.current ? C.sage : e.done ? C.fg3 : C.border}`, boxShadow: e.current ? `0 0 0 3px ${C.sage}33` : "none" }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...T.meta, fontFamily: mono, color: C.fg3, minWidth: 48 }}>{e.date}</span>
              <span style={{ ...T.bodySm, fontWeight: e.current ? 600 : 400, color: e.done ? C.fg2 : e.current ? C.fg : C.fg3 }}>{e.label}</span>
              <Tag text={e.dept} color={C.sage} bg={C.sageBg} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 3. KONSULTATION ─── */
function ConsultRequest() {
  const [step, setStep] = useState(0);
  const specialties = [
    "Plastikkirurgi / Mikrovaskulär",
    "Maxillofacial / Protetik",
    "Anestesi",
    "Onkologi — Strålning",
    "Radiologi",
    "Tal & Sväljning",
    "Näring / Dietistik",
  ];
  return (
    <div style={{ padding: "24px 20px", maxWidth: 500, margin: "0 auto" }}>
      <div style={{ ...T.section, fontWeight: 600, color: C.fg, marginBottom: 20 }}>Begär specialistyttrande</div>
      {step === 0 && specialties.map((s, i) => (
        <div key={i} onClick={() => setStep(1)} style={{ padding: "10px 12px", marginBottom: 4, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", ...T.bodySm, color: C.fg2 }}>{s}</div>
      ))}
      {step === 1 && (
        <div>
          <Tag text="Plastikkirurgi / Mikrovaskulär" color={C.blue} bg={C.blueBg} />
          <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, margin: "14px 0" }}>
            <Label>Patientöversikt</Label>
            <div style={{ ...T.bodySm, color: C.fg2, lineHeight: 1.7 }}>
              {patient.name} · {patient.age}å<br />
              SCC mandibel T3N1M0 · Planerat: segmentell mandibulektomi<br />
              CTA 2026-02-10 · CT hals 2026-02-03
            </div>
          </div>
          <textarea aria-label="Klinisk fråga för specialistyttrande" placeholder="Vad behöver teamet hjälp att bedöma?" style={{ width: "100%", minHeight: 80, padding: 10, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 6, color: C.fg, fontSize: "1rem", lineHeight: 1.55, fontFamily: font, resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
          <Btn primary onClick={() => setStep(2)}>Skicka förfrågan</Btn>
        </div>
      )}
      {step === 2 && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ ...T.title, fontWeight: 600, color: C.fg }}>Skickat till Plastikkirurgi</div>
          <div style={{ ...T.meta, fontFamily: mono, color: C.fg3, marginTop: 6 }}>Länkad till tidslinje · Svar spåras</div>
        </div>
      )}
    </div>
  );
}

/* ─── 4. KALENDER ─── */
function CalendarView() {
  return (
    <div style={{ padding: "24px 20px", maxWidth: 540, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...T.section, fontWeight: 600, color: C.fg }}>{patient.name}</div>
        <div style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>Vecka 13 · mars 2026</div>
      </div>
      <div style={{ background: C.amberBg, border: `1px solid ${C.amber}33`, borderRadius: 6, padding: 12, marginBottom: 20 }}>
        <div style={{ ...T.bodySm, color: C.fg2, lineHeight: 1.55 }}>
          <span style={{ color: C.amber, fontWeight: 600 }}>Fre: 3 platser. </span>
          Protetik kan flytta till Karolinska samma dag som plastikkirurgi — båda tillgängliga 15:30.
        </div>
        <Btn small style={{ marginTop: 8 }}>Föreslå till teamet</Btn>
      </div>
      {calendarAppts.map((d, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ ...T.label, fontWeight: 600, color: C.fg, marginBottom: 6, fontFamily: mono }}>{d.day}</div>
          {d.items.map((a, j) => (
            <div key={j} style={{ display: "flex", gap: 12, padding: "8px 12px", marginBottom: 3, background: C.s1, borderRadius: 5, borderLeft: `3px solid ${a.c}` }}>
              <span style={{ ...T.meta, fontFamily: mono, color: C.fg3, minWidth: 42 }}>{a.t}</span>
              <div>
                <div style={{ ...T.bodySm, color: C.fg }}>{a.n}</div>
                <div style={{ ...T.meta, color: C.fg3 }}>{a.l}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div style={{ background: C.s1, padding: 10, borderRadius: 6, marginTop: 4, borderLeft: `3px solid ${C.fg3}` }}>
        <div style={{ ...T.bodySm, color: C.fg2, fontStyle: "italic" }}>"Kan inte resa måndag — behöver skjuts. Alla tisdag på Karolinska om möjligt."</div>
      </div>
    </div>
  );
}

/* ─── 5. MDT-SAMMANFATTNING ─── */
function MDTSummary() {
  const [approved, setApproved] = useState(false);
  return (
    <div style={{ padding: "24px 20px", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...T.section, fontWeight: 600, color: C.fg }}>Slutlig kirurgisk plangranskning</div>
        <div style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>2026-03-19 · 47 min · 8 deltagare</div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...T.titleSm, fontWeight: 600, color: C.fg, marginBottom: 10 }}>Beslut</div>
        {mdtData.decisions.map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, ...T.bodySm, color: C.fg2, lineHeight: 1.55 }}>
            <span style={{ color: C.sage, flexShrink: 0 }}>✓</span>
            <span>{d}</span>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...T.titleSm, fontWeight: 600, color: C.fg, marginBottom: 10 }}>Åtgärder</div>
        {mdtData.actions.map((a, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: C.s1, borderRadius: 5, marginBottom: 3, ...T.meta, gap: 8 }}>
            <span style={{ ...T.bodySm, color: C.fg2 }}>{a.t}</span>
            <span style={{ ...T.meta, fontFamily: mono, color: C.fg3, whiteSpace: "nowrap" }}>{a.o} · {a.d}</span>
          </div>
        ))}
      </div>
      <div style={{ background: C.amberBg, border: `1px solid ${C.amber}33`, borderRadius: 6, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ ...T.label, fontWeight: 500, color: C.amber }}>Patientsammanfattning</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Tag text="AI-genererad" color={C.mauve} bg={C.mauveBg} />
            {approved && <span style={{ ...T.meta, fontFamily: mono, color: C.sage }}>✓ godkänd</span>}
          </div>
        </div>
        <p style={{ ...T.body, color: C.fg2, fontStyle: "italic", margin: "0 0 12px", maxWidth: "62ch" }}>{mdtData.patientSv}</p>
        {!approved
          ? <Btn primary onClick={() => setApproved(true)}>Godkänn &amp; publicera</Btn>
          : <div style={{ ...T.meta, fontFamily: mono, color: C.sage }}>✓ Godkänd av Dr. Bergström · Publicerad i portalen</div>}
      </div>
    </div>
  );
}

/* ─── 6. PATIENTPORTAL ─── */
function PatientPortal() {
  const lb = "oklch(96% 0.008 55)";
  const lt = "oklch(20% 0.01 55)";
  const lt2 = "oklch(45% 0.01 55)";
  const card = { background: "oklch(99% 0.006 55)", borderRadius: 10, padding: 14, marginBottom: 10, boxShadow: C.shadowSm };
  return (
    <div style={{ background: lb, minHeight: "100%", color: lt }}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: "1.45rem", lineHeight: 1.2, fontWeight: 600 }}>Hej Erik 👋</div>
            <div style={{ ...T.label, color: lt2 }}>Din vårdöversikt</div>
          </div>
          <div style={{ ...T.meta, fontFamily: mono, padding: "3px 8px", background: "oklch(90% 0.03 155)", color: "oklch(35% 0.1 155)", borderRadius: 16 }}>BankID ✓</div>
        </div>
        <div style={card}>
          <div style={{ ...T.eyebrow, fontFamily: font, color: lt2, textTransform: "uppercase", marginBottom: 8 }}>Närmast i planen</div>
          <div style={{ fontSize: "1.08rem", lineHeight: 1.3, fontWeight: 600 }}>Strålbehandling (14/33)</div>
          <div style={{ ...T.body, color: lt2 }}>Tis 25 mars kl. 10:00 · Karolinska Solna</div>
          <div style={{ ...T.bodySm, color: lt2, marginTop: 6, padding: "6px 8px", background: lb, borderRadius: 5 }}>💡 Dietistbesök samma dag 14:00</div>
        </div>
        <div style={card}>
          <div style={{ ...T.eyebrow, fontFamily: font, color: lt2, textTransform: "uppercase", marginBottom: 8 }}>Vecka 13 — 5 besök</div>
          {["Mån: Sårvård 08:30 — Södersjukhuset", "Tis: Strålning + Dietist — Karolinska", "Ons: Sårvård + Logoped — 2 platser", "Tor: Strålning — Karolinska", "Fre: Sårvård + Plastik + Tand — 3 platser"].map((d, i, arr) => (
            <div key={i} style={{ ...T.bodySm, color: lt2, padding: "4px 0", borderBottom: i < arr.length - 1 ? "1px solid oklch(92% 0.005 55)" : "none" }}>{d}</div>
          ))}
          <button style={{ width: "100%", marginTop: 8, padding: 7, background: lb, border: "none", borderRadius: 5, ...T.bodySm, color: lt2, cursor: "pointer", fontFamily: font }}>Be om hjälp med tider →</button>
        </div>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ ...T.eyebrow, fontFamily: font, color: lt2, textTransform: "uppercase" }}>Senaste teamuppdatering</div>
            <div style={{ ...T.meta, fontFamily: mono, color: "oklch(35% 0.1 155)", background: "oklch(90% 0.03 155)", padding: "1px 6px", borderRadius: 3 }}>Godkänd av Dr. Bergström</div>
          </div>
          <p style={{ ...T.body, margin: "0 0 10px", color: "oklch(30% 0.01 55)", maxWidth: "34ch" }}>{mdtData.patientSv}</p>
          <button style={{ padding: "6px 12px", background: lb, border: "none", borderRadius: 5, ...T.bodySm, color: lt2, cursor: "pointer", fontFamily: font }}>Ställ en fråga →</button>
        </div>
        <div style={card}>
          <div style={{ ...T.eyebrow, fontFamily: font, color: lt2, textTransform: "uppercase", marginBottom: 8 }}>Hur kan vi hjälpa dig?</div>
          {["📅 Jag behöver ändra en tid", "🩹 Jag vill rapportera symtom", "❓ Jag har en fråga om behandlingen", "🚗 Jag behöver praktisk hjälp"].map((m, i) => (
            <div key={i} style={{ padding: "8px 10px", marginBottom: 3, background: lb, borderRadius: 5, cursor: "pointer", ...T.bodySm, display: "flex", justifyContent: "space-between" }}>
              <span>{m}</span><span style={{ color: lt2 }}>→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 7. KONFERENS ─── */
function Conference() {
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const participants = [
    { name: "Dr. A. Bergström", role: "H&H Kirurgi", speaking: true },
    { name: "Dr. K. Johansson", role: "Plastikkirurgi", speaking: false },
    { name: "Dr. M. Eriksson", role: "Maxillofacial", speaking: false },
    { name: "Dr. L. Svensson", role: "Anestesi", speaking: false },
    { name: "Dr. P. Olsson", role: "Onkologi", speaking: false },
    { name: "S. Nilsson", role: "Vårdkoordinator", speaking: false },
  ];
  return (
    <div style={{ height: "calc(100vh - 48px)", display: "flex", flexDirection: "column", background: C.ink }}>
      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <span style={{ ...T.label, fontWeight: 600, color: C.fg }}>MDT-konferens</span>
          <span style={{ ...T.meta, fontFamily: mono, color: C.fg3, marginLeft: 8 }}>{patient.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {recording && (
            <span style={{ fontSize: 10, fontFamily: mono, color: C.rose, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.rose, animation: "pulse 1.5s infinite" }} />REC
            </span>
          )}
          <span style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>23:41</span>
        </div>
      </div>
      <div className="conference-grid" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, padding: "8px 16px" }}>
        {participants.map((p, i) => (
          <div key={i} style={{ background: C.s1, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: p.speaking ? `2px solid ${C.sage}` : `1px solid ${C.border}`, position: "relative", minHeight: 110 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.s3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: C.fg2, marginBottom: 6 }}>
              {p.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
            </div>
            <div style={{ ...T.bodySm, fontWeight: 500, color: C.fg, textAlign: "center" }}>{p.name}</div>
            <div style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>{p.role}</div>
            {p.speaking && (
              <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2 }}>
                {[3, 5, 2, 4, 3].map((h, j) => (
                  <div key={j} style={{ width: 3, height: h * 2 + 4, background: C.sage, borderRadius: 2, animation: `wave ${0.4 + j * 0.1}s ease-in-out infinite alternate` }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {sharing && (
        <div style={{ margin: "0 16px 8px", background: C.s1, border: `1px solid ${C.blue}44`, borderRadius: 6, padding: 16, textAlign: "center" }}>
          <div style={{ ...T.label, fontFamily: mono, color: C.blue, marginBottom: 4 }}>Skärmdelning aktiv</div>
          <div style={{ ...T.bodySm, color: C.fg2 }}>Dr. Bergström delar: OHIF DICOM-visare — CT Hals-serie</div>
        </div>
      )}
      <div className="conference-controls" style={{ padding: "10px 16px", background: C.s1, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
        {[
          { label: muted ? "Avtysta" : "Tysta", icon: muted ? "🔇" : "🎤", action: () => setMuted(!muted), active: !muted },
          { label: "Video", icon: "📹", active: true },
          { label: sharing ? "Sluta dela" : "Dela skärm", icon: "🖥️", action: () => setSharing(!sharing), active: sharing },
          { label: recording ? "Stoppa" : "Spela in", icon: "⏺️", action: () => setRecording(!recording), active: recording, color: C.rose },
          { label: "Avsluta", icon: "📵", end: true },
        ].map((b, i) => (
          <button key={i} onClick={b.action} style={{ minWidth: 44, minHeight: 44, padding: "7px 13px", border: "none", borderRadius: 6, cursor: "pointer", background: b.end ? C.rose : b.active && b.color ? `${b.color}33` : b.active ? C.s3 : C.s2, color: b.end ? C.bg : b.color || C.fg2, fontSize: 11, fontFamily: mono, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, transition: "transform 180ms ease, background-color 180ms ease" }}>
            <span>{b.icon}</span> {b.label}
          </button>
        ))}
      </div>
      <style>{`@keyframes wave { from { height: 4px; } to { height: 14px; } } @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}

/* ─── 8. DICOM-VISARE ─── */
function DICOMViewer() {
  const [tool, setTool] = useState("pan");
  const [wl, setWl] = useState({ w: 350, l: 40 });
  const studyUid = "1.2.840.113619.2.290.3.2831164354.783.1725609484.467";
  const tools = [
    { id: "pan", icon: "✋", label: "Panorera" },
    { id: "zoom", icon: "🔍", label: "Zooma" },
    { id: "wl", icon: "☀️", label: "F/N" },
    { id: "measure", icon: "📏", label: "Mäta" },
    { id: "annotate", icon: "✏️", label: "Anteckna" },
    { id: "roi", icon: "⭕", label: "ROI" },
  ];
  const presets = [{ n: "Ben", w: 2000, l: 500 }, { n: "Mjukvävnad", w: 350, l: 40 }, { n: "Lunga", w: 1500, l: -600 }, { n: "Hjärna", w: 80, l: 40 }];
  const openOhif = () => {
    const url = `https://viewer.ohif.org/viewer?StudyInstanceUIDs=${encodeURIComponent(studyUid)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <div style={{ height: "calc(100vh - 48px)", display: "flex", flexDirection: "column", background: C.ink }}>
      <div style={{ padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <span style={{ ...T.label, fontWeight: 600, color: C.fg }}>OHIF DICOM-visare</span>
          <span style={{ ...T.meta, fontFamily: mono, color: C.fg3, marginLeft: 8 }}>CT Hals C+ · 2026-02-03 · 186 snitt</span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <button onClick={openOhif} style={{ padding: "3px 8px", border: `1px solid ${C.blue}55`, borderRadius: 4, background: C.blueBg, color: C.blue, ...T.meta, fontFamily: mono, cursor: "pointer" }} title="Öppna serien i OHIF web viewer">
            Öppna i OHIF ↗
          </button>
          {presets.map(p => (
            <button key={p.n} onClick={() => setWl({ w: p.w, l: p.l })} style={{ padding: "3px 8px", border: `1px solid ${C.border}`, borderRadius: 4, background: wl.w === p.w ? C.s3 : "transparent", color: wl.w === p.w ? C.fg : C.fg3, ...T.meta, fontFamily: mono, cursor: "pointer" }}>{p.n}</button>
          ))}
        </div>
      </div>
      <div className="dicom-layout" style={{ flex: 1, display: "flex", minWidth: 0 }}>
        <div className="dicom-toolbar" style={{ width: 52, background: C.s1, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 2 }}>
          {tools.map(t => (
            <button key={t.id} aria-label={t.label} onClick={() => setTool(t.id)} style={{ width: 44, height: 44, border: "none", borderRadius: 6, cursor: "pointer", background: tool === t.id ? C.s3 : "transparent", color: tool === t.id ? C.fg : C.fg3, fontSize: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
              <span>{t.icon}</span>
              <span style={{ fontSize: "0.62rem", lineHeight: 1.1, fontFamily: mono }}>{t.label}</span>
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button aria-label="Länka bildserien till diskussion" style={{ width: 44, height: 44, border: "none", borderRadius: 6, background: "transparent", color: C.sage, fontSize: 16, cursor: "pointer" }} title="Länka till diskussion">💬</button>
        </div>
        <div style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "90%", maxWidth: 500, aspectRatio: "1", background: "radial-gradient(ellipse at 50% 45%, oklch(25% 0.01 55), oklch(8% 0.005 55) 70%)", borderRadius: 4, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "30%", left: "35%", width: "30%", height: "25%", borderRadius: "50%", border: "1px solid oklch(35% 0.01 55)" }} />
            <div style={{ position: "absolute", top: "35%", left: "42%", width: "16%", height: "15%", borderRadius: "50%", border: "1px solid oklch(40% 0.01 55)", background: "oklch(20% 0.01 55)" }} />
            <div style={{ position: "absolute", top: "60%", left: "30%", width: "40%", height: "8%", borderRadius: 4, border: "1px solid oklch(30% 0.01 55)" }} />
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              <line x1="38%" y1="38%" x2="62%" y2="45%" stroke={C.amber} strokeWidth="1.5" strokeDasharray="4 2" />
              <circle cx="38%" cy="38%" r="3" fill={C.amber} />
              <circle cx="62%" cy="45%" r="3" fill={C.amber} />
              <text x="51%" y="37%" fill={C.amber} fontSize="11" fontFamily={mono} textAnchor="middle">32,4 mm</text>
            </svg>
            <div style={{ position: "absolute", top: "28%", right: "25%", background: C.roseBg, border: `1px solid ${C.rose}66`, borderRadius: 4, padding: "3px 6px" }}>
              <div style={{ ...T.meta, fontFamily: mono, color: C.rose }}>Dr. Bergström</div>
              <div style={{ ...T.meta, color: C.fg2 }}>Tumörmarginal</div>
            </div>
          </div>
          <div style={{ position: "absolute", top: 8, left: 8, ...T.meta, fontFamily: mono, color: C.fg3, lineHeight: 1.6 }}>
            {patient.name}<br />CT Hals C+<br />Snitt 94/186<br />Ax 2,0mm
          </div>
          <div style={{ position: "absolute", top: 8, right: 8, ...T.meta, fontFamily: mono, color: C.fg3, textAlign: "right" }}>
            F: {wl.w} N: {wl.l}<br />Zoom: 100%
          </div>
          <div style={{ position: "absolute", bottom: 8, left: 8, right: 8 }}>
            <input aria-label="Välj snitt i DICOM-serien" type="range" min={1} max={186} defaultValue={94} style={{ width: "100%", accentColor: C.sage }} />
            <div style={{ display: "flex", justifyContent: "space-between", ...T.meta, fontFamily: mono, color: C.fg3 }}><span>1</span><span>Snitt 94</span><span>186</span></div>
          </div>
        </div>
        <div className="dicom-sidebar" style={{ width: 190, background: C.s1, borderLeft: `1px solid ${C.border}`, padding: 10, overflowY: "auto" }}>
          <Label>Anteckningar</Label>
          {[
            { author: "Dr. Bergström", text: "Tumörmarginal — 32,4mm på bredaste", slice: 94, color: C.rose },
            { author: "Dr. Johansson", text: "Markera pedikelfäste för lapplanering", slice: 112, color: C.blue },
            { author: "Dr. Eriksson", text: "Tandrötter i resektionszon — bekräfta extraktionsplan", slice: 78, color: C.amber },
          ].map((a, i) => (
            <div key={i} style={{ padding: 8, marginBottom: 6, background: C.s2, borderRadius: 5, borderLeft: `2px solid ${a.color}`, cursor: "pointer" }}>
              <div style={{ ...T.meta, fontWeight: 500, color: C.fg }}>{a.author}</div>
              <div style={{ ...T.meta, color: C.fg2, marginTop: 2, lineHeight: 1.45 }}>{a.text}</div>
              <div style={{ ...T.meta, fontFamily: mono, color: C.fg3, marginTop: 3 }}>Snitt {a.slice}</div>
            </div>
          ))}
          <Btn small style={{ width: "100%", marginTop: 8 }}>+ Anteckning</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── 9. WHITEBOARD ─── */
function Whiteboard() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState(C.sage);
  const [penSize] = useState(2);
  const [activeTool, setActiveTool] = useState("pen");
  const lastPos = useRef(null);
  const collaborators = [
    { name: "Dr. Bergström", note: "Markerar resektionsmarginal", color: C.sage, x: 34, y: 42 },
    { name: "Dr. Johansson", note: "Justerar osteotomilinjer", color: C.amber, x: 58, y: 66 },
    { name: "Dr. Eriksson", note: "Bekräftar tandrötter", color: C.blue, x: 71, y: 34 },
  ];

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.fillStyle = "#111110";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "oklch(30% 0.01 55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.5, canvas.height * 0.4, 140, 80, 0, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.strokeStyle = "oklch(25% 0.01 55)";
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.15, canvas.height * 0.7);
    ctx.lineTo(canvas.width * 0.85, canvas.height * 0.7);
    ctx.stroke();
    ctx.fillStyle = C.fg3;
    ctx.font = `10px ${mono}`;
    ctx.fillText("Mandibel — defektzon", canvas.width * 0.38, canvas.height * 0.32);
    ctx.fillText("Fibulabricka — planerade segment", canvas.width * 0.28, canvas.height * 0.68);
    ctx.strokeStyle = C.sage;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.35, canvas.height * 0.48);
    ctx.lineTo(canvas.width * 0.65, canvas.height * 0.48);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.sage;
    ctx.font = `9px ${mono}`;
    ctx.fillText("Resektionsmarginal — Dr. Bergström", canvas.width * 0.37, canvas.height * 0.52);
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 1.5;
    [0.3, 0.45, 0.6].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(canvas.width * x, canvas.height * 0.66);
      ctx.lineTo(canvas.width * x, canvas.height * 0.74);
      ctx.stroke();
    });
    ctx.fillStyle = C.amber;
    ctx.fillText("Osteotomisnitten — Dr. Johansson", canvas.width * 0.32, canvas.height * 0.78);
  }, []);

  const startDraw = useCallback((e) => {
    if (activeTool !== "pen") return;
    setIsDrawing(true);
    lastPos.current = getPos(e);
  }, [activeTool]);

  const draw = useCallback((e) => {
    if (!isDrawing || activeTool !== "pen") return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }, [isDrawing, penColor, penSize, activeTool]);

  const stopDraw = useCallback(() => { setIsDrawing(false); lastPos.current = null; }, []);

  const drawTools = [
    { id: "pen", icon: "✏️" }, { id: "line", icon: "📏" }, { id: "rect", icon: "⬜" },
    { id: "circle", icon: "⭕" }, { id: "text", icon: "T" }, { id: "arrow", icon: "↗" },
    { id: "eraser", icon: "🧹" }, { id: "move", icon: "✋" },
  ];

  return (
    <div style={{ height: "calc(100vh - 48px)", display: "flex", flexDirection: "column", background: C.ink }}>
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ ...T.label, fontWeight: 600, color: C.fg }}>Samarbetstavla</span>
          <span style={{ ...T.meta, fontFamily: mono, color: C.fg3, marginLeft: 8 }}>Kirurgplanering · {patient.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {collaborators.map((collaborator) => (
              <div key={collaborator.name} className="presence-chip" style={{ border: `1px solid ${collaborator.color}3d`, background: `color-mix(in oklch, ${collaborator.color} 10%, ${C.s1})`, color: C.fg2, borderRadius: 999, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6, ...T.meta, fontFamily: mono }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: collaborator.color, boxShadow: `0 0 12px ${collaborator.color}` }} />
                {collaborator.note}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {["Dr. B", "Dr. J", "Dr. E"].map((u, i) => (
            <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: [C.sage, C.blue, C.amber][i], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: C.bg, fontWeight: 700, marginLeft: i > 0 ? -6 : 0, border: `2px solid ${C.ink}` }}>{u.slice(-1)}</div>
          ))}
          <span style={{ ...T.meta, fontFamily: mono, color: C.fg3 }}>3 aktiva</span>
          </div>
        </div>
      </div>
      <div className="whiteboard-layout" style={{ display: "flex", flex: 1, overflow: "hidden", minWidth: 0 }}>
        <div className="whiteboard-toolbar" style={{ width: 48, background: C.s1, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 2 }}>
          {drawTools.map(t => (
            <button key={t.id} className="whiteboard-tool" aria-label={`Välj verktyg ${t.id}`} onClick={() => setActiveTool(t.id)} style={{ width: 44, height: 44, border: "none", borderRadius: 6, cursor: "pointer", background: activeTool === t.id ? C.s3 : "transparent", color: activeTool === t.id ? C.fg : C.fg3, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: activeTool === t.id ? `0 12px 32px color-mix(in oklch, ${penColor} 16%, transparent)` : "none" }}>{t.icon}</button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingBottom: 6 }}>
            {[C.sage, C.blue, C.amber, C.rose, C.fg].map(c => (
              <div key={c} onClick={() => setPenColor(c)} aria-label="Välj pennfärg" role="button" style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", border: penColor === c ? `2px solid ${C.fg}` : "2px solid transparent" }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
          <canvas
            ref={canvasRef}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
            style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", cursor: activeTool === "pen" ? "crosshair" : activeTool === "move" ? "grab" : "default" }}
          />
          <div className="whiteboard-grid" style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none", opacity: 0.72, backgroundImage: `linear-gradient(to right, color-mix(in oklch, ${C.fg3} 22%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, ${C.fg3} 22%, transparent) 1px, transparent 1px), radial-gradient(circle at top, color-mix(in oklch, ${penColor} 14%, transparent), transparent 54%)`, backgroundSize: "40px 40px, 40px 40px, 100% 100%" }} />
          {collaborators.map((collaborator) => (
            <div
              key={collaborator.name}
              className="presence-cursor"
              style={{
                position: "absolute",
                left: `${collaborator.x}%`,
                top: `${collaborator.y}%`,
                zIndex: 3,
                pointerEvents: "none",
                transform: "translate(-50%, -50%)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: collaborator.color, boxShadow: `0 0 18px ${collaborator.color}` }} />
                <div style={{ padding: "5px 8px", borderRadius: 999, background: "color-mix(in oklch, oklch(10% 0.005 55) 82%, transparent)", border: `1px solid ${collaborator.color}44`, color: C.fg, ...T.meta, fontFamily: mono, whiteSpace: "nowrap" }}>
                  {collaborator.name}
                </div>
              </div>
            </div>
          ))}
          <div style={{ position: "absolute", right: 14, bottom: 14, zIndex: 3, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, background: "color-mix(in oklch, oklch(10% 0.005 55) 82%, transparent)", border: `1px solid ${penColor}44`, boxShadow: `0 18px 48px color-mix(in oklch, ${penColor} 12%, transparent)` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: penColor, boxShadow: `0 0 12px ${penColor}` }} />
            <span style={{ ...T.meta, color: C.fg2, fontFamily: mono }}>Live-skiss synkad med konferensen</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 10. OR-LAYOUT ─── */
function ORLayout() {
  const [items, setItems] = useState([
    { id: "table", kind: "table", x: 250, y: 180, w: 170, h: 84, label: "Operationsbord", color: C.fg3 },
    { id: "micro", kind: "microscope", x: 100, y: 120, w: 88, h: 88, label: "Mikroskop", color: C.blue },
    { id: "anesth", kind: "anesthesia", x: 250, y: 60, w: 120, h: 80, label: "Anestesistation", color: C.sage },
    { id: "team1", kind: "person", initials: "H&H", x: 150, y: 270, w: 78, h: 78, label: "H&H Team", color: C.rose },
    { id: "team2", kind: "person", initials: "PL", x: 350, y: 270, w: 78, h: 78, label: "Plastikteam", color: C.amber },
    { id: "inst1", kind: "tray", x: 60, y: 255, w: 90, h: 58, label: "Instrument 1", color: C.fg3 },
    { id: "inst2", kind: "tray", x: 450, y: 255, w: 90, h: 58, label: "Instrument 2", color: C.fg3 },
    { id: "monitor", kind: "monitor", x: 430, y: 80, w: 92, h: 78, label: "Monitorer", color: C.mauve },
    { id: "carm", kind: "carm", x: 80, y: 50, w: 96, h: 94, label: "C-Båge", color: C.fg3 },
    { id: "cellsaver", kind: "tower", x: 440, y: 170, w: 80, h: 96, label: "Cell Saver", color: C.blue },
    { id: "warm", kind: "warming", x: 440, y: 330, w: 88, h: 56, label: "Värmning", color: C.amber },
    { id: "nurse", kind: "person", initials: "OP", x: 250, y: 330, w: 78, h: 78, label: "Op-sjuksköterska", color: C.sage },
  ]);
  const [dragging, setDragging] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [phase, setPhase] = useState("resection");
  const containerRef = useRef(null);

  const handleMouseDown = (e, id) => {
    const item = items.find(i => i.id === id);
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setOffset({ x: clientX - rect.left - item.x, y: clientY - rect.top - item.y });
    setDragging(id);
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setItems(prev => prev.map(i => i.id === dragging ? { ...i, x: clientX - rect.left - offset.x, y: clientY - rect.top - offset.y } : i));
  }, [dragging, offset]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleMouseMove);
      window.addEventListener("touchend", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("touchmove", handleMouseMove);
        window.removeEventListener("touchend", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  const phaseNotes = {
    resection: "H&H team primärt. Mikroskop i beredskap. C-båge för mandibelbedömning. Anestesi: fiberoptisk intubation, artärlinje höger arm.",
    harvest: "Plastikteam vid benet. H&H team förbereder mottagarkärl. Flytta mikroskop till benet. Cell saver aktiv.",
    inset: "Båda team vid huvudet. Mikroskop vid anastomosstället. Övervaka lappperfusion. Värmefilt på nederkroppen.",
  };
  const phaseFocusItems = {
    resection: ["table", "micro", "anesth", "team1", "monitor", "carm"],
    harvest: ["team2", "cellsaver", "warm", "inst2", "table"],
    inset: ["table", "micro", "team1", "team2", "monitor", "nurse"],
  };
  const phaseZones = {
    resection: [
      { label: "Resektionsfält", color: C.rose, top: "18%", left: "28%", width: "34%", height: "28%" },
      { label: "Anestesizon", color: C.sage, top: "6%", left: "34%", width: "22%", height: "18%" },
    ],
    harvest: [
      { label: "Lapputtag", color: C.amber, top: "46%", left: "10%", width: "28%", height: "28%" },
      { label: "Perfusionsstöd", color: C.blue, top: "38%", left: "70%", width: "18%", height: "24%" },
    ],
    inset: [
      { label: "Anastomoszon", color: C.mauve, top: "22%", left: "40%", width: "28%", height: "22%" },
      { label: "Teamöverlapp", color: C.sage, top: "48%", left: "28%", width: "40%", height: "22%" },
    ],
  };
  const phaseChecklist = {
    resection: ["Bekräfta resektionsmarginal", "Fri väg till C-båge", "Mikroskop i standby"],
    harvest: ["Lapputtag sterilt avskärmat", "Cell saver aktiv", "Transportlinje till huvudet fri"],
    inset: ["Mikroskop centrerat", "Dubbel teamposition", "Perfusionsmonitor synlig för båda"],
  };

  const renderAssetShape = (item) => {
    const stroke = phaseFocusItems[phase].includes(item.id) ? item.color : C.fg3;
    const fill = `color-mix(in oklch, ${stroke} 16%, ${C.s1})`;

    if (item.kind === "table") {
      return (
        <svg viewBox="0 0 100 60" style={{ width: "88%", height: "72%" }}>
          <rect x="10" y="18" width="80" height="22" rx="8" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="16" y="8" width="24" height="10" rx="4" fill="none" stroke={stroke} strokeWidth="2" />
          <line x1="28" y1="40" x2="20" y2="54" stroke={stroke} strokeWidth="2" />
          <line x1="72" y1="40" x2="80" y2="54" stroke={stroke} strokeWidth="2" />
          <circle cx="20" cy="55" r="2.5" fill={stroke} />
          <circle cx="80" cy="55" r="2.5" fill={stroke} />
        </svg>
      );
    }
    if (item.kind === "carm") {
      return (
        <svg viewBox="0 0 80 80" style={{ width: "84%", height: "84%" }}>
          <path d="M58 18a24 24 0 1 0 0 44" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
          <rect x="48" y="52" width="16" height="16" rx="3" fill={fill} stroke={stroke} strokeWidth="2" />
          <line x1="20" y1="62" x2="52" y2="62" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    }
    if (item.kind === "microscope") {
      return (
        <svg viewBox="0 0 80 80" style={{ width: "84%", height: "84%" }}>
          <rect x="28" y="10" width="12" height="20" rx="3" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M40 28l12 8-8 12-12-8z" fill={fill} stroke={stroke} strokeWidth="2" />
          <line x1="30" y1="48" x2="52" y2="48" stroke={stroke} strokeWidth="3" />
          <rect x="22" y="52" width="36" height="10" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
          <line x1="18" y1="64" x2="62" y2="64" stroke={stroke} strokeWidth="3" />
        </svg>
      );
    }
    if (item.kind === "monitor") {
      return (
        <svg viewBox="0 0 100 70" style={{ width: "86%", height: "74%" }}>
          <rect x="12" y="8" width="76" height="42" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
          <polyline points="20,38 35,28 46,34 62,18 80,24" fill="none" stroke={stroke} strokeWidth="2" />
          <rect x="44" y="50" width="12" height="6" rx="2" fill={stroke} />
          <rect x="34" y="56" width="32" height="6" rx="3" fill={fill} stroke={stroke} strokeWidth="2" />
        </svg>
      );
    }
    if (item.kind === "anesthesia" || item.kind === "tower") {
      return (
        <svg viewBox="0 0 80 80" style={{ width: "80%", height: "82%" }}>
          <rect x="20" y="10" width="40" height="50" rx="5" fill={fill} stroke={stroke} strokeWidth="2" />
          <line x1="20" y1="25" x2="60" y2="25" stroke={stroke} strokeWidth="1.5" />
          <line x1="20" y1="40" x2="60" y2="40" stroke={stroke} strokeWidth="1.5" />
          <circle cx="30" cy="66" r="4" fill={stroke} />
          <circle cx="50" cy="66" r="4" fill={stroke} />
        </svg>
      );
    }
    if (item.kind === "tray" || item.kind === "warming") {
      return (
        <svg viewBox="0 0 100 60" style={{ width: "88%", height: "70%" }}>
          <rect x="8" y="10" width="84" height="28" rx="6" fill={fill} stroke={stroke} strokeWidth="2" />
          <line x1="20" y1="38" x2="20" y2="52" stroke={stroke} strokeWidth="2" />
          <line x1="80" y1="38" x2="80" y2="52" stroke={stroke} strokeWidth="2" />
          <line x1="8" y1="52" x2="92" y2="52" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    }
    if (item.kind === "person") {
      return (
        <svg viewBox="0 0 80 80" style={{ width: "86%", height: "86%" }}>
          <circle cx="40" cy="24" r="11" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="24" y="38" width="32" height="24" rx="10" fill={fill} stroke={stroke} strokeWidth="2" />
          <text x="40" y="54" textAnchor="middle" fill={stroke} fontSize="10" fontFamily={mono}>{item.initials || "TM"}</text>
        </svg>
      );
    }

    return null;
  };

  return (
    <div style={{ height: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ ...T.label, fontWeight: 600, color: C.fg }}>OR-layoutplanerare</span>
          <span style={{ ...T.meta, fontFamily: mono, color: C.fg3, marginLeft: 8 }}>{patient.name} · OR 4 Karolinska</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[{ id: "resection", label: "Fas 1: Resektion" }, { id: "harvest", label: "Fas 2: Lapputtag" }, { id: "inset", label: "Fas 3: Anastomos" }].map(p => (
            <button key={p.id} onClick={() => setPhase(p.id)} style={{ padding: "4px 10px", border: `1px solid ${phase === p.id ? C.sage + "66" : C.border}`, borderRadius: 5, background: phase === p.id ? C.sageBg : "transparent", color: phase === p.id ? C.sage : C.fg3, ...T.meta, fontFamily: mono, cursor: "pointer" }}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="or-layout-shell" style={{ flex: 1, display: "flex", minWidth: 0 }}>
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden", cursor: dragging ? "grabbing" : "default" }}>
          <div style={{ position: "absolute", inset: 20, border: `2px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ position: "absolute", top: -10, left: 16, background: C.bg, padding: "0 6px", ...T.meta, fontFamily: mono, color: C.fg3 }}>OR 4 · 7,2m × 6,4m</div>
            <div style={{ position: "absolute", bottom: -2, left: "40%", width: "20%", height: 4, background: C.sage, borderRadius: 2 }} />
            <div style={{ position: "absolute", top: "30%", right: -2, width: 4, height: "15%", background: C.sage, borderRadius: 2 }} />
          </div>
          {phaseZones[phase].map((zone) => (
            <div key={zone.label} className="or-zone" style={{ position: "absolute", top: zone.top, left: zone.left, width: zone.width, height: zone.height, borderRadius: 18, background: `color-mix(in oklch, ${zone.color} 10%, transparent)`, border: `1px solid ${zone.color}33`, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${zone.color} 24%, transparent), 0 18px 40px color-mix(in oklch, ${zone.color} 12%, transparent)` }}>
              <div style={{ position: "absolute", top: -12, left: 14, padding: "3px 10px", borderRadius: 999, background: C.bg, border: `1px solid ${zone.color}44`, color: zone.color, ...T.meta, fontFamily: mono }}>{zone.label}</div>
            </div>
          ))}
          <div style={{ position: "absolute", top: 20, right: 24, padding: "6px 10px", borderRadius: 999, background: "color-mix(in oklch, oklch(13% 0.008 55) 86%, transparent)", border: `1px solid ${C.mauve}33`, color: C.fg2, ...T.meta, fontFamily: mono }}>
            Dra utrustning för att testa flödet live
          </div>
          {items.map(item => (
            <div key={item.id} className="or-item" onMouseDown={(e) => handleMouseDown(e, item.id)} onTouchStart={(e) => handleMouseDown(e, item.id)} style={{ position: "absolute", left: item.x, top: item.y, width: item.w, height: item.h, background: phaseFocusItems[phase].includes(item.id) ? `color-mix(in oklch, ${item.color} 16%, ${C.s1})` : `${item.color}12`, border: `1.5px solid ${item.color}55`, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", cursor: "grab", userSelect: "none", touchAction: "none", boxShadow: dragging === item.id ? `0 0 0 2px ${item.color}, 0 20px 40px color-mix(in oklch, ${item.color} 18%, transparent)` : phaseFocusItems[phase].includes(item.id) ? `0 0 0 1px color-mix(in oklch, ${item.color} 35%, transparent), 0 16px 32px color-mix(in oklch, ${item.color} 12%, transparent)` : "none", transform: phaseFocusItems[phase].includes(item.id) ? "scale(1.03)" : "scale(1)", transition: dragging === item.id ? "none" : "transform 180ms ease, box-shadow 180ms ease, background 180ms ease", padding: 4 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                {renderAssetShape(item)}
              </div>
              <span style={{ ...T.meta, fontFamily: mono, color: item.color, textAlign: "center", padding: "0 4px 2px", lineHeight: 1.2 }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="or-layout-sidebar" style={{ width: 170, background: C.s1, borderLeft: `1px solid ${C.border}`, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <Label>Fasanteckningar</Label>
          <div style={{ ...T.bodySm, color: C.fg2, lineHeight: 1.65, marginBottom: 16, flex: 1 }}>{phaseNotes[phase]}</div>
          <Label>Live-checklista</Label>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {phaseChecklist[phase].map((item) => (
              <div key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: C.s2 }}>
                <span style={{ width: 8, height: 8, marginTop: 6, borderRadius: "50%", background: C.mauve, boxShadow: `0 0 10px ${C.mauve}` }} />
                <span style={{ ...T.meta, color: C.fg2 }}>{item}</span>
              </div>
            ))}
          </div>
          <Btn small style={{ width: "100%", marginBottom: 4 }}>Spara layout</Btn>
          <Btn small style={{ width: "100%" }}>Dela med teamet</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── APP-SKAL ─── */
const primaryScreens = [
  { id: "space", label: "Ärendeyta", icon: "💬" },
  { id: "timeline", label: "Tidslinje", icon: "📊" },
  { id: "consult", label: "Konsultation", icon: "📋" },
  { id: "calendar", label: "Kalender", icon: "📅" },
  { id: "mdt", label: "MDT", icon: "🗂️" },
  { id: "portal", label: "Patient", icon: "👤" },
];
const toolScreens = [
  { id: "conference", label: "Konferens", icon: "📹" },
  { id: "viewer", label: "DICOM", icon: "🔬" },
  { id: "whiteboard", label: "Whiteboard", icon: "🖊" },
  { id: "or-layout", label: "OR-layout", icon: "🏥" },
];

const screenSequence = [...primaryScreens, ...toolScreens];
const careflowMeta = {
  space: {
    phase: "Samordning",
    cue: "Teamet knyter ihop beslut, bildunderlag och praktiska steg.",
    accent: C.sage,
    glow: "radial-gradient(circle at 18% 0%, color-mix(in oklch, oklch(65% 0.1 155) 22%, transparent), transparent 44%), linear-gradient(180deg, color-mix(in oklch, oklch(65% 0.1 155) 8%, transparent), transparent 70%)",
  },
  timeline: {
    phase: "Förlopp",
    cue: "Alla kritiska milstolpar syns i ett enda vårdflöde.",
    accent: C.blue,
    glow: "radial-gradient(circle at 50% 0%, color-mix(in oklch, oklch(65% 0.12 245) 18%, transparent), transparent 48%), linear-gradient(180deg, color-mix(in oklch, oklch(65% 0.12 245) 9%, transparent), transparent 70%)",
  },
  consult: {
    phase: "Bedömning",
    cue: "Frågor skickas med rätt kliniskt sammanhang från start.",
    accent: C.amber,
    glow: "radial-gradient(circle at 72% 0%, color-mix(in oklch, oklch(72% 0.14 75) 20%, transparent), transparent 42%), linear-gradient(180deg, color-mix(in oklch, oklch(72% 0.14 75) 9%, transparent), transparent 72%)",
  },
  calendar: {
    phase: "Koordinering",
    cue: "Besök, behandling och stöd hålls ihop utan kollisioner.",
    accent: C.mauve,
    glow: "radial-gradient(circle at 18% 0%, color-mix(in oklch, oklch(65% 0.1 310) 18%, transparent), transparent 42%), linear-gradient(180deg, color-mix(in oklch, oklch(65% 0.1 310) 8%, transparent), transparent 72%)",
  },
  mdt: {
    phase: "Beslut",
    cue: "MDT-beslut förankras med tydlig ansvarsfördelning.",
    accent: C.sage,
    glow: "radial-gradient(circle at 82% 0%, color-mix(in oklch, oklch(65% 0.1 155) 18%, transparent), transparent 44%), linear-gradient(180deg, color-mix(in oklch, oklch(65% 0.1 155) 8%, transparent), transparent 72%)",
  },
  portal: {
    phase: "Patientkontakt",
    cue: "Patienten möter samma plan i ett lugnare, tryggare tonläge.",
    accent: C.rose,
    glow: "radial-gradient(circle at 22% 0%, color-mix(in oklch, oklch(65% 0.12 15) 20%, transparent), transparent 40%), linear-gradient(180deg, color-mix(in oklch, oklch(65% 0.12 15) 8%, transparent), transparent 72%)",
  },
  conference: {
    phase: "Live-konferens",
    cue: "Diskussion, skärmdelning och beslut sker i samma rytm.",
    accent: C.sage,
    glow: "radial-gradient(circle at 50% 0%, color-mix(in oklch, oklch(65% 0.1 155) 18%, transparent), transparent 44%), linear-gradient(180deg, color-mix(in oklch, oklch(65% 0.1 155) 7%, transparent), transparent 74%)",
  },
  viewer: {
    phase: "Bildgranskning",
    cue: "Bildserier, mått och kommentarer hålls nära diskussionen.",
    accent: C.blue,
    glow: "radial-gradient(circle at 80% 0%, color-mix(in oklch, oklch(65% 0.12 245) 20%, transparent), transparent 46%), linear-gradient(180deg, color-mix(in oklch, oklch(65% 0.12 245) 8%, transparent), transparent 74%)",
  },
  whiteboard: {
    phase: "Kirurgisk skiss",
    cue: "Flera specialister kan markera, reagera och orientera sig samtidigt.",
    accent: C.amber,
    glow: "radial-gradient(circle at 25% 0%, color-mix(in oklch, oklch(72% 0.14 75) 20%, transparent), transparent 42%), linear-gradient(180deg, color-mix(in oklch, oklch(72% 0.14 75) 7%, transparent), transparent 74%)",
  },
  "or-layout": {
    phase: "OR-koreografi",
    cue: "Bemanning, utrustning och fasbyten kan testas visuellt innan start.",
    accent: C.mauve,
    glow: "radial-gradient(circle at 78% 0%, color-mix(in oklch, oklch(65% 0.1 310) 18%, transparent), transparent 42%), linear-gradient(180deg, color-mix(in oklch, oklch(65% 0.1 310) 7%, transparent), transparent 74%)",
  },
};

export default function App() {
  const [screen, setScreen] = useState("space");
  const [showTools, setShowTools] = useState(false);
  const isToolScreen = toolScreens.some(s => s.id === screen);
  const activeMeta = careflowMeta[screen];
  const activeIndex = screenSequence.findIndex((entry) => entry.id === screen);
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: C.bg, fontFamily: font, fontKerning: "normal", position: "relative", overflow: "hidden" }}>
      <div className="app-shell-ambient" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: activeMeta.glow, opacity: 1 }} />
      <nav className="app-nav" style={{ height: 48, background: "color-mix(in oklch, oklch(16% 0.006 55) 88%, transparent)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 12px", gap: 2, flexShrink: 0, overflowX: "auto", position: "relative", zIndex: 1, backdropFilter: "blur(16px)" }}>
        <div style={{ fontSize: "0.98rem", lineHeight: 1.2, fontWeight: 700, color: C.fg, marginRight: 14, whiteSpace: "nowrap" }}>
          <span style={{ color: C.sage }}>●</span> CasePlatform
        </div>
        {primaryScreens.map(s => (
          <button key={s.id} className={`app-nav-button${screen === s.id ? " is-active" : ""}`} onClick={() => { setScreen(s.id); setShowTools(false); }} style={{ padding: "5px 10px", border: "none", borderRadius: 999, cursor: "pointer", background: screen === s.id ? `color-mix(in oklch, ${activeMeta.accent} 14%, ${C.s3})` : "transparent", color: screen === s.id ? C.fg : C.fg3, fontSize: "0.9rem", lineHeight: 1.2, fontFamily: font, fontWeight: screen === s.id ? 600 : 400, whiteSpace: "nowrap" }}>
            {s.icon} {s.label}
          </button>
        ))}
        <div style={{ position: "relative", marginLeft: 4 }}>
          <button className={`app-nav-button${isToolScreen || showTools ? " is-active" : ""}`} onClick={() => setShowTools(v => !v)} style={{ padding: "5px 10px", border: "none", borderRadius: 999, cursor: "pointer", background: isToolScreen || showTools ? `color-mix(in oklch, ${activeMeta.accent} 14%, ${C.s3})` : "transparent", color: isToolScreen || showTools ? C.fg : C.fg3, fontSize: "0.9rem", lineHeight: 1.2, fontFamily: font, whiteSpace: "nowrap" }}>
            Verktyg ▾
          </button>
          {showTools && (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", zIndex: 100, minWidth: 160, boxShadow: `0 20px 48px color-mix(in oklch, ${activeMeta.accent} 12%, transparent)` }}>
              {toolScreens.map(s => (
                <button key={s.id} onClick={() => { setScreen(s.id); setShowTools(false); }} style={{ display: "block", width: "100%", padding: "8px 12px", border: "none", textAlign: "left", background: screen === s.id ? C.s3 : "transparent", color: screen === s.id ? C.fg : C.fg2, fontSize: "0.9rem", lineHeight: 1.25, fontFamily: font, cursor: "pointer" }}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>
      <div className="careflow-ribbon" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, alignItems: "center", padding: "12px 16px 14px", borderBottom: `1px solid color-mix(in oklch, ${activeMeta.accent} 18%, ${C.border})`, background: "color-mix(in oklch, oklch(13% 0.008 55) 88%, transparent)", backdropFilter: "blur(16px)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...T.eyebrow, color: activeMeta.accent, fontFamily: mono, textTransform: "uppercase" }}>Fas · {activeMeta.phase}</span>
            <span style={{ ...T.bodySm, color: C.fg2 }}>{activeMeta.cue}</span>
          </div>
        </div>
        <div className="careflow-track" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {screenSequence.map((entry, index) => (
            <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: index === activeIndex ? 22 : 8, height: 8, borderRadius: 999, background: index <= activeIndex ? activeMeta.accent : C.border, boxShadow: index === activeIndex ? `0 0 22px ${activeMeta.accent}` : "none", transition: "width 220ms ease, background 220ms ease, box-shadow 220ms ease" }} />
              {index < screenSequence.length - 1 && <span style={{ width: 12, height: 1, background: index < activeIndex ? activeMeta.accent : C.border, opacity: 0.7 }} />}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes careflowReveal {
          0% { opacity: 0; transform: translateY(18px) scale(0.985); filter: blur(10px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        @keyframes careflowDrift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -1.2%, 0) scale(1.02); }
        }

        @keyframes presencePulse {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.8; }
          50% { transform: translate3d(0, -4px, 0); opacity: 1; }
        }

        .app-nav::-webkit-scrollbar { display: none; }
        .app-shell-ambient {
          animation: careflowDrift 12s ease-in-out infinite;
        }

        .app-nav-button {
          position: relative;
          transition: transform 180ms ease, background-color 180ms ease, color 180ms ease, box-shadow 180ms ease;
        }

        .app-nav-button:hover {
          transform: translateY(-1px);
        }

        .app-nav-button.is-active {
          box-shadow: 0 12px 32px color-mix(in oklch, ${activeMeta.accent} 14%, transparent);
        }

        .careflow-stage {
          animation: careflowReveal 420ms cubic-bezier(0.2, 0.7, 0.2, 1);
          position: relative;
          z-index: 1;
        }

        .whiteboard-grid {
          animation: careflowDrift 14s ease-in-out infinite;
        }

        .presence-cursor,
        .presence-chip {
          animation: presencePulse 3.6s ease-in-out infinite;
        }

        .or-zone {
          pointer-events: none;
          animation: presencePulse 5.5s ease-in-out infinite;
        }

        .or-item,
        .whiteboard-tool {
          will-change: transform, box-shadow;
        }

        .or-item:hover,
        .whiteboard-tool:hover,
        .conference-controls button:hover {
          transform: translateY(-1px);
        }

        .case-space,
        .dicom-layout,
        .whiteboard-layout,
        .or-layout-shell {
          container-type: inline-size;
        }

        @media (max-width: 900px) {
          .careflow-ribbon {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .careflow-track {
            justify-content: flex-start !important;
          }

          .case-space {
            flex-direction: column;
          }

          .case-space-sidebar,
          .dicom-sidebar,
          .or-layout-sidebar {
            width: 100% !important;
            border-left: none !important;
            border-right: none !important;
            border-top: 1px solid ${C.border};
          }

          .conference-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .dicom-layout,
          .or-layout-shell {
            flex-direction: column;
          }
        }

        @media (max-width: 640px) {
          .presence-chip {
            display: none !important;
          }

          .conference-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .dicom-layout,
          .whiteboard-layout {
            flex-direction: column;
          }

          .dicom-toolbar,
          .whiteboard-toolbar {
            width: 100% !important;
            border-right: none !important;
            border-bottom: 1px solid ${C.border};
            flex-direction: row !important;
            justify-content: flex-start;
            overflow-x: auto;
            padding: 8px;
          }

          .conference-controls {
            justify-content: stretch;
          }

          .conference-controls button {
            flex: 1 1 calc(50% - 6px);
          }
        }
      `}</style>
      <div style={{ flex: 1, overflowY: "auto" }} onClick={() => showTools && setShowTools(false)}>
        <div key={screen} className="careflow-stage">
          {screen === "space" && <CaseSpace nav={setScreen} />}
          {screen === "timeline" && <Timeline />}
          {screen === "consult" && <ConsultRequest />}
          {screen === "calendar" && <CalendarView />}
          {screen === "mdt" && <MDTSummary />}
          {screen === "conference" && <Conference />}
          {screen === "viewer" && <DICOMViewer />}
          {screen === "whiteboard" && <Whiteboard />}
          {screen === "or-layout" && <ORLayout />}
          {screen === "portal" && <PatientPortal />}
        </div>
      </div>
    </div>
  );
}
