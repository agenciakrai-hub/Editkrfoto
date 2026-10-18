import {packPhoto,restorePhotos,savedStep,photoIdentity} from './workspaceCache';
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
