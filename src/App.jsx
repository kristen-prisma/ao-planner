import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Copy, Info, RotateCcw } from "lucide-react";

// ===== Prisma palette =====
const C = {
  bone:        "#faf9f6",
  paper:       "#ffffff",
  indigo:      "#693efe",   // Prisma Purple
  indigoSoft:  "#ede8ff",   // Lilac
  text:        "#202020",   // Ink
  textSoft:    "#595959",   // Muted
  textFaint:   "#898989",   // Muted-hover
  line:        "#d9d4c7",   // warm hairline on Bone
  lineSoft:    "#eae6da",
  green:       "#22c973",   // Fern
  greenSoft:   "#d9f5e5",
  red:         "#fc5e48",   // Poppy
  redSoft:     "#ffd3cb",   // Peche
  sky:         "#d8edff",   // Arctic
  highlighter: "#f9ff83",   // Highlighter Yellow
};

const FONT_SANS = '"DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_MONO = '"Roboto Mono", ui-monospace, Menlo, Consolas, monospace';

// ===== Prisma-wide constants from 26-27 Conservative budget =====
const TOTAL_PRISMA_REVENUE = 8089298;
const TOTAL_PRISMA_EXPENSES = 7305424;
const SHARED_OVERHEAD = 2162055;
const CURRICULUM_POOL = 609546;
const NON_AO_NON_HS_REVENUE = 4822253;

// ===== Rules =====
const LS_THRESHOLD = 20;
const MS_THRESHOLD = 23;
const HS_THRESHOLD = 25;

// ===== Benchmarks =====
const BENCH_LS = 0.32;
const BENCH_MS = 0.25;
const BENCH_HS = 0.50;

const DEFAULT_SCENARIO = {
  name: "Current plan (26-27 Conservative)",
  headSalary: 115000,
  mentorSalary: 68000,
  mathSalary: 70000,
  mathEnabled: true,
  contractors: 35000,
  lsFullProgram: 11,
  lsParentCoach: 6,
  msFullProgram: 32,
  msParentCoach: 14,
  hsLearners: 15,
  fpRate: 10631,
  hsRate: 11241,
  pcRate: 5600,
  lsOverride: null,
  msOverride: null,
  hsOverride: null,
};

const PRESET_SCENARIOS = [
  { ...DEFAULT_SCENARIO, name: "Current plan (26-27 Conservative)" },
  { ...DEFAULT_SCENARIO, name: "Growth case: +15 MS learners", msFullProgram: 47, msParentCoach: 14 },
  { ...DEFAULT_SCENARIO, name: "HS expansion: 25 HS learners", hsLearners: 25, contractors: 60000 },
  { ...DEFAULT_SCENARIO, name: "Aggressive: full A&O buildout", msFullProgram: 55, msParentCoach: 20, lsFullProgram: 15, lsParentCoach: 8, hsLearners: 20, contractors: 50000 },
];

// ===== Formatters =====
const fmtUSD = (n) => {
  const abs = Math.abs(Math.round(n));
  const s = "$" + abs.toLocaleString("en-US");
  return n < 0 ? `(${s})` : s;
};
const fmtK = (n) => {
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 1_000_000) s = "$" + (abs / 1_000_000).toFixed(2) + "M";
  else if (abs >= 1000) s = "$" + Math.round(abs / 1000) + "K";
  else s = "$" + Math.round(abs);
  return neg ? `(${s})` : s;
};
const fmtPct = (n) => { if (!isFinite(n)) return "–"; return (n * 100).toFixed(0) + "%"; };
const fmtPct1 = (n) => { if (!isFinite(n)) return "–"; return (n * 100).toFixed(1) + "%"; };
const ceilDiv = (a, b) => (a <= 0 ? 0 : Math.ceil(a / b));

// ===== Core math =====
function computePnL(s) {
  const lsTotal = s.lsFullProgram + s.lsParentCoach;
  const msTotal = s.msFullProgram + s.msParentCoach;
  const aoTotal = lsTotal + msTotal + s.hsLearners;

  const lsAuto = ceilDiv(lsTotal, LS_THRESHOLD);
  const msAuto = ceilDiv(msTotal, MS_THRESHOLD);
  const hsAuto = ceilDiv(s.hsLearners, HS_THRESHOLD);
  const lsCoaches = s.lsOverride !== null && s.lsOverride !== undefined ? s.lsOverride : lsAuto;
  const msCoaches = s.msOverride !== null && s.msOverride !== undefined ? s.msOverride : msAuto;
  const hsCoaches = s.hsOverride !== null && s.hsOverride !== undefined ? s.hsOverride : hsAuto;

  const lsRev = s.lsFullProgram * s.fpRate + s.lsParentCoach * s.pcRate;
  const msRev = s.msFullProgram * s.fpRate + s.msParentCoach * s.pcRate;
  const hsRev = s.hsLearners * s.hsRate;

  const lsCoachCost = lsCoaches * s.mentorSalary;
  const msCoachCost = msCoaches * s.mentorSalary;
  const hsCoachCost = s.headSalary + hsCoaches * s.mentorSalary;

  const lsRatio = lsRev > 0 ? lsCoachCost / lsRev : 0;
  const msRatio = msRev > 0 ? msCoachCost / msRev : 0;
  const hsRatio = hsRev > 0 ? hsCoachCost / hsRev : 0;

  const revFP = (s.lsFullProgram + s.msFullProgram) * s.fpRate;
  const revHS = hsRev;
  const revPC = (s.lsParentCoach + s.msParentCoach) * s.pcRate;
  const revenue = revFP + revHS + revPC;

  const costMentor = (lsCoaches + msCoaches + hsCoaches) * s.mentorSalary;
  const costMath = s.mathEnabled ? s.mathSalary : 0;
  const costHead = s.headSalary;
  const costContract = s.contractors;

  const aoNonHsRev = lsRev + msRev;
  const currDenom = aoNonHsRev + NON_AO_NON_HS_REVENUE;
  const aoCurricShare = currDenom > 0 ? aoNonHsRev / currDenom : 0;
  const costCurricAlloc = CURRICULUM_POOL * aoCurricShare;

  const directCost = costHead + costMentor + costMath + costContract + costCurricAlloc;

  const revShare = TOTAL_PRISMA_REVENUE > 0 ? revenue / TOTAL_PRISMA_REVENUE : 0;
  const allocatedOH = SHARED_OVERHEAD * revShare;

  const directContrib = revenue - directCost;
  const directMargin = revenue > 0 ? directContrib / revenue : 0;
  const fullyLoaded = directContrib - allocatedOH;
  const loadedMargin = revenue > 0 ? fullyLoaded / revenue : 0;

  return {
    lsTotal, msTotal, aoTotal,
    lsAuto, msAuto, hsAuto, lsCoaches, msCoaches, hsCoaches,
    lsRev, msRev, hsRev,
    lsCoachCost, msCoachCost, hsCoachCost,
    lsRatio, msRatio, hsRatio,
    revFP, revHS, revPC, revenue,
    costMentor, costMath, costHead, costContract, costCurricAlloc,
    aoCurricShare, directCost,
    revShare, allocatedOH,
    directContrib, directMargin, fullyLoaded, loadedMargin,
  };
}

// ===== Highlighter wrap — the signature Prisma type treatment =====
function Highlight({ children, pad = 6 }) {
  return (
    <span style={{ position: "relative", display: "inline-block", padding: `0 ${pad}px` }}>
      <span style={{ position: "absolute", left: 0, right: 0, bottom: 1, height: "36%", background: C.highlighter, zIndex: 0 }} />
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
    </span>
  );
}

// ===== UI components =====

function Slider({ label, value, min, max, step, onChange, format = fmtUSD, help }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <label style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.text }}>{label}</label>
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: C.text }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.indigo }} />
      {help && <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.textFaint, margin: "4px 0 0" }}>{help}</p>}
    </div>
  );
}

function Counter({ label, value, onChange, min = 0, max = 200, help }) {
  const pillBtn = {
    width: 32, height: 32, border: `0.5px solid ${C.line}`,
    background: C.paper, borderRadius: 500, cursor: "pointer",
    fontSize: 16, color: C.text, padding: 0,
    fontFamily: FONT_SANS,
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <label style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.text }}>{label}</label>
        <span style={{ fontFamily: FONT_SANS, fontSize: 24, fontWeight: 400, fontVariantNumeric: "tabular-nums", color: C.text }}>{value}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => onChange(Math.max(min, value - 1))} style={pillBtn}>−</button>
        <input type="range" min={min} max={max} step={1} value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          style={{ flex: 1, accentColor: C.indigo }} />
        <button onClick={() => onChange(Math.min(max, value + 1))} style={pillBtn}>+</button>
      </div>
      {help && <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.textFaint, margin: "4px 0 0" }}>{help}</p>}
    </div>
  );
}

function Card({ title, hint, children, accent }) {
  return (
    <div style={{
      background: C.paper,
      border: `0.5px solid ${C.line}`,
      borderTop: accent ? `3px solid ${accent}` : `0.5px solid ${C.line}`,
      padding: "26px 30px", borderRadius: 10,
    }}>
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, color: C.text }}>{title}</h3>
          {hint && <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.textFaint }}>{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function KPI({ label, value, sublabel, tone, hero }) {
  const isHero = !!hero;
  const bg = isHero ? C.indigo : C.paper;
  const fg = isHero ? "#fff" : (tone === "neg" ? "#601212" : C.text);
  const subFg = isHero ? "rgba(255,255,255,0.82)" : C.textFaint;
  const labelFg = isHero ? "rgba(255,255,255,0.82)" : C.textSoft;
  return (
    <div style={{
      padding: "20px 22px",
      background: bg,
      border: `0.5px solid ${isHero ? C.indigo : C.line}`,
      borderRadius: 10,
    }}>
      <p style={{ margin: 0, fontFamily: FONT_MONO, fontSize: 11, color: labelFg, fontWeight: 500 }}>{label}</p>
      <p style={{ margin: "8px 0 0", fontFamily: FONT_SANS, fontSize: 40, fontWeight: 400, color: fg, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em", lineHeight: 1 }}>{value}</p>
      {sublabel && <p style={{ margin: "8px 0 0", fontFamily: FONT_MONO, fontSize: 11.5, color: subFg }}>{sublabel}</p>}
    </div>
  );
}

// ===== Cohort Cost Ratio Strip =====
function CohortRatioBar({ label, hasData, revenue, coachCost, ratio, benchmark, showBench, subLabel }) {
  const delta = hasData ? ratio - benchmark : 0;
  let tone;
  if (!hasData) tone = C.textFaint;
  else if (ratio > benchmark * 1.2) tone = C.red;
  else if (ratio > benchmark) tone = "#f29820"; // goldenrod as 'warn'
  else tone = C.green;

  const maxScale = Math.max(0.6, benchmark * 1.5, ratio * 1.1);
  const barPct = hasData ? Math.min(100, (ratio / maxScale) * 100) : 0;
  const benchPct = Math.min(100, (benchmark / maxScale) * 100);

  return (
    <div style={{
      padding: "18px 20px", background: C.paper,
      border: `0.5px solid ${C.line}`, borderRadius: 10,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontFamily: FONT_MONO, fontSize: 11, color: C.textSoft, fontWeight: 500 }}>{label}</p>
          <p style={{ margin: "4px 0 0", fontFamily: FONT_MONO, fontSize: 11, color: C.textFaint }}>
            {hasData ? `${fmtK(coachCost)} coach ÷ ${fmtK(revenue)} rev` : subLabel || "no learners"}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 32, fontWeight: 400, color: tone, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{hasData ? fmtPct1(ratio) : "–"}</span>
          {showBench && (
            <p style={{ margin: "4px 0 0", fontFamily: FONT_MONO, fontSize: 11, color: C.textFaint }}>
              bench {fmtPct(benchmark)}
              {hasData && Math.abs(delta) >= 0.005 && (
                <span style={{ marginLeft: 6, color: delta > 0 ? C.red : C.green, fontWeight: 500 }}>
                  {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}pp
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      <div style={{ position: "relative", height: 8, background: C.lineSoft, borderRadius: 4 }}>
        {hasData && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: tone, borderRadius: 4, transition: "width 0.24s cubic-bezier(0.2,0.7,0.2,1)" }} />
        )}
        {showBench && (
          <div style={{ position: "absolute", left: `${benchPct}%`, top: -4, bottom: -4, width: 2, background: C.text, opacity: 0.6, borderRadius: 1 }} title={`Benchmark ${fmtPct(benchmark)}`} />
        )}
      </div>
    </div>
  );
}

function CostRatioStrip({ pnl }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, color: C.text }}>Coach cost ratio by cohort</h3>
        <p style={{ margin: 0, fontFamily: FONT_MONO, fontSize: 11, color: C.textSoft }}>
          Coach salary ÷ cohort tuition · lower is better
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <CohortRatioBar
          label="Lower school"
          hasData={pnl.lsTotal > 0}
          revenue={pnl.lsRev} coachCost={pnl.lsCoachCost}
          ratio={pnl.lsRatio} benchmark={BENCH_LS} showBench={true}
        />
        <CohortRatioBar
          label="Middle school"
          hasData={pnl.msTotal > 0}
          revenue={pnl.msRev} coachCost={pnl.msCoachCost}
          ratio={pnl.msRatio} benchmark={BENCH_MS} showBench={true}
        />
        <CohortRatioBar
          label="High school"
          hasData={pnl.hsRev > 0}
          revenue={pnl.hsRev} coachCost={pnl.hsCoachCost}
          ratio={pnl.hsRatio} benchmark={BENCH_HS} showBench={true}
          subLabel="Head of A&O leads"
        />
      </div>
    </div>
  );
}

// ===== P&L table =====
function PnLTable({ scenario, pnl }) {
  const rows = [
    { lbl: "Full program tuition", amt: pnl.revFP, detail: `${scenario.lsFullProgram + scenario.msFullProgram} learners × ${fmtUSD(scenario.fpRate)}` },
    { lbl: "High school tuition", amt: pnl.revHS, detail: `${scenario.hsLearners} learners × ${fmtUSD(scenario.hsRate)}` },
    { lbl: "Parent coach tuition", amt: pnl.revPC, detail: `${scenario.lsParentCoach + scenario.msParentCoach} learners × ${fmtUSD(scenario.pcRate)}` },
    { lbl: "Total revenue", amt: pnl.revenue, bold: true, detail: `${pnl.aoTotal} total learners`, rule: true },
    { lbl: "Head of A&O", amt: -pnl.costHead, detail: "Leads HS cohort" },
    { lbl: "Mentor coaches", amt: -pnl.costMentor, detail: `${pnl.lsCoaches + pnl.msCoaches + pnl.hsCoaches} coaches × ${fmtUSD(scenario.mentorSalary)}` },
    { lbl: "Math coach", amt: -pnl.costMath, detail: scenario.mathEnabled ? "1 coach" : "not included" },
    { lbl: "Contractors", amt: -pnl.costContract, detail: "Annual budget" },
    { lbl: "Curriculum team (allocated)", amt: -pnl.costCurricAlloc, detail: `Revenue-weighted share of $${CURRICULUM_POOL.toLocaleString()} · excludes Cindy` },
    { lbl: "Direct contribution", amt: pnl.directContrib, bold: true, detail: `${fmtPct(pnl.directMargin)} margin`, rule: true },
    { lbl: "Allocated shared overhead", amt: -pnl.allocatedOH, detail: `Revenue-weighted (${fmtPct(pnl.revShare)} of Prisma)` },
    { lbl: "Fully-loaded contribution", amt: pnl.fullyLoaded, bold: true, highlight: true, detail: `${fmtPct(pnl.loadedMargin)} margin` },
  ];

  const headStyle = {
    textAlign: "left", padding: "12px 0", fontWeight: 500, fontSize: 11,
    fontFamily: FONT_MONO, color: C.textSoft,
    borderBottom: `0.5px solid ${C.line}`,
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_SANS, fontSize: 14 }}>
      <thead>
        <tr>
          <th style={headStyle}>Line item</th>
          <th style={{ ...headStyle, textAlign: "right", width: 140 }}>Amount</th>
          <th style={{ ...headStyle, textAlign: "right", width: 72 }}>% rev</th>
          <th style={{ ...headStyle, paddingLeft: 20 }}>Detail</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const color = r.highlight ? (r.amt >= 0 ? C.green : C.red) : C.text;
          const bb = r.rule
            ? `1px solid ${C.text}`
            : `0.5px solid ${C.lineSoft}`;
          return (
            <tr key={i} style={{ borderBottom: bb }}>
              <td style={{ padding: "12px 0", fontWeight: r.bold ? 500 : 400, color: C.text }}>
                {r.highlight ? <Highlight>{r.lbl}</Highlight> : r.lbl}
              </td>
              <td style={{ padding: "12px 0", textAlign: "right", fontWeight: r.bold ? 500 : 400, color, fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmtUSD(r.amt)}</td>
              <td style={{ padding: "12px 0", textAlign: "right", color: C.textFaint, fontFamily: FONT_MONO, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{pnl.revenue > 0 ? fmtPct(r.amt / pnl.revenue) : "–"}</td>
              <td style={{ padding: "12px 0 12px 20px", color: C.textFaint, fontFamily: FONT_MONO, fontSize: 12 }}>{r.detail}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ===== Scenario tabs =====
function ScenarioTabs({ scenarios, activeIdx, onSwitch, onAdd, onDelete, onRename }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (idx) => { setEditingIdx(idx); setEditValue(scenarios[idx].name); };
  const commitEdit = () => { if (editingIdx !== null) { onRename(editingIdx, editValue || "Untitled"); setEditingIdx(null); } };

  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-end", borderBottom: `0.5px solid ${C.line}`, marginBottom: 28 }}>
      {scenarios.map((sc, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          {editingIdx === i ? (
            <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingIdx(null); }}
              style={{ margin: "6px 0", padding: "8px 12px", fontFamily: FONT_SANS, fontSize: 14, border: `1px solid ${C.indigo}`, background: C.paper, width: 240, borderRadius: 4, color: C.text, outline: "none" }} />
          ) : (
            <button onClick={() => i === activeIdx ? startEdit(i) : onSwitch(i)}
              title={i === activeIdx ? "Click again to rename" : "Click to switch"}
              style={{
                padding: "12px 18px 14px", fontFamily: FONT_SANS, fontSize: 14, background: "transparent", border: "none",
                borderBottom: i === activeIdx ? `2px solid ${C.indigo}` : "2px solid transparent",
                marginBottom: -0.5, cursor: "pointer",
                color: i === activeIdx ? C.text : C.textSoft,
                fontWeight: i === activeIdx ? 500 : 400,
              }}
            >{sc.name}</button>
          )}
          {scenarios.length > 1 && i === activeIdx && editingIdx !== i && (
            <button onClick={() => onDelete(i)} title="Delete scenario"
              style={{ padding: "6px", background: "transparent", border: "none", cursor: "pointer", color: C.textFaint, borderRadius: 4 }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd}
        style={{ padding: "12px 14px", fontFamily: FONT_MONO, fontSize: 12, background: "transparent", border: "none", cursor: "pointer", color: C.indigo, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
        <Plus size={13} /> New scenario
      </button>
    </div>
  );
}

// ===== Comparison =====
function ComparisonRow({ scenarios }) {
  if (scenarios.length < 2) return null;
  const pnls = scenarios.map(computePnL);

  const metrics = [
    { lbl: "Total learners", values: pnls.map((p) => p.aoTotal), fmt: (v) => v.toString() },
    { lbl: "Revenue", values: pnls.map((p) => p.revenue), fmt: fmtK },
    { lbl: "LS coach ratio", values: pnls.map((p) => p.lsRatio), fmt: fmtPct1, bench: BENCH_LS },
    { lbl: "MS coach ratio", values: pnls.map((p) => p.msRatio), fmt: fmtPct1, bench: BENCH_MS },
    { lbl: "HS coach ratio", values: pnls.map((p) => p.hsRatio), fmt: fmtPct1, bench: BENCH_HS },
    { lbl: "Direct contribution", values: pnls.map((p) => p.directContrib), fmt: fmtK, contribution: true },
    { lbl: "Direct margin", values: pnls.map((p) => p.directMargin), fmt: fmtPct, contribution: true },
    { lbl: "Fully loaded", values: pnls.map((p) => p.fullyLoaded), fmt: fmtK, contribution: true },
    { lbl: "Loaded margin", values: pnls.map((p) => p.loadedMargin), fmt: fmtPct, contribution: true },
    { lbl: "Mentor coaches", values: pnls.map((p) => p.lsCoaches + p.msCoaches + p.hsCoaches), fmt: (v) => v.toString() },
  ];

  const headStyle = {
    textAlign: "left", padding: "10px 14px 10px 0", fontWeight: 500, fontSize: 11,
    fontFamily: FONT_MONO, color: C.textSoft,
    borderBottom: `0.5px solid ${C.line}`,
  };

  return (
    <div style={{ marginTop: 36 }}>
      <h3 style={{ margin: "0 0 14px", fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, color: C.text }}>Scenario comparison</h3>
      <div style={{ background: C.paper, border: `0.5px solid ${C.line}`, padding: "24px 28px", borderRadius: 10, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_SANS, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={headStyle}>Metric</th>
              {scenarios.map((sc, i) => (
                <th key={i} style={{ ...headStyle, textAlign: "right", padding: "10px 14px", color: C.text, fontFamily: FONT_SANS, fontSize: 12.5, maxWidth: 200 }}>{sc.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, i) => (
              <tr key={i} style={{ borderBottom: `0.5px solid ${C.lineSoft}` }}>
                <td style={{ padding: "10px 14px 10px 0", color: C.textSoft, fontFamily: FONT_SANS, fontSize: 13 }}>
                  {m.lbl}
                  {m.bench !== undefined && (
                    <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.textFaint, marginLeft: 6 }}>bench {fmtPct(m.bench)}</span>
                  )}
                </td>
                {m.values.map((v, j) => {
                  let color = C.text;
                  if (m.contribution) {
                    if (v < 0) color = C.red;
                    else if (v > 0) color = C.green;
                  } else if (m.bench !== undefined) {
                    if (v > m.bench * 1.2) color = C.red;
                    else if (v > m.bench) color = "#f29820";
                    else color = C.green;
                  }
                  return (
                    <td key={j} style={{ textAlign: "right", padding: "10px 14px", color, fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                      {m.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Main app =====
export default function App() {
  const [scenarios, setScenarios] = useState([DEFAULT_SCENARIO]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [showPresets, setShowPresets] = useState(false);

  // Inject Google Fonts once on mount (so no index.html changes are required)
  useEffect(() => {
    const id = "prisma-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..700&family=Roboto+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (window.storage && window.storage.get) {
          const result = await window.storage.get("ao-scenarios-v2");
          if (result && result.value) {
            const parsed = JSON.parse(result.value);
            if (parsed.scenarios && parsed.scenarios.length) {
              setScenarios(parsed.scenarios);
              setActiveIdx(Math.min(parsed.activeIdx || 0, parsed.scenarios.length - 1));
            }
          }
        } else {
          const raw = localStorage.getItem("ao-scenarios-v2");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.scenarios && parsed.scenarios.length) {
              setScenarios(parsed.scenarios);
              setActiveIdx(Math.min(parsed.activeIdx || 0, parsed.scenarios.length - 1));
            }
          }
        }
      } catch (e) { /* no prior save */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(async () => {
      try {
        const payload = JSON.stringify({ scenarios, activeIdx });
        if (window.storage && window.storage.set) {
          await window.storage.set("ao-scenarios-v2", payload);
        } else {
          localStorage.setItem("ao-scenarios-v2", payload);
        }
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 1500);
      } catch (e) { setSaveStatus("Save failed"); }
    }, 600);
    return () => clearTimeout(timer);
  }, [scenarios, activeIdx, loaded]);

  const scenario = scenarios[activeIdx];
  const pnl = useMemo(() => computePnL(scenario), [scenario]);

  const update = (key, value) => {
    const next = [...scenarios];
    next[activeIdx] = { ...next[activeIdx], [key]: value };
    setScenarios(next);
  };

  const addScenario = () => {
    const copy = { ...scenario, name: `${scenario.name} (copy)` };
    setScenarios([...scenarios, copy]);
    setActiveIdx(scenarios.length);
  };

  const loadPreset = (preset) => {
    setScenarios([...scenarios, preset]);
    setActiveIdx(scenarios.length);
    setShowPresets(false);
  };

  const deleteScenario = (idx) => {
    if (scenarios.length <= 1) return;
    const next = scenarios.filter((_, i) => i !== idx);
    setScenarios(next);
    setActiveIdx(Math.max(0, Math.min(activeIdx, next.length - 1)));
  };

  const renameScenario = (idx, name) => {
    const next = [...scenarios];
    next[idx] = { ...next[idx], name };
    setScenarios(next);
  };

  const resetCurrent = () => {
    const next = [...scenarios];
    next[activeIdx] = { ...DEFAULT_SCENARIO, name: scenario.name };
    setScenarios(next);
  };

  if (!loaded) {
    return <div style={{ padding: 40, color: C.textSoft, background: C.bone, minHeight: "100vh", fontFamily: FONT_SANS }}>Loading saved scenarios…</div>;
  }

  const btnStyle = {
    padding: "0 16px", height: 38, fontSize: 12,
    fontFamily: FONT_MONO, fontWeight: 500,
    background: "transparent", border: `1px solid ${C.text}`,
    borderRadius: 500, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6, color: C.text,
  };

  // Resolve logo URL under Vite/CRA/GH Pages. Falls back to "/prisma-wordmark-purple.svg".
  const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
  const LOGO = `${BASE.replace(/\/$/, "")}/prisma-wordmark-purple.svg`;

  return (
    <div style={{
      background: C.bone, minHeight: "100vh",
      padding: "40px 56px 72px",
      fontFamily: FONT_SANS,
      color: C.text,
    }}>
      <div style={{ maxWidth: 1290, margin: "0 auto" }}>

        {/* Masthead */}
        <header style={{ marginBottom: 32, borderBottom: `1px solid ${C.text}`, paddingBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <img src={LOGO} alt="Prisma" style={{ height: 28, width: "auto", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <span style={{ width: 1, height: 18, background: C.line, display: "inline-block" }} />
              <p style={{ margin: 0, fontFamily: FONT_MONO, fontSize: 11, color: C.text, fontWeight: 500 }}>Finance · Internal</p>
            </div>
            <h1 style={{ margin: 0, fontFamily: FONT_SANS, fontSize: 52, fontWeight: 400, letterSpacing: "-0.02em", color: C.text, lineHeight: 1.05, maxWidth: 720 }}>
              A&amp;O <Highlight>profitability planner</Highlight>
              <span style={{ color: C.textFaint, fontWeight: 300, marginLeft: 6 }}> –</span>
            </h1>
            <p style={{ margin: "10px 0 0", fontFamily: FONT_MONO, fontSize: 13, color: C.textSoft, maxWidth: 560 }}>
              Scenario model for the Asia &amp; Oceania program, SY26-27 basis.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <span style={{
              fontFamily: FONT_MONO, fontSize: 11, color: C.textSoft,
              display: "inline-flex", alignItems: "center", gap: 6,
              opacity: saveStatus ? 1 : 0, transition: "opacity 240ms",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
              {saveStatus || "Saved"}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => setShowPresets(!showPresets)} style={btnStyle}>
                <Copy size={12} /> Load preset
              </button>
              <button onClick={resetCurrent} style={btnStyle}>
                <RotateCcw size={12} /> Reset
              </button>
            </div>
          </div>
        </header>

        {/* Preset dropdown */}
        {showPresets && (
          <div style={{ marginBottom: 24, background: C.indigoSoft, border: `0.5px solid ${C.line}`, padding: "16px 20px", borderRadius: 10 }}>
            <p style={{ margin: "0 0 10px", fontFamily: FONT_MONO, fontSize: 11, color: C.text, fontWeight: 500 }}>Choose a preset to branch into a new scenario</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRESET_SCENARIOS.map((p, i) => (
                <button key={i} onClick={() => loadPreset(p)}
                  style={{ padding: "8px 14px", fontFamily: FONT_MONO, fontSize: 12, background: C.paper, border: `0.5px solid ${C.text}`, cursor: "pointer", borderRadius: 500, color: C.text }}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scenario tabs */}
        <ScenarioTabs
          scenarios={scenarios} activeIdx={activeIdx}
          onSwitch={setActiveIdx} onAdd={addScenario}
          onDelete={deleteScenario} onRename={renameScenario}
        />

        {/* Cost ratio strip */}
        <CostRatioStrip pnl={pnl} />

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <KPI label="Total learners" value={pnl.aoTotal} sublabel={`${pnl.lsTotal} LS · ${pnl.msTotal} MS · ${scenario.hsLearners} HS`} />
          <KPI label="Revenue" value={fmtK(pnl.revenue)} sublabel={`${fmtPct1(pnl.revShare)} of Prisma total`} />
          <KPI label="Direct contribution" value={fmtK(pnl.directContrib)}
            sublabel={`${fmtPct(pnl.directMargin)} margin`}
            tone={pnl.directContrib < 0 ? "neg" : "pos"} />
          <KPI hero label="Fully loaded" value={fmtK(pnl.fullyLoaded)}
            sublabel={`${fmtPct(pnl.loadedMargin)} margin · after shared overhead`} />
        </div>

        {/* Input grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

          <Card title="Salaries & direct costs">
            <Slider label="Head of A&O" value={scenario.headSalary} min={80000} max={200000} step={1000}
              onChange={(v) => update("headSalary", v)} help="Also leads the HS cohort" />
            <Slider label="Mentor coach (each)" value={scenario.mentorSalary} min={50000} max={120000} step={500}
              onChange={(v) => update("mentorSalary", v)} />
            <Slider label="Math coach" value={scenario.mathSalary} min={0} max={120000} step={500}
              onChange={(v) => update("mathSalary", v)} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "-4px 0 12px", fontFamily: FONT_SANS, fontSize: 13, color: C.textSoft }}>
              <input type="checkbox" checked={scenario.mathEnabled} onChange={(e) => update("mathEnabled", e.target.checked)} style={{ accentColor: C.indigo }} />
              Include math coach in costs
            </label>
            <Slider label="Contractors (annual)" value={scenario.contractors} min={0} max={200000} step={1000}
              onChange={(v) => update("contractors", v)} help="Supplemental support, curriculum, HS contractors" />
          </Card>

          <Card title="Learner counts">
            <Counter label="LS Full program (grades 4–5)" value={scenario.lsFullProgram}
              onChange={(v) => update("lsFullProgram", v)} max={60} />
            <Counter label="LS Parent coach (grades 4–5)" value={scenario.lsParentCoach}
              onChange={(v) => update("lsParentCoach", v)} max={60} />
            <Counter label="MS Full program (grades 6–8)" value={scenario.msFullProgram}
              onChange={(v) => update("msFullProgram", v)} max={120} />
            <Counter label="MS Parent coach (grades 6–8)" value={scenario.msParentCoach}
              onChange={(v) => update("msParentCoach", v)} max={120} />
            <Counter label="HS learners (Head of A&O leads)" value={scenario.hsLearners}
              onChange={(v) => update("hsLearners", v)} max={40} />
          </Card>

          <Card title="Tuition rates">
            <Slider label="Full program tuition" value={scenario.fpRate} min={6000} max={15000} step={100}
              onChange={(v) => update("fpRate", v)} help="Applied to LS + MS full program learners" />
            <Slider label="HS tuition" value={scenario.hsRate} min={6000} max={16000} step={100}
              onChange={(v) => update("hsRate", v)} />
            <Slider label="Parent coach tuition" value={scenario.pcRate} min={2000} max={8000} step={50}
              onChange={(v) => update("pcRate", v)} help="Applied to LS + MS parent coach learners" />
          </Card>

          <Card title="Auto-hired coaches" hint="override if needed" accent={C.indigo}>
            {[
              { key: "ls", label: "LS mentor coaches", count: pnl.lsCoaches, auto: pnl.lsAuto, override: scenario.lsOverride, updateKey: "lsOverride", threshold: LS_THRESHOLD, total: pnl.lsTotal, prefix: "LS" },
              { key: "ms", label: "MS mentor coaches", count: pnl.msCoaches, auto: pnl.msAuto, override: scenario.msOverride, updateKey: "msOverride", threshold: MS_THRESHOLD, total: pnl.msTotal, prefix: "MS" },
              { key: "hs", label: "HS mentor coaches", count: pnl.hsCoaches, auto: pnl.hsAuto, override: scenario.hsOverride, updateKey: "hsOverride", threshold: HS_THRESHOLD, total: scenario.hsLearners, prefix: "HS" },
            ].map((row, idx, arr) => (
              <div key={row.key} style={{ marginBottom: idx < arr.length - 1 ? 18 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <label style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.text }}>{row.label}</label>
                  <span style={{ fontFamily: FONT_SANS, fontSize: 24, fontWeight: 400, fontVariantNumeric: "tabular-nums", color: C.text }}>{row.count}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontFamily: FONT_MONO, fontSize: 11, padding: "5px 10px", borderRadius: 500,
                    background: row.override !== null ? C.indigoSoft : C.paper,
                    border: `0.5px solid ${row.override !== null ? C.indigoSoft : C.line}`,
                    color: C.textSoft,
                  }}>Auto {row.auto}</span>
                  <input type="number" placeholder="override"
                    value={row.override ?? ""}
                    onChange={(e) => update(row.updateKey, e.target.value === "" ? null : parseInt(e.target.value))}
                    min={0}
                    style={{ width: 76, height: 32, fontFamily: FONT_MONO, fontSize: 13, padding: "0 10px", border: `0.5px solid ${C.line}`, background: C.paper, borderRadius: 6, color: C.text, outline: "none", fontVariantNumeric: "tabular-nums" }}
                  />
                  {row.override !== null && (
                    <button onClick={() => update(row.updateKey, null)}
                      style={{ fontFamily: FONT_MONO, fontSize: 11, background: "transparent", border: "none", cursor: "pointer", color: C.indigo }}>
                      clear
                    </button>
                  )}
                </div>
                <p style={{ margin: "6px 0 0", fontFamily: FONT_MONO, fontSize: 11, color: C.textFaint }}>
                  {row.prefix === "HS"
                    ? `Rule: 1 coach per ${row.threshold} HS learners. Currently ${row.total} HS learners. Head of A&O leads by default.`
                    : `Rule: 1 coach per ${row.threshold} ${row.prefix} learners (Full + Parent coach). Currently ${row.total} ${row.prefix} learners.`}
                </p>
              </div>
            ))}
          </Card>

        </div>

        {/* Insight strip */}
        <div style={{
          background: pnl.fullyLoaded >= 0 ? C.greenSoft : C.redSoft,
          border: `0.5px solid ${pnl.fullyLoaded >= 0 ? C.green : C.red}`,
          padding: "18px 22px", marginBottom: 24, borderRadius: 10,
          display: "flex", alignItems: "flex-start", gap: 16,
        }}>
          <div style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: 500,
            background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONT_SANS, fontSize: 18, fontWeight: 500,
            color: pnl.fullyLoaded >= 0 ? C.green : C.red,
          }}>{pnl.fullyLoaded >= 0 ? "✓" : "!"}</div>
          <p style={{ margin: 0, fontFamily: FONT_SANS, fontSize: 15, color: C.text, lineHeight: 1.45, paddingTop: 4 }}>
            {pnl.fullyLoaded >= 0 ? (
              <>Fully-loaded positive by <strong style={{ fontWeight: 500 }}>{fmtK(pnl.fullyLoaded)}</strong>. Direct margin is <strong style={{ fontWeight: 500 }}>{fmtPct(pnl.directMargin)}</strong> on {pnl.aoTotal} learners — A&amp;O is carrying its share of shared overhead and still contributing.</>
            ) : (
              <>Fully-loaded deficit of <strong style={{ fontWeight: 500 }}>{fmtK(-pnl.fullyLoaded)}</strong>. At the current blended rate of {fmtUSD(Math.round(pnl.revenue / Math.max(pnl.aoTotal, 1)))}/learner, you'd need roughly <strong style={{ fontWeight: 500 }}>{pnl.aoTotal > 0 ? Math.ceil(-pnl.fullyLoaded / (pnl.revenue / pnl.aoTotal)) : 0} more learners</strong> to break even — assuming existing coach capacity absorbs them.</>
            )}
          </p>
        </div>

        {/* P&L */}
        <Card title="Profit & loss build">
          <PnLTable scenario={scenario} pnl={pnl} />
        </Card>

        {/* Comparison */}
        <ComparisonRow scenarios={scenarios} />

        {/* Footer */}
        <footer style={{ marginTop: 48, paddingTop: 20, borderTop: `0.5px solid ${C.line}`, fontFamily: FONT_MONO, fontSize: 11.5, color: C.textFaint, lineHeight: 1.6, maxWidth: 1000 }}>
          <p style={{ margin: 0 }}>
            Shared overhead ({fmtK(SHARED_OVERHEAD)}) allocated revenue-weighted against Prisma total ({fmtK(TOTAL_PRISMA_REVENUE)}). Curriculum pool ({fmtK(CURRICULUM_POOL)}) allocated revenue-weighted across all non-HS learners in A&amp;O, EMEA, and Americas. Excludes Cindy (Community &amp; Culture, Americas + EMEA only), Leena (HS Head of School), Natalie (MS Head of School), Javi (LS Head of School) — all directly attributed to their own tiers elsewhere. Scenarios save automatically. Coach thresholds: {LS_THRESHOLD} LS, {MS_THRESHOLD} MS, {HS_THRESHOLD} HS. Benchmarks: LS 32%, MS 25%, HS 50% (derived from Americas HS at scale: coaches + Head of School).
          </p>
        </footer>

      </div>
    </div>
  );
}
