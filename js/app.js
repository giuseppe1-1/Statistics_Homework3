"use strict";
/* ===== User interface, charts and tables ===== */
const $ = id => document.getElementById(id);
const tick = () => new Promise(r => setTimeout(r, 0));
const COL = { B: "#4aa8ee", R: "#ffa94d", exact: "#dbe7f1", cheb: "#ff6b81", hoef: "#b794f6", clt: "#52c98f", vS: "#ff7ab6", vA: "#52c98f", vN: "#ffd166" };
const NAME = { B: "Bernoulli", R: "Rademacher" };
let SIM = null, running = false;

/* ---------- number formatting ---------- */
const fmtN = v => Math.round(v).toLocaleString("en-US");
function fmtP(x) { return x === 0 ? "0" : x >= 0.1 ? x.toFixed(3) : x >= 1e-3 ? x.toFixed(4) : x.toExponential(1); }
function fmtV(x) { const a = Math.abs(x); return a === 0 ? "0" : (a >= 1e5 || a < 1e-3) ? x.toExponential(3) : (+x.toPrecision(4)).toString(); }
const fmt3 = x => (+x.toFixed(3)).toString();

/* ---------- generic SVG chart (lines, markers, log axes) ---------- */
function linTicks(lo, hi, n) {
  const step0 = (hi - lo) / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9 * step; i++) out.push(+(i * step).toPrecision(12));
  return out;
}
function tickLabel(v) { if (v === 0) return "0"; const a = Math.abs(v); return (a >= 1e5 || a < 1e-3) ? v.toExponential(0).replace("e+", "e") : String(+v.toPrecision(3)); }
const decade = e => `10<tspan dy="-5" font-size="9">${e}</tspan>`;
let uid = 0;

function chart(svg, o) {
  const W = o.W || 520, H = o.H || 300, l = o.l || 56, r = 24, b = o.xlabel ? 50 : 32;
  const named = o.series.filter(s => s.name), per = o.perRow || 2, rows = o.legend === false ? 0 : Math.ceil(named.length / per);
  const t = 12 + 19 * rows;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const fx = v => o.xlog ? Math.log10(v) : v, fy = v => o.ylog ? Math.log10(v) : v;
  const x0 = fx(o.xmin), x1 = fx(o.xmax), y0 = fy(o.ymin), y1 = fy(o.ymax);
  const px = v => l + (W - l - r) * (fx(v) - x0) / (x1 - x0), py = v => H - b - (H - b - t) * (fy(v) - y0) / (y1 - y0);
  const id = "cl" + (++uid);
  let s = `<clipPath id="${id}"><rect x="${l}" y="${t}" width="${W - l - r}" height="${H - b - t}"/></clipPath>`;
  // ticks
  const xt = o.xticks ? o.xticks.map(v => ({ v, lab: fmtN(v) })) : o.xlog
    ? Array.from({ length: Math.floor(x1) - Math.ceil(x0) + 1 }, (_, i) => Math.ceil(x0) + i).map(e => ({ v: Math.pow(10, e), lab: decade(e) }))
    : linTicks(o.xmin, o.xmax, 6).map(v => ({ v, lab: tickLabel(v) }));
  const yt = o.ylog
    ? Array.from({ length: Math.floor(y1) - Math.ceil(y0) + 1 }, (_, i) => Math.ceil(y0) + i).map(e => ({ v: Math.pow(10, e), lab: decade(e) }))
    : linTicks(o.ymin, o.ymax, 5).map(v => ({ v, lab: tickLabel(v) }));
  yt.forEach(k => { const y = py(k.v); s += `<line class="gr" x1="${l}" x2="${W - r}" y1="${y}" y2="${y}"/><text class="tx" x="${l - 6}" y="${y + 3.5}" font-size="12.5" text-anchor="end">${k.lab}</text>`; });
  xt.forEach(k => { const x = px(k.v); s += `<line class="gr" x1="${x}" x2="${x}" y1="${t}" y2="${H - b}" stroke-opacity=".5"/><text class="tx" x="${x}" y="${H - b + 18}" font-size="12.5" text-anchor="middle">${k.lab}</text>`; });
  s += `<line class="ax" x1="${l}" y1="${t}" x2="${l}" y2="${H - b}"/><line class="ax" x1="${l}" y1="${H - b}" x2="${W - r}" y2="${H - b}"/>`;
  if (o.xlabel) s += `<text class="tx2" x="${(l + W - r) / 2}" y="${H - 7}" font-size="13.5" text-anchor="middle">${o.xlabel}</text>`;
  if (o.ylabel) s += `<text class="tx2" x="13" y="${(t + H - b) / 2}" font-size="13.5" text-anchor="middle" transform="rotate(-90 13 ${(t + H - b) / 2})">${o.ylabel}</text>`;
  // series
  s += `<g clip-path="url(#${id})">`;
  (o.hlines || []).forEach(h => { const y = py(h.y); s += `<line x1="${l}" x2="${W - r}" y1="${y}" y2="${y}" stroke="${h.color}" stroke-width="1.4" ${h.dash ? `stroke-dasharray="${h.dash}"` : ""}/>`; });
  o.series.forEach(se => {
    const dash = se.dash ? `stroke-dasharray="${se.dash}"` : "";
    let run = [];
    const flush = () => { if (run.length > 1) s += `<polyline fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" stroke-opacity="${se.opacity || 1}" ${dash} stroke-linejoin="round" points="${run.join(" ")}"/>`; run = []; };
    se.pts.forEach(p => { if (p === null || (o.ylog && p[1] < o.ymin)) { flush(); return; } run.push(px(p[0]).toFixed(1) + "," + py(p[1]).toFixed(1)); });
    flush();
    if (se.marker) se.pts.forEach(p => { if (!p || (o.ylog && p[1] < o.ymin)) return; s += p[2] === "zero" ? `<circle cx="${px(p[0])}" cy="${py(p[1])}" r="4" fill="none" stroke="${se.color}" stroke-width="1.8"/>` : `<circle cx="${px(p[0])}" cy="${py(p[1])}" r="3.6" fill="${se.color}"/>`; });
  });
  s += `</g>`;
  // legend
  const cw = (W - l - r) / per;
  named.forEach((se, k) => {
    const lx = l + 4 + (k % per) * cw, ly = 15 + Math.floor(k / per) * 19;
    s += `<line x1="${lx}" x2="${lx + 16}" y1="${ly - 4}" y2="${ly - 4}" stroke="${se.color}" stroke-width="2.4" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""}/>${se.marker ? `<circle cx="${lx + 8}" cy="${ly - 4}" r="3.4" fill="${se.color}"/>` : ""}<text class="tx2" x="${lx + 21}" y="${ly}" font-size="12.5">${se.name}</text>`;
  });
  svg.innerHTML = s;
}

/* ---------- histogram with theoretical normal density ---------- */
function histChart(svg, o) {
  const W = o.W || 520, H = o.H || 280, l = 54, r = 12, t = 30, b = 38, small = W < 400, fs = small ? 11.5 : 12.5;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  let xa = Math.min(...o.bars.map(q => q.x0)), xb = Math.max(...o.bars.map(q => q.x1));
  const pad = (xb - xa) * 0.06 || 1; xa -= pad; xb += pad;
  const curve = []; for (let i = 0; i <= 160; i++) { const x = xa + (xb - xa) * i / 160; curve.push([x, o.pdf(x)]); }
  const ymax = Math.max(...o.bars.map(q => q.d), ...curve.map(c => c[1])) * 1.12;
  const px = v => l + (W - l - r) * (v - xa) / (xb - xa), py = v => H - b - (H - b - t) * v / ymax;
  let s = "";
  linTicks(0, ymax, 4).forEach(v => { s += `<line class="gr" x1="${l}" x2="${W - r}" y1="${py(v)}" y2="${py(v)}"/><text class="tx" x="${l - 5}" y="${py(v) + 3.5}" font-size="${fs}" text-anchor="end">${tickLabel(v)}</text>`; });
  linTicks(xa, xb, small ? 4 : 6).forEach(v => { s += `<text class="tx" x="${px(v)}" y="${H - b + 17}" font-size="${fs}" text-anchor="middle">${tickLabel(v)}</text><line class="ax" x1="${px(v)}" x2="${px(v)}" y1="${H - b}" y2="${H - b + 3}"/>`; });
  o.bars.forEach(q => { s += `<rect class="bar bar${o.model}" x="${px(q.x0) + 0.4}" y="${py(q.d)}" width="${Math.max(px(q.x1) - px(q.x0) - 0.8, 0.5)}" height="${H - b - py(q.d)}"/>`; });
  s += `<polyline fill="none" stroke="#ff6b81" stroke-width="2" points="${curve.map(c => px(c[0]).toFixed(1) + "," + py(c[1]).toFixed(1)).join(" ")}"/>`;
  s += `<line class="ax" x1="${l}" y1="${t}" x2="${l}" y2="${H - b}"/><line class="ax" x1="${l}" y1="${H - b}" x2="${W - r}" y2="${H - b}"/>`;
  s += `<text class="tx2" x="${l}" y="18" font-size="${small ? 13 : 14}" font-weight="700">${o.title}</text>`;
  if (o.sub) s += `<text class="tx" x="${W - r}" y="18" font-size="${fs}" text-anchor="end">${o.sub}</text>`;
  if (o.xlabel) s += `<text class="tx" x="${(l + W - r) / 2}" y="${H - 5}" font-size="11" text-anchor="middle">${o.xlabel}</text>`;
  svg.innerHTML = s;
}

/* ---------- running the simulation ---------- */
function parseNs(str) {
  const v = str.split(/[,;\s]+/).map(Number).filter(x => Number.isInteger(x) && x >= 1 && x <= 100000);
  return [...new Set(v)].sort((a, b) => a - b).slice(0, 8);
}
async function run() {
  if (running) return;
  const msg = $("runMsg"), bad = t => { msg.innerHTML = `<span class="bad">${t}</span>`; };
  const p = +$("pIn").value, m = Math.round(+$("mIn").value), eps = +$("epsIn").value, nTr = Math.round(+$("trIn").value), seed = Math.round(+$("seedIn").value) >>> 0;
  const ns = parseNs($("nIn").value);
  if (!(p > 0 && p < 1)) return bad("p must be strictly between 0 and 1.");
  if (!(m >= 100 && m <= 20000)) return bad("m must be between 100 and 20,000.");
  if (!(eps > 0 && eps < 1)) return bad("The tolerance must be between 0 and 1.");
  if (ns.length < 2) return bad("Give at least two different values of n (integers from 1 to 100,000).");
  if (!(nTr >= 1 && nTr <= 40)) return bad("Trajectories drawn must be between 1 and 40.");
  const nmax = ns[ns.length - 1];
  if (m * nmax > 2.5e8) return bad("m times the largest n is too large for the browser (limit 250 million steps): reduce m or n.");
  running = true; $("runBtn").disabled = true; msg.textContent = "Simulating...";
  const prog = $("prog"); prog.style.width = "0%";
  const lf = makeLogFact(nmax), st = {};
  const total = 2 * m; let done = 0;
  for (const [i, model] of ["B", "R"].entries()) {
    st[model] = makeState(model, p, m, ns, (seed + 1 + i * 104729) >>> 0, nTr);
    const chunk = Math.max(20, Math.floor(1.5e6 * (model === "R" ? 16 : 1) / nmax));
    for (let j = 0; j < m; j += chunk) {
      const to = Math.min(m, j + chunk);
      simulateAttackers(st[model], j, to);
      done += to - j; prog.style.width = (100 * done / total).toFixed(1) + "%";
      await tick();
    }
  }
  const an = { B: analyse(st.B, eps, lf), R: analyse(st.R, eps, lf) };
  SIM = { p, m, eps, ns, st, an, nTr };
  const keep = Math.min(+$("nSel").value || ns.length - 1, ns.length - 1);
  ["nSel", "nSel2"].forEach(id => { $(id).innerHTML = ns.map((n, k) => `<option value="${k}">${fmtN(n)}</option>`).join(""); $(id).value = String(keep); });
  renderTraj(); renderHist(); renderLLN(); renderVar(); renderCLT(); renderEffectM(); renderFindings();
  msg.textContent = `Done: ${fmtN(m)} attackers, n up to ${fmtN(nmax)}, p = ${p}, seed ${seed}.`;
  running = false; $("runBtn").disabled = false;
}

/* ---------- section 2: trajectories ---------- */
function gridLog(nmax) {
  const set = new Set();
  for (let i = 0; i < 320; i++) set.add(Math.max(1, Math.round(Math.pow(nmax, i / 319))));
  return [...set].sort((a, b) => a - b);
}
function gridLin(nmax) {
  const set = new Set([1]);
  for (let i = 1; i <= 400; i++) set.add(Math.max(1, Math.round(nmax * i / 400)));
  return [...set].sort((a, b) => a - b);
}
function renderTraj() {
  const { p, eps, ns, st } = SIM, nmax = ns[ns.length - 1], gl = gridLog(nmax), gn = gridLin(nmax);
  for (const model of ["B", "R"]) {
    const mu = modelMu(model, p), sg = Math.sqrt(modelVar(model, p)), paths = st[model].paths;
    const defs = [
      { id: "tr" + model + "1", lin: true, f: (s, k) => s, mean: k => k * mu, sd: k => sg * Math.sqrt(k), yl: "total score S_k" },
      { id: "tr" + model + "2", f: (s, k) => s / k, mean: k => mu, sd: k => sg / Math.sqrt(k), yl: "average score S_k / k", tube: true },
      { id: "tr" + model + "3", f: (s, k) => s / Math.sqrt(k), mean: k => mu * Math.sqrt(k), sd: k => sg, yl: "normalized score S_k / √k" }
    ];
    if (model === "B") defs.push({ id: "trB4", lin: true, f: (s, k) => s - k * mu, mean: k => 0, sd: k => sg * Math.sqrt(k), yl: "centred total S_k − kp" });
    defs.forEach(d => {
      const idx = d.lin ? gn : gl;
      const series = paths.map(pa => ({ color: COL[model], opacity: 0.55, width: 1.4, pts: idx.map(k => [k, d.f(pa[k], k)]) }));
      let lo = Infinity, hi = -Infinity;
      series.forEach(se => se.pts.forEach(q => { if (q[1] < lo) lo = q[1]; if (q[1] > hi) hi = q[1]; }));
      series.push({ color: "#dbe7f1", dash: "6 4", width: 1.6, pts: idx.map(k => [k, d.mean(k)]) });
      series.push({ color: "#ff6b81", dash: "3 4", width: 1.5, pts: idx.map(k => [k, d.mean(k) + 2 * d.sd(k)]) });
      series.push({ color: "#ff6b81", dash: "3 4", width: 1.5, pts: idx.map(k => [k, d.mean(k) - 2 * d.sd(k)]) });
      if (d.tube) { series.push({ color: "#52c98f", dash: "1 4", width: 2, pts: idx.map(k => [k, mu + eps]) }); series.push({ color: "#52c98f", dash: "1 4", width: 2, pts: idx.map(k => [k, mu - eps]) }); }
      lo = Math.min(lo, d.mean(1)); hi = Math.max(hi, d.mean(nmax));
      if (d.lin) { lo = Math.min(lo, d.mean(nmax) - 2 * d.sd(nmax)); hi = Math.max(hi, d.mean(nmax) + 2 * d.sd(nmax)); }
      const padY = (hi - lo) * 0.06 || 1;
      chart($(d.id), { H: 300, l: 66, series, xlog: !d.lin, xmin: d.lin ? 0 : 1, xmax: nmax, ymin: lo - padY, ymax: hi + padY, xlabel: "systems probed k" + (d.lin ? "" : " (log scale)"), ylabel: d.yl, legend: false });
    });
  }
}

/* ---------- section 3: histograms ---------- */
const QNAME = { S: "S_n", A: "S_n / n", N: "S_n / √n", Z: "Z_n = (S_n − np) / √(np(1−p))" };
function quantity(model, q, n) { // Y = a*S + b, with its theoretical mean and sd
  const { p } = SIM, mu = modelMu(model, p), sg = Math.sqrt(modelVar(model, p));
  let a, b = 0;
  if (q === "S") a = 1; else if (q === "A") a = 1 / n; else if (q === "N") a = 1 / Math.sqrt(n); else { a = 1 / (sg * Math.sqrt(n)); b = -n * mu * a; }
  return { a, b, mean: a * n * mu + b, sd: a * sg * Math.sqrt(n) };
}
function histOf(model, k, q, W, H, title, sub) {
  const { st, ns, m } = SIM, n = ns[k], Q = quantity(model, q, n);
  const bars = histLattice(st[model].S[k], model, n, 36).map(h => { const x0 = Q.a * h.lo + Q.b, x1 = Q.a * h.hi + Q.b; return { x0, x1, d: h.count / m / (x1 - x0) }; });
  const xlab = q === "Z" || (q === "N" && model === "R") ? "" : "";
  return { bars, Q, opts: { model, bars, pdf: x => phi((x - Q.mean) / Q.sd) / Q.sd, title: title || QNAME[q], sub, W, H, xlabel: xlab } };
}
function renderHist() {
  const { ns, an } = SIM, k = +$("nSel").value, n = ns[k];
  const panels = { B: ["S", "A", "N", "Z"], R: ["S", "A", "N"] };
  for (const model of ["B", "R"]) {
    const box = $("hist" + model); box.innerHTML = "";
    panels[model].forEach(q => {
      const fig = document.createElement("figure"); fig.innerHTML = `<svg width="100%"></svg>`; box.appendChild(fig);
      const h = histOf(model, k, q, 520, 280, QNAME[q].replace(/_n/g, "ₙ"), "n = " + fmtN(n));
      histChart(fig.firstChild, h.opts);
    });
  }
  // table
  const rows = [];
  for (const model of ["B", "R"]) {
    const a = an[model][k], mu = modelMu(model, SIM.p), s2 = modelVar(model, SIM.p);
    const L = [["S", "Sₙ", a.mS, n * mu, n * s2], ["A", "Sₙ/n", a.mA, mu, s2 / n], ["N", "Sₙ/√n", a.mN, mu * Math.sqrt(n), s2]];
    if (model === "B") L.push(["Z", "Zₙ", a.mZ, 0, 1]);
    L.forEach(r => rows.push(`<tr><td>${NAME[model]}</td><td>${r[1]}</td><td class="n">${fmtV(r[2].mean)}</td><td class="th">${fmtV(r[3])}</td><td class="n">${fmtV(r[2].variance)}</td><td class="th">${fmtV(r[4])}</td></tr>`));
  }
  $("histTab").innerHTML = `<tr><th>Model</th><th>Quantity (n = ${fmtN(n)})</th><th>Sample mean</th><th>Theory</th><th>Sample variance</th><th>Theory</th></tr>` + rows.join("");
}

/* ---------- section 4: LLN ---------- */
function renderLLN() {
  const { ns, an, m, eps } = SIM;
  const ymin = Math.pow(10, Math.floor(Math.log10(0.5 / m)));
  for (const model of ["B", "R"]) {
    const A = an[model], mk = f => ns.map((n, k) => [n, f(A[k])]);
    const emp = ns.map((n, k) => [n, A[k].tailEmp === 0 ? ymin * 1.0001 : A[k].tailEmp, A[k].tailEmp === 0 ? "zero" : ""]);
    chart($("lln" + model), {
      H: 320, l: 62, perRow: 2, xlog: true, ylog: true, xmin: ns[0] / 1.35, xmax: ns[ns.length - 1] * 1.35, ymin, ymax: 2, xticks: ns, xlabel: "number of systems n", ylabel: "probability",
      series: [
        { name: "Simulation (hollow: 0 seen)", color: COL[model], marker: true, width: 2.2, pts: emp },
        { name: "Exact", color: COL.exact, width: 1.6, pts: mk(a => a.tailExact) },
        { name: "Chebyshev bound", color: COL.cheb, dash: "6 4", pts: mk(a => a.cheb) },
        { name: "Hoeffding bound", color: COL.hoef, dash: "6 4", pts: mk(a => a.hoef) },
        { name: "Normal approx. (CLT)", color: COL.clt, dash: "2 3", width: 2.2, pts: mk(a => a.clt) }
      ]
    });
  }
  let h = `<tr><th rowspan="2">n</th><th colspan="5">Bernoulli: P(|Sₙ/n − p| &gt; ε)</th><th colspan="5">Rademacher: P(|Sₙ/n| &gt; ε)</th></tr><tr>` + `<th>Simulation</th><th>Exact</th><th>Chebyshev</th><th>Hoeffding</th><th>CLT</th>`.repeat(2) + `</tr>`;
  ns.forEach((n, k) => {
    h += `<tr><td class="m">${fmtN(n)}</td>` + ["B", "R"].map(md => { const a = an[md][k]; return [a.tailEmp, a.tailExact, a.cheb, a.hoef, a.clt].map((v, i) => `<td class="${i === 0 ? "n" : "th"}">${fmtP(v)}</td>`).join(""); }).join("") + `</tr>`;
  });
  $("llnTab").innerHTML = h + `<tr><td colspan="11" class="sub">ε = ${eps}, m = ${fmtN(m)} attackers. “Simulation” is the fraction of attackers whose average score is more than ε from its mean.</td></tr>`;
}

/* ---------- section 5: variances ---------- */
function renderVar() {
  const { ns, an, p } = SIM;
  for (const model of ["B", "R"]) {
    const A = an[model], s2 = modelVar(model, p), mk = f => ns.map((n, k) => [n, f(A[k], n)]);
    const all = [...A.map(a => a.mS.variance), ...A.map(a => a.mA.variance), ...A.map(a => a.mN.variance)];
    const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all)) - 0.15)), hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all)) + 0.15));
    chart($("var" + model), {
      H: 320, l: 62, perRow: 2, xlog: true, ylog: true, xmin: ns[0] / 1.35, xmax: ns[ns.length - 1] * 1.35, ymin: lo, ymax: hi, xticks: ns, xlabel: "number of systems n", ylabel: "variance",
      series: [
        { name: "Var Sₙ", color: COL.vS, marker: true, pts: mk(a => a.mS.variance) }, { name: "Var Sₙ/n", color: COL.vA, marker: true, pts: mk(a => a.mA.variance) }, { name: "Var Sₙ/√n", color: COL.vN, marker: true, pts: mk(a => a.mN.variance) },
        { color: COL.vS, dash: "6 4", width: 1.4, pts: mk((a, n) => n * s2) }, { color: COL.vA, dash: "6 4", width: 1.4, pts: mk((a, n) => s2 / n) }, { color: COL.vN, dash: "6 4", width: 1.4, pts: mk(() => s2) }
      ]
    });
  }
  let h = `<tr><th rowspan="2">n</th><th colspan="3">Var[Sₙ]</th><th colspan="3">Var[Sₙ/n]</th><th colspan="3">Var[Sₙ/√n]</th></tr><tr>` + `<th>Sample</th><th>Theory</th><th>Ratio</th>`.repeat(3) + `</tr>`;
  for (const model of ["B", "R"]) {
    const s2 = modelVar(model, p);
    h += `<tr><td colspan="10" style="background:var(--soft)"><b>${NAME[model]}</b> (σ² = ${fmt3(s2)})</td></tr>`;
    ns.forEach((n, k) => {
      const a = an[model][k], c = [[a.mS.variance, n * s2], [a.mA.variance, s2 / n], [a.mN.variance, s2]];
      h += `<tr><td class="m">${fmtN(n)}</td>` + c.map(([e, t]) => `<td class="n">${fmtV(e)}</td><td class="th">${fmtV(t)}</td><td class="n">${(e / t).toFixed(3)}</td>`).join("") + `</tr>`;
    });
  }
  $("varTab").innerHTML = h;
}

/* ---------- section 6: CLT ---------- */
function renderCLT() {
  const { ns, an, m } = SIM;
  for (const model of ["B", "R"]) {
    const box = $("gal" + model); box.innerHTML = "";
    ns.forEach((n, k) => {
      const fig = document.createElement("figure"); fig.style.padding = "8px 8px 4px"; fig.innerHTML = `<svg width="100%"></svg>`; box.appendChild(fig);
      const h = histOf(model, k, model === "B" ? "Z" : "N", 300, 205, "n = " + fmtN(n), "KS = " + an[model][k].ks.toFixed(3));
      histChart(fig.firstChild, h.opts);
    });
  }
  const mk = (model, f) => ns.map((n, k) => [n, f(an[model][k])]);
  const vals = [...an.B.map(a => a.ks), ...an.R.map(a => a.ks), ...an.B.map(a => a.be), ...an.R.map(a => a.be)];
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...vals, 1.36 / Math.sqrt(m))) - 0.1));
  chart($("ksFig"), {
    H: 340, l: 62, perRow: 2, xlog: true, ylog: true, xmin: ns[0] / 1.35, xmax: ns[ns.length - 1] * 1.35, ymin: lo, ymax: 1, xticks: ns, xlabel: "number of systems n", ylabel: "Kolmogorov–Smirnov distance",
    hlines: [{ y: 1.36 / Math.sqrt(m), color: COL.clt, dash: "2 3" }],
    series: [
      { name: "Bernoulli, Zₙ", color: COL.B, marker: true, pts: mk("B", a => a.ks) }, { name: "Rademacher, Sₙ/√n", color: COL.R, marker: true, pts: mk("R", a => a.ks) },
      { name: "Berry–Esseen (B)", color: COL.B, dash: "6 4", width: 1.5, pts: mk("B", a => a.be) }, { name: "Berry–Esseen (R)", color: COL.R, dash: "6 4", width: 1.5, pts: mk("R", a => a.be) },
      { name: "1.36/√m (noise)", color: COL.clt, dash: "2 3", pts: [] }
    ]
  });
  let h = `<tr><th rowspan="2">n</th><th colspan="2">KS distance</th><th colspan="2">Berry–Esseen</th><th colspan="2">Skewness of Zₙ</th><th colspan="2">Excess kurtosis of Zₙ</th></tr><tr><th>Bernoulli</th><th>Rademacher</th><th>Bernoulli</th><th>Rademacher</th>` + `<th>Bernoulli (sample / theory)</th><th>Rademacher</th><th>Bernoulli (sample / theory)</th><th>Rademacher</th></tr>`;
  ns.forEach((n, k) => {
    const B = an.B[k], R = an.R[k];
    h += `<tr><td class="m">${fmtN(n)}</td><td class="n">${B.ks.toFixed(4)}</td><td class="n">${R.ks.toFixed(4)}</td><td class="th">${B.be.toFixed(4)}</td><td class="th">${R.be.toFixed(4)}</td>` +
      `<td class="n">${fmt3(B.mZ.skew)} / ${fmt3(B.th.skew)}</td><td class="n">${fmt3(R.mZ.skew)} / ${fmt3(R.th.skew)}</td><td class="n">${fmt3(B.mZ.exkurt)} / ${fmt3(B.th.exkurt)}</td><td class="n">${fmt3(R.mZ.exkurt)} / ${fmt3(R.th.exkurt)}</td></tr>`;
  });
  $("cltTab").innerHTML = h + `<tr><td colspan="9" class="sub">Sampling noise of the empirical distribution (5% level): 1.36/√m = ${(1.36 / Math.sqrt(m)).toFixed(4)}. The Berry–Esseen column is a bound on the true distance, not an estimate of it.</td></tr>`;
}

/* ---------- section 7: effect of m and findings ---------- */
function renderEffectM() {
  const { st, ns, m, p, eps, lf } = SIM, k = +$("nSel2").value, n = ns[k];
  const ms = [25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000].filter(x => x < m).concat([m]);
  const lfT = makeLogFact(n);
  const ex = { B: exactTail("B", p, n, eps, lfT), R: exactTail("R", p, n, eps, lfT) };
  let h = `<tr><th>m</th><th>Noise 1.36/√m</th><th>KS Bernoulli</th><th>KS Rademacher</th><th>mean Sₙ/n (Bernoulli) ± s.e.</th><th>P̂ tail, Bernoulli (exact ${fmtP(ex.B)})</th><th>P̂ tail, Rademacher (exact ${fmtP(ex.R)})</th></tr>`;
  ms.forEach(mm => {
    const cells = {};
    for (const model of ["B", "R"]) {
      const mu = modelMu(model, p), sg = Math.sqrt(modelVar(model, p)), arr = st[model].S[k];
      const Z = new Float64Array(mm), Av = new Float64Array(mm); let bad = 0;
      for (let i = 0; i < mm; i++) { Z[i] = (arr[i] - n * mu) / (sg * Math.sqrt(n)); Av[i] = arr[i] / n; if (Math.abs(Av[i] - mu) > eps + 1e-12) bad++; }
      cells[model] = { ks: ksNormal(Z), mo: momentsOf(Av), tail: bad / mm };
    }
    const mo = cells.B.mo;
    h += `<tr><td class="m">${fmtN(mm)}</td><td class="th">${(1.36 / Math.sqrt(mm)).toFixed(4)}</td><td class="n">${cells.B.ks.toFixed(4)}</td><td class="n">${cells.R.ks.toFixed(4)}</td><td class="n">${mo.mean.toFixed(4)} ± ${(Math.sqrt(mo.variance / mm)).toFixed(4)}</td><td class="n">${fmtP(cells.B.tail)}</td><td class="n">${fmtP(cells.R.tail)}</td></tr>`;
  });
  $("mTab").innerHTML = h + `<tr><td colspan="7" class="sub">Computed with the first m attackers of the same simulation, n = ${fmtN(n)}, ε = ${eps}, p = ${p}. The true mean of Sₙ/n (Bernoulli) is ${p}.</td></tr>`;
}
function renderFindings() {
  const { ns, an, m, p, eps } = SIM, last = ns.length - 1, B = an.B, R = an.R, n0 = ns[0], n1 = ns[last];
  const sv = (a, key) => a[key].variance;
  const items = [
    `<b>Law of Large Numbers.</b> With ε = ${eps}, the fraction of attackers whose success rate S<sub>n</sub>/n lies more than ε from p was ${fmtP(B[0].tailEmp)} at n = ${fmtN(n0)} and ${fmtP(B[last].tailEmp)} at n = ${fmtN(n1)} (exact: ${fmtP(B[0].tailExact)} and ${fmtP(B[last].tailExact)}). In the zero-mean model the average score deviates from 0 by more than ε with frequency ${fmtP(R[0].tailEmp)} and ${fmtP(R[last].tailEmp)}, respectively. At n = ${fmtN(n1)} Chebyshev guarantees only ≤ ${fmtP(B[last].cheb)} (Bernoulli) and ≤ ${fmtP(R[last].cheb)} (Rademacher).`,
    `<b>Variance.</b> Between n = ${fmtN(n0)} and n = ${fmtN(n1)} the variance of the total score S<sub>n</sub> grew by a factor ${(sv(B[last], "mS") / sv(B[0], "mS")).toFixed(0)} (Bernoulli) and ${(sv(R[last], "mS") / sv(R[0], "mS")).toFixed(0)} (Rademacher), the variance of S<sub>n</sub>/n fell by a factor ${(sv(B[0], "mA") / sv(B[last], "mA")).toFixed(0)} and ${(sv(R[0], "mA") / sv(R[last], "mA")).toFixed(0)}, and the variance of S<sub>n</sub>/√n stayed between ${fmt3(Math.min(...B.map(a => a.mN.variance)))} and ${fmt3(Math.max(...B.map(a => a.mN.variance)))} (Bernoulli, theory ${fmt3(p * (1 - p))}) and between ${fmt3(Math.min(...R.map(a => a.mN.variance)))} and ${fmt3(Math.max(...R.map(a => a.mN.variance)))} (Rademacher, theory 1).`,
    `<b>Central Limit Theorem.</b> The Kolmogorov–Smirnov distance between the standardized score and N(0,1) went from ${B[0].ks.toFixed(3)} to ${B[last].ks.toFixed(3)} (Bernoulli) and from ${R[0].ks.toFixed(3)} to ${R[last].ks.toFixed(3)} (Rademacher). The noise level of an empirical distribution with m = ${fmtN(m)} attackers is ${(1.36 / Math.sqrt(m)).toFixed(3)}: below it, further convergence cannot be seen.`,
    `<b>Scale.</b> At n = ${fmtN(n1)} a single attacker obtains ${fmtN(B[last].mS.mean)} ± ${fmtN(Math.sqrt(sv(B[last], "mS")))} successes in the Bernoulli model, a success rate ${B[last].mA.mean.toFixed(4)} ± ${Math.sqrt(sv(B[last], "mA")).toFixed(4)}; in the Rademacher model the final score is ${fmtN(R[last].mS.mean)} ± ${fmtN(Math.sqrt(sv(R[last], "mS")))}, that is only ${Math.sqrt(sv(R[last], "mA")).toFixed(4)} per system.`
  ];
  $("findings").innerHTML = `<b>Results of the current run</b><ul class="plain" style="margin-top:6px">${items.map(t => `<li>${t}</li>`).join("")}</ul>`;
}

/* ---------- download button: warn if the zip was not uploaded next to index.html ---------- */
(function () {
  const a = document.querySelector("a.dl");
  if (a) a.addEventListener("click", async ev => {
    if (!/^https?:$/.test(location.protocol)) return;
    ev.preventDefault();
    try {
      const r = await fetch(a.href, { method: "HEAD" });
      if (!r.ok) throw new Error("missing");
      const t = document.createElement("a"); t.href = a.href; t.download = "penetration-site.zip";
      document.body.appendChild(t); t.click(); t.remove();
    } catch (e) { alert("penetration-site.zip was not found next to index.html. Upload the zip to the same folder of the repository to enable this button."); }
  });
  run();
})();
