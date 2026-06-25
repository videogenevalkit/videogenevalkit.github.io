// videogenevalkit leaderboard SPA — vanilla JS, no build step.
// Fair comparison = one board per context (benchmark · prompt_set · judge · profile).
let DATA = [];
const $ = (s) => document.querySelector(s);

const ctxKey = (r) => [r.benchmark, r.prompt_set.name, r.judge, r.profile].join(" | ");
const norm = (r) => {                         // map score -> 0..1 for coloring/overall
  let v = r.score;
  if (r.scale === "1-5") v = v / 5;
  else if (r.scale === "0-100") v = v / 100;
  if (r.lower_is_better) v = 1 - v;
  return Math.max(0, Math.min(1, v));
};
const heat = (t) => {                          // 0..1 -> red→yellow→green
  const h = 120 * t; return `hsl(${h} 65% ${88 - 22 * t}%)`;
};

function uniq(arr) { return [...new Set(arr)]; }

function fillSelect(sel, vals, keep) {
  sel.innerHTML = "";
  vals.forEach((v) => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  if (keep && vals.includes(keep)) sel.value = keep;
}

function refreshSelectors() {
  const b = $("#sel-bench").value;
  const benches = uniq(DATA.map((r) => r.benchmark)).sort();
  fillSelect($("#sel-bench"), benches, b);
  const bench = $("#sel-bench").value;
  const sub = DATA.filter((r) => r.benchmark === bench);
  fillSelect($("#sel-pset"), uniq(sub.map((r) => r.prompt_set.name)).sort(), $("#sel-pset").value);
  const pset = $("#sel-pset").value;
  const sub2 = sub.filter((r) => r.prompt_set.name === pset);
  fillSelect($("#sel-judge"), uniq(sub2.map((r) => r.judge)).sort(), $("#sel-judge").value);
  const judge = $("#sel-judge").value;
  const sub3 = sub2.filter((r) => r.judge === judge);
  fillSelect($("#sel-profile"), uniq(sub3.map((r) => r.profile)).sort(), $("#sel-profile").value);
}

let sortDim = "__overall__", sortDesc = true;

function render() {
  const bench = $("#sel-bench").value, pset = $("#sel-pset").value,
        judge = $("#sel-judge").value, prof = $("#sel-profile").value;
  const rows = DATA.filter((r) => r.benchmark === bench && r.prompt_set.name === pset
                && r.judge === judge && r.profile === prof);
  $("#ctx-badge").innerHTML = `context: <b>${bench}</b> · prompt_set <b>${pset}</b> · judge <b>${judge}</b> · profile <b>${prof}</b>`;
  if (!rows.length) { $("#board").innerHTML = "<p class=muted>No results for this context.</p>"; return; }

  const dims = uniq(rows.map((r) => r.dimension)).sort();
  const models = uniq(rows.map((r) => r.model));
  const cell = {}; const scaleOf = {};
  rows.forEach((r) => { (cell[r.model] = cell[r.model] || {})[r.dimension] = r; scaleOf[r.dimension] = r.scale; });
  // overall = mean of normalized dims (excludes a literal "overall" dim if present from the mean)
  const dimsForMean = dims.filter((d) => d !== "overall");
  const overall = {};
  models.forEach((m) => {
    const vs = dimsForMean.map((d) => cell[m][d] ? norm(cell[m][d]) : null).filter((x) => x !== null);
    overall[m] = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN;
  });

  // per-dimension normalized for coloring (relative to models in this context)
  const sorted = models.slice().sort((a, b) => {
    const va = sortDim === "__overall__" ? overall[a] : (cell[a][sortDim] ? norm(cell[a][sortDim]) : -1);
    const vb = sortDim === "__overall__" ? overall[b] : (cell[b][sortDim] ? norm(cell[b][sortDim]) : -1);
    return sortDesc ? vb - va : va - vb;
  });

  let h = "<table><thead><tr><th>#</th><th>model</th>";
  h += `<th class="sortable ov" data-d="__overall__">overall ▾</th>`;
  dims.forEach((d) => { h += `<th class="sortable" data-d="${d}">${d}${scaleOf[d] !== "0-1" ? `<br><span class=sc>${scaleOf[d]}</span>` : ""}</th>`; });
  h += "</tr></thead><tbody>";
  sorted.forEach((m, i) => {
    h += `<tr><td>${i + 1}</td><td class=model>${m}</td>`;
    h += `<td class=ov style="background:${heat(overall[m])}">${(overall[m]).toFixed(3)}</td>`;
    dims.forEach((d) => {
      const r = cell[m][d];
      if (!r) { h += "<td>—</td>"; return; }
      h += `<td style="background:${heat(norm(r))}" title="raw ${r.score} (${r.scale})">${r.score.toFixed(r.scale === "0-100" ? 1 : 3)}</td>`;
    });
    h += "</tr>";
  });
  h += "</tbody></table>";
  $("#board").innerHTML = h;
  $("#meta").textContent = `${models.length} models · ${dims.length} dims · ${rows[0].n_videos} videos · ${rows[0].timestamp.slice(0,10)}`;
  document.querySelectorAll("th.sortable").forEach((th) => th.onclick = () => {
    const d = th.dataset.d; if (sortDim === d) sortDesc = !sortDesc; else { sortDim = d; sortDesc = true; } render();
  });
}

["sel-bench","sel-pset","sel-judge","sel-profile"].forEach((id) =>
  document.getElementById(id).addEventListener("change", () => { refreshSelectors(); render(); }));

fetch("site/data.json").then((r) => r.json()).then((d) => {
  DATA = d; refreshSelectors();
  // default to a wbench/qwen3-vl context if present
  render();
}).catch((e) => { $("#board").innerHTML = "<p class=muted>failed to load data.json: " + e + "</p>"; });
