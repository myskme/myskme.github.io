import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createGame,applyMove,playMove,scoreGo} from '../../boardroom/engine.js';
const root=new URL('../../boardroom/vendor/katago/',import.meta.url),require=createRequire(import.meta.url),createKata=require('../../boardroom/vendor/katago/kataeval.js');
function sequence(indices){let s=createGame({game:'go',size:9});for(const i of indices){const r=applyMove(s,i);assert.ok(r.state,`illegal fixture ${i}`);s=r.state;}return s;}
async function engine(model,size){
 const M=await createKata({print:()=>{},printErr:()=>{}});M.ccall('kgeSetForceCpu',null,['number'],[1]);M.FS.writeFile('/net.bin.gz',readFileSync(new URL(`model-${model}.bin.gz`,root)));assert.equal(await M.ccall('kgeLoad','number',['string','number'],['/net.bin.gz',size],{async:true}),1);M.FS.unlink('/net.bin.gz');
 const moves=M._malloc(8192),colors=M._malloc(8192),board=M._malloc(size*size*4),policy=M._malloc((size*size+1)*4),values=M._malloc(20),owner=M._malloc(size*size*4),best=M._malloc(4),win=M._malloc(4),pv=M._malloc(128),pvLen=M._malloc(4),visits=M._malloc(4);
 function write(line){line.forEach((m,i)=>{M.HEAP32[(moves>>2)+i]=m.index;M.HEAP32[(colors>>2)+i]=m.color|(m.resumed?256:0);});}
 async function evaluate(line,pla,komi=7.5,expectError=false){write(line);const ok=await M.ccall('kgeEvalSeq','number',Array(9).fill('number'),[moves,colors,line.length,pla,komi,board,policy,values,owner],{async:true});if(expectError){assert.equal(ok,0);assert.match(M.ccall('kgeError','string',[],[]),/illegal history/);return;}assert.equal(ok,1,M.ccall('kgeError','string',[],[]));const v=Array.from(M.HEAPF32.subarray(values>>2,(values>>2)+5)),b=Array.from(M.HEAP32.subarray(board>>2,(board>>2)+size*size));assert.ok(v.every(Number.isFinite));return{v,board:b,ownership:Array.from(M.HEAPF32.subarray(owner>>2,(owner>>2)+size*size))};}
 async function search(line,pla){write(line);const ok=await M.ccall('kgeSearch','number',Array(13).fill('number'),[moves,colors,line.length,pla,7.5,8,700,best,win,pv,32,pvLen,visits],{async:true});assert.equal(ok,1);return{best:M.HEAP32[best>>2],visits:M.HEAP32[visits>>2],pv:Array.from(M.HEAP32.subarray(pv>>2,(pv>>2)+M.HEAP32[pvLen>>2]))};}
 return{evaluate,search};
}
test('distributed model/runtime bytes match the pinned build manifest',()=>{const manifest=JSON.parse(readFileSync(new URL('build.json',root)));for(const [name,v]of Object.entries(manifest.files)){const b=readFileSync(new URL(name,root));assert.equal(b.length,v.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),v.sha256);}assert.equal(createHash('sha256').update(readFileSync(new URL('../third_party/katago-runtime.patch',import.meta.url))).digest('hex'),manifest.patchSha256);});
test('actual KataGo b6 CPU agrees with Chinese rules, captures, ko, suicide, resumed scoring and terminal points',async()=>{
 const E=await engine('b6',9),s=sequence([1,0,9,80,2,79]);const c=await E.evaluate(s.moves,s.turn);assert.deepEqual(c.board,s.board);assert.ok(c.ownership.every(x=>x>=-1&&x<=1));
 const empty=await E.evaluate([],1,7.5),zero=await E.evaluate([],1,0);assert.ok(empty.v[3]>zero.v[3]);assert.ok(empty.v[0]-empty.v[1]>zero.v[0]-zero.v[1]);
 const suicide=sequence([80,1,79,9,78,11,77,19]);await E.evaluate([...suicide.moves,{index:10,color:1}],2,7.5,true);
 const ko=sequence([1,10,9,2,19,12,80,20,11]);assert.equal(ko.board[10],0);await E.evaluate([...ko.moves,{index:10,color:2}],1,7.5,true);await E.evaluate([...ko.moves,{index:-1,color:2},{index:-1,color:1,resumed:true},{index:10,color:2}],1,7.5,true);
 const terminal=sequence([40,-1,-1]);const end=await E.evaluate(terminal.moves,terminal.turn),score=scoreGo(terminal.board,9);assert.equal(end.v[3],score.white-score.black);assert.ok(end.v[3]<-50,'score is in points rather than raw NN units');
 terminal.status='playing';terminal.passes=0;terminal.moves.at(-1).resumed=true;const resumed=applyMove(terminal,41).state;const a=await E.evaluate(resumed.moves,resumed.turn);assert.deepEqual(a.board,resumed.board);const found=await E.search(resumed.moves,resumed.turn);assert.ok(found.visits>0&&found.visits<=8);assert.ok(found.best===-1||!playMove(resumed.board,found.best,resumed.turn,'go',9,resumed.positions).error);assert.equal(found.pv[0],found.best);
});
for(const [model,size]of [['b6',13],['b10',19]])test(`actual KataGo ${model} loads and searches a legal ${size}-line opening`,async()=>{const E=await engine(model,size),a=await E.evaluate([],1);assert.equal(a.board.length,size*size);const found=await E.search([],1);assert.ok(found.best>=0&&found.best<size*size);assert.ok(found.visits>0&&found.visits<=8);});
