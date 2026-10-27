import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyMove,playMove,winningLine,groupAt,key,scoreGo,gomokuBestMove,goBestMove,replayState,exportSGF} from '../../boardroom/engine.js';
const empty=n=>Array(n*n).fill(0);
const board=(n,black,white)=>{const b=empty(n);for(const i of black)b[i]=1;for(const i of white)b[i]=2;return b;};

test('gomoku is 15x15, black plays first',()=>{const s=createGame();assert.equal(s.board.length,225);assert.equal(s.turn,1);assert.equal(s.status,'playing');});
test('a move cannot be out of bounds or overwrite a stone',()=>{const b=empty(15);b[5]=1;assert.equal(playMove(b,5,2,'gomoku',15).error,'occupied');assert.equal(playMove(b,-1,2,'gomoku',15).error,'outside');assert.equal(playMove(b,225,2,'gomoku',15).error,'outside');assert.equal(playMove(b,1.5,2,'gomoku',15).error,'outside');});
for(const [name,step,start] of [['horizontal',1,105],['vertical',15,7],['descending diagonal',16,48],['ascending diagonal',14,22]]){
 test(`gomoku detects ${name} win`,()=>{const b=empty(15);for(let i=0;i<4;i++)b[start+step*i]=1;const r=playMove(b,start+step*4,1,'gomoku',15);assert.equal(r.winner,1);assert.equal(r.line.length,5);assert.equal(b[start+step*4],0);});
}
test('long runs win in freestyle gomoku',()=>{const b=empty(15);for(let i=3;i<=8;i++)b[7*15+i]=1;assert.equal(winningLine(b,110,15).length,6);});
test('a wrapped row is not a line',()=>{const b=empty(15);[13,14,15,16,17].forEach(i=>b[i]=1);assert.equal(winningLine(b,15,15),null);});
test('separated stones do not win',()=>{const b=empty(15);[100,101,103,104,105].forEach(i=>b[i]=1);assert.equal(winningLine(b,103,15),null);});
test('turns alternate and state remains immutable',()=>{const s=createGame();const r=applyMove(s,112).state;assert.equal(r.turn,2);assert.equal(r.moves[0].index,112);assert.equal(s.moves.length,0);assert.equal(s.board[112],0);});
test('no moves after game ends',()=>{const s=createGame();s.status='finished';assert.equal(applyMove(s,4).error,'finished');});
test('a surrounded white stone is captured',()=>{const b=board(5,[7,11,17],[12]);const r=playMove(b,13,1,'go',5);assert.deepEqual(r.captured,[12]);assert.equal(r.board[12],0);assert.equal(b[12],2);});
test('connected stones share liberties and are captured together',()=>{const b=board(5,[1,5,11,2,8],[6,7]);const g=groupAt(b,6,5);assert.equal(g.stones.size,2);assert.deepEqual([...g.liberties],[12]);const r=playMove(b,12,1,'go',5);assert.equal(r.captured.length,2);});
test('diagonals do not connect go groups',()=>{const b=board(5,[6,12],[]);assert.equal(groupAt(b,6,5).stones.size,1);});
test('suicide is forbidden',()=>{const b=board(5,[],[7,11,13,17]);assert.equal(playMove(b,12,1,'go',5).error,'suicide');});
test('capturing makes an otherwise surrounded move legal',()=>{const b=board(3,[0,2,6,8],[1,3,5,7]);const r=playMove(b,4,1,'go',3);assert.equal(r.error,undefined);assert.equal(r.captured.length,4);});
test('ko recapture is forbidden, including positional repetition',()=>{const b=board(5,[1,5,11],[6,2,8,12]);const first=playMove(b,7,1,'go',5,[key(b)]);assert.deepEqual(first.captured,[6]);const back=playMove(first.board,6,2,'go',5,[key(b),key(first.board)]);assert.equal(back.error,'ko');});
test('edges are not liberties',()=>{const b=board(3,[1],[0]);assert.deepEqual([...groupAt(b,0,3).liberties],[3]);assert.deepEqual(playMove(b,3,1,'go',3).captured,[0]);});
test('two passes start scoring',()=>{let s=createGame({game:'go'});s=applyMove(s,-1).state;assert.equal(s.status,'playing');s=applyMove(s,-1).state;assert.equal(s.status,'scoring');});
test('a move between passes resets pass count',()=>{let s=createGame({game:'go'});s=applyMove(s,-1).state;s=applyMove(s,40).state;assert.equal(s.passes,0);s=applyMove(s,-1).state;assert.equal(s.status,'playing');});
test('Chinese area scoring includes komi',()=>{const b=board(3,[0,1,2,3,5,6,7,8],[]);const score=scoreGo(b,3);assert.equal(score.black,9);assert.equal(score.white,7.5);assert.equal(score.winner,1);});
test('mixed borders are neutral territory',()=>{const b=board(3,[0],[8]);const score=scoreGo(b,3);assert.equal(score.neutral,7);assert.equal(score.black,1);assert.equal(score.white,8.5);});
test('removing dead stones changes area scoring',()=>{const b=board(3,[0,1,2,3,5,6,7,8],[4]);const s=scoreGo(b,3,[4]);assert.equal(s.black,9);assert.equal(s.white,7.5);assert.equal(b[4],2);});
for(const level of ['easy','medium','hard']){
 test(`gomoku ${level} takes an immediate win`,()=>{const b=board(15,[105,106,107,108],[104,90]);assert.equal(gomokuBestMove(b,15,1,level),109);assert.equal(b[109],0);});
 test(`gomoku ${level} blocks an immediate threat`,()=>{const b=board(15,[104],[105,106,107,108]);assert.equal(gomokuBestMove(b,15,1,level),109);});
}
test('gomoku engine opens at center',()=>assert.equal(gomokuBestMove(empty(15),15,1,'hard'),112));
test('go engine takes a capture and avoids illegal moves',()=>{const b=board(5,[7,11,17],[12]);const i=goBestMove(b,5,1,'hard');assert.equal(i,13);assert.equal(playMove(b,i,1,'go',5).error,undefined);});
test('replay reconstructs an exact board and captured counts',()=>{let s=createGame({game:'go',size:9});for(const i of [1,0,9,80,2,79])s=applyMove(s,i).state;const r=replayState(s,s.moves);assert.deepEqual(r.board,s.board);assert.deepEqual(r.captures,s.captures);assert.equal(r.turn,s.turn);assert.equal(r.id,s.id);});
test('SGF exports correct game ID, coordinates, komi and pass',()=>{let s=createGame({game:'go',size:9});s=applyMove(s,0).state;s=applyMove(s,-1).state;const text=exportSGF(s);assert.match(text,/GM\[1\]/);assert.match(text,/SZ\[9\]/);assert.match(text,/KM\[7.5\]/);assert.match(text,/;B\[aa\];W\[\]/);assert.match(exportSGF(createGame()),/GM\[4\]/);});
test('gomoku cannot pass',()=>assert.equal(applyMove(createGame(),-1).error,'pass'));
test('Go replay preserves a resumed game after two passes',()=>{let s=createGame({game:'go',size:9});s=applyMove(s,40).state;s=applyMove(s,-1).state;s=applyMove(s,-1).state;s.status='playing';s.passes=0;s.moves.at(-1).resumed=true;s=applyMove(s,41).state;const restored=replayState(s,s.moves);assert.deepEqual(restored.board,s.board);assert.equal(restored.status,'playing');assert.equal(restored.moves.length,4);});
test('resume markers survive repeated reconstruction, undo and reload',()=>{let s=createGame({game:'go'});s=applyMove(s,40).state;s=applyMove(s,-1).state;s=applyMove(s,-1).state;s.status='playing';s.passes=0;s.moves.at(-1).resumed=true;const once=replayState(s,s.moves),twice=replayState(once,once.moves);assert.equal(twice.status,'playing');assert.equal(twice.passes,0);assert.equal(twice.moves.at(-1).resumed,true);assert.equal(applyMove(twice,41).state.moves.length,4);});
test('hard search returns a legal move without mutating a contested position',()=>{const b=board(15,[112,96,98,80],[113,127,128,144]),copy=[...b];const i=gomokuBestMove(b,15,1,'hard');assert.equal(Number.isInteger(i),true);assert.equal(b[i],0);assert.equal(playMove(b,i,1,'gomoku',15).error,undefined);assert.deepEqual(b,copy);});
