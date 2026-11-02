// Adminland: users, roles, leader photos and emails.
// Part of the roster's client script; see ./index.ts.
export const ADMINLAND = `// ── ADMIN ─────────────────────────────────────────────────────

function openAdminland() {
  loadAdminPanel();
}


function openAdminUsers() {
  showScreen('admin');
  switchAdminTab('users', document.querySelector('.admin-tab[onclick*="users"]'));
  loadAdminUsers();
}

async function loadAdminPanel() {
  showScreen('admin');
  await Promise.all([loadAdminOverview(),loadAdminUsers(),loadAdminMetrics(),loadAdminMentors()]);
}
function switchAdminTab(name,btn) {
  document.querySelectorAll('.admin-sec').forEach(s=>s.classList.remove('active'));
  document.getElementById('admin-'+name).classList.add('active');
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
}
async function loadAdminOverview() {
  const total=['hs','ms'].reduce((a,sk)=>a+(DATA[sk].students||[]).length,0);
  const conn=['hs','ms'].reduce((a,sk)=>a+(DATA[sk].students||[]).filter(isConnected).length,0);
  let ints=0;
  try{const r=await fetch('/api/activity/stats');const d=await r.json();ints=d.totalInteractions||0;}catch(e){}
  document.getElementById('admin-stats-grid').innerHTML=
    kpi(total,'Total Students')+kpi(conn,'Connected')+kpi(ints,'Hangouts Logged')+
    kpi((DATA.hs.students||[]).filter(p=>statusOf(p)==='core').length,'HS Core')+
    kpi((DATA.ms.students||[]).filter(p=>statusOf(p)==='core').length,'MS Core');
}
function kpi(n,label) { return '<div class="kpi"><div class="kpi-val">'+n+'</div><div class="kpi-label">'+label+'</div></div>'; }
function stat(n,label) { return '<div class="stat"><div class="stat-val">'+n+'</div><div class="stat-label">'+label+'</div></div>'; }
async function loadAdminUsers() {
  const res=await fetch('/api/admin/users');
  const data=await res.json();
  const users=data.users||[];
  adminUsersCache=users;
  const el=document.getElementById('admin-users-table');
  if (!users.length) { el.innerHTML='<div class="empty"><p>No users.</p></div>'; return; }
  const selfEmail=(currentUser?.email||'').toLowerCase();
  el.innerHTML='<table class="user-table"><thead><tr><th></th><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead><tbody>'+
    users.map((u,i)=>{
      const isSelf=u.email.toLowerCase()===selfEmail;
      const isAdmin=u.role==='admin';
      const isLeader=u.role==='leader';
      const isPending=u.role==='pending';
      const leaderChecked=(isLeader||isAdmin)?'checked':'';
      const leaderDisabled=(isSelf||isAdmin)?'disabled':'';
      const avatarHtml='<div class="admin-user-avatar" data-email="'+esc(u.email)+'" onclick="openAdminUserPhotoEditor(this.dataset.email)" title="'+(u.photoUrl?'Change photo':'Add photo')+'">'+
        (u.photoUrl
          ? '<img src="'+esc((driveThumb(u.photoUrl)||u.photoUrl))+'" alt="" onerror="this.style.display=\\'none\\'">'
          : '<div class="av-fallback" style="background:'+GRADIENTS[i % GRADIENTS.length]+'">'+initials(u.name)+'</div>')+
        '<div class="admin-user-avatar-overlay">📷</div>'+
      '</div>';
      return '<tr data-email="'+esc(u.email)+'"'+(isSelf?' style="background:var(--accent-glow)"':'')+'><td class="avatar-cell">'+avatarHtml+'</td><td>'+esc(u.name)+(isSelf?' <span style="font-size:10px;color:var(--muted)">(you)</span>':'')+'</td>'+
        '<td style="color:var(--muted)">'+esc(u.email)+'</td>'+
        '<td><span class="role-badge '+esc(u.role)+'">'+esc(u.role)+'</span></td>'+
        '<td style="color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;font-size:11px">'+(u.createdAt?new Date(u.createdAt).toLocaleDateString():'—')+'</td>'+
        '<td><div class="btn-row">'+
          (isPending?'<button class="role-btn approve" onclick="updateUser(this.closest(\\'tr\\').dataset.email,\\'leader\\')">Approve</button>':'')+
          (isPending&&!isSelf?'<button class="role-btn revoke" onclick="declineUser(this.closest(\\'tr\\').dataset.email)">Decline</button>':'')+
          (!isAdmin?'<label class="leader-toggle" title="Toggle leader access"><input type="checkbox" '+leaderChecked+' '+leaderDisabled+' onchange="toggleLeader(this.closest(\\'tr\\').dataset.email,this.checked)"><span>Leader</span></label>':'')+
          (!isSelf&&!isAdmin?'<button class="role-btn mk-admin" onclick="updateUser(this.closest(\\'tr\\').dataset.email,\\'admin\\')">→ Admin</button>':'')+
          (!isSelf&&!isPending?'<button class="role-btn revoke" onclick="updateUser(this.closest(\\'tr\\').dataset.email,\\'pending\\')">Revoke</button>':'')+
          '<button class="role-btn" data-email="'+esc(u.email)+'" onclick="changeUserEmail(this.dataset.email)" title="Change sign-in email">Change email</button>'+
          (u.photoUrl?'<button class="role-btn" data-email="'+esc(u.email)+'" onclick="removeAdminUserPhoto(this.dataset.email)" title="Remove photo">Remove photo</button>':'')+
        '</div></td></tr>';
    }).join('')+'</tbody></table>';
  el.querySelectorAll('.admin-user-avatar').forEach(wrap=>{
    const img=wrap.querySelector('img'); if(!img) return;
    const u=users.find(x=>x.email===wrap.dataset.email);
    if(!u) return;
    img.onload=()=>{ img.classList.add('loaded'); applyCropToImg(img, u.photoCrop); };
  });
}
async function toggleLeader(email, isLeader) {
  await updateUser(email, isLeader ? 'leader' : 'approved');
}
async function loadAdminMetrics() {
  const el=document.getElementById('admin-metrics-content');
  try {
    const r=await fetch('/api/activity/stats'); const d=await r.json();
    el.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:4px">'+
      '<div class="panel"><div class="panel-title">🏆 Most Active Leaders</div>'+
      (d.topLeaders||[]).map(l=>'<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><span>'+esc(l.name)+'</span><span style="color:var(--accent)">'+l.count+' hangouts</span></div>').join('')+
      (!(d.topLeaders||[]).length?'<p style="color:var(--muted);font-size:13px">No data yet</p>':'')+
      '</div>'+
      '<div class="panel"><div class="panel-title">❤️ Most Visited</div>'+
      (d.topStudents||[]).map(s=>'<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><span>'+esc(s.name)+'</span><span style="color:var(--accent)">'+s.count+' visits</span></div>').join('')+
      (!(d.topStudents||[]).length?'<p style="color:var(--muted);font-size:13px">No data yet</p>':'')+
      '</div></div>'+
      '<div class="panel" style="margin-top:16px"><div class="panel-title">📊 Overview</div>'+
      '<div class="stats" style="margin-top:12px">'+
        stat(d.totalInteractions||0,'Total Interactions')+stat(d.uniqueLeaders||0,'Active Leaders')+
        stat(d.uniqueStudents||0,'Students Visited')+stat(d.thisMonth||0,'This Month')+
      '</div></div>';
  } catch(e) { el.innerHTML='<div class="empty"><p>Could not load.</p></div>'; }
}
async function updateUser(email,role) {
  if (currentUser && email.toLowerCase()===currentUser.email.toLowerCase() && currentUser.role==='admin' && role!=='admin') {
    showToast('You cannot change your own admin status','error'); return;
  }
  const res=await fetch('/api/admin/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,role})});
  const data=await res.json();
  if (data.success) { showToast('✓ Updated','ok'); loadAdminUsers(); }
  else showToast(data.error||'Failed','error');
}

// Their password, notes and mentor assignments all move to the new address,
// and anyone already signed in stays signed in.
async function changeUserEmail(email) {
  const next=window.prompt('New sign-in email for '+email+':', email);
  if (next===null) return;
  const newEmail=next.trim().toLowerCase();
  if (!newEmail || newEmail===email.toLowerCase()) return;
  const res=await fetch('/api/admin/users/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,newEmail})});
  const data=await res.json().catch(()=>({error:'Failed ('+res.status+')'}));
  if (!data.success) { showToast(data.error||'Failed','error'); return; }
  if (currentUser && currentUser.email && currentUser.email.toLowerCase()===email.toLowerCase()) {
    currentUser.email=data.email;
    const el=document.getElementById('profile-display-email'); if(el) el.textContent=data.email;
  }
  showToast('✓ Email changed','ok');
  loadAdminUsers();
}

// Matches declining from the email link: the account is deleted outright and
// the person is told nothing. They can request again later if they want to.
async function declineUser(email) {
  if (!window.confirm('Decline and delete the request from '+email+'?\\n\\nThey will not be notified.')) return;
  const res=await fetch('/api/admin/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,action:'delete'})});
  const data=await res.json();
  if (data.success) { showToast('Request declined','ok'); loadAdminUsers(); }
  else showToast(data.error||'Failed','error');
}

`;
