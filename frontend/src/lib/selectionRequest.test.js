let requestSelection;
beforeEach(()=>{jest.resetModules();jest.useFakeTimers();requestSelection=require('./selectionRequest').requestSelection;});
afterEach(()=>jest.useRealTimers());
async function settle(p){
 let done=false,value,error;
 p.then(v=>{done=true;value=v;},e=>{done=true;error=e;});
 for(let i=0;i<60&&!done;i++){await Promise.resolve();jest.advanceTimersByTime(60000);await Promise.resolve();}
 if(!done) throw new Error('request did not settle');
 if(error) throw error;return value;
}
test('429 waits visibly then retries the same request',async()=>{
 const fn=jest.fn().mockRejectedValueOnce({response:{status:429,headers:{'retry-after':'60'}}}).mockResolvedValue('valid');
 const onWait=jest.fn();
 expect(await settle(requestSelection(fn,{onWait}))).toBe('valid');
 expect(fn).toHaveBeenCalledTimes(2);expect(onWait).toHaveBeenCalledTimes(1);
});
test.each([401,402,403,504])('HTTP %s stops without retrying or switching provider',async status=>{
 const fn=jest.fn().mockRejectedValue({response:{status}});
 await expect(settle(requestSelection(fn))).rejects.toEqual({response:{status}});
 expect(fn).toHaveBeenCalledTimes(1);
});
test('cancel during provider recovery prevents another request',async()=>{
 const controller=new AbortController();
 const fn=jest.fn().mockRejectedValue({response:{status:429}});
 await expect(settle(requestSelection(fn,{signal:controller.signal,onWait:()=>controller.abort()}))).rejects.toThrow('pausada');
 expect(fn).toHaveBeenCalledTimes(1);
});
