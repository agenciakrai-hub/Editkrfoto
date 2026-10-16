import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewStep from './ReviewStep';
import api from '@/lib/api';
import {thumbBase64} from '@/lib/rawThumb';
jest.mock('@/lib/api',()=>({__esModule:true,default:{post:jest.fn()}}));
jest.mock('@/lib/rawThumb',()=>({thumbBase64:jest.fn(async()=> 'preview')}));
jest.mock('@/lib/selectionRequest',()=>({requestSelection:fn=>fn(),selectionError:e=>e.message}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
jest.mock('@/components/studio/Thumbnail',()=>()=>null);
jest.mock('@/components/studio/PhotoViewer',()=>()=>null);
global.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
beforeEach(()=>{
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
 global.Image=class {width=800;height=600;set src(v){this.onload();}};
 api.post.mockReset();
 thumbBase64.mockResolvedValue("preview");
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const pictures=()=>Array.from({length:6},(_,i)=>({id:`p${i}`,name:`secret_name_${i}.NEF`,size:100+i,burstId:Math.floor(i/2),file:{},selectedForEdit:i%2===0}));
async function start(onChange){
 await act(async()=>root.render(<ReviewStep initialPhotos={pictures()} onChange={onChange} onContinue={()=>{}}/>));
 await act(async()=>host.querySelector('[data-testid="tab-bursts"]').click());
 await act(async()=>host.querySelector('[data-testid="ai-refine-all-btn"]').click());
}
test('actual review accumulates all three winners instead of restoring stale selections',async()=>{
 const saves=[];
 api.post.mockImplementation(async(url,body)=>({data:{best_filename:body.candidates[1].filename,reason:'eyes open'}}));
 await start(async photos=>saves.push(photos));
 expect(saves).toHaveLength(3);
 expect(saves[2].filter(p=>p.selectedForEdit).map(p=>p.id)).toEqual(['p1','p3','p5']);
 expect(api.post.mock.calls[0][1].candidates[0].filename).toBe('candidate_1');
 expect(host.querySelector('[data-testid="ai-refine-all-btn"]').disabled).toBe(true);
});
test('failed persistence stops remaining groups and never counts a saved success',async()=>{
 api.post.mockImplementation(async(url,body)=>({data:{best_filename:body.candidates[1].filename,reason:'eyes open'}}));
 const save=jest.fn(async()=>{throw new Error('save failed');});
 await start(save);
 expect(save).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledTimes(1);
 expect(host.querySelector('[data-testid="ai-refine-all-btn"]').disabled).toBe(false);
});
