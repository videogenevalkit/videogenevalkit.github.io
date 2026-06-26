// videogenevalkit leaderboard SPA — vanilla JS, no build step.
// Structure comes from site/catalog.json (every board, tested or not); values
// come from site/data.json (sparse). render = catalog ⟕ data, so untested
// boards appear as 留白 placeholders. Four views: Leaderboard · Compare ·
// Model card · Dimensions. Fair comparison = one board per context.
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
const COLORS = ["#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#64748b"];

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

// L7: judge-independent dims shared across judge contexts.
function judgeDepMap(board){ const m={};
  (board.groups||[]).forEach(g=>g.dims.forEach(d=>{ m[d.id]=!!d.judge_dependent; })); return m; }
function rowsForBench(board){
  const jdep=judgeDepMap(board);
  const nonJudge=(board.context_facets||[]).filter(f=>f!=="judge");
  let base=boardRows(board.id);
  nonJudge.forEach(f=>{ const g=FACET_GET[f]; if(g&&facetState[f]!=null) base=base.filter(r=>g(r)===facetState[f]); });
  const judge=facetState.judge, out=[], seen=new Set();
  base.forEach(r=>{ if(jdep[r.dimension]){ if(r.judge===judge) out.push(r); }
    else if(r.judge===judge){ const k=r.model+"|"+r.dimension; if(!seen.has(k)){seen.add(k);out.push(r);} } });
  base.forEach(r=>{ if(!jdep[r.dimension]){ const k=r.model+"|"+r.dimension; if(!seen.has(k)){seen.add(k);out.push(r);} } });
  return out;
}

// ---- shared board model: cells, group means, headline score (used by all views) ----
function boardModel(board, rows){
  const jdep=judgeDepMap(board);
  const models=uniq(rows.map(r=>r.model));
  const cell={}, scale={};
  rows.forEach(r=>{ (cell[r.model]=cell[r.model]||{})[r.dimension]=r; });
  // CATALOG-driven dim set: every dimension the bench defines appears, so
  // untested / removed-unreliable dims render as "—" (full picture for users).
  const grp={}, dimsByGroup={};
  (board.groups||[]).forEach(g=>{ dimsByGroup[g.id]=g.dims.map(d=>d.id);
    g.dims.forEach(d=>{ grp[d.id]=g.id; scale[d.id]=d.scale; }); });
  // data dim not in catalog → put under "other" (safety)
  rows.forEach(r=>{ if(!(r.dimension in grp)){ grp[r.dimension]="other"; (dimsByGroup.other=dimsByGroup.other||[]).push(r.dimension); } scale[r.dimension]=r.scale; });
  const groups=Object.keys(dimsByGroup).filter(g=>dimsByGroup[g] && dimsByGroup[g].length)
    .sort((a,b)=>{ const ia=GROUP_ORDER.indexOf(a), ib=GROUP_ORDER.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); });
  Object.values(dimsByGroup).forEach(ds=>ds.sort());
  const rankGroups=groups.filter(g=>g!=="holistic");
  const holisticDims=dimsByGroup["holistic"]||[];
  const overallDim=holisticDims.includes("overall")?"overall":holisticDims[0];
  const hasHead=!!overallDim;
  const gmean={}, score={};
  models.forEach(m=>{ gmean[m]={};
    groups.forEach(g=>{ const vs=dimsByGroup[g].map(d=>cell[m][d]?norm(cell[m][d]):null).filter(x=>x!==null); gmean[m][g]=mean(vs); });
    score[m]=hasHead?(cell[m][overallDim]?norm(cell[m][overallDim]):NaN):mean(rankGroups.map(g=>gmean[m][g]).filter(x=>!isNaN(x))); });
  return {jdep,models,cell,grp,scale,dimsByGroup,groups,rankGroups,overallDim,hasHead,gmean,score};
}
function familyModel(board, rows){
  const cols=board.columns.map(c=>c.id);
  const dirOf={}, scaleOf={}; board.columns.forEach(c=>{dirOf[c.id]=c.dir;scaleOf[c.id]=c.scale;});
  const models=uniq(rows.map(r=>r.model));
  const cell={}; rows.forEach(r=>{ (cell[r.model]=cell[r.model]||{})[r.dimension]=r; });
  const nv=(id,r)=>{ let v=norm(r); if(dirOf[id]==="down") v=1-v; return v; };
  const score={}; models.forEach(m=>{ const vs=cols.map(c=>cell[m][c]?nv(c,cell[m][c]):null).filter(x=>x!==null); score[m]=mean(vs); });
  return {cols,dirOf,scaleOf,models,cell,nv,score};
}

let sortKey="__score__", sortDesc=true, activeView="leaderboard";

function setBadge(board){
  const chips = (board.context_facets||[]).map(f=> facetState[f]!=null
    ? `${f.replace(/_/g," ")} <b>${facetState[f]}</b>` : null).filter(Boolean).join(" · ");
  $("#ctx-badge").innerHTML = `<b>${board.label}</b> <span class=tag-${board.type}>${board.type}</span>`
    + (chips?` · ${chips}`:"") ;
}

// ---- Leaderboard view: grouped-dimension table ----
function renderBench(board, rows){
  const bm=boardModel(board, rows);
  const {jdep,cell,scale,dimsByGroup,groups,rankGroups,overallDim,hasHead,gmean,score}=bm;
  const dispGroups=hasHead?rankGroups:groups;
  // a dim is "untested" in this context if no model has a value → header greyed
  const dimHasData={}; Object.values(dimsByGroup).forEach(ds=>ds.forEach(d=>{ dimHasData[d]=bm.models.some(m=>cell[m]&&cell[m][d]); }));
  const keyVal=(m)=> sortKey==="__score__"?score[m]
    : sortKey.startsWith("g:")?gmean[m][sortKey.slice(2)]
    : (cell[m][sortKey]?norm(cell[m][sortKey]):-1);
  const sorted=bm.models.slice().sort((a,b)=> sortDesc?keyVal(b)-keyVal(a):keyVal(a)-keyVal(b));
  let h="<table><thead><tr><th rowspan=2 class=rank>#</th><th rowspan=2 class=model>model</th>"
       +`<th rowspan=2 class="sortable sc-col" data-k="__score__">${hasHead?overallDim:"Score"}<br><span class=sc>${hasHead?"overall · judge":"group-μ mean"}</span></th>`;
  dispGroups.forEach(g=>{ const span=dimsByGroup[g].length+1; h+=`<th colspan=${span} class="grp grp-${g}">${g}</th>`; });
  h+="</tr><tr>";
  dispGroups.forEach(g=>{ h+=`<th class="sortable mu" data-k="g:${g}">μ</th>`;
    dimsByGroup[g].forEach(d=>{ const sx=scale[d]!=="0-1"?`<br><span class=sc>${scale[d]}</span>`:"";
      const jd=jdep[d]?' <span class=jd title="judge-dependent — not shared across judges">⚖</span>':"";
      const nd=dimHasData[d]?"":" nodata"; const ttl=dimHasData[d]?"":' title="not evaluated in this context (— = no/unreliable data)"';
      h+=`<th class="sortable dim${jdep[d]?" jdep":""}${nd}" data-k="${d}"${ttl}>${d}${jd}${sx}</th>`; }); });
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
  $("#meta").textContent=`${bm.models.length} models · ${Object.keys(bm.grp).length} dims / ${groups.length} groups · ${rows[0].n_videos} videos · ${rows[0].timestamp.slice(0,10)}`;
  wireSort();
}

// ---- Leaderboard view: metric-family matrix ----
function renderFamily(board, rows){
  const fm=familyModel(board, rows); const {cols,dirOf,scaleOf,cell,nv,score}=fm;
  const keyVal=(m)=> sortKey==="__score__"?score[m]:(cell[m][sortKey]?nv(sortKey,cell[m][sortKey]):-1);
  const sorted=fm.models.slice().sort((a,b)=> sortDesc?keyVal(b)-keyVal(a):keyVal(a)-keyVal(b));
  let h="<table><thead><tr><th class=rank>#</th><th class=model>model</th><th class=\"sortable sc-col\" data-k=\"__score__\">Score</th>";
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
  $("#meta").textContent=`${fm.models.length} models · ${cols.length} metrics`;
  wireSort();
}

// ---- SVG radar (N axes, 0..1 values, one polygon per series) ----
function radarSVG(axes, series){
  const size=360, cx=size/2, cy=size/2, R=size/2-58, n=axes.length;
  const ang=(i)=> -Math.PI/2 + i*2*Math.PI/n;
  const pt=(i,r)=>[cx+Math.cos(ang(i))*R*r, cy+Math.sin(ang(i))*R*r];
  let s=`<svg viewBox="0 0 ${size} ${size}" class="radar">`;
  [0.25,0.5,0.75,1].forEach(g=>{ const p=axes.map((_,i)=>pt(i,g).map(v=>v.toFixed(1)).join(",")).join(" "); s+=`<polygon points="${p}" class="ring" />`; });
  axes.forEach((a,i)=>{ const [x,y]=pt(i,1); s+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="spoke" />`;
    const [lx,ly]=pt(i,1.14); const anchor=Math.abs(lx-cx)<4?"middle":(lx>cx?"start":"end");
    s+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="rlabel" text-anchor="${anchor}">${a}</text>`; });
  series.forEach(se=>{ const p=se.values.map((v,i)=>pt(i,Math.max(0.02,isNaN(v)?0:v)).map(x=>x.toFixed(1)).join(",")).join(" ");
    s+=`<polygon points="${p}" fill="${se.color}1f" stroke="${se.color}" stroke-width="2" />`; });
  s+=`</svg>`; return s;
}
function legend(series){ return `<div class=legend2>`+series.map(se=>`<span class=lg><i class=dot style="background:${se.color}"></i>${se.name}</span>`).join("")+`</div>`; }

// ---- Compare view: radar over groups (bench) / metrics (family) + table ----
function renderCompare(board, rows){
  setBadge(board);
  $("#subcontrols").innerHTML="";
  let axes, valOf, models, score;
  if(board.type==="benchmark"){ const bm=boardModel(board,rows);
    axes=bm.rankGroups; models=bm.models; score=bm.score; valOf=(m,a)=>bm.gmean[m][a];
  } else { const fm=familyModel(board,rows);
    axes=fm.cols; models=fm.models; score=fm.score; valOf=(m,a)=>fm.cell[m][a]?fm.nv(a,fm.cell[m][a]):NaN; }
  models = models.slice().sort((a,b)=>score[b]-score[a]).slice(0,COLORS.length);
  const series=models.map((m,i)=>({name:m,color:COLORS[i],values:axes.map(a=>valOf(m,a))}));
  let h=`<div class=compare><div class=radarbox>${radarSVG(axes,series)}${legend(series)}</div>`;
  // comparison table: model × axis (group-μ / metric)
  h+=`<div class=cmptable><table><thead><tr><th class=model>model</th><th class=sc-col>Score</th>`
    + axes.map(a=>`<th class=dim>${a}</th>`).join("") + `</tr></thead><tbody>`;
  models.forEach((m,i)=>{ h+=`<tr><td class=model><i class=dot style="background:${COLORS[i]}"></i>${m}</td>`
    + `<td class=sc-col><b>${isNaN(score[m])?"—":score[m].toFixed(3)}</b></td>`
    + axes.map(a=>{ const v=valOf(m,a); return `<td style="background:${heat(isNaN(v)?0:v)}">${isNaN(v)?"—":v.toFixed(2)}</td>`; }).join("")+`</tr>`; });
  h+=`</tbody></table></div></div>`;
  $("#board").innerHTML=h;
  $("#meta").textContent=`compare ${models.length} models across ${axes.length} ${board.type==="benchmark"?"groups":"metrics"}`;
}

// ---- Dimension explorer: pick a dim, rank all models on it ----
let dimPick=null;
function renderDimExplorer(board, rows){
  setBadge(board);
  const dims=uniq(rows.map(r=>r.dimension));
  if(!dimPick||!dims.includes(dimPick)) dimPick=dims.includes("overall")?"overall":dims[0];
  $("#subcontrols").innerHTML=`<label class=pick>Dimension<select id="dimsel">${dims.map(d=>`<option${d===dimPick?" selected":""}>${d}</option>`).join("")}</select></label>`;
  $("#dimsel").onchange=(e)=>{ dimPick=e.target.value; render(); };
  const cell={}; rows.forEach(r=>{ if(r.dimension===dimPick) cell[r.model]=r; });
  const items=Object.keys(cell).map(m=>({m, r:cell[m], v:norm(cell[m])})).sort((a,b)=>b.v-a.v);
  let h=`<div class=dimx><h3>${dimPick} <span class=muted>· ${items.length} models</span></h3>`;
  items.forEach((it,i)=>{ const medal=i<3?["🥇","🥈","🥉"][i]:(i+1);
    h+=`<div class=dimrow><span class=dr-rank>${medal}</span><span class=dr-model>${it.m}</span>`
      +`<span class=dr-bar><i style="width:${Math.round(it.v*100)}%;background:${heat(it.v)}"></i></span>`
      +`<span class=dr-val>${it.r.score.toFixed(it.r.scale==="0-100"?1:2)}<span class=sc> ${it.r.scale}</span></span></div>`; });
  h+=`</div>`;
  $("#board").innerHTML=h;
  $("#meta").textContent=`dimension explorer · ${dimPick}`;
}

// ---- Model card: one model's profile across every board it appears in ----
let mcModel=null;
function renderModelCard(){
  const allModels=uniq(DATA.map(r=>r.model)).sort();
  if(!allModels.length){ $("#board").innerHTML="<p class=muted>no data</p>"; return; }
  if(!mcModel||!allModels.includes(mcModel)) mcModel=allModels[0];
  $("#subcontrols").innerHTML=`<label class=pick>Model<select id="mcsel">${allModels.map(m=>`<option${m===mcModel?" selected":""}>${m}</option>`).join("")}</select></label>`;
  $("#mcsel").onchange=(e)=>{ mcModel=e.target.value; renderModelCard(); };
  $("#ctx-badge").innerHTML=`<b>${mcModel}</b> <span class=tag-benchmark>model card</span> · profile across all boards it appears in`;
  let cards="";
  CAT.boards.forEach(b=>{
    const mrows=DATA.filter(r=>r.benchmark===b.id && r.model===mcModel);
    if(!mrows.length) return;
    const ctx={j:mrows[0].judge, p:mrows[0].prompt_set&&mrows[0].prompt_set.name, pf:mrows[0].profile};
    const ctxRows=DATA.filter(r=>r.benchmark===b.id && r.judge===ctx.j && (r.prompt_set&&r.prompt_set.name)===ctx.p && r.profile===ctx.pf);
    let score, rank, n, bars="";
    if(b.type==="benchmark"){ const bm=boardModel(b,ctxRows);
      const ranked=Object.keys(bm.score).filter(m=>!isNaN(bm.score[m])).sort((x,y)=>bm.score[y]-bm.score[x]);
      score=bm.score[mcModel]; rank=ranked.indexOf(mcModel)+1; n=ranked.length;
      bars=bm.rankGroups.map(g=>{ const v=bm.gmean[mcModel][g]; return `<div class=mcbar title="${g}: ${isNaN(v)?"—":v.toFixed(2)}"><span class=mcbl>${g}</span><span class=mcbt><i style="width:${Math.round((isNaN(v)?0:v)*100)}%;background:${heat(isNaN(v)?0:v)}"></i></span></div>`; }).join("");
    } else { const fm=familyModel(b,ctxRows);
      const ranked=Object.keys(fm.score).filter(m=>!isNaN(fm.score[m])).sort((x,y)=>fm.score[y]-fm.score[x]);
      score=fm.score[mcModel]; rank=ranked.indexOf(mcModel)+1; n=ranked.length;
      bars=fm.cols.map(c=>{ const r=fm.cell[mcModel][c]; const v=r?fm.nv(c,r):NaN; return `<div class=mcbar title="${c}"><span class=mcbl>${c}</span><span class=mcbt><i style="width:${Math.round((isNaN(v)?0:v)*100)}%;background:${heat(isNaN(v)?0:v)}"></i></span></div>`; }).join("");
    }
    const ctxlbl=[ctx.p,ctx.j!=="none"?ctx.j:null,ctx.pf].filter(Boolean).join(" · ");
    cards+=`<div class=mccard><div class=mchead><span class=mctitle>${b.label}</span>`
      +`<span class=mcrank>#${rank}<span class=sc>/${n}</span></span></div>`
      +`<div class=mcscore style="background:${heat(isNaN(score)?0:score)}">${isNaN(score)?"—":score.toFixed(3)}</div>`
      +`<div class=mcctx>${ctxlbl}</div>${bars}</div>`;
  });
  $("#board").innerHTML=`<div class=mcgrid>${cards||"<p class=muted>this model has no results</p>"}</div>`;
  $("#meta").textContent=`model card · ${mcModel}`;
}

function wireSort(){
  document.querySelectorAll("th.sortable").forEach(th=>th.onclick=()=>{
    const k=th.dataset.k; if(sortKey===k)sortDesc=!sortDesc; else{sortKey=k;sortDesc=true;} render(); });
}

function render(){
  const ctrlHide = activeView==="modelcard";
  $("#controls").style.display = ctrlHide ? "none" : "flex";
  if(activeView==="modelcard"){ renderModelCard(); return; }
  const board=boardById($("#sel-board").value); if(!board) return;
  const rows = board.type==="benchmark" ? rowsForBench(board) : currentRows(board);
  setBadge(board);
  if(!rows.length){ $("#subcontrols").innerHTML=""; renderPlaceholder(board); return; }
  if(activeView==="leaderboard"){ $("#subcontrols").innerHTML=""; board.type==="benchmark"?renderBench(board,rows):renderFamily(board,rows); }
  else if(activeView==="compare") renderCompare(board,rows);
  else if(activeView==="dimensions") renderDimExplorer(board,rows);
}

// ---- 留白 placeholder ----
function renderPlaceholder(board){
  let cols=[];
  if(board.type==="benchmark") cols=(board.groups||[]).flatMap(g=>g.dims.map(d=>d.id));
  else cols=(board.columns||[]).map(c=>c.id);
  const chips=cols.length?`<div class=ph-cols>${cols.map(c=>`<span class=ph-chip>${c}</span>`).join("")}</div>`
                         :`<p class=muted>dimensions to be finalized on first run</p>`;
  $("#board").innerHTML=`<div class=placeholder><span class=ph-badge>尚未测试 · not yet evaluated</span>
    <p class=muted>Defined in the catalog; no results in this context yet.</p>${chips}</div>`;
  $("#meta").textContent=`${cols.length} planned ${board.type==="family"?"metrics":"dimensions"} · awaiting first run`;
}

// ---- view tabs + wiring ----
function wireViews(){
  document.querySelectorAll("#views button").forEach(btn=>btn.onclick=()=>{
    activeView=btn.dataset.view;
    document.querySelectorAll("#views button").forEach(b=>b.classList.toggle("on", b===btn));
    sortKey="__score__"; sortDesc=true; render();
  });
}
$("#sel-board").addEventListener("change",()=>{ sortKey="__score__"; sortDesc=true;
  buildFacets(boardById($("#sel-board").value)); render(); });

Promise.all([
  fetch("site/catalog.json?_="+Date.now()).then(r=>r.json()),
  fetch("site/data.json?_="+Date.now()).then(r=>r.json()),
]).then(([cat,data])=>{ CAT=cat; DATA=data; buildBoardSelect(); wireViews();
  buildFacets(boardById($("#sel-board").value)); render(); })
 .catch(e=>{ $("#board").innerHTML="<p class=muted>failed to load: "+e+"</p>"; });
