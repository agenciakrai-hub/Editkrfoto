// Cache previews and analysis on this device; never copy entire RAW files.
function database() {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('editflow-workspaces-v1',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('photos');
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
export const photoIdentity = p => JSON.stringify([p.relativePath || p.file?.webkitRelativePath || p.webkitRelativePath || p.filename || p.name, p.size || 0, p.lastModified || p.file?.lastModified || 0]);
export function packPhoto(p) {
  const out={};
  for (const k of ['id','name','size','burstId','score','basic','photometrics','color','isBest','selectedForEdit','source','selectionComparison','warning','faceCount','groupPhoto','faceScore','personIds']) if(p[k]!==undefined) out[k]=p[k];
  return {...out,name:p.name || p.filename,relativePath:p.relativePath || p.file?.webkitRelativePath || p.name || p.filename,lastModified:p.lastModified || p.file?.lastModified || 0};
}
export async function readPhoto(scope,photo) {
  const db=await database();
  try {return await new Promise((resolve,reject)=>{const r=db.transaction('photos').objectStore('photos').get(scope+':'+photoIdentity(photo));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});} finally {db.close();}
}
export async function cachePhoto(scope,photo,preview,metrics) {
  const db=await database();
  try {await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({preview,metrics},scope+':'+photoIdentity(photo));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});} finally {db.close();}
}
export function restorePhotos(state) {
  return (state.workspacePhotos || state.finalSelection || []).map((p,i)=>({...p,name:p.name || p.filename,id:p.id || 'saved-'+i+'-'+(p.filename || p.name),selectedForEdit:p.selectedForEdit ?? !!p.selected,source:p.source || 'ai',thumb:null}));
}
export function savedStep(state) {
  if(state.report && state.presetInfo) return 'report';
  if(state.workspaceStep==='mode' && state.presetInfo) return 'mode';
  return 'review';
}
