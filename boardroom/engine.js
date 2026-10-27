export const BLACK = 1, WHITE = 2;
export const other = c => 3 - c;
export const key = board => board.join('');
export const directions = [[1,0],[0,1],[1,1],[1,-1]];
export function neighbors(index, size) {
  const x = index % size, y = Math.floor(index / size), n = [];
  if (x) n.push(index - 1); if (x < size - 1) n.push(index + 1);
  if (y) n.push(index - size); if (y < size - 1) n.push(index + size);
  return n;
}
export function groupAt(board, index, size) {
  const color = board[index], stones = new Set(), liberties = new Set();
  if (!color) return {stones, liberties};
  const stack = [index]; stones.add(index);
  while (stack.length) {
    for (const n of neighbors(stack.pop(), size)) {
      if (!board[n]) liberties.add(n);
      else if (board[n] === color && !stones.has(n)) { stones.add(n); stack.push(n); }
    }
  }
  return {stones, liberties};
}
export function winningLine(board, index, size) {
  const color = board[index]; if (!color) return null;
  const x = index % size, y = Math.floor(index / size);
  for (const [dx,dy] of directions) {
    let line = [index];
    for (const sign of [-1,1]) {
      let nx = x + dx * sign, ny = y + dy * sign;
      while (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny*size+nx] === color) {
        line.push(ny*size+nx); nx += dx * sign; ny += dy * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}
export function playMove(board, index, color, game, size, history = []) {
  if (!Number.isInteger(index) || index < 0 || index >= board.length) return {error:'outside'};
  if (board[index]) return {error:'occupied'};
  const next = [...board]; next[index] = color;
  let captured = [];
  if (game === 'go') {
    const checked = new Set();
    for (const n of neighbors(index,size)) {
      if (next[n] !== other(color) || checked.has(n)) continue;
      const group = groupAt(next,n,size);
      group.stones.forEach(s => checked.add(s));
      if (!group.liberties.size) group.stones.forEach(s => { next[s] = 0; captured.push(s); });
    }
    if (!groupAt(next,index,size).liberties.size) return {error:'suicide'};
    if (history.includes(key(next))) return {error:'ko'};
  }
  const line = game === 'gomoku' ? winningLine(next,index,size) : null;
  return {board:next,captured,line,winner:line ? color : next.every(Boolean) && game === 'gomoku' ? 3 : 0};
}
export function scoreGo(board,size,dead = [],komi=7.5) {
  const next = [...board]; dead.forEach(i => next[i] = 0);
  let black=0, white=0, neutral=0; const visited = new Set(), territory = {};
  next.forEach((c,i) => {
    if (c) {if(c===1) black++; else white++; return;}
    if (visited.has(i)) return;
    let region=[i], border=new Set(), stack=[i]; visited.add(i);
    while(stack.length) {
      for(const n of neighbors(stack.pop(),size)) {
        if(next[n]) border.add(next[n]);
        else if(!visited.has(n)){visited.add(n);region.push(n);stack.push(n);}
      }
    }
    const owner=border.size===1 ? [...border][0] : 0;
    region.forEach(n => territory[n]=owner);
    if(owner===1) black+=region.length; else if(owner===2) white+=region.length; else neutral+=region.length;
  });
  return {black,white:white+komi,komi,neutral,territory,winner:black>white+komi?1:2};
}
export function candidates(board,size,radius=2) {
  if(!board.some(Boolean)) return [Math.floor(size/2)*size+Math.floor(size/2)];
  const result = new Set();
  board.forEach((c,i) => {
    if(!c)return; const x=i%size,y=Math.floor(i/size);
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<size&&ny>=0&&ny<size&&!board[ny*size+nx]) result.add(ny*size+nx);
    }
  });
  return [...result];
}
function patternScore(board,index,color,size) {
  const x=index%size,y=Math.floor(index/size); let score=0,threes=0,fours=0;
  for(const [dx,dy] of directions) {
    let count=1,open=0;
    for(const sign of [-1,1]){
      let nx=x+dx*sign,ny=y+dy*sign;
      while(nx>=0&&nx<size&&ny>=0&&ny<size&&board[ny*size+nx]===color){count++;nx+=dx*sign;ny+=dy*sign;}
      if(nx>=0&&nx<size&&ny>=0&&ny<size&&!board[ny*size+nx]) open++;
    }
    if(count>=5)return 10000000;
    if(count===4){score+=open===2?600000:open===1?45000:0; if(open)fours++;}
    else if(count===3){score+=open===2?12000:open===1?450:0;if(open===2)threes++;}
    else if(count===2)score+=open===2?500:open===1?50:0;
    else score+=open*5;
    // Broken three and four: inspect every five-point window through this move.
    for(let offset=-4;offset<=0;offset++){
      let own=0,empty=0,valid=true;
      for(let j=0;j<5;j++){
        const nx=x+(offset+j)*dx,ny=y+(offset+j)*dy;
        if(nx<0||nx>=size||ny<0||ny>=size){valid=false;break;}
        const v=board[ny*size+nx];if(v===other(color)){valid=false;break;}if(v===color)own++;else empty++;
      }
      if(valid&&own===4&&empty===1)score+=18000;
      else if(valid&&own===3&&empty===2)score+=180;
    }
  }
  if(threes>=2)score+=55000;if(fours&&threes)score+=300000;
  return score;
}
function rankedMoves(board,size,color,limit=12) {
  return candidates(board,size).map(index=>{
    board[index]=color;const attack=patternScore(board,index,color,size);
    board[index]=other(color);const defend=patternScore(board,index,other(color),size);board[index]=0;
    const center=(size-1)/2,central= size - Math.abs(index%size-center)-Math.abs(Math.floor(index/size)-center);
    return {index,attack,defend,score:attack+defend*1.12+central};
  }).sort((a,b)=>b.score-a.score).slice(0,limit);
}
function evaluateBoard(board,size,color) {
  let mine=0,theirs=0;
  board.forEach((c,i)=>{if(c===color)mine=Math.max(mine,patternScore(board,i,c,size));else if(c)theirs=Math.max(theirs,patternScore(board,i,c,size));});
  return mine-theirs*1.08;
}
function negamax(board,size,color,depth,alpha,beta,deadline) {
  if(depth===0||Date.now()>deadline)return evaluateBoard(board,size,color);
  const moves=rankedMoves(board,size,color,depth===1?5:7);if(!moves.length)return 0;
  if(moves.some(m=>m.attack>=10000000))return 10000000+depth;
  let best=-Infinity;
  for(const m of moves){
    board[m.index]=color;
    const v=-negamax(board,size,other(color),depth-1,-beta,-alpha,deadline);
    board[m.index]=0;best=Math.max(best,v);alpha=Math.max(alpha,v);
    if(alpha>=beta||Date.now()>deadline)break;
  }
  return best;
}
export function gomokuBestMove(board,size,color,level='medium') {
  const next=[...board], ranked=rankedMoves(next,size,color,16);if(!ranked.length)return -1;
  const win=ranked.find(m=>m.attack>=10000000);if(win)return win.index;
  const block=ranked.find(m=>m.defend>=10000000);if(block)return block.index;
  if(level==='easy'){
    if(ranked[0].defend>=45000||ranked[0].attack>=45000)return ranked[0].index;
    return ranked[Math.floor(Math.random()*Math.min(4,ranked.length))].index;
  }
  if(level==='medium')return ranked[0].index;
  let best=ranked[0].index;const deadline=Date.now()+700;
  // Keep the last fully completed search. A partial iteration must not replace
  // a proven shallower result simply because its first candidate was examined.
  for(let depth=1;depth<=4;depth++){
    let iterationBest=best,iterationScore=-Infinity,complete=true;
    const roots=ranked.slice(0,10).sort((a,b)=>(b.index===best)-(a.index===best));
    for(const m of roots){
      if(Date.now()>deadline){complete=false;break;}
      next[m.index]=color;
      const value=-negamax(next,size,other(color),depth-1,-Infinity,Infinity,deadline)+m.score*.001;
      next[m.index]=0;
      if(Date.now()>deadline){complete=false;break;}
      if(value>iterationScore){iterationScore=value;iterationBest=m.index;}
    }
    if(!complete)break;
    best=iterationBest;
  }
  return best;
}
export function goBestMove(board,size,color,level='medium',history=[]) {
  const options=[],alliedGroups=[],enemyGroups=[],seen=new Set();
  board.forEach((c,i)=>{if(!c||seen.has(i))return;const g=groupAt(board,i,size);g.stones.forEach(n=>seen.add(n));(c===color?alliedGroups:enemyGroups).push(g);});
  for(const index of candidates(board,size,2)){
    const move=playMove(board,index,color,'go',size,history);if(move.error)continue;
    const own=groupAt(move.board,index,size), ns=neighbors(index,size);
    let score=move.captured.length*140;
    for(const g of alliedGroups)if(g.liberties.size===1&&g.liberties.has(index)&&own.liberties.size>1)score+=g.stones.size*90;
    for(const g of enemyGroups)if(g.liberties.has(index)&&g.liberties.size===2)score+=g.stones.size*18;
    const friendly=ns.filter(n=>board[n]===color).length,enemies=ns.filter(n=>board[n]===other(color)).length;
    // Avoid filling a settled eye and putting friendly groups into atari.
    if(ns.length>=2&&friendly===ns.length&&!move.captured.length)score-=150;
    if(own.liberties.size===1)score-=100+own.stones.size*25;
    const x=index%size,y=Math.floor(index/size),edge=Math.min(x,y,size-1-x,size-1-y);
    score+= Math.min(own.liberties.size,6)*4 + (enemies?8:0) + (friendly===1?6:0);
    score+=edge===2||edge===3?14:edge===1?4:edge===0?-10:8;
    // Reward approaching unoccupied corners and extending into open space.
    if(!friendly&&!enemies){
      let closest=size*2;
      board.forEach((c,i)=>{if(c)closest=Math.min(closest,Math.abs(i%size-x)+Math.abs(Math.floor(i/size)-y));});
      score+=closest>=3?10:0;
    }
    score+=Math.random()*(level==='easy'?24:level==='medium'?7:2);
    options.push({index,score});
  }
  options.sort((a,b)=>b.score-a.score);
  if(!options.length||options[0].score<-35)return -1;
  return options[0].index;
}
export function bestMove(board,size,color,game,level,history=[]){return game==='go'?goBestMove(board,size,color,level,history):gomokuBestMove(board,size,color,level);}
export function createGame(config={}){
  const game=config.game??'gomoku',size=game==='gomoku'?15:config.size??9;
  return {id:globalThis.crypto?.randomUUID?.()??String(Date.now()),game,size,opponent:config.opponent??'computer',level:config.level??'easy',goEngine:config.goEngine??'katago',human:config.human??1,board:Array(size*size).fill(0),turn:1,moves:[],positions:[key(Array(size*size).fill(0))],captures:{1:0,2:0},passes:0,status:'playing',winner:0,line:null,elapsed:0,startedAt:Date.now(),createdAt:new Date().toISOString()};
}
export function applyMove(state,index){
  if(state.status!=='playing')return {error:'finished'};
  if(index===-1&&state.game!=='go')return {error:'pass'};
  const move=index===-1?{board:[...state.board],captured:[],winner:0,line:null}:playMove(state.board,index,state.turn,state.game,state.size,state.positions);
  if(move.error)return move;
  const record={index,color:state.turn,captured:move.captured};
  const captures={...state.captures};captures[state.turn]+=move.captured.length;
  const passes=index===-1?state.passes+1:0;
  return {state:{...state,board:move.board,turn:other(state.turn),moves:[...state.moves,record],positions:[...state.positions,key(move.board)],captures,passes,status:move.winner?'finished':passes>=2?'scoring':'playing',winner:move.winner,line:move.line}};
}
export function replayState(base,moves){
  let state=createGame(base);
  state={...state,goEngine:base.goEngine??'light',id:base.id,startedAt:base.startedAt,createdAt:base.createdAt,elapsed:base.elapsed};
  for(const m of moves){const result=applyMove(state,m.index);if(result.state){state=result.state;if(m.resumed){state.status='playing';state.passes=0;state.moves.at(-1).resumed=true;}}}
  return state;
}
export function exportSGF(state){
  const coord=i=>i<0?'':String.fromCharCode(97+i%state.size)+String.fromCharCode(97+Math.floor(i/state.size));
  const result=state.winner===3?'0':state.winner?`${state.winner===1?'B':'W'}+${state.reason==='resign'?'R':state.score?Math.abs(state.score.black-state.score.white):''}`:'?';
  const white=state.opponent==='computer'&&state.human===1?'MYSKME Computer':'White';
  return `(;GM[${state.game==='go'?1:4}]FF[4]CA[UTF-8]AP[MYSKME:2.0]SZ[${state.size}]${state.game==='go'?'KM[7.5]RU[Chinese]':''}PB[${state.human===2&&state.opponent==='computer'?'MYSKME Computer':'Black'}]PW[${white}]DT[${state.createdAt.slice(0,10)}]RE[${result}]${state.moves.map(m=>`;${m.color===1?'B':'W'}[${coord(m.index)}]`).join('')})`;
}
