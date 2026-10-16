import {applyComparison, compareWholeBurst, completedComparison} from './burstComparison';
const photos = n => Array.from({length:n},(_,i)=>({id:`p${i}`,name:`IMG${i}.NEF`,size:100+i,burstId:1, selectedForEdit:i===0}));
test('compares all 25 originals then finalists with at most eight per request',async()=>{
  const all=photos(25),seen=new Set(),calls=[];
  const result=await compareWholeBurst(all,async batch=>{
    calls.push(batch.length);batch.forEach(p=>seen.add(p.id));
    return {winnerId:batch[batch.length-1].id,reason:'best expression'};
  });
  expect(seen.size).toBe(25);expect(Math.max(...calls)).toBe(8);
  expect(result.winner.id).toBe('p24');
  const saved=applyComparison(all,all,result);
  expect(saved.filter(p=>p.selectedForEdit)).toHaveLength(1);
  expect(completedComparison(saved)).toBe(true);
  expect(completedComparison([...saved,{id:'new',name:'new',size:1}])).toBe(false);
});
test('failure in later round never commits a partial winner',async()=>{
  const all=photos(10),copy=JSON.stringify(all);let calls=0;
  await expect(compareWholeBurst(all,async batch=>{
    if(++calls===2) throw new Error('429');
    return {winnerId:batch[0].id,reason:'x'};
  })).rejects.toThrow('429');
  expect(JSON.stringify(all)).toBe(copy);
});
test('unknown winner and empty reason are rejected',async()=>{
  await expect(compareWholeBurst(photos(2),async()=>({winnerId:'other',reason:'x'}))).rejects.toThrow();
  await expect(compareWholeBurst(photos(2),async()=>({winnerId:'p0',reason:''}))).rejects.toThrow();
});
test('several saved bursts remain exclusive and resumable',async()=>{
  const a=photos(3),b=photos(3).map(p=>({...p,id:`b${p.id}`,name:`b${p.name}`,burstId:2}));
  const compare=async xs=>({winnerId:xs[1].id,reason:'eyes open'});
  let saved=applyComparison([...a,...b],a,await compareWholeBurst(a,compare));
  saved=applyComparison(saved,b,await compareWholeBurst(b,compare));
  expect(completedComparison(saved.slice(0,3))).toBe(true);
  expect(completedComparison(saved.slice(3))).toBe(true);
  expect(saved.filter(p=>p.selectedForEdit)).toHaveLength(2);
});
