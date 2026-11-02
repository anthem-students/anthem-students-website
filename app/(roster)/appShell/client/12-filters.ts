// Search, filters and sort for the roster grid.
// Part of the roster's client script; see ./index.ts.
export const FILTERS = `// ── FILTER / SORT ────────────────────────────────────────────
function getAllStudents() {
  const all=[];
  for (const sk of ['hs','ms']) (DATA[sk].students||[]).forEach((p,i)=>all.push({...p,_sk:sk,_idx:i}));
  return all;
}
function populateFilterDropdowns() {
  const all=getAllStudents();
  const grades=[...new Set(all.map(p=>p.grade).filter(Boolean))].sort((a,b)=>+a-+b);
  const schools=[...new Set(all.map(p=>p.school).filter(Boolean))].sort();
  const gradeEl=document.getElementById('filter-grade');
  const schoolEl=document.getElementById('filter-school');
  if(gradeEl){
    const cur=gradeEl.value;
    gradeEl.innerHTML='<option value="">All Grades</option>'+grades.map(g=>'<option value="'+esc(g)+'">Grade '+esc(g)+'</option>').join('');
    gradeEl.value=cur;
  }
  if(schoolEl){
    const cur=schoolEl.value;
    schoolEl.innerHTML='<option value="">All Schools</option>'+schools.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
    schoolEl.value=cur;
  }
  const mentorEl=document.getElementById('filter-mentor');
  if(mentorEl){
    const cur=mentorEl.value;
    const unassigned=all.filter(p=>!mentorsOf(p).primary).length;
    // Your own entry stays listed even at zero, so "My students" always has
    // something to select.
    const me=myMentorKey();
    const list=mentorDirectory().filter(m=>m.primary+m.secondary>0 || m.key===me);
    mentorEl.innerHTML='<option value="">All Mentors</option>'+
      '<option value="__none">No primary mentor ('+unassigned+')</option>'+
      list.map(m=>'<option value="'+esc(m.key)+'">'+esc(m.name)+(m.isLeader?'':' (volunteer)')+' ('+(m.primary+m.secondary)+')</option>').join('');
    mentorEl.value=cur;
  }
  const myBtn=document.getElementById('my-students-btn');
  if(myBtn) myBtn.style.display=myMentorKey()?'':'none';
  const apprenticeEl=document.getElementById('filter-apprentice');
  if(apprenticeEl){
    const n=all.filter(p=>p.apprentice).length;
    const opt=apprenticeEl.querySelector('option[value="yes"]');
    if(opt) opt.textContent='Apprentices only ('+n+')';
  }
}
function applyFilters() {
  const q=(document.getElementById('roster-search').value||'').toLowerCase().trim();
  const gradeF=document.getElementById('filter-grade').value;
  const schoolF=document.getElementById('filter-school').value;
  const connF=document.getElementById('filter-connected').value;
  const statusF=(document.getElementById('filter-status')||{}).value||'';
  const mentorF=(document.getElementById('filter-mentor')||{}).value||'';
  const apprenticeF=(document.getElementById('filter-apprentice')||{}).value||'';
  const sortF=document.getElementById('filter-sort').value;
  ['hs','ms'].forEach(sk => {
    const gridEl=document.getElementById(sk+'-grid');
    if(!gridEl) return;
    const items=DATA[sk].students||[];
    let filtered=items.map((p,i)=>({p,i})).filter(({p})=>{
      if(q && !(p.name||'').toLowerCase().includes(q) && !(p.school||'').toLowerCase().includes(q) && !(p.grade||'').toLowerCase().includes(q)) return false;
      if(gradeF && p.grade!==gradeF) return false;
      if(schoolF && p.school!==schoolF) return false;
      if(statusF && statusOf(p)!==statusF) return false;
      if(connF && connectionState(p)!==connF) return false;
      if(mentorF && !matchesMentorFilter(p, mentorF)) return false;
      if(apprenticeF && !!p.apprentice!==(apprenticeF==='yes')) return false;
      return true;
    });
    if(sortF) {
      filtered.sort((a,b)=>{
        switch(sortF){
          case 'name-asc': return (a.p.name||'').localeCompare(b.p.name||'');
          case 'name-desc': return (b.p.name||'').localeCompare(a.p.name||'');
          case 'grade-asc': return (+a.p.grade||99)-(+b.p.grade||99);
          case 'grade-desc': return (+b.p.grade||0)-(+a.p.grade||0);
          case 'status-asc': return STATUS_ORDER.indexOf(statusOf(a.p))-STATUS_ORDER.indexOf(statusOf(b.p));
          case 'interactions-desc': return (+b.p.interactionCount||0)-(+a.p.interactionCount||0);
          case 'interactions-asc': return (+a.p.interactionCount||0)-(+b.p.interactionCount||0);
          case 'mentor-asc': {
            // Unassigned sinks to the bottom rather than sorting as "".
            const an=mentorName(mentorsOf(a.p).primary), bn=mentorName(mentorsOf(b.p).primary);
            if(!an!==!bn) return an?-1:1;
            return an.localeCompare(bn) || (a.p.name||'').localeCompare(b.p.name||'');
          }
          default: return 0;
        }
      });
    }
    gridEl.innerHTML='';
    if(!filtered.length){
      gridEl.innerHTML='<div class="empty"><div class="empty-icon">🔍</div><p>No students match your filters</p></div>';
      return;
    }
    // The card's index has to stay the student's index in DATA, not their
    // position in the filtered list — every action on the card looks them up
    // by it.
    filtered.forEach(({p,i})=>gridEl.appendChild(makeCard(p,i,sk)));
  });
  document.querySelectorAll('.edit-gated').forEach(el=>{el.style.display=canEdit?'':'none';});
  updateFilterCount();
}
function clearSearch() {
  const el = document.getElementById('roster-search');
  if (el) { el.value=''; applyFilters(); }
}
function clearFilters() {
  document.getElementById('roster-search').value='';
  document.getElementById('filter-grade').value='';
  document.getElementById('filter-school').value='';
  document.getElementById('filter-connected').value='';
  const statusEl=document.getElementById('filter-status');
  if(statusEl) statusEl.value='';
  const mentorEl=document.getElementById('filter-mentor');
  if(mentorEl) mentorEl.value='';
  const apprenticeEl=document.getElementById('filter-apprentice');
  if(apprenticeEl) apprenticeEl.value='';
  saveMyStudents(false);
  document.getElementById('filter-sort').value='';
  const panel = document.getElementById('filter-panel');
  if (panel) panel.classList.remove('open');
  const btn = document.getElementById('filter-toggle-btn');
  if (btn) { btn.classList.remove('active','has-filters'); }
  updateFilterCount();
  renderAll();
}
function toggleFilterPanel() {
  const panel = document.getElementById('filter-panel');
  const btn = document.getElementById('filter-toggle-btn');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  if (btn) btn.classList.toggle('active', !isOpen);
}
function updateFilterCount() {
  const count = [
    (document.getElementById('filter-grade')||{}).value,
    (document.getElementById('filter-school')||{}).value,
    (document.getElementById('filter-connected')||{}).value,
    (document.getElementById('filter-status')||{}).value,
    (document.getElementById('filter-mentor')||{}).value,
    (document.getElementById('filter-apprentice')||{}).value,
    (document.getElementById('filter-sort')||{}).value,
  ].filter(Boolean).length;
  const myBtn = document.getElementById('my-students-btn');
  if (myBtn) myBtn.classList.toggle('active', isMyStudentsOn());
  const badge = document.getElementById('filter-count');
  const btn = document.getElementById('filter-toggle-btn');
  if (badge) { badge.textContent = count||''; badge.classList.toggle('visible', count>0); }
  if (btn) btn.classList.toggle('has-filters', count>0);
  const sc = document.getElementById('search-clear');
  if (sc) {
    const q = (document.getElementById('roster-search')||{}).value||'';
    sc.classList.toggle('visible', q.length>0);
  }
}

`;
