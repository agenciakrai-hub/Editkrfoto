import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Thumbnail from './Thumbnail';

jest.mock('@/lib/rawThumb',()=>({extractThumb:jest.fn().mockResolvedValue(null)}));
global.IS_REACT_ACT_ENVIRONMENT=true;

let host,root;
beforeEach(()=>{
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
 global.IntersectionObserver=class { observe(){} disconnect(){} };
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

test('shows a labeled empty state when neither file nor preview exists',async()=>{
 await act(async()=>root.render(<Thumbnail alt="A.DNG" className="h-20" />));
 expect(host.querySelector('[data-testid="thumbnail-unavailable"]')?.textContent).toContain('Vista previa no disponible');
});

test('renders the stored preview immediately without an original file',async()=>{
 await act(async()=>root.render(<Thumbnail alt="A.DNG" fallback="data:image/jpeg;base64,ZmFrZQ==" className="h-20" />));
 expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,ZmFrZQ==');
 expect(host.querySelector('[data-testid="thumbnail-unavailable"]')).toBeNull();
});