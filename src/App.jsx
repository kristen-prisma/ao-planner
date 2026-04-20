import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Copy, Info, RotateCcw } from "lucide-react";

// ===== Palette =====
const C = {
  bone: "#faf9f6",
  indigo: "#693efe",
  text: "#1a2b35",
  green: "#24c873",
  sky: "#d8edff",
  textSoft: "#5a6872",
  textFaint: "#8b959d",
  line: "#e6e2d8",
  lineSoft: "#efece3",
  paper: "#ffffff",
  indigoSoft: "#ede8ff",
  greenSoft: "#d9f5e5",
  red: "#c0392b",
  redSoft: "#fae5e2",
};

// ===== Prisma-wide constants from 26-27 Conservative budget =====
const TOTAL_PRISMA_REVENUE = 8089298;
const TOTAL_PRISMA_EXPENSES = 7305424;
const DIRECT_COACH_TOTAL = 515797 + 1181266 + 279257 + 240960 + 1649145;
const SHARED_OVERHEAD = TOTAL_PRISMA_EXPENSES - DIRECT_COACH_TOTAL;

// ===== Rules =====
const LS_THRESHOLD = 22;
const MS_THRESHOLD = 24;

// ===== Benchmarks (coach salary / cohort revenue) =====
const BENCH_LS = 0.32;
const BENCH_MS = 0.25;

const DEFAULT_SCENARIO = {
  name: "Current plan (26-27 Conservative)",
  headSalary: 115000,
  mentorSalary: 68000,
  mathSalary: 70000,
  mathEnabled: true,
  contractors: 35000,
  lsFullProgram: 8,
  lsParentCoach: 5,
  msFullProgram: 32,
  msParentCoach: 14,
  hsLearners: 5,
  fpRate: 10618,
  hsRate: 11241,
  pcRate: 4930,
  lsOverride: null,
  msOverride: null,
};

const PRESET_SCENARIOS = [
  { ...DEFAULT_SCENARIO, name: "Current plan (26-27 Conservative)" },
  { ...DEFAULT_SCENARIO, name: "Growth case: +15 MS learners", msFullProgram: 47, msParentCoach: 14 },
  { ...DEFAULT_SCENARIO, name: "HS expansion: 15 HS learners", hsLearners: 15, contractors: 60000 },
  { ...DEFAULT_SCENARIO, name: "Aggressive: full A&O buildout", msFullProgram: 55, msParentCoach: 20, lsFullProgram: 15, lsParentCoach: 8, hsLearners: 12, contractors: 50000 },
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
  const lsCoaches = s.lsOverride !== null && s.lsOverride !== undefined ? s.lsOverride : lsAuto;
  const msCoaches = s.msOverride !== null && s.msOverride !== undefined ? s.msOverride : msAuto;

  const lsRev = s.lsFullProgram * s.fpRate + s.lsParentCoach * s.pcRate;
  const msRev = s.msFullProgram * s.fpRate + s.msParentCoach * s.pcRate;
  const hsRev = s.hsLearners * s.hsRate;

  const lsCoachCost = lsCoaches * s.mentorSalary;
  const msCoachCost = msCoaches * s.mentorSalary;
  const hsCoachCost = s.headSalary;

  const lsRatio = lsRev > 0 ? lsCoachCost / lsRev : 0;
  const msRatio = msRev > 0 ? msCoachCost / msRev : 0;
  const hsRatio = hsRev > 0 ? hsCoachCost / hsRev : 0;

  const revFP = (s.lsFullProgram + s.msFullProgram) * s.fpRate;
  const revHS = hsRev;
  const revPC = (s.lsParentCoach + s.msParentCoach) * s.pcRate;
  const revenue = revFP + revHS + revPC;

  const costMentor = (lsCoaches + msCoaches) * s.mentorSalary;
  const costMath = s.mathEnabled ? s.mathSalary : 0;
  const costHead = s.headSalary;
  const costContract = s.contractors;
  const directCost = costHead + costMentor + costMath + costContract;

  const revShare = TOTAL_PRISMA_REVENUE > 0 ? revenue / TOTAL_PRISMA_REVENUE : 0;
  const allocatedOH = SHARED_OVERHEAD * revShare;

  const directContrib = revenue - directCost;
  const directMargin = revenue > 0 ? directContrib / revenue : 0;
  const fullyLoaded = directContrib - allocatedOH;
  const loadedMargin = revenue > 0 ? fullyLoaded / revenue : 0;

  return {
    lsTotal, msTotal, aoTotal,
    lsAuto, msAuto, lsCoaches, msCoaches,
    lsRev, msRev, hsRev,
    lsCoachCost, msCoachCost, hsCoachCost,
    lsRatio, msRatio, hsRatio,
    revFP, revHS, revPC, revenue,
    costMentor, costMath, costHead, costContract, directCost,
    revShare, allocatedOH,
    directContrib, directMargin, fullyLoaded, loadedMargin,
  };
}

// ===== UI components =====

function Slider({ label, value, min, max, step, onChange, format = fmtUSD, help }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <label style={{ fontSize: 13, color: C.textSoft }}>{label}</label>
        <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: C.text }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.indigo }} />
      {help && <p style={{ fontSize: 11, color: C.textFaint, margin: "3px 0 0" }}>{help}</p>}
    </div>
  );
}

function Counter({ label, value, onChange, min = 0, max = 200, help }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <label style={{ fontSize: 13, color: C.textSoft }}>{label}</label>
        <span style={{ fontSize: 20, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: C.text }}>{value}</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button onClick={() => onChange(Math.max(min, value - 1))}
          style={{ width: 28, height: 28, border: `0.5px solid ${C.line}`, background: C.paper, borderRadius: 4, cursor: "pointer", fontSize: 14, color: C.textSoft, padding: 0 }}>−</button>
        <input type="range" min={min} max={max} step={1} value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          style={{ flex: 1, accentColor: C.indigo }} />
        <button onClick={() => onChange(Math.min(max, value + 1))}
          style={{ width: 28, height: 28, border: `0.5px solid ${C.line}`, background: C.paper, borderRadius: 4, cursor: "pointer", fontSize: 14, color: C.textSoft, padding: 0 }}>+</button>
      </div>
      {help && <p style={{ fontSize: 11, color: C.textFaint, margin: "3px 0 0" }}>{help}</p>}
    </div>
  );
}

function Card({ title, children, accent }) {
  return (
    <div style={{
      background: C.paper,
      border: `0.5px solid ${C.line}`,
      borderTop: accent ? `2px solid ${accent}` : `0.5px solid ${C.line}`,
      padding: "18px 22px", borderRadius: 6,
    }}>
      {title && (
        <h3 style={{ margin: "0 0 14px", fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textSoft }}>{title}</h3>
      )}
      {children}
    </div>
  );
}

function KPI({ label, value, sublabel, tone }) {
  let color = C.text;
  if (tone === "neg") color = C.red;
  if (tone === "pos") color = C.green;
  return (
    <div style={{ padding: "16px 18px", background: C.paper, border: `0.5px solid ${C.line}`, borderRadius: 6 }}>
      <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textSoft, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 500, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{value}</p>
      {sublabel && <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textFaint }}>{sublabel}</p>}
    </div>
  );
}

// ===== Cohort Cost Ratio Strip =====
function CohortRatioBar({ label, hasData, revenue, coachCost, ratio, benchmark, showBench, subLabel }) {
  const delta = hasData ? ratio - benchmark : 0;
  const ratioColor = !hasData
    ? C.textFaint
    : ratio > benchmark * 1.2 ? C.red
    : ratio > benchmark ? C.indigo
    : C.green;

  const maxScale = Math.max(0.6, benchmark * 1.5, ratio * 1.1);
  const barPct = hasData ? Math.min(100, (ratio / maxScale) * 100) : 0;
  const benchPct = Math.min(100, (benchmark / maxScale) * 100);

  return (
    <div style={{
      padding: "14px 18px", background: C.paper,
      border: `0.5px solid ${C.line}`, borderRadius: 6,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textSoft, fontWeight: 600 }}>{label}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textFaint }}>
            {hasData ? `${fmtK(coachCost)} coach / ${fmtK(revenue)} rev` : subLabel || "no learners"}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: 22, fontWeight: 500, color: ratioColor, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{hasData ? fmtPct1(ratio) : "–"}</span>
          {showBench && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textFaint }}>
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
      <div style={{ position: "relative", height: 6, background: C.lineSoft, borderRadius: 3 }}>
        {hasData && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: ratioColor, borderRadius: 3, transition: "width 0.2s ease" }} />
        )}
        {showBench && (
          <div style={{ position: "absolute", left: `${benchPct}%`, top: -3, bottom: -3, width: 1.5, background: C.text, opacity: 0.5 }} title={`Benchmark ${fmtPct(benchmark)}`} />
        )}
      </div>
    </div>
  );
}

function CostRatioStrip({ pnl }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textSoft }}>Coach cost ratio by cohort</h3>
        <p style={{ margin: 0, fontSize: 11, color: C.textFaint }}>
          Coach salary ÷ cohort tuition revenue · lower is better
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
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
          ratio={pnl.hsRatio} benchmark={BENCH_MS} showBench={false}
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
    { lbl: "Mentor coaches", amt: -pnl.costMentor, detail: `${pnl.lsCoaches + pnl.msCoaches} coaches × ${fmtUSD(scenario.mentorSalary)}` },
    { lbl: "Math coach", amt: -pnl.costMath, detail: scenario.mathEnabled ? "1 coach" : "not included" },
    { lbl: "Contractors", amt: -pnl.costContract, detail: "Annual budget" },
    { lbl: "Direct contribution", amt: pnl.directContrib, bold: true, detail: `${fmtPct(pnl.directMargin)} margin`, rule: true },
    { lbl: "Allocated overhead", amt: -pnl.allocatedOH, detail: `Revenue-weighted (${fmtPct(pnl.revShare)} of Prisma)` },
    { lbl: "Fully-loaded contribution", amt: pnl.fullyLoaded, bold: true, highlight: true, detail: `${fmtPct(pnl.loadedMargin)} margin` },
  ];

  const headStyle = {
    textAlign: "left", padding: "10px 0", fontWeight: 600, fontSize: 10,
    letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSoft,
    borderBottom: `0.5px solid ${C.line}`,
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={headStyle}>Line item</th>
          <th style={{ ...headStyle, textAlign: "right", width: 120 }}>Amount</th>
          <th style={{ ...headStyle, textAlign: "right", width: 70 }}>% rev</th>
          <th style={{ ...headStyle, paddingLeft: 16 }}>Detail</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isHL = r.highlight;
          const color = isHL ? (r.amt >= 0 ? C.green : C.red) : C.text;
          const bg = isHL ? (r.amt >= 0 ? C.greenSoft : C.redSoft) : "transparent";
          return (
            <tr key={i} style={{ background: bg, borderBottom: r.rule ? `0.5px solid ${C.line}` : "none" }}>
              <td style={{ padding: "9px 0", fontWeight: r.bold ? 500 : 400, color: C.text }}>{r.lbl}</td>
              <td style={{ padding: "9px 0", textAlign: "right", fontWeight: r.bold ? 500 : 400, color, fontVariantNumeric: "tabular-nums" }}>{fmtUSD(r.amt)}</td>
              <td style={{ padding: "9px 0", textAlign: "right", color: C.textFaint, fontVariantNumeric: "tabular-nums" }}>{pnl.revenue > 0 ? fmtPct(r.amt / pnl.revenue) : "–"}</td>
              <td style={{ padding: "9px 0 9px 16px", color: C.textFaint, fontSize: 12 }}>{r.detail}</td>
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
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", borderBottom: `0.5px solid ${C.line}`, marginBottom: 20 }}>
      {scenarios.map((sc, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          {editingIdx === i ? (
            <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingIdx(null); }}
              style={{ padding: "8px 12px", fontSize: 13, border: `1px solid ${C.indigo}`, background: C.paper, width: 240, borderRadius: 4, color: C.text, outline: "none" }} />
          ) : (
            <button onClick={() => i === activeIdx ? startEdit(i) : onSwitch(i)}
              title={i === activeIdx ? "Click again to rename" : "Click to switch"}
              style={{
                padding: "10px 16px", fontSize: 13, background: "transparent", border: "none",
                borderBottom: i === activeIdx ? `2px solid ${C.indigo}` : "2px solid transparent",
                marginBottom: -1, cursor: "pointer",
                color: i === activeIdx ? C.text : C.textSoft,
                fontWeight: i === activeIdx ? 500 : 400,
              }}
            >{sc.name}</button>
          )}
          {scenarios.length > 1 && i === activeIdx && editingIdx !== i && (
            <button onClick={() => onDelete(i)} title="Delete scenario"
              style={{ padding: "6px", background: "transparent", border: "none", cursor: "pointer", color: C.textFaint }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd}
        style={{ padding: "10px 14px", fontSize: 13, background: "transparent", border: "none", cursor: "pointer", color: C.indigo, display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
        <Plus size={14} /> New scenario
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
    { lbl: "Direct contribution", values: pnls.map((p) => p.directContrib), fmt: fmtK, contribution: true },
    { lbl: "Direct margin", values: pnls.map((p) => p.directMargin), fmt: fmtPct, contribution: true },
    { lbl: "Fully loaded", values: pnls.map((p) => p.fullyLoaded), fmt: fmtK, contribution: true },
    { lbl: "Loaded margin", values: pnls.map((p) => p.loadedMargin), fmt: fmtPct, contribution: true },
    { lbl: "Mentor coaches", values: pnls.map((p) => p.lsCoaches + p.msCoaches), fmt: (v) => v.toString() },
  ];

  const headStyle = {
    textAlign: "left", padding: "10px 12px 10px 0", fontWeight: 600, fontSize: 10,
    letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSoft,
    borderBottom: `0.5px solid ${C.line}`,
  };

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textSoft }}>Scenario comparison</h3>
      <div style={{ background: C.paper, border: `0.5px solid ${C.line}`, padding: "18px 22px", borderRadius: 6, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={headStyle}>Metric</th>
              {scenarios.map((sc, i) => (
                <th key={i} style={{ ...headStyle, textAlign: "right", padding: "10px 12px", color: C.text, maxWidth: 180, textTransform: "none", fontSize: 11, letterSpacing: "0" }}>{sc.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, i) => (
              <tr key={i} style={{ borderBottom: `0.5px solid ${C.lineSoft}` }}>
                <td style={{ padding: "9px 12px 9px 0", color: C.textSoft }}>
                  {m.lbl}
                  {m.bench !== undefined && (
                    <span style={{ fontSize: 10, color: C.textFaint, marginLeft: 6 }}>bench {fmtPct(m.bench)}</span>
                  )}
                </td>
                {m.values.map((v, j) => {
                  let color = C.text;
                  if (m.contribution) {
                    if (v < 0) color = C.red;
                    else if (v > 0) color = C.green;
                  } else if (m.bench !== undefined) {
                    if (v > m.bench * 1.2) color = C.red;
                    else if (v > m.bench) color = C.indigo;
                    else color = C.green;
                  }
                  return (
                    <td key={j} style={{ textAlign: "right", padding: "9px 12px", color, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ao-scenarios");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.scenarios && parsed.scenarios.length) {
          setScenarios(parsed.scenarios);
          setActiveIdx(Math.min(parsed.activeIdx || 0, parsed.scenarios.length - 1));
        }
      }
    } catch (e) { /* no prior save or parse error */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("ao-scenarios", JSON.stringify({ scenarios, activeIdx }));
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
    return <div style={{ padding: 40, color: C.textSoft, background: C.bone, minHeight: "100vh" }}>Loading saved scenarios…</div>;
  }

  const btnStyle = {
    padding: "8px 14px", fontSize: 12, background: "transparent",
    border: `1px solid ${C.text}`, cursor: "pointer", borderRadius: 4,
    display: "flex", alignItems: "center", gap: 6, color: C.text, fontWeight: 500,
  };

  return (
    <div style={{
      background: C.bone, minHeight: "100vh",
      padding: "32px 28px 60px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: C.text,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Masthead */}
        <header style={{ marginBottom: 24, borderBottom: `1px solid ${C.text}`, paddingBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: C.indigo, fontWeight: 600 }}>Prisma · Finance</p>
              <h1 style={{ margin: "6px 0 0", fontSize: 32, fontWeight: 500, letterSpacing: "-0.015em", color: C.text }}>A&amp;O profitability planner</h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textSoft }}>Scenario model for the Asia &amp; Oceania program · SY26-27 basis</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {saveStatus && (
                <span style={{ fontSize: 11, color: C.green, fontWeight: 500 }}>● {saveStatus}</span>
              )}
              <button onClick={() => setShowPresets(!showPresets)} style={btnStyle}>
                <Copy size={12} /> Load preset
              </button>
              <button onClick={resetCurrent} style={btnStyle}>
                <RotateCcw size={12} /> Reset current
              </button>
            </div>
          </div>
        </header>

        {/* Preset dropdown */}
        {showPresets && (
          <div style={{ marginBottom: 20, background: C.sky, border: `0.5px solid ${C.line}`, padding: "14px 18px", borderRadius: 6 }}>
            <p style={{ margin: "0 0 10px", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textSoft, fontWeight: 600 }}>Presets</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRESET_SCENARIOS.map((p, i) => (
                <button key={i} onClick={() => loadPreset(p)}
                  style={{ padding: "7px 12px", fontSize: 12, background: C.paper, border: `0.5px solid ${C.line}`, cursor: "pointer", borderRadius: 4, color: C.text }}>
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

        {/* Cost ratio strip — sits at top per request */}
        <div style={{ marginBottom: 20 }}>
          <CostRatioStrip pnl={pnl} />
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <KPI label="Total learners" value={pnl.aoTotal} />
          <KPI label="Revenue" value={fmtK(pnl.revenue)} />
          <KPI label="Direct contribution" value={fmtK(pnl.directContrib)}
            sublabel={`${fmtPct(pnl.directMargin)} margin`}
            tone={pnl.directContrib < 0 ? "neg" : "pos"} />
          <KPI label="Fully loaded" value={fmtK(pnl.fullyLoaded)}
            sublabel={`${fmtPct(pnl.loadedMargin)} margin`}
            tone={pnl.fullyLoaded < 0 ? "neg" : "pos"} />
        </div>

        {/* Input grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          <Card title="Salaries & direct costs">
            <Slider label="Head of A&O" value={scenario.headSalary} min={80000} max={200000} step={1000}
              onChange={(v) => update("headSalary", v)} help="Also leads the HS cohort" />
            <Slider label="Mentor coach (each)" value={scenario.mentorSalary} min={50000} max={120000} step={500}
              onChange={(v) => update("mentorSalary", v)} />
            <Slider label="Math coach" value={scenario.mathSalary} min={0} max={120000} step={500}
              onChange={(v) => update("mathSalary", v)} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -6, marginBottom: 10, fontSize: 12, color: C.textSoft }}>
              <input type="checkbox" checked={scenario.mathEnabled} onChange={(e) => update("mathEnabled", e.target.checked)} style={{ accentColor: C.indigo }} />
              Include math coach
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

          <Card title="Auto-hired coaches (override if needed)" accent={C.indigo}>
            {[
              { key: "ls", label: "LS mentor coaches", count: pnl.lsCoaches, auto: pnl.lsAuto, override: scenario.lsOverride, updateKey: "lsOverride", threshold: LS_THRESHOLD, total: pnl.lsTotal, prefix: "LS" },
              { key: "ms", label: "MS mentor coaches", count: pnl.msCoaches, auto: pnl.msAuto, override: scenario.msOverride, updateKey: "msOverride", threshold: MS_THRESHOLD, total: pnl.msTotal, prefix: "MS" },
            ].map((row, idx) => (
              <div key={row.key} style={{ marginBottom: idx === 0 ? 16 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <label style={{ fontSize: 13, color: C.textSoft }}>{row.label}</label>
                  <span style={{ fontSize: 20, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: C.text }}>{row.count}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 4,
                    background: row.override !== null ? C.sky : C.paper,
                    border: `0.5px solid ${C.line}`, color: C.textSoft,
                  }}>Auto: {row.auto}</span>
                  <input type="number" placeholder="override"
                    value={row.override ?? ""}
                    onChange={(e) => update(row.updateKey, e.target.value === "" ? null : parseInt(e.target.value))}
                    min={0}
                    style={{ width: 80, height: 30, fontSize: 13, padding: "0 10px", border: `0.5px solid ${C.line}`, background: C.paper, borderRadius: 4, color: C.text, outline: "none" }}
                  />
                  {row.override !== null && (
                    <button onClick={() => update(row.updateKey, null)}
                      style={{ fontSize: 11, background: "transparent", border: "none", cursor: "pointer", color: C.indigo }}>
                      clear
                    </button>
                  )}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: C.textFaint }}>
                  Rule: 1 coach per {row.threshold} {row.prefix} learners (Full + Parent coach). Currently {row.total} {row.prefix} learners.
                </p>
              </div>
            ))}
          </Card>

        </div>

        {/* Insight strip */}
        <div style={{
          background: pnl.fullyLoaded >= 0 ? C.greenSoft : C.sky,
          border: `0.5px solid ${pnl.fullyLoaded >= 0 ? C.green : C.indigo}`,
          padding: "14px 20px", marginBottom: 16, borderRadius: 6,
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <Info size={16} color={pnl.fullyLoaded >= 0 ? C.green : C.indigo} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
            {pnl.fullyLoaded >= 0 ? (
              <>Fully loaded positive by {fmtK(pnl.fullyLoaded)}. Direct margin {fmtPct(pnl.directMargin)} on {pnl.aoTotal} learners.</>
            ) : (
              <>Fully loaded deficit of {fmtK(-pnl.fullyLoaded)}. At current blended rate of {fmtUSD(Math.round(pnl.revenue / Math.max(pnl.aoTotal, 1)))}/learner, need approximately {pnl.aoTotal > 0 ? Math.ceil(-pnl.fullyLoaded / (pnl.revenue / pnl.aoTotal)) : 0} more learners to break even — assuming existing coach capacity absorbs them.</>
            )}
          </p>
        </div>

        {/* P&L table */}
        <Card title="Profit & loss build">
          <PnLTable scenario={scenario} pnl={pnl} />
        </Card>

        {/* Comparison */}
        <ComparisonRow scenarios={scenarios} />

        {/* Footer */}
        <footer style={{ marginTop: 40, paddingTop: 18, borderTop: `0.5px solid ${C.line}`, fontSize: 11, color: C.textFaint, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            Shared overhead ({fmtK(SHARED_OVERHEAD)}) allocated revenue-weighted against Prisma total ({fmtK(TOTAL_PRISMA_REVENUE)}). Scenarios save automatically. Coach thresholds: 22 LS, 24 MS. HS cohort led by Head of A&amp;O with contractor support as budgeted. Benchmarks: MS average 25%, LS average 32%.
          </p>
        </footer>

      </div>
    </div>
  );
}
