// Photo upload, compression, thumbnails and the non-destructive crop editor.
// Part of the roster's client script; see ./index.ts.
export const PHOTO_CROP = `// ── PHOTO CROP / COMPRESS ─────────────────────────────────────
// cropOffX/cropOffY are fractions of the editing preview's own CSS width —
// resolution-independent, so the same numbers reproduce the same visual crop
// at any avatar size via applyCropToImg() below. cropZoom is likewise a
// resolution-independent multiplier on the "fit-the-shorter-side" baseline
// (exactly what CSS object-fit:cover does at zoom=1).
let cropImg=null, cropZoom=1, cropOffX=0, cropOffY=0, cropIsDragging=false, cropDragStartX=0, cropDragStartY=0;
let cropCallback=null, cropPendingFile=null;
// Which <input type=file> "Choose a different photo" should reopen, when the
// crop modal was opened on an *existing* photo (recrop) rather than a fresh
// pick. Null hides that link — a fresh pick has nothing to "go back" to.
let cropReplaceInputId=null;

function onSharedPhotoSelected(input) {
  const file=input.files[0];
  // Cleared straight away — otherwise picking the same file again (after a
  // Cancel, say) fires no change event and the button looks dead.
  input.value='';
  if(!file) return;
  if(file.size>40*1024*1024){showToast('Photo is too large — try a smaller photo','error');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      cropImg=img; cropZoom=1; cropOffX=0; cropOffY=0; cropPendingFile=file;
      cropReplaceInputId=null;
      setCropReplaceRowVisible(false);
      openModal('crop-modal');
      renderCropPreview();
      initCropDrag();
      const zoomEl=document.getElementById('crop-zoom');
      zoomEl.max=cropZoomBounds().max; zoomEl.value=1;
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

// Re-opens the crop editor on a photo that's already uploaded (Drive or
// Supabase Storage), so a leader can fix the crop without picking a new
// file. Loads the display-sized thumbnail directly — no more canvas pixel
// readback happens anywhere in this flow, so there's nothing left that a
// missing CORS header could taint.
function loadExistingCropImage(url) {
  if (!url) return;
  showToast('Loading photo…');
  cropPendingFile=null;
  const img=new Image();
  img.onload=()=>{
    cropImg=img; cropZoom=1; cropOffX=0; cropOffY=0;
    setCropReplaceRowVisible(true);
    openModal('crop-modal');
    renderCropPreview();
    initCropDrag();
    const zoomEl=document.getElementById('crop-zoom');
    zoomEl.max=cropZoomBounds().max; zoomEl.value=1;
  };
  img.onerror=()=>showToast('Could not load photo for editing','error');
  img.src=driveThumb(url,1600)||url;
}

function setCropReplaceRowVisible(visible) {
  const row=document.getElementById('crop-replace-row');
  if(row) row.style.display=visible?'':'none';
}

// The crop modal's "choose a different photo" escape hatch: keeps whatever
// cropCallback the recrop entry point already set up, just swaps in a
// freshly picked file instead of the existing photo. Safe because every
// cropCallback now takes the picked File as its second argument and decides
// whether to upload based on whether one was actually passed, rather than on
// which function happened to install the callback.
function cropPickDifferentPhoto() {
  const inputId=cropReplaceInputId;
  closeModal('crop-modal');
  cropImg=null;
  if (inputId) {
    const input=document.getElementById(inputId);
    if (input) { input.value=''; input.click(); }
  }
}

// crop: {zoom,offX,offY}. file: the picked File when there's a genuine new
// original to upload (fresh pick, or "choose a different photo instead");
// null for a same-photo recrop, where photoUrl never changes.
async function profileCropCallback(crop, file) {
  let url=currentUser.photoUrl;
  if (file) {
    const data=await uploadOriginalPhoto(file,'leader');
    if(!data.url){showToast(data.error||'Upload failed','error');return;}
    url=data.url;
  }
  if (await saveOwnPhoto(url, crop)) showToast('✓ Photo updated','ok');
}

// Saves the signed-in leader's own photo. Used to report success whether or
// not the save landed.
async function saveOwnPhoto(url, crop) {
  try {
    const res=await fetch('/api/profile/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({photoUrl:url||'',photoCrop:crop})});
    const d=await res.json().catch(()=>({}));
    if(!res.ok||!d.success) throw new Error(d.error||('error '+res.status));
    currentUser.photoUrl=d.photoUrl||null; currentUser.photoCrop=d.photoCrop||null;
  } catch(e) {
    showToast('Couldn’t save photo — '+e.message,'error');
    return false;
  }
  paintProfileAvatar(); updateNav(); refreshLeaderDirectory();
  return true;
}

// Leader faces on mentor pills, notes and the activity feed come from the
// cached leader directory — refetch it so a new photo shows without a reload.
function refreshLeaderDirectory() {
  leaderDirectoryPromise=null;
  return loadLeaderDirectory().then(()=>{ if(currentUser) renderAll(); });
}

function recropProfilePhoto() {
  if (!currentUser || !currentUser.photoUrl) return;
  cropReplaceInputId='profile-photo-input';
  cropCallback=profileCropCallback;
  loadExistingCropImage(currentUser.photoUrl);
}

async function editFormCropCallback(crop, file) {
  let url=v('ef-photoUrl');
  if (file) {
    const data=await uploadOriginalPhoto(file,'student');
    if(!data.url){showToast(data.error||'Upload failed','error');return;}
    url=data.url; sv('ef-photoUrl',url);
    efThumbUrl=data.thumbUrl||null; efThumbFor=url;
  }
  efPhotoCrop=crop;
  updateEditPhotoPreview();
  showToast(file?'✓ Uploaded':'✓ Crop updated','ok');
}

// Same as the profile avatar: tap the photo to recrop it, or to pick one
// when there isn't one yet.
function editPhotoPreviewClick() {
  if (v('ef-photoUrl')) recropEditFormPhoto();
  else { const input=document.getElementById('photo-upload-input'); if(input) input.click(); }
}
function recropEditFormPhoto() {
  const url=v('ef-photoUrl');
  if (!url) return;
  cropReplaceInputId='photo-upload-input';
  cropCallback=editFormCropCallback;
  loadExistingCropImage(url);
}

function studentDetailCropCallback(sk, index) {
  return async (crop, file) => {
    const person=DATA[sk].students[index];
    let url=person.photoUrl;
    if (file) {
      const data=await uploadOriginalPhoto(file,'student');
      if(!data.url){showToast(data.error||'Upload failed','error');return;}
      url=data.url;
      const params=new URLSearchParams({action:'update',payload:JSON.stringify({sheet:sk,id:person.id,rowIndex:person.rowIndex,fields:{photoUrl:url,thumbUrl:data.thumbUrl||null}})});
      const res=await fetch('/api/students/write', writeInit(params));
      const saved=await res.json().catch(()=>({error:'Save failed ('+res.status+')'}));
      if(!res.ok||saved.error){showToast(saved.error||'Could not save the photo','error');return;}
      person.photoUrl=url; person.thumbUrl=data.thumbUrl||null;
    }
    person.photoCrop=crop;
    await savePhotoCrop(sk, person.id, crop);
    renderStudentDetail(sk,index);
    showToast('✓ Photo updated','ok');
  };
}

function recropStudentPhoto(sk, index) {
  if (!canEdit) return;
  const person=DATA[sk].students[index];
  if (!person.photoUrl) return;
  cropReplaceInputId='shared-photo-input';
  cropCallback=studentDetailCropCallback(sk,index);
  loadExistingCropImage(person.photoUrl);
}

// Lets an admin change another leader's photo from Adminland's Users tab —
// same shared crop modal as everywhere else, just a fourth callback plugged
// into it. url stays null when there's no new file (a pure recrop); the
// server route treats null as "leave photoUrl alone."
function adminUserPhotoCropCallback(email) {
  return async (crop, file) => {
    let url = null;
    if (file) {
      const data = await uploadOriginalPhoto(file, 'leader');
      if (!data.url) { showToast(data.error || 'Upload failed', 'error'); return; }
      url = data.url;
    }
    if (await saveAdminUserPhoto(email, url, crop)) showToast('✓ Photo updated', 'ok');
  };
}

async function saveAdminUserPhoto(email, url, crop) {
  try {
    const res = await fetch('/api/admin/users/photo', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, photoUrl: url, photoCrop: crop })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) throw new Error(d.error || ('error '+res.status));
    // An admin editing their own row here is also editing the nav avatar.
    if (currentUser && (currentUser.email||'').toLowerCase() === String(email).toLowerCase()) {
      currentUser.photoUrl = d.photoUrl || null; currentUser.photoCrop = d.photoCrop || null;
      updateNav();
    }
  } catch (e) {
    showToast('Couldn’t save photo — '+e.message, 'error');
    return false;
  }
  loadAdminUsers();
  refreshLeaderDirectory();
  return true;
}

async function removeAdminUserPhoto(email) {
  if (await saveAdminUserPhoto(email, '', null)) showToast('Photo removed', 'ok');
}

// Looks the photo up from the last Users load rather than taking it as an
// argument — it used to be pasted into an inline onclick string.
function openAdminUserPhotoEditor(email) {
  const u = adminUsersCache.find(x => x.email === email);
  const existingUrl = u && u.photoUrl;
  cropCallback = adminUserPhotoCropCallback(email);
  if (existingUrl) {
    cropReplaceInputId = 'shared-photo-input';
    loadExistingCropImage(existingUrl);
  } else {
    cropReplaceInputId = null;
    document.getElementById('shared-photo-input').click();
  }
}

// Applies stored crop metadata to a displayed <img> by explicit width/height/
// left/top percentages, sized against the shorter side (base) the same way
// zoom=1 already matches CSS object-fit:cover. iw/ih default to the image's
// own natural size but can be passed explicitly for the editor preview,
// where cropImg's dimensions are already known before crop-preview-img's own
// load has necessarily fired for the *new* src.
function applyCropToImg(imgEl, crop, iw, ih) {
  if (!crop || !crop.zoom) return;
  iw = iw || imgEl.naturalWidth; ih = ih || imgEl.naturalHeight;
  if (!iw || !ih) return;
  const base=Math.min(iw,ih);
  const wPct=(iw/base)*crop.zoom*100, hPct=(ih/base)*crop.zoom*100;
  imgEl.style.width=wPct+'%'; imgEl.style.height=hPct+'%';
  imgEl.style.left=(50*(1-wPct/100)+crop.offX*100)+'%';
  imgEl.style.top=(50*(1-hPct/100)+crop.offY*100)+'%';
  imgEl.style.right='auto'; imgEl.style.bottom='auto'; // inset:0 sets these; clear or the box is over-constrained
}

function applyCropFromDataset(imgEl) {
  let crop=null;
  try { crop=JSON.parse(imgEl.dataset.crop||'null'); } catch(e) {}
  applyCropToImg(imgEl, crop);
}

function renderCropPreview() {
  const img=document.getElementById('crop-preview-img');
  if(!img||!cropImg) return;
  if(img.src!==cropImg.src) img.src=cropImg.src;
  applyCropToImg(img, {zoom:cropZoom, offX:cropOffX, offY:cropOffY}, cropImg.width, cropImg.height);
}

// A pan can't be allowed to pull the image's edge inside the container —
// unlike the old canvas bake, an unclamped offset here would be saved and
// shown as a gap/background leak everywhere the photo displays, not just
// visible-and-fixable in the editor.
function clampCropOffsets() {
  if (!cropImg) return;
  const base=Math.min(cropImg.width,cropImg.height);
  const maxX=Math.max(0,((cropImg.width/base)*cropZoom-1)/2);
  const maxY=Math.max(0,((cropImg.height/base)*cropZoom-1)/2);
  cropOffX=Math.min(maxX,Math.max(-maxX,cropOffX));
  cropOffY=Math.min(maxY,Math.max(-maxY,cropOffY));
}

// Caps zoom relative to the source image's own resolution so a small source
// (e.g. a re-uploaded 100x100 avatar) can't be zoomed into visible blockiness.
function cropZoomBounds() {
  if(!cropImg) return {min:1,max:8};
  const base=Math.min(cropImg.width,cropImg.height);
  const wrap=document.querySelector('.crop-canvas-wrap');
  const cssSize=(wrap&&wrap.clientWidth)||300;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const maxByRes=Math.max(1.2,(base*8)/(cssSize*dpr));
  return {min:1,max:Math.min(8,maxByRes)};
}

function setCropZoom(z) {
  const {min,max}=cropZoomBounds();
  cropZoom=Math.min(max,Math.max(min,z));
  clampCropOffsets();
  const zoomEl=document.getElementById('crop-zoom');
  if(zoomEl) zoomEl.value=cropZoom;
  renderCropPreview();
}

function resetCropView() {
  cropZoom=1; cropOffX=0; cropOffY=0;
  const zoomEl=document.getElementById('crop-zoom');
  if(zoomEl) zoomEl.value=1;
  renderCropPreview();
}

function initCropDrag() {
  const wrap=document.querySelector('.crop-canvas-wrap');
  if(!wrap||wrap._cropDragInit) return;
  wrap._cropDragInit=true;

  // Mouse pan (desktop). preventDefault stops the browser's native "drag this
  // image out to the desktop" gesture from hijacking the mousedown before our
  // own drag ever gets a chance to move anything.
  wrap.addEventListener('mousedown',e=>{
    e.preventDefault();
    const cssSize=wrap.clientWidth||300;
    cropIsDragging=true;cropDragStartX=e.clientX-cropOffX*cssSize;cropDragStartY=e.clientY-cropOffY*cssSize;
  });
  window.addEventListener('mousemove',e=>{
    if(!cropIsDragging)return;
    const cssSize=wrap.clientWidth||300;
    cropOffX=(e.clientX-cropDragStartX)/cssSize; cropOffY=(e.clientY-cropDragStartY)/cssSize;
    clampCropOffsets(); renderCropPreview();
  });
  window.addEventListener('mouseup',()=>{cropIsDragging=false;});

  // Wheel-to-zoom (desktop) — prevents page scroll under the modal.
  wrap.addEventListener('wheel',e=>{
    e.preventDefault();
    const delta=-e.deltaY*0.0015;
    setCropZoom(cropZoom+delta*cropZoom);
  },{passive:false});

  // Double-click / double-tap resets pan+zoom.
  wrap.addEventListener('dblclick',()=>resetCropView());
  let lastTapTime=0;
  wrap.addEventListener('touchend',e=>{
    const now=Date.now();
    if(now-lastTapTime<300 && e.touches.length===0) resetCropView();
    lastTapTime=now;
  },{passive:true});

  // Touch: single-finger pan, two-finger pinch-to-zoom.
  let pinchStartDist=0, pinchStartZoom=1;
  const touchDist=(t0,t1)=>Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY);

  wrap.addEventListener('touchstart',e=>{
    if(e.touches.length===2){
      cropIsDragging=false;
      pinchStartDist=touchDist(e.touches[0],e.touches[1]);
      pinchStartZoom=cropZoom;
    } else if(e.touches.length===1){
      const t=e.touches[0];
      const cssSize=wrap.clientWidth||300;
      cropIsDragging=true;cropDragStartX=t.clientX-cropOffX*cssSize;cropDragStartY=t.clientY-cropOffY*cssSize;
    }
  },{passive:true});

  wrap.addEventListener('touchmove',e=>{
    if(e.touches.length===2){
      const dist=touchDist(e.touches[0],e.touches[1]);
      if(pinchStartDist>0) setCropZoom(pinchStartZoom*(dist/pinchStartDist));
    } else if(e.touches.length===1 && cropIsDragging){
      const t=e.touches[0];
      const cssSize=wrap.clientWidth||300;
      cropOffX=(t.clientX-cropDragStartX)/cssSize;cropOffY=(t.clientY-cropDragStartY)/cssSize;
      clampCropOffsets(); renderCropPreview();
    }
  },{passive:true});

  wrap.addEventListener('touchend',e=>{
    if(e.touches.length<2) pinchStartDist=0;
    if(e.touches.length===0) cropIsDragging=false;
  },{passive:true});
}

function onCropZoom(val) {
  setCropZoom(+val);
}

// Backdrop/Escape close. The crop modal holds a pending callback and file —
// left behind, the next pick from the shared input would save to whoever the
// abandoned edit was for.
function dismissModal(id) {
  if (id === 'crop-modal') closeCropModal(); else closeModal(id);
}

function closeCropModal() {
  closeModal('crop-modal');
  cropCallback=null; cropImg=null; cropReplaceInputId=null; cropPendingFile=null;
}

function saveCrop() {
  if(!cropImg) return;
  clampCropOffsets();
  const crop={zoom:cropZoom, offX:cropOffX, offY:cropOffY};
  const file=cropPendingFile; cropPendingFile=null;
  closeModal('crop-modal');
  if(cropCallback) cropCallback(crop, file);
}

// Vercel turns away any request body over 4.5MB with a bare 413, and a phone
// camera photo is routinely 3–10MB. Cropping is non-destructive (the crop is
// stored as fractions, not baked into pixels), so shrinking the *whole* photo
// here loses nothing the crop needs — it just has to stay uncropped.
const UPLOAD_MAX_EDGE = 2048;
// The grid's first-paint image — small enough that a hundred of them cost
// less than one full photo.
const THUMB_MAX_EDGE = 160;
function downscaleForUpload(file) { return resizeImage(file, UPLOAD_MAX_EDGE, 0.88, false); }
function makeThumb(file) { return resizeImage(file, THUMB_MAX_EDGE, 0.8, true); }
function resizeImage(file, maxEdge, quality, alwaysEncode) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      if (!alwaysEncode && scale === 1 && file.size < 1.5*1024*1024) { resolve(file); return; }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w*scale); canvas.height = Math.round(h*scale);
        const ctx = canvas.getContext('2d');
        // JPEG has no alpha — a transparent PNG would otherwise go black.
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) { resolve(alwaysEncode ? null : file); return; }
          const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      } catch (e) { resolve(alwaysEncode ? null : file); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(alwaysEncode ? null : file); };
    img.src = url;
  });
}

async function uploadOriginalPhoto(file, type) {
  showToast('Uploading…');
  try {
    const thumb = type==='student' ? await makeThumb(file) : null;
    file = await downscaleForUpload(file);
    if (file.size > 4*1024*1024) return {error:'Photo is too large — try a smaller one'};
    const fd=new FormData(); fd.append('file',file,file.name||'photo.jpg'); fd.append('type',type);
    if (thumb && thumb.type==='image/jpeg') fd.append('thumb',thumb,'thumb.jpg');
    const res=await fetch('/api/upload-photo',{method:'POST',body:fd});
    const data=await res.json().catch(()=>({}));
    if(res.status===413) return {error:'Photo is too large — try a smaller one'};
    if(!res.ok||!data.url) return {error:data.error||('Upload failed ('+res.status+')')};
    return data;
  } catch(e) {
    return {error:'Upload failed — check your connection and try again'};
  }
}

async function savePhotoCrop(sk, id, crop) {
  if (!sk || !id || !crop) return;
  await fetch('/api/student/photo-crop', {method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({sk, id, ...crop})});
}

`;
