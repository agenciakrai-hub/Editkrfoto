// Cache previews and analysis on this device; never copy entire RAW files.
function database() {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('editflow-workspaces-v1',2);
    r.onupgradeneeded=()=>{
      if(!r.result.objectStoreNames.contains('photos')) r.result.createObjectStore('photos');
      if(!r.result.objectStoreNames.contains('directories')) r.result.createObjectStore('directories');
    };
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}

export async function saveDirectoryHandle(scope,handle) {
  if(!handle || typeof indexedDB==='undefined') return false;
  let db;
  try {
    db=await database();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('directories','readwrite');
      tx.objectStore('directories').put({handle,name:handle.name || ''},scope);
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
    });
    return true;
  } catch { return false; }
  finally { db?.close(); }
}

export async function readDirectoryHandle(scope) {
  if(typeof indexedDB==='undefined') return null;
  const db=await database();
  try {
    return await new Promise((resolve,reject)=>{
      const r=db.transaction('directories').objectStore('directories').get(scope);
      r.onsuccess=()=>resolve(r.result || null); r.onerror=()=>reject(r.error);
    });
  } finally { db.close(); }
}

export async function readDirectoryPermission(handle,request=false) {
  if(!handle) return 'denied';
  try {
    const options={mode:'read'};
    const permission=await handle.queryPermission(options);
    if(permission==='granted' || !request) return permission;
    return typeof handle.requestPermission==='function' ? handle.requestPermission(options) : permission;
  } catch { return 'denied'; }
}

export async function filesFromDirectory(handle) {
  const files=[];
  if(!handle?.entries) return files;
  const visit=async(directory,parts)=>{
    for await (const [name,entry] of directory.entries()) {
      if(entry.kind==='directory') await visit(entry,[...parts,name]);
      else if(entry.kind==='file') {
        const file=await entry.getFile();
        const relativePath=[handle.name,...parts,name].filter(Boolean).join('/');
        try { Object.defineProperty(file,'webkitRelativePath',{value:relativePath}); }
        catch { file.relativePath=relativePath; }
        files.push(file);
      }
    }
  };
  await visit(handle,[]);
  return files;
}

export const photoIdentity = p => JSON.stringify([p.relativePath || p.file?.webkitRelativePath || p.webkitRelativePath || p.filename || p.name, p.size || 0, p.lastModified || p.file?.lastModified || 0]);
export function packPhoto(p) {
  const out={};
  for (const k of ['id','name','size','burstId','seq','groupUncertain','captureTime','camera','basic','photometrics','color','isBest','selectedForEdit','source','selectionComparison','warning','faceCount','groupPhoto','faceScore','personIds']) if(p[k]!==undefined) out[k]=p[k];
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
  if(state.workspaceStep==='selection' && state.selectionCompleted===false) return 'selection';
  return 'review';
}
