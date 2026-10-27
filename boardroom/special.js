import {winningLine,playMove,groupAt,neighbors,other,candidates} from './engine.js';
import {drawGardenDecoration} from './garden-art.js';

export const THEMES = {
  lime:{name:'晴日青柠',subtitle:'SUNNY & SPECIAL',accent:'#287252',ink:'#213e31',soft:'#e7f3ca',board:['#f3e4c0','#efdcb4','#e7cd9e'],grid:'#ae9565',coordinate:'#a28c64',signature:'#dff0ae'},
  peach:{name:'蜜桃花园',subtitle:'SOFT & KIND',accent:'#a95445',ink:'#543d35',soft:'#fae8dc',board:['#f9e6d8','#f2d9c7','#e9cbb5'],grid:'#ba9681',coordinate:'#ae8974',signature:'#f5c9b5'},
  sky:{name:'晴空来信',subtitle:'CLEAR & CURIOUS',accent:'#326f89',ink:'#294656',soft:'#e1eef2',board:['#e9f0ed','#dbe8e6','#ccddda'],grid:'#90aaa5',coordinate:'#829f9b',signature:'#bfe1e9'},
  mint:{name:'晨雾薄荷',subtitle:'FRESH LITTLE BEGINNINGS',accent:'#2d7c6a',ink:'#294c40',soft:'#e1f2e6',board:['#ecf3df','#e0ebcf','#d3e1be'],grid:'#93a57c',coordinate:'#829472',signature:'#cce8d5'},
  honey:{name:'晴光蜂蜜',subtitle:'A LITTLE GOLDEN HOUR',accent:'#94672f',ink:'#51412b',soft:'#fbefcb',board:['#fbefd1','#f4e4bd','#ead6a8'],grid:'#b59b68',coordinate:'#a38e61',signature:'#f5dfa2'}
};
const position=(black,white)=>{const b=Array(81).fill(0);black.forEach(([x,y])=>b[y*9+x]=1);white.forEach(([x,y])=>b[y*9+x]=2);return b;};
export const TOGETHER_STAGES = [
 {id:'leave-room',name:'留一条路',word:'ROOM TO BLOOM',note:'两条最直接的路，可能会在中心相遇。试着为彼此留出另一种可能。',board:position([[2,4],[3,4],[2,3]],[[4,2],[4,3],[3,2]]),blocked:[0,80],limit:6},
 {id:'meet-light',name:'向光交汇',word:'GROW YOUR OWN WAY',note:'琥珀种子会挡住连线。先看清棋形，再一起寻找各自的方向。',board:position([[2,2],[3,3],[2,4]],[[4,2],[3,2],[4,4]]),blocked:[31,0],limit:6},
 {id:'make-space',name:'彼此成全',word:'BETTER, TOGETHER',note:'一方斜向生长，一方横向舒展。不同的方向，也可以一起绽放。',board:position([[2,2],[3,3],[2,4]],[[4,2],[5,1],[6,2]]),blocked:[29,21,80],limit:6}
];
export function createTogether(stageId='leave-room'){
 const stage=TOGETHER_STAGES.find(s=>s.id===stageId)||TOGETHER_STAGES[0];
 return {id:globalThis.crypto?.randomUUID?.()??String(Date.now()),stageId:stage.id,board:[...stage.board],turn:1,moves:[],blooms:{1:null,2:null},status:'playing',size:9};
}
export function togetherMove(session,index){
 const stage=TOGETHER_STAGES.find(s=>s.id===session.stageId);if(session.status!=='playing')return {error:'finished'};
 if(!Number.isInteger(index)||index<0||index>=81)return {error:'outside'};
 if(stage.blocked.includes(index))return {error:'seed'};
 if(session.board[index])return {error:'occupied'};
 const board=[...session.board];board[index]=session.turn;
 const blooms={...session.blooms};blooms[session.turn]=winningLine(board,index,9)||blooms[session.turn];
 const moves=[...session.moves,{index,color:session.turn,captured:[]}];
 const status=blooms[1]&&blooms[2]?'success':moves.length>=stage.limit?'retry':'playing';
 return {session:{...session,board,turn:other(session.turn),moves,blooms,status}};
}
export function restoreTogether(stageId,moves=[]){let s=createTogether(stageId);for(const m of moves){const r=togetherMove(s,m.index);if(r.error)break;s=r.session;}return s;}
export function winningPoints(board,size,color){
 const next=[...board],points=[];
 for(const i of candidates(board,size,1)){next[i]=color;if(winningLine(next,i,size))points.push(i);next[i]=0;}
 return points;
}
export function moveInsight(board,index,color,game,size,history=[]){
 if(index<0)return {title:'给局面一点呼吸。',text:'可以考虑停一手。请先确认边界与死活，再与对手一起收官。',tag:'收官思考'};
 const r=playMove(board,index,color,game,size,history);if(r.error)return {title:'换个角度，再看看。',text:'这个位置暂时不能落子。先确认气与盘面重复，再寻找新的方向。',tag:'规则提醒'};
 if(game==='go'){
  const g=groupAt(r.board,index,size);
  if(r.captured.length)return {title:`找到呼吸，提走 ${r.captured.length} 子。`,text:`这一步使对方棋块失去全部的气。落子后，自己的这块棋有 ${g.liberties.size} 口气。`,tag:'提子机会'};
  const rescued=neighbors(index,size).some(n=>board[n]===color&&groupAt(board,n,size).liberties.size===1)&&g.liberties.size>1;
  if(rescued)return {title:'先照顾自己的棋。',text:`这一步为被打吃的棋块续上了气，连接后共有 ${g.liberties.size} 口气。稳住，再向前。`,tag:'解救棋块'};
  return {title:g.liberties.size===1?'这一步需要多一点留意。':'让棋形，自在舒展。',text:`落子后相连的这块棋有 ${g.liberties.size} 口气。${g.liberties.size===1?'只剩一口气，可能被对手提走。':'也留意对方能否切断你的连接。'}`,tag:'气与连接'};
 }
 if(r.winner===color)return {title:'看见了，那条获胜的线。',text:'这一手将同色棋子连成五子。横、竖、斜，方向不同，精彩相同。',tag:'连五取胜'};
 if(winningPoints(board,size,other(color)).includes(index))return {title:'守住关键，也是一手好棋。',text:'这里是对方下一手的成五点。这一步挡住了这条直接威胁，还要留意其他方向。',tag:'关键防守'};
 const wins=winningPoints(r.board,size,color);
 if(wins.length>1)return {title:'一手落下，两处生花。',text:`这一步形成 ${wins.length} 个下一手成五点，带来多重进攻机会。同时留意对方是否能先行获胜。`,tag:'多重威胁'};
 if(wins.length===1)return {title:'下一步的机会，已经出现。',text:'落子后出现一个下一手可成五的点。观察对手的防守，再决定怎样延续进攻。',tag:'制造四子威胁'};
 return {title:'让每一子，都有自己的方向。',text:'这一手还没有形成直接成五威胁。试着衔接已有棋子，同时给后续延展留出空间。',tag:'布局与延展'};
}
export const KIND_NOTES=['谢谢你，陪我认真下完这一局。','胜负之外，也看见你的好棋。','今天的我们，都比昨天多了一点勇气。'];

export function drawSignature(canvas,record,themeName='lime',nickname='自在棋手',note='',decoration='plain'){
 const theme=THEMES[themeName]||THEMES.lime,c=canvas.getContext('2d');canvas.width=960;canvas.height=1240;
 c.fillStyle='#fcfcf7';c.fillRect(0,0,960,1240);
 c.fillStyle=theme.signature;c.beginPath();c.roundRect(28,28,904,1184,38);c.fill();
 // Original petal emblem: two leaves become a heart, a third point becomes a star.
 c.save();c.translate(90,85);c.fillStyle=theme.accent;
 for(const a of [-.7,.7]){c.save();c.rotate(a);c.beginPath();c.ellipse(0,-12,10,20,0,0,Math.PI*2);c.fill();c.restore();}c.beginPath();c.arc(0,15,5,0,Math.PI*2);c.fill();c.restore();
 c.fillStyle=theme.ink;c.font='800 31px "DM Sans",sans-serif';c.fillText('MYSKME',127,90);
 c.font='500 13px "DM Sans",sans-serif';c.fillText('MAKE YOURSELF SPECIAL & KIND',127,114);
 c.font='500 12px "DM Sans",sans-serif';c.textAlign='right';c.fillText('A LITTLE PIECE OF MY WORLD',866,86);c.textAlign='left';
 c.font='600 54px "Noto Sans SC",sans-serif';c.fillText('特别的一局，',80,211);c.fillText('留给温柔的自己。',80,286);
 const size=record.size,side=644,left=158,top=346,margin=32,step=(side-margin*2)/(size-1);
 c.save();c.shadowColor=theme.ink+'1c';c.shadowBlur=30;c.shadowOffsetY=14;c.fillStyle=theme.board[0];c.beginPath();c.roundRect(left,top,side,side,22);c.fill();c.restore();
 c.strokeStyle=theme.grid;c.lineWidth=.85;
 for(let i=0;i<size;i++){const p=margin+i*step;c.beginPath();c.moveTo(left+margin,top+p);c.lineTo(left+side-margin,top+p);c.moveTo(left+p,top+margin);c.lineTo(left+p,top+side-margin);c.stroke();}
 record.board.forEach((v,i)=>{if(!v)return;const x=left+margin+i%size*step,y=top+margin+Math.floor(i/size)*step,r=step*.44;const g=c.createRadialGradient(x-r*.3,y-r*.3,1,x,y,r);g.addColorStop(0,v===1?'#667060':'#ffffff');g.addColorStop(1,v===1?'#293529':'#e5e8da');c.save();c.shadowColor='#3941292d';c.shadowBlur=3;c.shadowOffsetY=3;c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore();});
 c.textAlign='center';c.fillStyle=theme.ink;c.font='500 20px "Noto Sans SC",sans-serif';c.fillText(note||'不必步步完美，每一步都算数。',480,1040,800);
 c.font='400 15px "Noto Sans SC",sans-serif';c.fillText(`${nickname} · ${record.game==='go'?'围棋':'五子棋'} · ${record.moves.length} 手 · ${record.createdAt.slice(0,10)}`,480,1082);
 c.strokeStyle=theme.accent+'40';c.beginPath();c.moveTo(80,1120);c.lineTo(880,1120);c.stroke();
 c.fillStyle=theme.accent;c.font='600 14px "DM Sans",sans-serif';c.fillText('BE SPECIAL. PLAY KIND.',480,1164);c.textAlign='left';
 drawGardenDecoration(c,theme,decoration);
}
