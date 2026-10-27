/* Browser KataGo bridge. Single-thread WASM + WebGPU/Eigen; all data stays local. */
let moduleReady=null,M=null,size=0,model='',manifest=null,buf={},queue=Promise.resolve();
const engineModules=Promise.all([import('./engine.js'),import('./review-core.js')]);
const progress=(id,stage,detail={})=>self.postMessage({id,progress:true,stage,...detail});
const hex=buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
async function digest(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
async function bytesFor(name,id){
 const expected=manifest.files[name],url='./vendor/katago/'+name;let cache=null;
 try{cache=await caches.open('myskme-katago-v1');const hit=await cache.match(url);if(hit){const b=await hit.arrayBuffer();if(b.byteLength===expected.bytes&&await digest(b)===expected.sha256)return new Uint8Array(b);await cache.delete(url);}}catch{}
 progress(id,'download',{file:name,loaded:0,total:expected.bytes});
 const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error('引擎资源加载失败，请稍后重试。');const copy=r.clone(),chunks=[];let count=0;
 if(r.body){const reader=r.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);count+=value.length;progress(id,'download',{file:name,loaded:count,total:expected.bytes});}}
 else{const all=new Uint8Array(await r.arrayBuffer());chunks.push(all);count=all.length;}
 const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(count!==expected.bytes||await digest(bytes)!==expected.sha256)throw new Error('引擎资源校验未通过，请重试下载。');
 try{await cache?.put(url,copy);}catch{}
 return bytes;
}
async function initialize(req){
 if(M&&size===req.size&&model===req.model)return;
 if(M)throw new Error('引擎配置已经改变，请重新开始本次分析。');
 progress(req.id,'prepare');
 const response=await fetch('./vendor/katago/build.json',{cache:'no-store'});if(!response.ok)throw new Error('无法读取引擎版本信息。');manifest=await response.json();
 const [wasm,weights]=await Promise.all([bytesFor('kataeval.wasm',req.id),bytesFor('model-'+req.model+'.bin.gz',req.id)]);
 progress(req.id,'initialize');importScripts('./vendor/katago/kataeval.js');
 M=await createKata({wasmBinary:wasm,locateFile:p=>'./vendor/katago/'+p,print:()=>{},printErr:()=>{}});
 let useGpu=false;
 if(!req.forceCpu&&self.navigator?.gpu){try{useGpu=!!await navigator.gpu.requestAdapter({powerPreference:'high-performance'});}catch{}}
 if(!useGpu)M.ccall('kgeSetForceCpu',null,['number'],[1]);
 M.FS.writeFile('/net.bin.gz',weights);
 if(!await M.ccall('kgeLoad','number',['string','number'],['/net.bin.gz',req.size],{async:true}))throw new Error('模型初始化失败：'+M.ccall('kgeError','string',[],[]));
 size=req.size;model=req.model;const hw=size*size;
 buf.moves=M._malloc(2048*4);buf.colors=M._malloc(2048*4);buf.board=M._malloc(hw*4);buf.policy=M._malloc((hw+1)*4);buf.values=M._malloc(5*4);buf.owner=M._malloc(hw*4);buf.best=M._malloc(4);buf.win=M._malloc(4);buf.pv=M._malloc(32*4);buf.pvLen=M._malloc(4);buf.visits=M._malloc(4);
 M.FS.unlink('/net.bin.gz');
 progress(req.id,'ready',{backend:backend(),model,size});
}
function backend(){return M.ccall('kgeBackendIsGpu','number',[],[])?'WebGPU':'CPU';}
function writeMoves(moves){if(moves.length>2048)throw new Error('本次分析支持 2048 手以内的棋谱。');for(let i=0;i<moves.length;i++){M.HEAP32[(buf.moves>>2)+i]=moves[i].index;M.HEAP32[(buf.colors>>2)+i]=moves[i].color|(moves[i].resumed?256:0);}}
async function evaluate(moves,color,expectedBoard){
 writeMoves(moves);const ok=await M.ccall('kgeEvalSeq','number',Array(9).fill('number'),[buf.moves,buf.colors,moves.length,color,7.5,buf.board,buf.policy,buf.values,buf.owner],{async:true});
 if(!ok)throw new Error('棋谱分析失败：'+M.ccall('kgeError','string',[],[]));
 const board=Array.from(M.HEAP32.subarray(buf.board>>2,(buf.board>>2)+size*size));
 if(expectedBoard&&(board.length!==expectedBoard.length||board.some((c,i)=>c!==expectedBoard[i])))throw new Error('引擎与本局棋盘未能一致重建，请重新选择棋谱。');
 const v=Array.from(M.HEAPF32.subarray(buf.values>>2,(buf.values>>2)+5));if(!v.every(Number.isFinite))throw new Error('引擎返回的局面数据不完整，请重试。');
 const max=Math.max(...v.slice(0,3)),exp=v.slice(0,3).map(x=>Math.exp(x-max)),z=exp.reduce((a,b)=>a+b,0);
 return {scoreWhite:v[3],leadWhite:v[4],whiteWin:exp[0]/z,policy:Array.from(M.HEAPF32.subarray(buf.policy>>2,(buf.policy>>2)+size*size+1)),board};
}
async function search(moves,color,visits,ms){
 writeMoves(moves);const t=performance.now();const ok=await M.ccall('kgeSearch','number',Array(13).fill('number'),[buf.moves,buf.colors,moves.length,color,7.5,visits,ms,buf.best,buf.win,buf.pv,32,buf.pvLen,buf.visits],{async:true});
 if(!ok)throw new Error('本次搜索未完成，请重试。');
 return {best:M.HEAP32[buf.best>>2],win:M.HEAPF32[buf.win>>2],pv:Array.from(M.HEAP32.subarray(buf.pv>>2,(buf.pv>>2)+M.HEAP32[buf.pvLen>>2])),visits:M.HEAP32[buf.visits>>2],searchMs:Math.round(performance.now()-t),backend:backend()};
}
function clippedPv(core,state,pv,best){const line=[];let s=state;const indexes=pv[0]===best?pv:[best];for(const i of indexes.slice(0,5)){if(s.status!=='playing')break;const r=core.applyMove(s,i);if(!r.state)break;line.push(i);s=r.state;}return line;}
async function play(req){
 const [core,review]=await engineModules;await initialize(req);
 const state=core.replayState({game:'go',size:req.size},req.moves);
 if(state.turn!==req.color||state.board.some((c,i)=>c!==req.board[i]))throw new Error('当前棋盘已变化，请重新请求建议。');
 const before=await evaluate(req.moves,req.color,req.board);progress(req.id,'search',{model,backend:backend(),visits:req.visits,ms:req.ms});
 const answer=await search(req.moves,req.color,req.visits,req.ms);
 let index=answer.best;
 if(req.level==='easy'&&index>=0){const legal=core.candidates(state.board,size,2).filter(i=>!core.playMove(state.board,i,state.turn,'go',size,state.positions).error);const top=legal.sort((a,b)=>before.policy[b]-before.policy[a]).slice(0,3);if(top.length){const max=Math.max(...top.map(i=>before.policy[i])),weights=top.map(i=>Math.exp((before.policy[i]-max)/.7)),sum=weights.reduce((a,b)=>a+b,0);let r=Math.random()*sum;index=top.at(-1);for(let i=0;i<top.length;i++){r-=weights[i];if(r<=0){index=top[i];break;}}}}
 if(index>=0&&core.playMove(state.board,index,state.turn,'go',size,state.positions).error)throw new Error('引擎建议与本局规则不一致，请重试。');
 return {index,model,backend:backend(),visits:answer.visits,searchMs:answer.searchMs,pv:clippedPv(core,state,answer.pv,index),scoreWhite:before.scoreWhite,whiteWin:before.whiteWin,source:'KataGo neural network + PUCT'};
}
async function goReview(req){
 const [core,R]=await engineModules;const entries=R.reviewTimeline(req.record);if(!entries.length)throw new Error('这局还没有可分析的落子，先完成一局对弈吧。');
 await initialize(req);const selected=R.shortlistGo(entries,req.precision==='deep'?24:14),estimates=[];
 for(let i=0;i<selected.length;i++){
  const e=selected[i];progress(req.id,'scan',{done:i,total:selected.length,ply:e.ply});
  const before=await evaluate(e.before.moves,e.move.color,e.before.board),played=await evaluate(e.after.moves,e.after.turn,e.after.board);
  const drop=(e.move.color===2?1:-1)*(before.scoreWhite-played.scoreWhite);
  estimates.push({entry:e,before,played,drop});
 }
 // Refine the largest changes plus one quiet/positive example; choose final keys
 // only after comparing each played move against an actually searched alternative.
 const ranked=[...estimates].sort((a,b)=>b.drop-a.drop),refine=ranked.slice(0,5);
 const good=[...estimates].sort((a,b)=>a.drop-b.drop)[0];if(good&&!refine.includes(good))refine.push(good);
 const cards=[];
 for(let i=0;i<refine.length;i++){
  const {entry:e,before,played}=refine[i];progress(req.id,'refine',{done:i,total:refine.length,ply:e.ply});
  const found=await search(e.before.moves,e.move.color,req.precision==='deep'?32:12,req.precision==='deep'?2200:900);
  const next=core.applyMove(e.before,found.best);if(!next.state)throw new Error('参考手无法在本局棋盘上验证。');
  const suggested=found.best===e.move.index?played:await evaluate(next.state.moves,next.state.turn,next.state.board);
  cards.push(R.makeGoInsight(e,{...found,before,played,suggested,pv:clippedPv(core,e.before,found.pv,found.best)}));
 }
 const chart=estimates.map(x=>({ply:x.entry.ply,whiteScore:Math.round(x.played.scoreWhite*10)/10}));
 return R.reportFor(req.record,R.selectKeyInsights(cards),{engine:'KataGo',model:model==='b10'?'b10c128':'b6c96',backend:backend(),precision:req.precision,sampled:selected.length,totalEligible:entries.length,refined:refine.length,chart,source:'KataGo native NN inputs / WebAssembly / PUCT',rule:'Chinese area, positional superko, no suicide, komi 7.5'});
}
self.onmessage=({data})=>{queue=queue.catch(()=>{}).then(async()=>{try{if(![9,13,19].includes(data.size)||!['b6','b10'].includes(data.model))throw new Error('引擎配置不受支持。');const result=data.type==='review'?await goReview(data):await play(data);self.postMessage({id:data.id,result});}catch(error){self.postMessage({id:data.id,error:error.message||'本次引擎请求未完成。'});}});};
