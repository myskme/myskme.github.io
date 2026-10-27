import {createGame,applyMove,playMove,groupAt,other,gomokuBestMove} from './engine.js';
import {winningPoints,moveInsight} from './special.js';
export const REVIEW_VERSION='myskme-coach-1';
export function coord(index,size){return index<0?'停一手':`${'ABCDEFGHJKLMNOPQRST'[index%size]}${size-Math.floor(index/size)}`;}
export function reviewFingerprint(record){let h=2166136261;const s=[record.id,record.game,record.size,record.opponent,record.human,...record.moves.map(m=>`${m.color}:${m.index}:${m.resumed?1:0}`)].join('|');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
export function hasValidReview(record){
 const r=record?.review;if(!r||r.version!==REVIEW_VERSION||r.fingerprint!==reviewFingerprint(record)||!Array.isArray(r.keys)||!r.keys.length||r.keys.length>3)return false;
 return typeof r.engine==='string'&&typeof r.model==='string'&&Number.isInteger(r.totalEligible)&&Number.isInteger(r.sampled)&&Number.isInteger(r.refined)&&r.keys.every(k=>{
  const m=record.moves[k.ply-1],minimum=record.game==='go'?-1:0;
  return Number.isInteger(k.ply)&&!!m&&k.actual===m.index&&k.color===m.color&&Number.isInteger(k.recommended)&&k.recommended>=minimum&&k.recommended<record.size*record.size&&['title','text','tag'].every(p=>typeof k[p]==='string')&&(record.game!=='go'||Number.isFinite(k.difference))&&Array.isArray(k.pv)&&k.pv.every(i=>Number.isInteger(i)&&i>=minimum&&i<record.size*record.size);
 });
}
export function reviewTimeline(record){
 if(!record||!['go','gomoku'].includes(record.game)||!Array.isArray(record.moves)||record.moves.length>2048)throw new Error('这份棋谱暂时无法分析，请选择 2048 手以内的标准棋谱。');
 if(record.game==='go'?![9,13,19].includes(record.size):record.size!==15)throw new Error('棋盘大小不受支持。');
 let state=createGame(record);const entries=[];
 for(let i=0;i<record.moves.length;i++){
  const move=record.moves[i];if(!move||!Number.isInteger(move.index)||move.color!==state.turn)throw new Error(`第 ${i+1} 手的棋谱顺序不正确。`);
  const before=state,result=applyMove(state,move.index);if(result.error)throw new Error(`第 ${i+1} 手无法按当前规则重建。`);
  state=result.state;if(move.resumed){state.status='playing';state.passes=0;state.moves.at(-1).resumed=true;}
  if(move.index>=0&&(record.opponent!=='computer'||move.color===(record.human||1)))entries.push({ply:i+1,move:{...state.moves.at(-1)},before,after:state});
 }
 return entries;
}
export function shortlistGo(entries,limit=16){
 if(entries.length<=limit)return [...entries];
 const ranked=entries.map(e=>{const g=groupAt(e.after.board,e.move.index,e.after.size);let weight=e.move.captured.length*4;if(g.liberties.size===1)weight+=7+Math.min(g.stones.size,8);const last=e.before.moves.at(-1);if(last?.captured?.length)weight+=4;return{entry:e,weight};}).sort((a,b)=>b.weight-a.weight);
 const chosen=new Map();
 for(const r of ranked.filter(r=>r.weight>0).slice(0,Math.floor(limit/2)))chosen.set(r.entry.ply,r.entry);
 const spread=Array.from({length:limit},(_,i)=>entries[Math.round(i*(entries.length-1)/(limit-1))]);
 for(const e of spread){if(chosen.size>=limit)break;chosen.set(e.ply,e);}
 for(const e of entries){if(chosen.size>=limit)break;chosen.set(e.ply,e);}
 return [...chosen.values()].sort((a,b)=>a.ply-b.ply);
}
export function selectKeyInsights(cards,limit=3){
 if(cards.length<=limit)return [...cards].sort((a,b)=>a.ply-b.ply);
 const ranked=[...cards].sort((a,b)=>b.importance-a.importance||a.ply-b.ply),picked=[ranked[0]];
 const good=ranked.find(k=>k.positive&&k.ply!==picked[0].ply&&Math.abs(k.ply-picked[0].ply)>1);if(good)picked.push(good);
 for(const k of ranked){if(picked.length>=limit)break;if(picked.some(p=>p.ply===k.ply||Math.abs(p.ply-k.ply)<2))continue;picked.push(k);}
 for(const k of ranked){if(picked.length>=limit)break;if(!picked.some(p=>p.ply===k.ply))picked.push(k);}
 return picked.sort((a,b)=>a.ply-b.ply);
}
export function makeGoInsight(entry,data){
 const {before,after,move,ply}=entry,size=before.size,recommended=data.best;
 const actualShape=groupAt(after.board,move.index,size),suggest=playMove(before.board,recommended,move.color,'go',size,before.positions);
 if(recommended>=0&&suggest.error)throw new Error('引擎建议不符合本局规则。');
 const same=recommended===move.index,sign=move.color===2?1:-1;
 const difference=(data.suggested.scoreWhite-data.played.scoreWhite)*sign;
 const actualScore=data.played.scoreWhite*sign,referenceScore=data.suggested.scoreWhite*sign;
 const local=moveInsight(before.board,recommended,move.color,'go',size,before.positions);
 let title=same?'这手与引擎建议一致。':difference>1.5?'这里，值得再看一眼。':'同一局面，还有另一种方向。';
 let text=same?`你选择的 ${coord(move.index,size)} 与本轮搜索首选相同。${local.text}`:`引擎首选 ${coord(recommended,size)}，原手为 ${coord(move.index,size)}。${local.text}`;
 if(!same&&actualShape.liberties.size===1&&!move.captured.length){title='先看看，这块棋的气。';text=`原手 ${coord(move.index,size)} 落下后，这块棋只剩一口气。参考手是 ${coord(recommended,size)}。${local.text}`;}
 if(!same&&suggest.captured?.length){title='提子的时机，藏在这里。';text=`参考手 ${coord(recommended,size)} 可以立即提走 ${suggest.captured.length} 颗棋子。${local.text}`;}
 const pointLoss=Math.max(0,difference),positive=same;
 return {ply,color:move.color,actual:move.index,recommended,title,text,tag:same?'好选择':local.tag,positive,importance:pointLoss*5+(actualShape.liberties.size===1?8:0)+(same?2:0),difference:round(difference),pointLoss:round(pointLoss),actualScore:round(actualScore),referenceScore:round(referenceScore),beforeWhite:round(data.before.scoreWhite),afterWhite:round(data.played.scoreWhite),whiteWin:data.before.whiteWin,pv:data.pv||[],visits:data.visits||0,searchMs:data.searchMs||0,backend:data.backend};
}
const round=x=>Math.round(x*10)/10||0;
export function assessGomoku(entry){
 const {before,after,move}=entry,size=before.size,color=move.color;
 const wins=winningPoints(before.board,size,color),threats=winningPoints(before.board,size,other(color)),newWins=winningPoints(after.board,size,color);
 if(wins.length&&wins.includes(move.index))return {importance:85,positive:true,type:'finish',best:move.index};
 if(wins.length)return {importance:120,positive:false,type:'missed-win',best:wins[0]};
 if(threats.length===1&&!threats.includes(move.index))return {importance:110,positive:false,type:'defense',best:threats[0]};
 if(threats.length>1)return {importance:65,positive:false,type:'multiple-threats',best:threats[0]};
 if(newWins.length>=2)return {importance:75,positive:true,type:'double-threat',best:move.index};
 if(threats.length===1&&threats.includes(move.index))return {importance:70,positive:true,type:'block',best:move.index};
 return {importance:10+newWins.length*20,positive:false,type:'explore',best:null};
}
export function makeGomokuInsight(entry,assessment){
 const {before,move,ply}=entry,size=before.size;
 let best=assessment.best;if(best===null)best=gomokuBestMove(before.board,size,move.color,'hard');
 const labels={finish:['把握住了制胜一手。','这一步直接连成五子，抓住了已经存在的获胜机会。','连五取胜'], 'missed-win':['当时，其实可以直接取胜。',`局面中已有成五点，${coord(best,size)} 可立即连五。试着先检查自己的直接获胜机会，再考虑其他方向。`,'制胜机会'],defense:['先守住这个关键点。',`${coord(best,size)} 是对方下一手唯一的成五点。原手没有挡住这条直接威胁，应该优先处理。`,'关键防守'],'multiple-threats':['看见两条线，更早做准备。','对方已经拥有多个直接成五点，单点防守通常无法全部挡住。回看前几手，试着更早限制它们的形成。','多点威胁'],'double-threat':['一手落下，两处生花。','这一步创造了多个下一手成五点，为对手留下难以同时处理的威胁。也要留意对方是否能先行获胜。','多重威胁'],block:['守得住，也是一手好棋。','你挡住了对方唯一的直接成五点。先解除眼前威胁，再为自己争取新的延展空间。','关键防守'],explore:['这一手，试试另一种走法。',`有限深度搜索建议观察 ${coord(best,size)}。它是一个可供比较的方向，继续在分支里试出后续变化。`,'搜索建议']};
 let [title,text,tag]=labels[assessment.type];const pv=[];let s=before;
 if(assessment.type==='explore'&&best===move.index){title='这手与搜索建议一致。';text=`你选择的 ${coord(move.index,size)} 也是本轮有限深度搜索的首选。可以继续在分支里验证后续攻守。`;tag='搜索一致';}
 if(best>=0){for(let depth=0;depth<3;depth++){const index=depth===0?best:gomokuBestMove(s.board,s.size,s.turn,'medium');if(index<0)break;const r=applyMove(s,index);if(!r.state)break;pv.push(index);s=r.state;if(s.status!=='playing')break;}}
 return {ply,color:move.color,actual:move.index,recommended:best,title,text,tag,positive:assessment.positive||best===move.index,importance:assessment.importance,pv,type:assessment.type,visits:null,difference:null};
}
export function reportFor(record,keys,meta){return {version:REVIEW_VERSION,fingerprint:reviewFingerprint(record),createdAt:new Date().toISOString(),keys,...meta};}
