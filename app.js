// videogenevalkit leaderboard SPA — vanilla JS, no build step.
// Structure comes from site/catalog.json (every board, tested or not); values
// come from site/data.json (sparse). render = catalog ⟕ data, so untested
// boards appear as 留白 placeholders. Fair comparison = one board per context.
let DATA = [], CAT = { boards: [] };
const $ = (s) => document.querySelector(s);
const GROUP_ORDER = ["video_quality","consistency","setting_adherence","interaction_adherence",
  "causality","entity","spatial","event","cinematic","modifier","attribute","action","numeracy",
  "reasoning","i2v","trust","neutral","other","holistic"]; // holistic last
const norm = (r) => { let v = r.score; if (r.scale==="1-5") v/=5; else if (r.scale==="0-100") v/=100;
  if (r.lower_is_better) v=1-v; return Math.max(0,Math.min(1,v)); };
const heat = (t) => { t=Math.max(0,Math.min(1,t)); return `hsl(${8+(140-8)*t} 58% ${90-16*t}%)`; };
const uniq = (a) => [...new Set(a)];
const mean = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;

const FACET_GET = { prompt_set:(r)=>r.prompt_set&&r.prompt_set.name, judge:(r)=>r.judge,
  profile:(r)=>r.profile, ref_set:(r)=>r.ref_set, backbone:(r)=>r.backbone };
const boardById = (id) => CAT.boards.find(b=>b.id===id);
const boardRows = (id) => DATA.filter(r=>r.benchmark===id);

// ---- board selector (optgroups: Benchmarks / Metric families) ----
function buildBoardSelect(){
  const sel = $("#sel-board");
  const opt = (b)=>{ const has=boardRows(b.id).length>0;
    const sub = b.type==="family" && b.columns ? ` (${b.columns.map(c=>c.id).join(" · ")})` : "";
    return `<option value="${b.id}"${has?"":" class=ph"}>${b.label}${sub}${has?"":" · —"}</option>`; };
  const benches = CAT.boards.filter(b=>b.type==="benchmark");
  const fams = CAT.boards.filter(b=>b.type==="family");
  sel.innerHTML = `<optgroup label="Benchmarks">${benches.map(opt).join("")}</optgroup>`
                + `<optgroup label="Metric families">${fams.map(opt).join("")}</optgroup>`;
  const withData = CAT.boards.find(b=>boardRows(b.id).length>0);
  if (withData) sel.value = withData.id;
}

// ---- dynamic context facets for the selected board ----
let facetState = {};
function buildFacets(board){
  const host = $("#facets"); host.innerHTML=""; facetState={};
  let pool = boardRows(board.id);
  if (!pool.length) return;
  (board.context_facets||[]).forEach(f=>{
    const get = FACET_GET[f]; if (!get) return;
    const vals = uniq(pool.map(get).filter(v=>v!=null)).sort();
    if (!vals.length) return;
    facetState[f] = vals[0];
    host.insertAdjacentHTML("beforeend",
      `<label>${f.replace(/_/g," ")}<select data-f="${f}">${vals.map(v=>`<option>${v}</option>`).join("")}</select></label>`);
    pool = pool.filter(r=>get(r)===vals[0]);
  });
  host.querySelectorAll("select").forEach(s=>s.onchange=()=>{ facetState[s.dataset.f]=s.value; render(); });
}
function currentRows(board){
  let rows = boardRows(board.id);
  (board.context_facets||[]).forEach(f=>{ const g=FACET_GET[f];
    if (g && facetState[f]!=null) rows = rows.filter(r=>g(r)===facetState[f]); });
  return rows;
}

// L7: judge-independent dims are shared across judge contexts. A (bench, judge)
// board renders judge-DEPENDENT dims only from the selected judge, but pulls
// judge-INDEPENDENT (CV) dims from any judge's run (preferring the selected one).
function judgeDepMap(board){ const m={};
  (board.groups||[]).forEach(g=>g.dims.forEach(d=>{ m[d.id]=!!d.judge_dependent; })); return m; }
function rowsForBench(board){
  const jdep=judgeDepMap(board);
  const nonJudge=(board.context_facets||[]).filter(f=>f!=="judge");
  let base=boardRows(board.id);
  nonJudge.forEach(f=>{ const g=FACET_GET[f]; if(g&&facetState[f]!=null) base=base.filter(r=>g(r)===facetState[f]); });
  const judge=facetState.judge, out=[], seen=new Set();
  // pass 1: judge-dependent dims (selected judge only) + independent dims from selected judge
  base.forEach(r=>{ if(jdep[r.dimension]){ if(r.judge===judge) out.push(r); }
    else if(r.judge===judge){ const k=r.model+"|"+r.dimension; if(!seen.has(k)){seen.add(k);out.push(r);} } });
  // pass 2: independent dims still missing → pull from any other judge (identical by construction)
  base.forEach(r=>{ if(!jdep[r.dimension]){ const k=r.model+"|"+r.dimension; if(!seen.has(k)){seen.add(k);out.push(r);} } });
  return out;
}

let sortKey="__score__", sortDesc=true;

function setBadge(board, n){
  const chips = (board.context_facets||[]).map(f=> facetState[f]!=null
    ? `${f.replace(/_/g," ")} <b>${facetState[f]}</b>` : null).filter(Boolean).join(" · ");
  $("#ctx-badge").innerHTML = `<b>${board.label}</b> <span class=tag-${board.type}>${board.type}</span>`
    + (chips?` · ${chips}`:"") ;
}

// ---- benchmark board: grouped-dimension table ----
function renderBench(board, rows){
  const jdep=judgeDepMap(board);
  const models=uniq(rows.map(r=>r.model));
  const cell={}, grp={}, scale={};
  rows.forEach(r=>{ (cell[r.model]=cell[r.model]||{})[r.dimension]=r; grp[r.dimension]=r.group||"other"; scale[r.dimension]=r.scale; });
  const dimsByGroup={}; Object.keys(grp).forEach(d=>{ (dimsByGroup[grp[d]]=dimsByGroup[grp[d]]||[]).push(d); });
  const groups=Object.keys(dimsByGroup).sort((a,b)=>{
    const ia=GROUP_ORDER.indexOf(a), ib=GROUP_ORDER.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); });
  Object.values(dimsByGroup).forEach(ds=>ds.sort());
  const rankGroups=groups.filter(g=>g!=="holistic");
  // headline = the bench's own judged holistic axis (e.g. semantic_alignment "overall");
  // when present it IS the Score column + default sort and is shown first (not buried at the end).
  const holisticDims=dimsByGroup["holistic"]||[];
  const overallDim=holisticDims.includes("overall")?"overall":holisticDims[0];
  const hasHead=!!overallDim;
  const dispGroups=hasHead?rankGroups:groups; // when headlined, drop the trailing holistic group
  const gmean={}, score={};
  models.forEach(m=>{ gmean[m]={};
    groups.forEach(g=>{ const vs=dimsByGroup[g].map(d=>cell[m][d]?norm(cell[m][d]):null).filter(x=>x!==null); gmean[m][g]=mean(vs); });
    score[m]=hasHead?(cell[m][overallDim]?norm(cell[m][overallDim]):NaN)
                    :mean(rankGroups.map(g=>gmean[m][g]).filter(x=>!isNaN(x))); });
  const keyVal=(m)=> sortKey==="__score__"?score[m]
    : sortKey.startsWith("g:")?gmean[m][sortKey.slice(2)]
    : (cell[m][sortKey]?norm(cell[m][sortKey]):-1);
  const sorted=models.slice().sort((a,b)=> sortDesc?keyVal(b)-keyVal(a):keyVal(a)-keyVal(b));

  let h="<table><thead><tr><th rowspan=2 class=rank>#</th><th rowspan=2 class=model>model</th>"
       +`<th rowspan=2 class="sortable sc-col" data-k="__score__">${hasHead?overallDim:"Score"}<br><span class=sc>${hasHead?"overall · judge":"group-μ mean"}</span></th>`;
  dispGroups.forEach(g=>{ const span=dimsByGroup[g].length+1;
    h+=`<th colspan=${span} class="grp grp-${g}">${g}</th>`; });
  h+="</tr><tr>";
  dispGroups.forEach(g=>{ h+=`<th class="sortable mu" data-k="g:${g}">μ</th>`;
    dimsByGroup[g].forEach(d=>{ const sx=scale[d]!=="0-1"?`<br><span class=sc>${scale[d]}</span>`:"";
      const jd=jdep[d]?' <span class=jd title="judge-dependent — not shared across judges">⚖</span>':"";
      h+=`<th class="sortable dim${jdep[d]?" jdep":""}" data-k="${d}">${d}${jd}${sx}</th>`; }); });
  h+="</tr></thead><tbody>";
  sorted.forEach((m,i)=>{
    const medal=i<3?`<span class=medal>${["🥇","🥈","🥉"][i]}</span>`:(i+1);
    h+=`<tr class="${i<3?"top"+(i+1):""}"><td class=rank>${medal}</td><td class=model title="${m}">${m}</td>`;
    const pct=Math.round((isNaN(score[m])?0:score[m])*100);
    const sv=hasHead?(cell[m][overallDim]?cell[m][overallDim].score.toFixed(2):"—"):(isNaN(score[m])?"—":score[m].toFixed(3));
    h+=`<td class="sc-col"><div class=scorewrap><b>${sv}</b><span class=sbar><i style="width:${pct}%"></i></span></div></td>`;
    dispGroups.forEach(g=>{
      h+=`<td class="mu" style="background:${heat(gmean[m][g]||0)}">${isNaN(gmean[m][g])?"—":gmean[m][g].toFixed(2)}</td>`;
      dimsByGroup[g].forEach(d=>{ const r=cell[m][d];
        if(!r){ h+="<td>—</td>"; return; }
        h+=`<td style="background:${heat(norm(r))}" title="raw ${r.score} (${r.scale})">${r.score.toFixed(r.scale==="0-100"?1:2)}</td>`; });
    });
    h+="</tr>";
  });
  h+="</tbody></table>";
  $("#board").innerHTML=h;
  $("#meta").textContent=`${models.length} models · ${Object.keys(grp).length} dims / ${groups.length} groups · ${rows[0].n_videos} videos · ${rows[0].timestamp.slice(0,10)}`;
  wireSort();
}

// ---- metric-family board: model × metric matrix ----
function renderFamily(board, rows){
  const cols=board.columns.map(c=>c.id);
  const dirOf={}; board.columns.forEach(c=>dirOf[c.id]=c.dir);
  const scaleOf={}; board.columns.forEach(c=>scaleOf[c.id]=c.scale);
  const models=uniq(rows.map(r=>r.model));
  const cell={}; rows.forEach(r=>{ (cell[r.model]=cell[r.model]||{})[r.dimension]=r; });
  const nv=(id,r)=>{ let v=norm(r); if(dirOf[id]==="down") v=1-v; return v; };
  const score={}; models.forEach(m=>{ const vs=cols.map(c=>cell[m][c]?nv(c,cell[m][c]):null).filter(x=>x!==null); score[m]=mean(vs); });
  const keyVal=(m)=> sortKey==="__score__"?score[m]:(cell[m][sortKey]?nv(sortKey,cell[m][sortKey]):-1);
  const sorted=models.slice().sort((a,b)=> sortDesc?keyVal(b)-keyVal(a):keyVal(a)-keyVal(b));
  let h="<table><thead><tr><th class=rank>#</th><th class=model>model</th>"
       +`<th class="sortable sc-col" data-k="__score__">Score</th>`;
  cols.forEach(c=>{ const d=dirOf[c]==="down"?" ↓":dirOf[c]==="neutral"?" ·":" ↑";
    h+=`<th class="sortable dim" data-k="${c}">${c}<span class=sc>${scaleOf[c]}${d}</span></th>`; });
  h+="</tr></thead><tbody>";
  sorted.forEach((m,i)=>{
    const medal=i<3?`<span class=medal>${["🥇","🥈","🥉"][i]}</span>`:(i+1);
    h+=`<tr class="${i<3?"top"+(i+1):""}"><td class=rank>${medal}</td><td class=model title="${m}">${m}</td>`;
    h+=`<td class="sc-col"><b>${isNaN(score[m])?"—":score[m].toFixed(3)}</b></td>`;
    cols.forEach(c=>{ const r=cell[m][c];
      if(!r){ h+="<td>—</td>"; return; }
      const bg=dirOf[c]==="neutral"?"#f2f3f5":heat(nv(c,r));
      h+=`<td style="background:${bg}" title="raw ${r.score}">${r.score.toFixed(scaleOf[c]==="0-100"?1:2)}</td>`; });
    h+="</tr>";
  });
  h+="</tbody></table>";
  $("#board").innerHTML=h;
  $("#meta").textContent=`${models.length} models · ${cols.length} metrics`;
  wireSort();
}

// ---- 留白 placeholder for boards with no data yet ----
function renderPlaceholder(board){
  let cols=[];
  if(board.type==="benchmark") cols=(board.groups||[]).flatMap(g=>g.dims.map(d=>d.id));
  else cols=(board.columns||[]).map(c=>c.id);
  const chips=cols.length?`<div class=ph-cols>${cols.map(c=>`<span class=ph-chip>${c}</span>`).join("")}</div>`
                         :`<p class=muted>dimensions to be finalized on first run</p>`;
  $("#board").innerHTML=`<div class=placeholder><span class=ph-badge>尚未测试 · not yet evaluated</span>
    <p class=muted>Defined in the catalog; no results in this context yet. Planned ${board.type==="family"?"metrics":"dimensions"}:</p>
    ${chips}</div>`;
  $("#meta").textContent=`${cols.length} planned ${board.type==="family"?"metrics":"dimensions"} · awaiting first run`;
}

function wireSort(){
  document.querySelectorAll("th.sortable").forEach(th=>th.onclick=()=>{
    const k=th.dataset.k; if(sortKey===k)sortDesc=!sortDesc; else{sortKey=k;sortDesc=true;} render(); });
}

function render(){
  const board=boardById($("#sel-board").value); if(!board) return;
  const rows = board.type==="benchmark" ? rowsForBench(board) : currentRows(board);
  setBadge(board, rows.length);
  if(!rows.length){ renderPlaceholder(board); return; }
  if(board.type==="benchmark") renderBench(board, rows); else renderFamily(board, rows);
}

$("#sel-board").addEventListener("change",()=>{ sortKey="__score__"; sortDesc=true;
  buildFacets(boardById($("#sel-board").value)); render(); });

Promise.all([
  fetch("site/catalog.json?_="+Date.now()).then(r=>r.json()),
  fetch("site/data.json?_="+Date.now()).then(r=>r.json()),
]).then(([cat,data])=>{ CAT=cat; DATA=data; buildBoardSelect();
  buildFacets(boardById($("#sel-board").value)); render(); })
 .catch(e=>{ $("#board").innerHTML="<p class=muted>failed to load: "+e+"</p>"; });
