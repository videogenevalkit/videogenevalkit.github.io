// videogenevalkit leaderboard SPA — vanilla JS, no build step.
// Fair comparison = one board per context (benchmark · prompt_set · judge · profile).
// Dimensions are grouped by each bench's taxonomy; the ranking Score = mean of
// per-group means (excludes the judge's standalone holistic "overall" axis).
let DATA = [];
const $ = (s) => document.querySelector(s);
const GROUP_ORDER = ["video_quality","consistency","setting_adherence","interaction_adherence","causality",
                     "entity","spatial","event","cinematic","modifier",
                     "attribute","action","numeracy","other","holistic"]; // holistic last
const norm = (r) => { let v = r.score; if (r.scale==="1-5") v/=5; else if (r.scale==="0-100") v/=100;
  if (r.lower_is_better) v=1-v; return Math.max(0,Math.min(1,v)); };
const heat = (t) => `hsl(${120*t} 65% ${88-22*t}%)`;
const uniq = (a) => [...new Set(a)];
const mean = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;

function fillSelect(sel, vals, keep){ sel.innerHTML=""; vals.forEach(v=>{const o=document.createElement("option");o.value=o.textContent=v;sel.appendChild(o);}); if(keep&&vals.includes(keep))sel.value=keep; }
function refreshSelectors(){
  fillSelect($("#sel-bench"), uniq(DATA.map(r=>r.benchmark)).sort(), $("#sel-bench").value);
  const b=$("#sel-bench").value, s1=DATA.filter(r=>r.benchmark===b);
  fillSelect($("#sel-pset"), uniq(s1.map(r=>r.prompt_set.name)).sort(), $("#sel-pset").value);
  const ps=$("#sel-pset").value, s2=s1.filter(r=>r.prompt_set.name===ps);
  fillSelect($("#sel-judge"), uniq(s2.map(r=>r.judge)).sort(), $("#sel-judge").value);
  const j=$("#sel-judge").value, s3=s2.filter(r=>r.judge===j);
  fillSelect($("#sel-profile"), uniq(s3.map(r=>r.profile)).sort(), $("#sel-profile").value);
}

let sortKey="__score__", sortDesc=true;

function render(){
  const b=$("#sel-bench").value, ps=$("#sel-pset").value, j=$("#sel-judge").value, pf=$("#sel-profile").value;
  const rows=DATA.filter(r=>r.benchmark===b&&r.prompt_set.name===ps&&r.judge===j&&r.profile===pf);
  $("#ctx-badge").innerHTML=`context: <b>${b}</b> · prompt_set <b>${ps}</b> · judge <b>${j}</b> · profile <b>${pf}</b>`;
  if(!rows.length){ $("#board").innerHTML="<p class=muted>No results for this context.</p>"; return; }

  const models=uniq(rows.map(r=>r.model));
  const cell={}, grp={}, scale={};
  rows.forEach(r=>{ (cell[r.model]=cell[r.model]||{})[r.dimension]=r; grp[r.dimension]=r.group||"other"; scale[r.dimension]=r.scale; });
  // groups present, ordered; dims within group
  const dimsByGroup={}; Object.keys(grp).forEach(d=>{ (dimsByGroup[grp[d]]=dimsByGroup[grp[d]]||[]).push(d); });
  const groups=Object.keys(dimsByGroup).sort((a,b)=>{
    const ia=GROUP_ORDER.indexOf(a), ib=GROUP_ORDER.indexOf(b);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
  Object.values(dimsByGroup).forEach(ds=>ds.sort());
  const rankGroups=groups.filter(g=>g!=="holistic");

  // per-(model,group) mean of normalized; Score = mean of rank-group means
  const gmean={}, score={};
  models.forEach(m=>{ gmean[m]={};
    groups.forEach(g=>{ const vs=dimsByGroup[g].map(d=>cell[m][d]?norm(cell[m][d]):null).filter(x=>x!==null); gmean[m][g]=mean(vs); });
    score[m]=mean(rankGroups.map(g=>gmean[m][g]).filter(x=>!isNaN(x)));
  });

  const keyVal=(m)=> sortKey==="__score__"?score[m]
    : sortKey.startsWith("g:")?gmean[m][sortKey.slice(2)]
    : (cell[m][sortKey]?norm(cell[m][sortKey]):-1);
  const sorted=models.slice().sort((a,b)=> sortDesc?keyVal(b)-keyVal(a):keyVal(a)-keyVal(b));

  // header: group band row + dim row (each group: μ col + dims)
  let h="<table><thead><tr><th rowspan=2>#</th><th rowspan=2>model</th>"
       +`<th rowspan=2 class="sortable sc-col" data-k="__score__">Score ▾<br><span class=sc>group-μ mean</span></th>`;
  groups.forEach(g=>{ const span=dimsByGroup[g].length+1; const lbl=g==="holistic"?"holistic (judge)":g;
    h+=`<th colspan=${span} class="grp grp-${g}">${lbl}</th>`; });
  h+="</tr><tr>";
  groups.forEach(g=>{ h+=`<th class="sortable mu" data-k="g:${g}">μ</th>`;
    dimsByGroup[g].forEach(d=>{ const sx=scale[d]!=="0-1"?`<br><span class=sc>${scale[d]}</span>`:"";
      h+=`<th class="sortable dim" data-k="${d}">${d}${sx}</th>`; }); });
  h+="</tr></thead><tbody>";
  sorted.forEach((m,i)=>{
    h+=`<tr><td>${i+1}</td><td class=model>${m}</td>`;
    h+=`<td class="sc-col" style="background:${heat(score[m])}"><b>${score[m].toFixed(3)}</b></td>`;
    groups.forEach(g=>{
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
  document.querySelectorAll("th.sortable").forEach(th=>th.onclick=()=>{ const k=th.dataset.k; if(sortKey===k)sortDesc=!sortDesc; else{sortKey=k;sortDesc=true;} render(); });
}

["sel-bench","sel-pset","sel-judge","sel-profile"].forEach(id=>document.getElementById(id).addEventListener("change",()=>{refreshSelectors();render();}));
fetch("site/data.json?_="+Date.now()).then(r=>r.json()).then(d=>{ DATA=d; refreshSelectors(); render(); })
  .catch(e=>{ $("#board").innerHTML="<p class=muted>failed to load data.json: "+e+"</p>"; });
