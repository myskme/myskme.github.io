import test from 'node:test';
import assert from 'node:assert/strict';
import {TOGETHER_STAGES,createTogether,togetherMove,restoreTogether,moveInsight,winningPoints,THEMES} from '../../boardroom/special.js';
const solutions={
 'leave-room':[[2,2],[4,0],[2,5],[4,1],[2,6],[4,4]],
 'meet-light':[[2,1],[5,2],[2,3],[6,2],[2,5],[7,2]],
 'make-space':[[1,1],[5,2],[4,4],[7,2],[5,5],[8,2]]
};
for(const stage of TOGETHER_STAGES){
 test(`${stage.id}: both colors can bloom within six alternating moves`,()=>{let session=createTogether(stage.id);for(const[x,y]of solutions[stage.id]){const result=togetherMove(session,y*9+x);assert.equal(result.error,undefined);session=result.session;}assert.equal(session.status,'success');assert.ok(session.blooms[1].length>=5);assert.ok(session.blooms[2].length>=5);assert.equal(session.moves.length,6);assert.deepEqual(stage.board,createTogether(stage.id).board);});
 test(`${stage.id}: a seed cannot be occupied and occupied points cannot be overwritten`,()=>{const session=createTogether(stage.id);assert.equal(togetherMove(session,stage.blocked[0]).error,'seed');assert.equal(togetherMove(session,stage.board.findIndex(Boolean)).error,'occupied');});
 test(`${stage.id}: saved moves reconstruct the same success and undo returns to the previous turn`,()=>{let session=createTogether(stage.id);for(const[x,y]of solutions[stage.id])session=togetherMove(session,y*9+x).session;const restored=restoreTogether(stage.id,session.moves);assert.deepEqual(restored.board,session.board);assert.deepEqual(restored.blooms,session.blooms);assert.equal(restored.status,'success');const previous=restoreTogether(stage.id,session.moves.slice(0,-1));assert.equal(previous.moves.length,5);assert.equal(previous.turn,2);assert.equal(previous.status,'playing');assert.equal(previous.blooms[2],null);});
}
test('one player making five does not end the cooperative session',()=>{let s=createTogether();for(const[x,y]of solutions['leave-room'].slice(0,5))s=togetherMove(s,y*9+x).session;assert.ok(s.blooms[1]);assert.equal(s.blooms[2],null);assert.equal(s.status,'playing');});
test('six nonwinning moves end in a retry, without declaring a winner',()=>{let s=createTogether();for(const i of [1,2,3,4,5,6])s=togetherMove(s,i).session;assert.equal(s.status,'retry');assert.equal(togetherMove(s,7).error,'finished');});
test('cooperative moves are immutable',()=>{const s=createTogether(),r=togetherMove(s,20).session;assert.equal(s.board[20],0);assert.equal(s.moves.length,0);assert.equal(r.board[20],1);assert.equal(r.turn,2);});
test('invalid replay input stops safely at the first illegal placement',()=>{const s=restoreTogether('leave-room',[{index:20},{index:20},{index:30}]);assert.equal(s.moves.length,1);assert.equal(s.board[30],0);});
test('invalid point indices are rejected',()=>{const s=createTogether();for(const i of [-1,81,NaN,1.2])assert.equal(togetherMove(s,i).error,'outside');});
test('winning points identify the open ends of a four without mutating the board',()=>{const b=Array(225).fill(0);for(const i of [108,109,110,111])b[i]=1;const copy=[...b];assert.deepEqual(winningPoints(b,15,1).sort((a,b)=>a-b),[107,112]);assert.deepEqual(b,copy);});
test('coach explains an actual winning move',()=>{const b=Array(225).fill(0);for(const i of [108,109,110,111])b[i]=1;assert.equal(moveInsight(b,112,1,'gomoku',15).tag,'连五取胜');});
test('coach identifies a forced defensive point',()=>{const b=Array(225).fill(0);for(const i of [108,109,110,111])b[i]=2;b[107]=1;assert.equal(moveInsight(b,112,1,'gomoku',15).tag,'关键防守');});
test('coach explains real Go captures and resulting liberties',()=>{const b=Array(25).fill(0);for(const i of [7,11,17])b[i]=1;b[12]=2;const a=moveInsight(b,13,1,'go',5);assert.equal(a.tag,'提子机会');assert.match(a.title,/1 子/);});
test('coach marks a one-liberty Go placement as vulnerable',()=>{const b=Array(25).fill(0);for(const i of [7,11,17])b[i]=2;const a=moveInsight(b,12,1,'go',5);assert.match(a.text,/1 口气/);assert.match(a.title,/留意/);});
test('coach handles illegal moves instead of inventing an evaluation',()=>{const b=Array(25).fill(0);b[12]=1;assert.equal(moveInsight(b,12,2,'go',5).tag,'规则提醒');});
test('original palettes and two garden palettes retain distinct and complete board colors',()=>{assert.equal(Object.keys(THEMES).length,5);for(const t of Object.values(THEMES)){assert.equal(t.board.length,3);assert.ok(t.accent);assert.ok(t.signature);}});
