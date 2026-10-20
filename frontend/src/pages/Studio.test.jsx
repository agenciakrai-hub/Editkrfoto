import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
jest.mock('react-router-dom',()=>{const navigate=()=>{};return {useNavigate:()=>navigate,useSearchParams:()=>[new URLSearchParams('project=p&folder=f')]};},{virtual:true});
import Studio from './Studio';
import api from '@/lib/api';
import {readPhoto,readDirectoryHandle,readDirectoryPermission,filesFromDirectory} from '@/lib/workspaceCache';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn(),put:jest.fn()}}));
jest.mock('@/lib/workspaceCache',()=>({...jest.requireActual('@/lib/workspaceCache'),readPhoto:jest.fn(),readDirectoryHandle:jest.fn(),readDirectoryPermission:jest.fn(),filesFromDirectory:jest.fn()}));
jest.mock('@/components/AppShell',()=>({children})=><div>{children}</div>);
jest.mock('@/components/studio/Stepper',()=>()=>null);
jest.mock('@/components/studio/SelectionStep',()=>()=>null);
jest.mock('@/components/studio/ReviewStep',()=>p=><div data-testid="restored-gallery">{p.initialPhotos.map(x=><span key={x.id}>{x.name}:{String(x.selectedForEdit)}:{x.source}:{x.file?'linked':'offline'}</span>)}</div>);
jest.mock('@/components/studio/ProfilePresetStep',()=>()=>null);
jest.mock('@/components/studio/ReportStep',()=>p=><div data-testid="restored-report">{JSON.stringify({report:p.report,payload:p.payload})}</div>);
jest.mock('@/lib/imageAnalysis',()=>({analyzeFile:jest.fn(),mapLimit:jest.fn()}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
global.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
beforeEach(()=>{host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);readPhoto.mockResolvedValue(null);readDirectoryHandle.mockResolvedValue(null);readDirectoryPermission.mockResolvedValue('denied');filesFromDirectory.mockResolvedValue([]);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function open(state){
 api.get.mockImplementation(async url=>({data:url.startsWith('/folders')?{name:'FOT',rawai_state:state}:{name:'BAUTIXO'}}));
 await act(async()=>root.render(<Studio/>));
}
test('opening saved 774 photo work mounts a gallery without the folder picker or fresh analysis',async()=>{
 const photos=Array.from({length:774},(_,i)=>({id:String(i),name:'PHOTO_'+i+'.DNG',selectedForEdit:i<600,source:i===0?'manual':'ai',photometrics:{luma:.4}}));
 await open({workspacePhotos:photos});
 expect(host.querySelector('[data-testid="folder-input"]')).toBeNull();
 expect(host.querySelector('[data-testid="restored-gallery"]').children).toHaveLength(774);
 expect(host.textContent).toContain('600 seleccionadas');expect(host.textContent).toContain('PHOTO_0.DNG:true:manual');
});
test('completed editing restores the saved report and exact export payload without originals',async()=>{
 const payload={photos:[{filename:'A.DNG',ai_basics:{Exposure2012:1.25}}],preset_xmp:'saved preset'};
 await open({workspacePhotos:[{id:'a',name:'A.DNG',selectedForEdit:true}],presetInfo:{presetName:'saved'},report:{total:1,succeeded:1,failed:0},xmpPayload:payload});
 const result=JSON.parse(host.querySelector('[data-testid="restored-report"]').textContent);
 expect(result.payload).toEqual(payload);expect(result.report.succeeded).toBe(1);
 expect(host.querySelector('[data-testid="folder-input"]')).toBeNull();
});

test('reopening relinks originals automatically when the saved directory permission is granted',async()=>{
 const file=new File(['raw'],'A.DNG',{lastModified:123});
 Object.defineProperty(file,'webkitRelativePath',{value:'Wedding/A.DNG'});
 const handle={name:'Wedding'};
 readDirectoryHandle.mockResolvedValue({handle});readDirectoryPermission.mockResolvedValue('granted');filesFromDirectory.mockResolvedValue([file]);
 await open({workspacePhotos:[{id:'a',name:'A.DNG',size:file.size,lastModified:123,relativePath:'Wedding/A.DNG',selectedForEdit:true}]});
 expect(filesFromDirectory).toHaveBeenCalledWith(handle);
 expect(host.textContent).toContain('Carpeta original conectada.');
 expect(host.querySelector('[data-testid="folder-input"]')).toBeNull();
});

test('legacy photos without file metadata relink by unique relative path',async()=>{
 const file=new File(['raw'],'A.DNG',{lastModified:123});
 Object.defineProperty(file,'webkitRelativePath',{value:'Wedding/A.DNG'});
 const handle={name:'Wedding'};
 readDirectoryHandle.mockResolvedValue({handle});readDirectoryPermission.mockResolvedValue('granted');filesFromDirectory.mockResolvedValue([file]);
 await open({workspacePhotos:[{id:'old',name:'A.DNG',relativePath:'Wedding/A.DNG',selectedForEdit:true}]});
 expect(host.querySelector('[data-testid="restored-gallery"]').textContent).toContain('A.DNG:true:ai:linked');
});
