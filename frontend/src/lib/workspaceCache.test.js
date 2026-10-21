import {packPhoto,restorePhotos,savedStep,photoIdentity,readDirectoryPermission,filesFromDirectory} from './workspaceCache';
test('reload retains every photo, manual and IA decisions, metrics, identity and comparison',()=>{
 const originals=[{id:'a',name:'A.DNG',size:10,file:{webkitRelativePath:'F/A.DNG',lastModified:9},selectedForEdit:true,source:'manual',photometrics:{luma:0.4},basic:{exposure:1}},{id:'b',name:'B.DNG',size:11,relativePath:'F/B.DNG',lastModified:8,selectedForEdit:false,source:'ai',selectionComparison:{winnerId:'a',version:2}}];
 const state=JSON.parse(JSON.stringify({workspacePhotos:originals.map(packPhoto)}));
 const restored=restorePhotos(state);
 expect(restored).toHaveLength(2);expect(restored.map(p=>p.selectedForEdit)).toEqual([true,false]);
 expect(restored[0].source).toBe('manual');expect(restored[0].photometrics).toEqual({luma:0.4});
 expect(restored[1].selectionComparison).toEqual({winnerId:'a',version:2});
 expect(photoIdentity(restored[0])).toBe(photoIdentity(originals[0]));expect(restored[0].file).toBeUndefined();
});
test('legacy decisions open as gallery without demanding the original folder',()=>{
 expect(restorePhotos({finalSelection:[{filename:'A.DNG',selected:true,source:'manual'}]})[0]).toMatchObject({name:'A.DNG',selectedForEdit:true,source:'manual'});
 expect(savedStep({reviewCompleted:true})).toBe('review');
});
test('finished editing reopens result, and unfinished editing resumes mode',()=>{
 expect(savedStep({report:{total:2},presetInfo:{presetXmpText:'original preset'}})).toBe('report');
 expect(savedStep({workspaceStep:'mode',presetInfo:{presetName:'saved'}})).toBe('mode');
 expect(savedStep({report:{total:2}})).toBe('review');
});

test('an explicitly restarted selection resumes after reload',()=>{
 expect(savedStep({workspaceStep:'selection',selectionCompleted:false})).toBe('selection');
 expect(savedStep({workspaceStep:'selection',selectionCompleted:true})).toBe('review');
});

test('restored photos preserve relative paths and file metadata for stable relinking',()=>{
 const photo={name:'A.DNG',relativePath:'Wedding/RAW/A.DNG',size:42,lastModified:123,selectedForEdit:true,captureTime:'2026-10-20T12:00:00Z',camera:'Camera X'};
 const restored=restorePhotos({workspacePhotos:[packPhoto(photo)]})[0];
 expect(photoIdentity(restored)).toBe(photoIdentity(photo));
 expect(restored).toMatchObject({relativePath:photo.relativePath,size:42,lastModified:123});
});

test('directory handles request read access only when explicitly requested',async()=>{
 const handle={queryPermission:jest.fn().mockResolvedValue('prompt'),requestPermission:jest.fn().mockResolvedValue('granted')};
 expect(await readDirectoryPermission(handle)).toBe('prompt');
 expect(handle.requestPermission).not.toHaveBeenCalled();
 expect(await readDirectoryPermission(handle,true)).toBe('granted');
 expect(handle.requestPermission).toHaveBeenCalledWith({mode:'read'});
});

test('directory enumeration keeps nested relative paths and file metadata',async()=>{
 const file=new File(['raw'],'A.DNG',{lastModified:123});
 const rawFile={kind:'file',getFile:async()=>file};
 const nested={kind:'directory',async *entries(){yield ['A.DNG',rawFile];}};
 const root={name:'Wedding',async *entries(){yield ['RAW',nested];}};
 const files=await filesFromDirectory(root);
 expect(files).toEqual([file]);
 expect(files[0].webkitRelativePath).toBe('Wedding/RAW/A.DNG');
 expect(files[0].lastModified).toBe(123);
});
