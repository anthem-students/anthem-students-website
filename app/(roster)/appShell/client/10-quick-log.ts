// Quick Log: paste notes about several students, match names, log each as a hangout.
// Part of the roster's client script; see ./index.ts.
export const QUICK_LOG = `// ── BRAIN DUMP ────────────────────────────────────────────────
async function processBrainDump() {
  const text=document.getElementById('dump-text').value.trim();
  if (!text) { showToast('Write something first!','error'); return; }
  const btn=document.getElementById('dump-btn');
  btn.disabled=true; btn.textContent='✨ Processing…';
  const roster=getAllStudentNames();
  const res=await fetch('/api/brain-dump',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,roster})});
  const data=await res.json();
  btn.disabled=false; btn.textContent='✨ Process & Assign';
  const el=document.getElementById('dump-result');
  if (!data.parsed||!data.parsed.length) {
    el.innerHTML='<div class="dump-result"><p style="color:var(--muted)">Couldn\\'t match any students. Try being more specific!</p></div>';
    return;
  }
  window._dumpParsed=data.parsed;
  el.innerHTML='<div class="dump-result"><div class="dump-result-title">✓ Found '+data.parsed.length+' mention'+
    (data.parsed.length!==1?'s':'')+
    '</div>'+
    data.parsed.map((p,i)=>
      '<div class="dump-match">'+
        '<div class="dump-match-name">'+p.name+' <span style="font-size:11px;color:'+(p.matched?'var(--connected)':'var(--warning)')+'">'+(p.matched?'✓ in roster':'⚠ not found')+'</span></div>'+
        '<div class="dump-match-sum">'+p.summary.slice(0,300)+'</div>'+
        (p.matched&&canEdit?'<div class="dump-match-actions"><button class="add-btn" onclick="applyDump('+i+')">Log as Hangout</button></div>':'')+
      '</div>'
    ).join('')+
  '</div>';
}
function getAllStudentNames() {
  const names=[];
  for (const sk of ['hs','ms']) (DATA[sk].students||[]).forEach(p=>names.push(p.name));
  return names;
}
async function applyDump(i) {
  const p=window._dumpParsed[i];
  const k=findStudentKey(p.name);
  if (!k) { showToast('Student not found','error'); return; }
  const person=DATA[k.sk].students[k.index];
  const interaction={leader:currentUser?currentUser.name:'Unknown',date:new Date().toISOString().slice(0,10),summary:p.summary,createdAt:new Date().toISOString(),leaderEmail:currentUser?currentUser.email:''};
  const res=await fetch('/api/student/interactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sk:k.sk,id:person.id,rowIndex:person.rowIndex,studentName:p.name,interaction})});
  const data=await res.json();
  if (data.success) showToast('✓ Logged for '+p.name,'ok');
  else showToast('Failed: '+(data.error||''),'error');
}

`;
