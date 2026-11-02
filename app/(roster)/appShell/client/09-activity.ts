// The Activity feed.
// Part of the roster's client script; see ./index.ts.
export const ACTIVITY = `// ── ACTIVITY FEED ─────────────────────────────────────────────
// Every kind of "did something" event shares the same activity: log now (see
// api/student/interactions, connections, notes, and api/students/write) — a
// hangout, a parent connection, a note, or a student added/edited/removed.
// Older records from before the type field existed have none, and those are
// all hangouts (the only writer at the time), so a missing type defaults to it.
function activityCopy(item, leaderName) {
  const student='<span>'+item.studentName+'</span>';
  switch (item.type) {
    case 'connection': return { names: leaderName+' connected with '+student+'’s family', summary: item.summary || 'No note added.' };
    case 'note': return { names: leaderName+' added a note about '+student, summary: item.summary || '' };
    case 'student_added': return { names: leaderName+' added '+student+' to the roster', summary: null };
    case 'student_updated': return { names: leaderName+' updated '+student+'’s details', summary: null };
    case 'student_removed': return { names: leaderName+' removed '+student+' from the roster', summary: null };
    case 'mentor_changed': return { names: leaderName+' changed '+student+'’s mentor', summary: dashEsc(item.summary || '') };
    case 'mentor_bulk': return { names: leaderName+' reassigned mentors', summary: dashEsc(item.summary || '') };
    case 'apprentice_changed': return { names: leaderName+' updated '+student+'’s apprentice status', summary: dashEsc(item.summary || '') };
    case 'apprentice_bulk': return { names: leaderName+' updated student apprentices', summary: dashEsc(item.summary || '') };
    default: return { names: student+' × '+leaderName, summary: item.summary || '' }; // hangout, or a legacy untyped record
  }
}

async function loadActivityFeed() {
  const el=document.getElementById('activity-feed');
  el.innerHTML='<div class="loader"><div class="loader-ring"></div></div>';
  try {
    await loadLeaderDirectory();
    const res=await fetch('/api/activity/recent');
    const data=await res.json();
    const items=data.items||[];
    if (!items.length) { el.innerHTML='<div class="empty"><div class="empty-icon">🌱</div><p>No activity yet.</p></div>'; return; }
    el.innerHTML=items.map(item=>{
      const student=findStudent(item.studentName);
      // A removed student has nothing to navigate to — don't offer a click
      // that silently does nothing.
      const canNavigate=!!student;
      const sThumb=student?driveThumb(student.photoUrl):null;
      const leaderName=item.leader||'Someone';
      const lp=findLeaderByEmail(item.leaderEmail);
      const leaderThumb=lp&&lp.photoUrl?(driveThumb(lp.photoUrl)||lp.photoUrl):null;
      const sg=GRADIENTS[0], lg=GRADIENTS[2];
      const {names, summary}=activityCopy(item, leaderName);
      const clickAttrs=canNavigate
        ? ' tabindex="0" role="button" aria-label="View '+item.studentName+'" onclick="navigateToStudent(\\''+item.studentName+'\\')"'
        : '';
      return '<div class="act-card'+(canNavigate?'':' act-card-static')+'"'+clickAttrs+'>'+
        '<div class="act-header">'+
          '<div class="act-avatars">'+
            '<div class="act-av"><div class="av-fallback" style="background:'+sg+'">'+initials(item.studentName)+'</div>'+
            (sThumb?'<img src="'+sThumb+'" onerror="this.style.display=\\'none\\'">':'')+
            '</div>'+
            '<div class="act-av"><div class="av-fallback" style="background:'+lg+'">'+initials(leaderName)+'</div>'+
            (leaderThumb?'<img src="'+leaderThumb+'" onerror="this.style.display=\\'none\\'">':'')+
            '</div>'+
          '</div>'+
          '<div class="act-info">'+
            '<div class="act-names">'+names+'</div>'+
            '<div class="act-time">'+(item.date?formatDate(item.date)+' · ':'')+timeAgo(item.createdAt)+'</div>'+
          '</div>'+
        '</div>'+
        (summary!==null?'<div class="act-summary">'+summary.slice(0,200)+(summary.length>200?'…':'')+'</div>':'')+
      '</div>';
    }).join('');
    const cards=el.querySelectorAll('.act-card');
    items.forEach((item,i)=>{
      const card=cards[i]; if(!card) return;
      if (card.hasAttribute('tabindex')) {
        card.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToStudent(item.studentName); }
        });
      }
      const avatars=card.querySelectorAll('.act-av');
      const studentImg=avatars[0]&&avatars[0].querySelector('img');
      if (studentImg) {
        const student=findStudent(item.studentName);
        studentImg.onload=()=>{ studentImg.classList.add('loaded'); applyCropToImg(studentImg, student&&student.photoCrop); };
      }
      const leaderImg=avatars[1]&&avatars[1].querySelector('img');
      if (leaderImg) {
        const lp=findLeaderByEmail(item.leaderEmail);
        leaderImg.onload=()=>{ leaderImg.classList.add('loaded'); applyCropToImg(leaderImg, lp&&lp.photoCrop); };
      }
    });
  } catch(e) { el.innerHTML='<div class="empty"><p>Could not load activity.</p></div>'; }
}

function findStudent(name) {
  for (const sk of ['hs','ms']) {
    const s=(DATA[sk].students||[]).find(p=>p.name===name);
    if (s) return s;
  }
  return null;
}
function findStudentKey(name) {
  for (const sk of ['hs','ms']) {
    const idx=(DATA[sk].students||[]).findIndex(p=>p.name===name);
    if (idx>=0) return {sk,index:idx};
  }
  return null;
}
function navigateToStudent(name) {
  const k=findStudentKey(name);
  if (k) openStudentDetail(k.sk,k.index);
}

`;
