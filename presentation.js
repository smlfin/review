/* ══════════════════════════════════════════════════════════
   PRESENTATION MODE  —  v3 (light theme, side-by-side Monthly + YTD)
   Reads script.js globals: allData, MONTHS, PLABEL,
   PROD_COLOR, OUT_CFG, getEffectiveMonths, calc, fmt,
   fmtFull, initials, parseDOJDate, SESSION_NAME,
   SESSION_ROLE, SESSION_BRANCH.
   No toggle switch needed — both views appear together.
   ══════════════════════════════════════════════════════════ */

const presState = {
  screen: "branch",
  branchName: null,
  months: new Set(),
  staffName: null
};

/* ── wait for script.js's own load() to finish ── */
(function waitForData() {
  const iv = setInterval(() => {
    if (typeof allData !== "undefined" && Array.isArray(allData) && allData.length) {
      clearInterval(iv);
      presInit();
    }
  }, 150);
})();

function presInit() {
  document.getElementById("presCrumb").textContent =
    SESSION_NAME + " · " + (SESSION_ROLE === "admin" ? "All Branches" : SESSION_BRANCH);

  if (SESSION_ROLE !== "admin" && allData.length === 1) {
    presSelectBranch(allData[0].branchName);
    return;
  }
  presRenderBranchGrid();
}

/* ═══════════════ SCREEN SWITCHING ═══════════════ */
function presShowScreen(name) {
  document.querySelectorAll(".pres-screen").forEach(s => s.classList.remove("on"));
  document.getElementById("scr-" + name).classList.add("on");
  presState.screen = name;
  document.getElementById("presBackBtn").style.display = name === "branch" ? "none" : "inline-block";
  presUpdateCrumb();
}

function presUpdateCrumb() {
  const parts = [SESSION_NAME];
  if (presState.branchName) parts.push(presState.branchName);
  if (presState.months.size) {
    const sorted = [...presState.months].sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b));
    parts.push(presPeriodLabel(sorted));
  }
  if (presState.staffName) parts.push(presState.staffName);
  document.getElementById("presCrumb").textContent = parts.join(" · ");
}

function presGoBack() {
  if (presState.screen === "staff")  { presShowScreen("dash");   return; }
  if (presState.screen === "dash")   { presShowScreen("month");  return; }
  if (presState.screen === "month") {
    if (SESSION_ROLE !== "admin") return;
    presState.branchName = null;
    presShowScreen("branch");
    return;
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
  else document.exitFullscreen();
}

/* ═══════════════ SCREEN 1 — BRANCH PICKER ═══════════════ */
function presRenderBranchGrid() {
  const grid = document.getElementById("branchGrid");
  grid.innerHTML = allData.map((b, i) => {
    const agg  = presAggregateBranch(b, presCurrentOrDefaultMonths());
    const pct  = presOverallPct(agg);
    return `<div class="pres-tile" data-branch-idx="${i}">
      <div class="t-ring" style="background:${presPctBg(pct)};color:#fff">${pct}%</div>
      <div class="t-name">${presEsc(b.branchName)}</div>
      <div class="t-sub">${(b.staff||[]).filter(s=>s.name.toUpperCase()!=="TOTAL").length} staff</div>
    </div>`;
  }).join("");
  presShowScreen("branch");
}

document.getElementById("branchGrid").addEventListener("click", e => {
  const tile = e.target.closest(".pres-tile");
  if (!tile) return;
  const b = allData[Number(tile.dataset.branchIdx)];
  if (b) presSelectBranch(b.branchName);
});

function presEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function presSelectBranch(name) {
  presState.branchName = name;
  if (!presState.months.size) presState.months = new Set([presCurrentMonth()]);
  presRenderMonthChips();
  presShowScreen("month");
}

/* ═══════════════ SCREEN 2 — MONTH PICKER ═══════════════ */

/* Map short keys (used internally) → full display names */
const MONTH_FULL = {
  Jan:"January", Feb:"February", Mar:"March",    Apr:"April",
  May:"May",     Jun:"June",     Jul:"July",      Aug:"August",
  Sep:"September", Oct:"October", Nov:"November", Dec:"December"
};
function presFullMonth(m) { return MONTH_FULL[m] || m; }

/* Build a human-readable period label using full month names */
function presPeriodLabel(months) {
  if (!months || !months.length) return "";
  if (months.length === 1) return presFullMonth(months[0]);
  // contiguous range → "April – September"
  return presFullMonth(months[0]) + " – " + presFullMonth(months[months.length - 1]);
}
/* YTD label: "April – September (YTD)" */
function presYtdLabel(lastMonth) {
  return "April – " + presFullMonth(lastMonth) + " (YTD)";
}

function presCurrentMonth() {
  const m = new Date().toLocaleString('en-US', { month: 'short' });
  return MONTHS.includes(m) ? m : MONTHS[MONTHS.length - 1];
}
function presCurrentOrDefaultMonths() {
  return presState.months.size ? [...presState.months] : [presCurrentMonth()];
}
function presRenderMonthChips() {
  document.getElementById("monthTitle").textContent = "Select Month — " + presState.branchName;
  const row = document.getElementById("monthChips");
  /* Show full month name on each chip */
  row.innerHTML = MONTHS.map(m =>
    `<span class="pres-chip ${presState.months.has(m)?"on":""}" onclick="presToggleMonth('${m}')">${presFullMonth(m)}</span>`
  ).join("");
}
function presToggleMonth(m) {
  if (presState.months.has(m)) { if (presState.months.size > 1) presState.months.delete(m); }
  else presState.months.add(m);
  presRenderMonthChips();
}
function presQuickRange(kind) {
  const cur = presCurrentMonth();
  const idx = MONTHS.indexOf(cur);
  presState.months = kind === "ytd" ? new Set(MONTHS.slice(0, idx + 1)) : new Set([cur]);
  presRenderMonthChips();
}

/* ═══════════════ PRODUCT CARD HTML — DUAL COLUMN ═══════════════
   Renders one product card that shows BOTH periods side by side.
   Left col = selected period  |  Right col = YTD
   ══════════════════════════════════════════════════════════════ */
function presDualProdCardHTML(k, ach, tgt, achYtd, tgtYtd, outstanding, due, inflow, periodLabel, ytdLabel) {
  const pct    = tgt    > 0 ? Math.round(ach    / tgt    * 100) : 100;
  const pctYtd = tgtYtd > 0 ? Math.round(achYtd / tgtYtd * 100) : 100;
  const gap    = ach    - tgt;
  const gapYtd = achYtd - tgtYtd;
  const color  = PROD_COLOR[k] || "#2d6bff";

  /* Outstanding + Due share ONE row — Due sits in the right half of the same strip */
  const outDueRow = (outstanding || due)
    ? `<div class="pp-extra-row">
        ${outstanding ? `<span class="pp-extra pp-extra-half">📦 Outstanding: <b>${fmtFull(outstanding.amount,k)}</b>${outstanding.count?` <span class="pp-extra-n">(${outstanding.count} a/c)</span>`:""}</span>` : `<span></span>`}
        ${due         ? `<span class="pp-extra pp-due pp-extra-half">⏰ Due: <b>${fmtFull(due.amount,k)}</b>${due.count?` <span class="pp-extra-n">(${due.count} a/c)</span>`:""}</span>` : ""}
       </div>`
    : "";
  /* Inflow YTD — full-width row below */
  const inflowRow = (k === "RD" && inflow)
    ? `<div class="pp-extra pp-inflow">💰 Inflow YTD: <b>${fmtFull(inflow.amount,k)}</b>${inflow.count?` <span class="pp-extra-n">(${inflow.count} a/c)</span>`:""}</div>`
    : "";

  return `<div class="pres-prod-card dual-card">
    <div class="pp-head">
      <span class="pp-dot" style="background:${color}"></span>
      <span class="pp-label">${PLABEL[k]||k}</span>
    </div>

    <div class="dual-cols">
      <!-- ── LEFT: Selected Period ── -->
      <div class="dual-col">
        <div class="dual-col-badge" style="border-color:${color}40;background:${color}12">
          <span class="dual-col-label">${presEsc(periodLabel)}</span>
          <span class="pp-pct-badge ${presPctClass(pct)}">${pct}%</span>
        </div>
        <div class="pp-track"><div class="pp-fill" style="width:${Math.min(pct,100)}%;background:${color}"></div></div>
        <div class="dual-fig-row">
          <div class="dual-fig">
            <span class="dual-fig-lbl">Achievement</span>
            <b class="dual-fig-val">${fmtFull(ach,k)}</b>
          </div>
          <div class="dual-fig">
            <span class="dual-fig-lbl">Target</span>
            <b class="dual-fig-val muted">${fmtFull(tgt,k)}</b>
          </div>
        </div>
        <div class="pp-gap ${gap<0?'short':'excess'}">${gap<0?'▼ Short':'▲ Excess'} <b>${gap>=0?'+':''}${fmtFull(gap,k)}</b></div>
      </div>

      <div class="dual-divider"></div>

      <!-- ── RIGHT: YTD ── -->
      <div class="dual-col">
        <div class="dual-col-badge" style="border-color:#a78bfa50;background:rgba(167,139,250,.08)">
          <span class="dual-col-label ytd-lbl">${presEsc(ytdLabel)}</span>
          <span class="pp-pct-badge ${presPctClass(pctYtd)}">${pctYtd}%</span>
        </div>
        <div class="pp-track"><div class="pp-fill" style="width:${Math.min(pctYtd,100)}%;background:#7c3aed"></div></div>
        <div class="dual-fig-row">
          <div class="dual-fig">
            <span class="dual-fig-lbl">Achievement</span>
            <b class="dual-fig-val">${fmtFull(achYtd,k)}</b>
          </div>
          <div class="dual-fig">
            <span class="dual-fig-lbl">Target</span>
            <b class="dual-fig-val muted">${fmtFull(tgtYtd,k)}</b>
          </div>
        </div>
        <div class="pp-gap ${gapYtd<0?'short':'excess'}">${gapYtd<0?'▼ Short':'▲ Excess'} <b>${gapYtd>=0?'+':''}${fmtFull(gapYtd,k)}</b></div>
      </div>
    </div>

    ${outDueRow}${inflowRow}
  </div>`;
}

/* ═══════════════ SCREEN 3 — BRANCH DASHBOARD ═══════════════ */
function presShowDashboard() {
  const b = allData.find(x => x.branchName === presState.branchName);
  if (!b) return;

  const months    = [...presState.months].sort((a,b2)=>MONTHS.indexOf(a)-MONTHS.indexOf(b2));
  const lastMonth = months[months.length - 1];
  const ytdMonths = MONTHS.slice(0, MONTHS.indexOf(lastMonth) + 1);

  const agg    = presAggregateBranch(b, months);
  const aggYtd = presAggregateBranch(b, ytdMonths);
  const extra    = presAggregateExtra(agg.staff);
  const extraYtd = presAggregateExtra(aggYtd.staff);

  const periodLabel = presPeriodLabel(months);
  const ytdLabel    = presYtdLabel(lastMonth);

  presState.dash = { agg, aggYtd, extra, extraYtd, lastMonth, months, periodLabel, ytdLabel };

  document.getElementById("dashTitle").textContent = "🏢 " + b.branchName + " — " + periodLabel;

  // Remove old toggle (not needed anymore)
  document.getElementById("branchModeToggle").innerHTML = "";

  presRenderProductGrid();

  // Staff strip
  document.getElementById("dashStaffGrid").innerHTML = agg.staff.map((s, i) => {
    const spct    = presStaffOverallPct(s, months);
    const spctYtd = presStaffOverallPct(s, ytdMonths);
    return `<div class="pres-staff-chip" data-staff-idx="${i}">
      <span class="c-ring" style="background:${presPctBg(spct)}">${spct}%</span>
      <span class="c-name">${presEsc(s.name)}</span>
      <span class="c-ytd-badge" style="color:${presPctColor(spctYtd)}">YTD ${spctYtd}%</span>
    </div>`;
  }).join("");

  presState.currentStaffList = agg.staff;
  presState.staffName = null;
  presShowScreen("dash");
}

function presRenderProductGrid() {
  const d = presState.dash;
  if (!d) return;
  const { agg, aggYtd, extra, extraYtd, periodLabel, ytdLabel } = d;

  /* Legend pills go into the top strip */
  const pillsEl = document.getElementById("dashLegendPills");
  if (pillsEl) pillsEl.innerHTML = `
    <span class="dual-legend-pill period-pill">📅 ${presEsc(periodLabel)}</span>
    <span class="dual-legend-pill ytd-pill">📈 ${presEsc(ytdLabel)}</span>`;

  document.getElementById("dashProducts").innerHTML = `
    <div class="pres-prod-grid">
    ${Object.keys(agg.totals).map(k => {
      const t    = agg.totals[k];
      const tYtd = aggYtd.totals[k] || { ach: 0, tgt: 0 };
      const out  = extra.outstanding[k]    || null;
      const due  = (k === "RD" && extra.rdDueAmount) ? { amount: extra.rdDueAmount, count: extra.rdDueCount } : null;
      return presDualProdCardHTML(k, t.ach, t.tgt, tYtd.ach, tYtd.tgt, out, due, null, periodLabel, ytdLabel);
    }).join("")}
    </div>`;
}

document.getElementById("dashStaffGrid").addEventListener("click", e => {
  const tile = e.target.closest(".pres-staff-chip");
  if (!tile) return;
  const list = presState.currentStaffList || [];
  const s = list[Number(tile.dataset.staffIdx)];
  if (s) presSelectStaff(s.name);
});

/* ═══════════════ SCREEN 4 — STAFF DETAIL ═══════════════ */
function presSelectStaff(name) {
  presState.staffName = name;
  presRenderStaffCards();
  presShowScreen("staff");
}

function presRenderStaffCards() {
  const b = allData.find(x => x.branchName === presState.branchName);
  const s = (b.staff || []).find(x => x.name === presState.staffName);
  if (!s) return;

  const periodMonths = [...presState.months].sort((a,b2)=>MONTHS.indexOf(a)-MONTHS.indexOf(b2));
  const lastMonth    = periodMonths[periodMonths.length - 1];
  const ytdMonths    = MONTHS.slice(0, MONTHS.indexOf(lastMonth) + 1);
  const periodLabel  = presPeriodLabel(periodMonths);
  const ytdLabel     = presYtdLabel(lastMonth);

  const svc = presServiceStr(s.doj);
  document.getElementById("staffAvatar").textContent = initials(s.name);
  document.getElementById("staffName").textContent   = s.name;
  document.getElementById("staffSub").textContent    =
    presState.branchName + " · " + periodLabel + " & " + ytdLabel + (svc ? " · " + svc : "");

  // Remove toggle — no longer needed
  document.getElementById("staffModeToggle").innerHTML = "";

  /* Inject period legend pills into the staffhead pill row */
  const staffPillsEl = document.getElementById("staffLegendPills");
  if (staffPillsEl) staffPillsEl.innerHTML = `
    <span class="dual-legend-pill period-pill">📅 ${presEsc(periodLabel)}</span>
    <span class="dual-legend-pill ytd-pill">📈 ${presEsc(ytdLabel)}</span>`;

  document.getElementById("staffCards").innerHTML = `
    <div class="pres-prod-grid">
    ${Object.keys(s.metrics).map(k => {
      const metric    = s.metrics[k];
      const rPeriod   = calc(metric, periodMonths, s.doj);
      const rYtd      = calc(metric, ytdMonths,    s.doj);
      const out = (OUT_CFG[k] && metric.outstanding) ? { amount: metric.outstanding, count: metric.outstandingCount } : null;
      const due = (k === "RD" && metric.dueAmount)   ? { amount: metric.dueAmount,   count: metric.dueCount }         : null;
      return presDualProdCardHTML(k, rPeriod.ach, rPeriod.tgt, rYtd.ach, rYtd.tgt, out, due, null, periodLabel, ytdLabel);
    }).join("") || `<div class="pres-empty">No product data for this staff member.</div>`}
    </div>`;

  presRenderStaffSwitchStrip(b);
}

function presRenderStaffSwitchStrip(b) {
  const list = (presState.currentStaffList && presState.currentStaffList.length)
    ? presState.currentStaffList
    : (b.staff || []).filter(x => x.name.toUpperCase() !== "TOTAL");
  document.getElementById("staffSwitchStrip").innerHTML = list.map(st =>
    `<span class="pres-staffswitch-chip ${st.name === presState.staffName ? "on" : ""}" data-switch-name="${presEsc(st.name)}">${presEsc(st.name)}</span>`
  ).join("");
}

document.getElementById("staffModeToggle").addEventListener("click", e => {
  /* retained for HTML compatibility — no-op in v2 */
});
document.getElementById("staffSwitchStrip").addEventListener("click", e => {
  const chip = e.target.closest("[data-switch-name]");
  if (chip && chip.dataset.switchName !== presState.staffName) presSelectStaff(chip.dataset.switchName);
});

/* ═══════════════ AGGREGATION ═══════════════ */
function presAggregateBranch(b, months) {
  const staff = (b.staff || []).filter(s => s.name.toUpperCase() !== "TOTAL");
  const totals = {};
  staff.forEach(s => {
    for (const k in s.metrics) {
      if (!totals[k]) totals[k] = { tgt: 0, ach: 0 };
      const metric = s.metrics[k];
      months.forEach(m => totals[k].ach += (metric.monthlyAchievement[m] || 0));
      if (k !== "BusinessLoan") totals[k].tgt += (metric.monthlyTarget || 0) * getEffectiveMonths(s.doj, months).length;
    }
  });
  if (totals["BusinessLoan"]) {
    const blMonthly = b.blBranchMonthlyTarget || 0;
    const blAnnual  = b.blBranchTotalTarget   || 0;
    totals["BusinessLoan"].tgt = blAnnual > 0 ? blAnnual : (blMonthly * months.length);
  }
  if (totals["GoldLoan"] && b.glBranchMonthlyTarget) {
    totals["GoldLoan"].tgt = b.glBranchMonthlyTarget * months.length;
  }

  let onTgt = 0;
  staff.forEach(s => {
    let sa = 0, st = 0;
    for (const k in s.metrics) {
      if (k === "BusinessLoan") continue;
      const metric = s.metrics[k];
      months.forEach(m => sa += (metric.monthlyAchievement[m] || 0));
      st += (metric.monthlyTarget || 0) * getEffectiveMonths(s.doj, months).length;
    }
    if (st > 0 && sa >= st) onTgt++;
  });

  let belowProd = 0;
  for (const k in totals) {
    const p = totals[k].tgt > 0 ? Math.round(totals[k].ach / totals[k].tgt * 100) : 100;
    if (p < 100) belowProd++;
  }
  return { totals, staff, staffCount: staff.length, onTgt, belowProd };
}

function presOverallPct(agg) {
  let ach = 0, tgt = 0;
  for (const k in agg.totals) { ach += agg.totals[k].ach; tgt += agg.totals[k].tgt; }
  return tgt > 0 ? Math.round(ach / tgt * 100) : 100;
}

function presStaffOverallPct(s, months) {
  let ach = 0, tgt = 0;
  for (const k in s.metrics) {
    if (k === "BusinessLoan") continue;
    const metric = s.metrics[k];
    months.forEach(m => ach += (metric.monthlyAchievement[m] || 0));
    tgt += (metric.monthlyTarget || 0) * getEffectiveMonths(s.doj, months).length;
  }
  return tgt > 0 ? Math.round(ach / tgt * 100) : 100;
}

function presAggregateExtra(staffList) {
  const outstanding = {};
  let rdDueAmount = 0, rdDueCount = 0;
  staffList.forEach(s => {
    for (const k in s.metrics) {
      const m = s.metrics[k];
      if (OUT_CFG[k] && m.outstanding) {
        if (!outstanding[k]) outstanding[k] = { amount: 0, count: 0 };
        outstanding[k].amount += m.outstanding  || 0;
        outstanding[k].count  += m.outstandingCount || 0;
      }
    }
    const rd = s.metrics["RD"];
    if (rd && rd.dueAmount) { rdDueAmount += rd.dueAmount; rdDueCount += rd.dueCount || 0; }
  });
  return { outstanding, rdDueAmount, rdDueCount };
}

function presServiceStr(dojStr) {
  const d = parseDOJDate(dojStr);
  if (!d) return null;
  const now = new Date();
  let months = (now.getFullYear()-d.getFullYear())*12+(now.getMonth()-d.getMonth());
  if (now.getDate() < d.getDate()) months--;
  if (months < 0) months = 0;
  const yrs = Math.floor(months/12), mos = months%12;
  if (yrs === 0) return mos+(mos===1?" mo":" mos");
  if (mos === 0) return yrs+(yrs===1?" yr":" yrs");
  return yrs+(yrs===1?" yr ":" yrs ")+mos+(mos===1?" mo":" mos");
}

/* Light-theme: % badge uses CSS classes (pct-green / pct-amber / pct-red) */
function presPctClass(p){ return p>=100?"pct-green":p>=75?"pct-amber":"pct-red"; }
/* Ring bg colours stay solid — these are white-text circles so keep them dark */
function presPctBg(p)   { return p>=100?"#15803d":p>=75?"#b45309":"#b91c1c"; }
/* Legacy inline-colour helper — not used in v3 but kept for safety */
function presPctColor(p){ return p>=100?"#15803d":p>=75?"#b45309":"#b91c1c"; }

/* ══════════════════════════════════════════════════════════
   RD INFLOW YTD — SML, fetched live from Google Sheets CSV
   CSV columns: Sl_No, Date, Instalment, Staff_Name, Emp_Code, Company, Branch
   Inflow = sum of Instalment. Stored per month (Apr, May, …) so
   YTD = Apr → last selected month.
   Staff: Emp_Code → roster name, else Staff_Name (SML check).
   Branch: Branch column, fallback = sum of the branch's staff.
   ══════════════════════════════════════════════════════════ */

const INFLOW_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTxcZ5BVpz-jvCQze4msaEqv1uSUTS-Z-mulCPYUU9xvh0_8R4aDoMmOIMclJQbIeeVWAtA9qkyJ8Vv/pub?gid=862887839&single=true&output=csv";

/* presInflowMap populated once on load; null means still loading */
let presInflowMap = null;
let presInflowLoading = false;

function presNorm(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function presCsvLine(line) {
  const cols = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { cols.push(cur); cur = ""; }
    else cur += ch;
  }
  cols.push(cur);
  return cols;
}

/* dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd, dd-Mon-yyyy → Date | null */
function presParseInflowDate(str) {
  str = (str || "").trim();
  if (!str) return null;
  let m;
  if ((m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/))) return new Date(+m[1], +m[2]-1, +m[3]);
  if ((m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/))) return new Date(+(m[3].length===2?"20"+m[3]:m[3]), +m[2]-1, +m[1]);
  const d = new Date(str.replace(/-/g, " "));
  return isNaN(d.getTime()) ? null : d;
}

async function presParseInflowCSV(text) {
  const staff = {}, branch = {};          // key → { Apr: amt, … }
  const rows = text.split(/\r?\n/);
  if (rows.length < 2) return { staff, branch };

  const h = presCsvLine(rows[0]).map(x => x.replace(/"/g, "").trim());
  const iDate = h.indexOf("Date"), iInst = h.indexOf("Instalment"), iName = h.indexOf("Staff_Name"),
        iCode = h.indexOf("Emp_Code"), iComp = h.indexOf("Company"), iBr = h.indexOf("Branch");
  if (iInst === -1 || iName === -1) return { staff, branch };

  let roster = window.__empRoster;
  if (!roster || !Object.keys(roster).length) { try { roster = await fetchEmployeeRoster(); } catch (e) { roster = {}; } }

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].trim()) continue;
    const c = presCsvLine(rows[i]);
    const comp = (c[iComp] || "").trim();
    const code = iCode !== -1 ? (c[iCode] || "").trim() : "";
    let name = "";
    if (/^8\d{2,}$/.test(code)) {
      const hit = roster[String(parseInt(code, 10))];
      if (hit && hit.name) name = hit.name.trim();
    }
    if (!name) {
      const raw = (c[iName] || "").trim();
      if (!raw) continue;
      if (!isSMLCompany(comp) && !isKnownSMLStaffName(raw)) continue;
      name = raw;
    }
    const amt = parseFloat((c[iInst] || "").replace(/[,"₹\s]/g, "")) || 0;
    if (!amt) continue;

    const d = iDate !== -1 ? presParseInflowDate(c[iDate]) : null;
    if (!d || d < FY_TARGET_START) continue;               // current FY only (from 01-Apr)
    const mk = d.toLocaleString("en-US", { month: "short" });
    if (!MONTHS.includes(mk)) continue;

    const sk = presNorm(name);
    (staff[sk] = staff[sk] || {})[mk] = (staff[sk][mk] || 0) + amt;
    const bk = presNorm(iBr !== -1 ? c[iBr] : "");
    if (bk) (branch[bk] = branch[bk] || {})[mk] = (branch[bk][mk] || 0) + amt;
  }
  return { staff, branch };
}

function presFetchInflow(callback) {
  if (presInflowMap) { callback(presInflowMap); return; }
  if (presInflowLoading) {
    const iv = setInterval(() => {
      if (presInflowMap) { clearInterval(iv); callback(presInflowMap); }
    }, 200);
    return;
  }
  presInflowLoading = true;
  fetch(INFLOW_CSV_URL)
    .then(r => r.text())
    .then(presParseInflowCSV)
    .then(map => { presInflowMap = map; presInflowLoading = false; callback(map); })
    .catch(e => {
      console.error("Inflow CSV error:", e);
      presInflowMap = { staff: {}, branch: {} };
      presInflowLoading = false;
      callback(presInflowMap);
    });
}

function presSumInflow(obj, months) {
  return obj ? months.reduce((t, m) => t + (obj[m] || 0), 0) : 0;
}

/* One staff member, YTD (ytdMonths = Apr → last selected month) */
function presGetStaffInflow(staffObj, branchName, inflowMap, ytdMonths) {
  if (!inflowMap) return null;
  const amount = presSumInflow(inflowMap.staff[presNorm(staffObj.name)], ytdMonths);
  return amount > 0 ? { amount, count: 0 } : null;
}

/* Branch, YTD — Branch column, fallback to sum of staff */
function presGetBranchInflow(staffList, branchName, inflowMap, ytdMonths) {
  if (!inflowMap) return null;
  let amount = presSumInflow(inflowMap.branch[presNorm(branchName)], ytdMonths);
  if (!amount) amount = staffList.reduce((t, s) => {
    const inf = presGetStaffInflow(s, branchName, inflowMap, ytdMonths);
    return t + (inf ? inf.amount : 0);
  }, 0);
  return amount > 0 ? { amount, count: 0 } : null;
}

/* ── Hook inflow into product grid render ──
   We patch presRenderProductGrid and presRenderStaffCards
   to fetch inflow first, then render with it. */

const _origRenderProductGrid = presRenderProductGrid;
presRenderProductGrid = function() {
  presFetchInflow(inflowMap => {
    const d = presState.dash;
    if (!d) return;
    const { agg, aggYtd, extra, extraYtd, periodLabel, ytdLabel } = d;
    const b = allData.find(x => x.branchName === presState.branchName);

    /* Legend pills */
    const pillsEl = document.getElementById("dashLegendPills");
    if (pillsEl) pillsEl.innerHTML = `
      <span class="dual-legend-pill period-pill">📅 ${presEsc(periodLabel)}</span>
      <span class="dual-legend-pill ytd-pill">📈 ${presEsc(ytdLabel)}</span>`;

    document.getElementById("dashProducts").innerHTML = `
      <div class="pres-prod-grid">
      ${Object.keys(agg.totals).map(k => {
        const t    = agg.totals[k];
        const tYtd = aggYtd.totals[k] || { ach: 0, tgt: 0 };
        const out  = extra.outstanding[k] || null;
        const due  = (k === "RD" && extra.rdDueAmount) ? { amount: extra.rdDueAmount, count: extra.rdDueCount } : null;
        /* RD Inflow YTD — branch aggregate */
        const inflow = (k === "RD") ? presGetBranchInflow(agg.staff, presState.branchName, inflowMap, MONTHS.slice(0, MONTHS.indexOf(d.lastMonth) + 1)) : null;
        return presDualProdCardHTML(k, t.ach, t.tgt, tYtd.ach, tYtd.tgt, out, due, inflow, periodLabel, ytdLabel);
      }).join("")}
      </div>`;
  });
};

const _origRenderStaffCards = presRenderStaffCards;
presRenderStaffCards = function() {
  /* Call original first to render immediately, then patch inflow in */
  _origRenderStaffCards();
  presFetchInflow(inflowMap => {
    const b = allData.find(x => x.branchName === presState.branchName);
    const s = (b && b.staff || []).find(x => x.name === presState.staffName);
    if (!s) return;

    const periodMonths = [...presState.months].sort((a,b2) => MONTHS.indexOf(a)-MONTHS.indexOf(b2));
    const lastMonth    = periodMonths[periodMonths.length - 1];
    const ytdMonths    = MONTHS.slice(0, MONTHS.indexOf(lastMonth) + 1);
    const periodLabel  = presPeriodLabel(periodMonths);
    const ytdLabel     = presYtdLabel(lastMonth);

    const staffInflow = presGetStaffInflow(s, presState.branchName, inflowMap, ytdMonths);

    document.getElementById("staffCards").innerHTML = `
      <div class="pres-prod-grid">
      ${Object.keys(s.metrics).map(k => {
        const metric  = s.metrics[k];
        const rPeriod = calc(metric, periodMonths, s.doj);
        const rYtd    = calc(metric, ytdMonths,    s.doj);
        const out = (OUT_CFG[k] && metric.outstanding) ? { amount: metric.outstanding, count: metric.outstandingCount } : null;
        const due = (k === "RD" && metric.dueAmount)   ? { amount: metric.dueAmount,   count: metric.dueCount }         : null;
        /* RD Inflow YTD — per staff */
        const inflow = (k === "RD") ? staffInflow : null;
        return presDualProdCardHTML(k, rPeriod.ach, rPeriod.tgt, rYtd.ach, rYtd.tgt, out, due, inflow, periodLabel, ytdLabel);
      }).join("") || `<div class="pres-empty">No product data.</div>`}
      </div>`;

    /* Re-render switcher strip too */
    presRenderStaffSwitchStrip(b);
  });
};
