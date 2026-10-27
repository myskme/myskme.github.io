import {createGame,applyMove,groupAt,scoreGo,key,other} from './engine.js';
import {winningPoints} from './special.js';
import {hasValidReview,reviewFingerprint,reviewTimeline} from './review-core.js';
export const GARDEN_VERSION=1;
export const GARDEN_KEY='garden-v1';
export const GARDEN_REWARDS=[
 {id:'mint',type:'theme',at:2,name:'晨雾薄荷',note:'给棋室换一口清新的呼吸。',color:'#bce5d2'},
 {id:'daisy',type:'mark',at:4,name:'小雏菊花印',note:'让最后一手，开成一朵小雏菊。',color:'#f3d784'},
 {id:'botanical',type:'card',at:7,name:'花间来信',note:'在你的签名卡边缘，留一枝花。',color:'#dfebbc'},
 {id:'honey',type:'theme',at:11,name:'晴光蜂蜜',note:'把暖暖的日光，留在棋盘上。',color:'#f3d38e'},
 {id:'spark',type:'mark',at:16,name:'星愿花印',note:'给认真思考的自己，一颗星。',color:'#c6dce9'},
 {id:'constellation',type:'card',at:23,name:'星光明信片',note:'把特别的一局，连成你的星空。',color:'#d9d9ef'}
];
const pos=(n,b,w)=>{const a=Array(n*n).fill(0);b.forEach(i=>a[i]=1);w.forEach(i=>a[i]=2);return a;};
const lesson=(game,id,title,concept,b,w,goal,answer,hints,takeaway)=>({id,game,size:game==='go'?9:15,color:1,title,concept,board:pos(game==='go'?9:15,b,w),goal,answer,hints,takeaway});
export const GARDEN_LESSONS=[
 lesson('gomoku','five-line','把第一条线连起来','横向连五',[105,106,107,108],[104,0,2,4],{type:'win'},109,['先沿着同一行数一数黑子。','一端已被白棋挡住，看看另一端。'],'已有四子相连时，先找能直接成五的空点。'),
 lesson('gomoku','five-upright','换个方向，也能看见','纵向连五',[22,37,52,67],[7,0,2,4],{type:'win'},82,['五子连线也可以竖着生长。','沿着黑棋所在的这一列，向下看一格。'],'观察横、竖、两条斜线，给自己一个完整的检查顺序。'),
 lesson('gomoku','five-diagonal','顺着斜光走','斜向连五',[48,64,80,96],[32,0,2,4],{type:'win'},112,['从左上到右下，黑棋正连成一条斜线。','左上端已有白棋，留意右下的延伸点。'],'斜线和横线一样重要，沿着交叉点一步步数。'),
 lesson('gomoku','five-rise','看见向上的那条路','反斜线',[126,112,98,84],[140,0,2,4],{type:'win'},70,['这次的黑棋，从左下朝右上延伸。','左下端已被白棋封住，看看右上的空位。'],'两条斜线都要看，别让习惯的方向遮住机会。'),
 lesson('gomoku','five-gap','答案，在中间','补上断点',[105,106,108,109],[104,0,2,4],{type:'win'},107,['连线的空缺可能藏在中间。','左右两段黑棋之间，只隔着一个交叉点。'],'先查中间的断点，再向两端延展。'),
 lesson('gomoku','five-defend','守住，也是好棋','唯一成五点',[104,0,2,4],[105,106,107,108],{type:'block'},109,['先用对手的眼睛看这一局。','白棋左端已被黑棋挡住，右端是它下一手的成五点。'],'没有直接获胜机会时，优先处理对手下一手的成五威胁。'),
 lesson('gomoku','five-priority','先把握自己的机会','攻守次序',[105,106,107,108,44],[104,45,46,47,48],{type:'win'},109,['双方都在接近连五。先找你这一手能否直接结束棋局。','黑棋这一排已连成四颗，右端仍然空着。'],'先看直接取胜，再看必须防守，最后考虑布局。'),
 lesson('gomoku','five-two-ways','一手落下，两处生花','双重成五点',[106,107,109],[0,2,4],{type:'double'},108,['试着把三颗黑棋连成一段两端开放的四子。','补上中间的断点，左右两端都会出现下一手成五点。'],'两端开放的四子能制造两个直接威胁；同时留意对方能否先赢。'),
 lesson('go','go-breath','找回最后一口气','打吃与提子',[31,39,49],[40],{type:'capture',count:1},41,['气是棋子上下左右相邻的空点，斜角不算。','中间的白棋，只有右侧还空着。'],'一块棋最后一口气被占据时，整块棋会被提走。'),
 lesson('go','go-edge','边缘，也要数清楚','边角的气',[1],[0],{type:'capture',count:1},9,['棋盘外面不算气。看看左上角白棋还能通向哪里。','白棋右侧已有黑棋，它下方是最后的空点。'],'角上的棋最多有两口直接相邻的气，边上的最多三口。'),
 lesson('go','go-linked','两颗棋，一起呼吸','整块提子',[31,39,49,32,42],[40,41],{type:'capture',count:2},50,['相连的白棋是一整块，要合在一起数气。','右边白棋的下方，是这整块棋唯一的气。'],'相连棋子共享气；没有气时，一整块一起提走。'),
 lesson('go','go-rescue','先照顾自己的棋','从打吃中逃出',[40],[31,39,49],{type:'rescue',anchor:40,min:3},41,['黑棋只剩一口气。想想如何连接一个新的空点。','向右延伸后，整块黑棋会获得更多相邻空点。'],'被打吃时，延伸、连接或提走对方，都可能帮助自己的棋恢复气。'),
 lesson('go','go-connect','让彼此连起来','连接棋块',[39,41],[0],{type:'connect',anchors:[39,41]},40,['两颗黑棋之间，隔着一个空点。','把中间接上，两块棋就能共享气。'],'直线相邻才连接，斜角相邻仍是两块棋。'),
 lesson('go','go-corner','小小一角，三颗相连','角部整块提子',[2,10],[0,1,9],{type:'capture',count:3},18,['把左上角三颗白棋作为一整块数气。','它们向下通往第三行的那个空点，是最后一口气。'],'提子的数量取决于整块棋的气，不取决于你落子的远近。'),
 lesson('go','go-capture-first','提子后，就能呼吸','提子与自杀禁手',[22,30,32,38,42,48,50,58],[31,39,41,49],{type:'capture',count:4},40,['中心看似被白棋包围，但先看看四颗白棋各有几口气。','它们最后的气，都指向中心同一个交叉点。'],'先提对方，再检查自己的气；能提子并获得气的落子可以合法成立。'),
 lesson('go','go-area','给围住的空点，一份归属','中国数子法',[30,31,32,39,41,48,49,50],[0],{type:'territory',owner:1},40,['这次先观察，不需要落子。找一个完全被黑棋围住的空点。','黑棋围成一个小圈，圈里的那个空点属于黑方。'],'中国数子法计算活子与所围空点；实战终局还需确认死子，白方贴 7.5 目。')
];
export const lessonById=id=>GARDEN_LESSONS.find(x=>x.id===id);
export const routeFor=game=>GARDEN_LESSONS.filter(x=>x.game===game);
export function dayKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&dayKey(new Date(s+'T12:00:00'))===s;
const clone=x=>JSON.parse(JSON.stringify(x));
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const KINDS=['lesson','daily','practice','review','kind','together'];
export function emptyGarden(){return {version:1,selectedGame:'gomoku',events:{},lessons:{},sessions:{},practices:[]};}
export function normaliseGarden(value){
 const g=emptyGarden();if(!object(value)||value.version!==1)return g;
 g.selectedGame=value.selectedGame==='go'?'go':'gomoku';
 if(object(value.events))for(const [id,e]of Object.entries(value.events).slice(-4096))if(object(e)&&KINDS.includes(e.kind)&&id.startsWith(e.kind+':')&&id.length<200&&validDay(e.day))g.events[id]={kind:e.kind,day:e.day};
 if(object(value.lessons))for(const [id,day]of Object.entries(value.lessons))if(lessonById(id)&&validDay(day))g.lessons[id]=day;
 if(object(value.sessions))for(const [id,s]of Object.entries(value.sessions).sort().slice(-120)){
  if(!object(s)||!validDay(s.day)||!['go','gomoku'].includes(s.game)||id!==`${s.day}:${s.game}`||!Array.isArray(s.ids)||s.ids.length!==3||new Set(s.ids).size!==3||s.ids.some(k=>lessonById(k)?.game!==s.game))continue;
  g.sessions[id]={day:s.day,game:s.game,ids:[...s.ids],solved:[...new Set(Array.isArray(s.solved)?s.solved.filter(k=>s.ids.includes(k)):[])]};
 }
 if(Array.isArray(value.practices))for(const p of value.practices.slice(0,24)){
  if(!object(p)||typeof p.id!=='string'||!/^p-[a-f0-9]+-\d+$/.test(p.id)||!['go','gomoku'].includes(p.game)||(p.game==='go'?![9,13,19].includes(p.size):p.size!==15)||!Array.isArray(p.moves)||p.moves.length>2048||p.moves.some((m,i)=>!m||m.color!==i%2+1||!Number.isInteger(m.index)||m.index<(p.game==='go'?-1:0)||m.index>=p.size*p.size)||p.color!==p.moves.length%2+1||!Number.isInteger(p.recommended)||p.recommended<(p.game==='go'?-1:0)||p.recommended>=p.size*p.size||!Number.isInteger(p.actual)||p.ply!==p.moves.length+1||!validDay(p.savedDay))continue;
  g.practices.push({id:p.id,game:p.game,size:p.size,moves:p.moves.map(m=>({index:m.index,color:m.color,...(m.resumed?{resumed:true}:{})})),color:p.color,recommended:p.recommended,actual:p.actual,ply:p.ply,title:String(p.title||'再想一手').slice(0,100),text:String(p.text||'').slice(0,1000),sourceId:String(p.sourceId||'').slice(0,100),sourceFingerprint:String(p.sourceFingerprint||'').slice(0,32),engine:String(p.engine||'有限搜索').slice(0,60),model:String(p.model||'').slice(0,60),difference:Number.isFinite(p.difference)?p.difference:null,pv:Array.isArray(p.pv)?p.pv.filter(i=>Number.isInteger(i)&&i>=(p.game==='go'?-1:0)&&i<p.size*p.size).slice(0,5):[],savedDay:p.savedDay});
 }
 return g;
}
export function gardenSeeds(g){return Object.keys(g.events).length;}
export function unlockedRewards(g){const n=gardenSeeds(g);return GARDEN_REWARDS.filter(r=>n>=r.at);}
export function hasReward(g,id){return unlockedRewards(g).some(r=>r.id===id);}
export function gardenStats(g){const a=Object.values(g.events),count=k=>a.filter(e=>k.includes(e.kind)).length;return {seeds:a.length,practice:count(['lesson','daily']),discovery:count(['review','practice']),kindness:count(['kind','together']),lessons:Object.keys(g.lessons).length,reviewed:count(['review']),rethought:count(['practice'])};}
function addCredit(g,kind,id,day){const eventId=`${kind}:${id}`;if(!KINDS.includes(kind)||!validDay(day)||Object.hasOwn(g.events,eventId)||Object.keys(g.events).length>=4096)return false;g.events[eventId]={kind,day};return true;}
export function creditGarden(g,kind,id,day=dayKey()){const next=clone(g),credited=addCredit(next,kind,id,day);return{garden:next,credited};}
export function dailyPlan(g,game,day=dayKey()){
 const saved=g.sessions[`${day}:${game}`];if(saved)return clone(saved);
 const route=routeFor(game);if(!route.length||!validDay(day))throw new Error('练习日期或路线无法读取。');
 const fresh=route.filter(x=>!g.lessons[x.id]);let ids=fresh.slice(0,3).map(x=>x.id);
 let offset=0;if(!fresh.length)offset=Number(day.replaceAll('-',''))%route.length;
 for(let i=0;ids.length<3&&i<route.length;i++){const id=route[(offset+i)%route.length].id;if(!ids.includes(id))ids.push(id);}
 return {day,game,ids,solved:[]};
}
export function ensureDaily(g,game,day=dayKey()){const next=clone(g),plan=dailyPlan(g,game,day);next.sessions[`${day}:${game}`]=plan;return {garden:next,plan};}
export function lessonState(l){const s=createGame({game:l.game,size:l.size,opponent:'local',human:l.color});return {...s,board:[...l.board],turn:l.color,positions:[key(l.board)]};}
export function checkLesson(l,index){
 if(!l||!Number.isInteger(index))return {ok:false,error:'outside'};
 const before=lessonState(l);
 if(l.goal.type==='territory'){if(index<0||index>=l.board.length||l.board[index])return {ok:false,error:'occupied'};return {ok:scoreGo(l.board,l.size).territory[index]===l.goal.owner,state:before};}
 const r=applyMove(before,index);if(r.error)return {ok:false,error:r.error};const s=r.state,goal=l.goal;let ok=false;
 if(goal.type==='win')ok=s.winner===l.color;
 if(goal.type==='capture')ok=s.moves.at(-1).captured.length>=goal.count;
 if(goal.type==='rescue')ok=s.board[goal.anchor]===l.color&&groupAt(s.board,goal.anchor,l.size).liberties.size>=goal.min;
 if(goal.type==='connect'){const group=groupAt(s.board,goal.anchors[0],l.size);ok=goal.anchors.every(i=>group.stones.has(i))&&group.liberties.size>=2;}
 if(goal.type==='block')ok=winningPoints(l.board,l.size,other(l.color)).includes(index)&&winningPoints(s.board,l.size,other(l.color)).length===0;
 if(goal.type==='double')ok=!s.winner&&winningPoints(s.board,l.size,l.color).length>=2&&winningPoints(s.board,l.size,other(l.color)).length===0;
 return {ok,state:s};
}
export function completeLesson(g,id,index,day=dayKey()){
 const l=lessonById(id),checked=checkLesson(l,index);if(!checked.ok)return {garden:g,ok:false,credited:false};
 const {garden:next,plan}=ensureDaily(g,l.game,day);const credited=addCredit(next,'lesson',id,day);next.lessons[id]??=day;
 if(plan.ids.includes(id)&&!plan.solved.includes(id))plan.solved.push(id);
 if(plan.solved.length===3)addCredit(next,'daily',`${day}:${l.game}`,day);
 next.sessions[`${day}:${l.game}`]=plan;
 return {garden:next,ok:true,credited,sessionComplete:plan.solved.length===3};
}
export function makePractice(record,insight,day=dayKey()){
 if(!hasValidReview(record)||!record.review.keys.some(k=>k.ply===insight.ply&&k.actual===insight.actual&&k.recommended===insight.recommended))throw new Error('先完成这局的教学复盘，再收藏关键手。');
 const e=reviewTimeline({...record,moves:record.moves.slice(0,insight.ply)}).find(x=>x.ply===insight.ply);if(!e)throw new Error('这个局面暂时无法重建。');
 if(!applyMove(e.before,insight.recommended).state)throw new Error('参考手无法在本局规则中验证。');
 const fingerprint=reviewFingerprint(record),pv=[];let s=e.before;
 for(const i of insight.pv||[]){const r=applyMove(s,i);if(!r.state)break;pv.push(i);s=r.state;if(s.status!=='playing'||pv.length===5)break;}
 return {id:`p-${fingerprint}-${insight.ply}`,sourceId:record.id,sourceFingerprint:fingerprint,game:record.game,size:record.size,color:e.move.color,ply:insight.ply,moves:e.before.moves.map(m=>({index:m.index,color:m.color,...(m.resumed?{resumed:true}:{})})),actual:insight.actual,recommended:insight.recommended,title:insight.title,text:insight.text,engine:record.review.engine,model:record.review.model,difference:record.game==='go'?insight.difference:null,pv:pv[0]===insight.recommended?pv:[insight.recommended],savedDay:day};
}
export function savePractice(g,p){const next=clone(g),old=next.practices.findIndex(x=>x.id===p.id);if(old<0&&next.practices.length>=24)throw new Error('花园可收藏 24 个局面，请先移除一题，再收下新灵感。');if(old>=0)next.practices.splice(old,1);next.practices.unshift(clone(p));return next;}
export function practiceState(p){
 const minimal={game:p.game,size:p.size,opponent:'local',human:p.color,moves:p.moves};
 const entries=reviewTimeline({...minimal,moves:[...p.moves,{index:p.actual,color:p.color}]});const e=entries.find(x=>x.ply===p.ply);if(!e)throw new Error('这份练习无法完整重建，请从原谱重新收藏。');return e.before;
}
export function completePractice(g,id,index,compared,day=dayKey()){
 const p=g.practices.find(x=>x.id===id);if(!p||!compared)return {garden:g,credited:false,ok:false};
 const s=practiceState(p);if(!applyMove(s,index).state)return {garden:g,credited:false,ok:false};
 return {...creditGarden(g,'practice',id,day),ok:true};
}
