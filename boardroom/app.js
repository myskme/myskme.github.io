import {createGame,applyMove,playMove,groupAt,scoreGo,key,other,bestMove,replayState,exportSGF} from './engine.js';
import {THEMES,TOGETHER_STAGES,createTogether,togetherMove,restoreTogether,moveInsight,KIND_NOTES,drawSignature} from './special.js';
import {createCoachController} from './coach-ui.js';
import {createGardenController} from './garden-ui.js';
import {drawGardenMark} from './garden-art.js';
import {bindBackupUI,APP_VERSION} from './backup.js';
import {createReleaseLayout} from './release-ui.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage={read(k,fallback){try{const v=localStorage.getItem('myskme:'+k);return v?JSON.parse(v):fallback;}catch{return fallback;}},write(k,v){try{localStorage.setItem('myskme:'+k,JSON.stringify(v));return true;}catch{return false;}}};
const today=()=>new Date().toLocaleDateString('en-CA');
let preferences={sound:true,coords:true,numbers:false,reduceMotion:false,theme:'lime',nickname:'自在棋手',bloomMark:true,confirmMode:'auto',markStyle:'bloom',cardDecoration:'plain',...storage.read('preferences',{})};
let records=storage.read('records',[]);if(!Array.isArray(records))records=[];
records=records.filter(r=>r&&['go','gomoku'].includes(r.game)&&Array.isArray(r.moves)&&r.moves.length<3000&&[9,13,15,19].includes(r.size)&&typeof r.id==='string'&&typeof r.createdAt==='string');
let config={game:'gomoku',size:9,opponent:'computer',level:'easy',human:1,goEngine:'katago'};
let state=createGame(config), thinking=false,worker=null,workerRequest=0,thinkTimeout=null,hover=-1,hint=-1,keyboard=-1,dead=new Set(),page='play',replay=null,puzzle=null,toastTimer,clockOrigin=null;
let together=null,variation=null,pending=-1,insight=null,coach=null,reviewOverlay=null,garden=null,gardenPaused=false,releaseLayout=null,backupUI=null,restoringBackup=false;
const levelNames={easy:'轻松练习',medium:'进阶对弈',hard:'挑战棋力'};
const gameName=g=>g==='go'?'围棋':'五子棋';
const colorName=c=>c===1?'黑方':'白方';
const active=storage.read('active',null);
if(active&&['go','gomoku'].includes(active.game)&&[9,13,15,19].includes(active.size)&&Array.isArray(active.moves)&&active.moves.length<3000&&active.status!=='finished'){
  try{
    const restored=replayState(active,active.moves);
    if(restored.moves.length===active.moves.length){state=restored;state.elapsed=Number(active.elapsed)||0;state.pendingDead=Array.isArray(active.pendingDead)?active.pendingDead.filter(i=>Number.isInteger(i)&&i>=0&&i<state.board.length):[];config={game:state.game,size:state.game==='go'?state.size:9,opponent:state.opponent,level:state.level,human:state.human,goEngine:state.goEngine||'light'};}
  }catch{}
}
const canvas=$('#board'),ctx=canvas.getContext('2d');
let canvasSize=0,boardGeometry={margin:32,step:32};

function notify(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
function showModal(html,onReady){$('#modal-body').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();onReady?.();}
function closeModal(){$('#modal').close();}
$('#modal-close').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
function confirmAction(title,message,callback,label='开始新对局'){
  if(state.status==='playing'&&state.moves.length&&!replay&&!puzzle&&!together&&!variation){showModal(`<div class="modal-icon">${icon('leaf')}</div><h2>${title}</h2><p>${message}</p><div class="modal-actions"><button class="secondary-button" id="cancel-action">继续这一局</button><button class="primary-button" id="confirm-action">${label}</button></div>`,()=>{$('#cancel-action').onclick=closeModal;$('#confirm-action').onclick=()=>{closeModal();callback();};});}
  else callback();
}
let audio;
function playSound(type='stone'){
  if(!preferences.sound)return;
  try{
    audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();
    const now=audio.currentTime,gain=audio.createGain();gain.connect(audio.destination);
    if(type==='stone'){
      const buffer=audio.createBuffer(1,audio.sampleRate*.055,audio.sampleRate),d=buffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(audio.sampleRate*.008));
      const node=audio.createBufferSource();node.buffer=buffer;
      const filter=audio.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1400;filter.Q.value=.6;
      node.connect(filter);filter.connect(gain);gain.gain.setValueAtTime(.24,now);node.start();
    }else{
      for(let i=0;i<3;i++){const osc=audio.createOscillator(),g=audio.createGain();osc.type='sine';osc.frequency.value=[523.25,659.25,783.99][i];osc.connect(g);g.connect(gain);g.gain.setValueAtTime(0,now+i*.11);g.gain.linearRampToValueAtTime(.10,now+i*.11+.02);g.gain.exponentialRampToValueAtTime(.001,now+i*.11+.35);osc.start(now+i*.11);osc.stop(now+i*.11+.4);}gain.gain.value=.45;
    }
  }catch{}
}
function savePreferences(){applyTheme();storage.write('preferences',preferences);document.body.classList.toggle('reduced-motion',!!preferences.reduceMotion);$('#sound-button').innerHTML=icon(preferences.sound?'sound':'mute');$('#sound-button').title=preferences.sound?'关闭音效':'开启音效';$('#sound-button').setAttribute('aria-label',$('#sound-button').title);for(const [id,p] of [['coords-button','coords'],['numbers-button','numbers']]){const b=$('#'+id);b.setAttribute('aria-pressed',String(!!preferences[p]));b.querySelector('.mini-toggle').classList.toggle('on',!!preferences[p]);}}
function elapsed(){return (state.elapsed||0)+(clockOrigin?Date.now()-clockOrigin:0);}
function stopClock(){if(clockOrigin){state.elapsed=elapsed();clockOrigin=null;}}
function startClock(){if(!clockOrigin&&state.status==='playing'&&state.moves.length&&!replay&&!puzzle&&!together&&!variation)clockOrigin=Date.now();}
function formatTime(ms){const sec=Math.floor(ms/1000);return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function persist(){if(restoringBackup)return;if(together){storage.write('together-active',{stageId:together.stageId,moves:together.moves});return;}if(!replay&&!puzzle&&!variation)storage.write('active',{...state,elapsed:elapsed()});}
function cancelComputer(){workerRequest++;coach?.cancelPlay();worker?.terminate();worker=null;clearTimeout(thinkTimeout);thinking=false;}
function newGame(next=config){
  coach?.cancelReview();reviewOverlay=null;cancelComputer();stopClock();replay=null;puzzle=null;together=null;variation=null;insight=null;pending=-1;storage.write('last-mode','classic');dead=new Set();hover=-1;hint=-1;keyboard=-1;
  config={goEngine:'katago',...next};state=createGame(config);persist();navigate('play');updateConfig();update();
  if(state.opponent==='computer'&&state.turn!==state.human)computerTurn();
}
function requestNew(){if(together){startTogether(together.stageId);return;}confirmAction('给下一局，留一点期待。','开始新对局后，当前未完成的棋局将被替换。已完成的对局仍可在「对局记录」中回看。',()=>newGame());}
function updateConfig(){
  $$('[data-game]').forEach(b=>{const selected=!together&&b.dataset.game===state.game;b.classList.toggle('selected',selected);b.setAttribute('aria-selected',selected);});
  $('#tab-together').classList.toggle('selected',!!together);$('#tab-together').setAttribute('aria-selected',String(!!together));
  $$('[data-opponent]').forEach(b=>{b.classList.toggle('selected',b.dataset.opponent===config.opponent);b.setAttribute('aria-pressed',String(b.dataset.opponent===config.opponent));});
  $$('[data-go-engine]').forEach(b=>{const on=b.dataset.goEngine===config.goEngine;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
  $('#go-engine-field').hidden=state.game!=='go'||config.opponent==='local';
  $$('[data-level]').forEach(b=>{b.classList.toggle('selected',b.dataset.level===config.level);b.setAttribute('aria-pressed',String(b.dataset.level===config.level));});
  $$('[data-color]').forEach(b=>{b.classList.toggle('selected',+b.dataset.color===config.human);b.setAttribute('aria-pressed',String(+b.dataset.color===config.human));});
  $$('[data-size]').forEach(b=>{b.classList.toggle('selected',+b.dataset.size===config.size);b.setAttribute('aria-pressed',String(+b.dataset.size===config.size));});
  $('#difficulty-field').hidden=config.opponent==='local';$('#color-field').hidden=config.opponent==='local';$('#go-size-field').hidden=state.game!=='go';
  const changed=config.opponent!==state.opponent||config.human!==state.human||config.level!==state.level||(state.game==='go'&&(config.size!==state.size||config.goEngine!==state.goEngine));
  $('#start-button span').textContent=changed?'应用设置，开始新局':'开始新对局';
  $('#difficulty-note').textContent={easy:'找到你的节奏',medium:'攻守之间的较量',hard:'多想一步，迎接挑战'}[config.level];
}
function update(){
  if(thinking||replay||state.status!=='playing')pending=-1;
  const isGo=state.game==='go',canMove=state.status==='playing'&&!thinking&&!replay&&(state.opponent==='local'||state.turn===state.human);
  $('#board-title').textContent=replay?'棋谱回放':puzzle?puzzle.title:state.opponent==='local'?'双人对弈':'自由对弈';
  $('#board-rule').textContent=`${state.size} 路 · ${isGo?'中国数子法':'自由规则'}`;
  const blackIsHuman=state.human===1||state.opponent==='local',whiteIsHuman=state.human===2||state.opponent==='local';
  $('#black-name').textContent=puzzle?'你 · 执黑':state.opponent==='local'?'黑方棋手':blackIsHuman?'你':'小棋 · 电脑';
  $('#white-name').textContent=puzzle?'棋题 · 白方':state.opponent==='local'?'白方棋手':whiteIsHuman?'你':'小棋 · 电脑';
  $('#black-detail').textContent=isGo?`执黑 · 提子 ${state.captures[1]}`:blackIsHuman?'执黑 · 先手':levelNames[state.level];
  $('#white-detail').textContent=isGo?`执白 · 提子 ${state.captures[2]}`:whiteIsHuman?'执白 · 后手':levelNames[state.level];
  $('#black-tag').textContent=blackIsHuman?'YOU':'CPU';
  $('#black-player').classList.toggle('current',state.turn===1&&state.status==='playing');
  $('#white-player').classList.toggle('current',state.turn===2&&state.status==='playing');
  const turn=$('#turn-status');turn.classList.toggle('thinking',thinking);
  let status=replay?'回看每一步':state.status==='scoring'?'点击标记死子':state.status==='finished'?state.winner===3?'棋逢对手 · 和棋':`${colorName(state.winner)}获胜`:puzzle?'找到关键一手':thinking?'小棋思考中':state.opponent==='local'?`轮到${colorName(state.turn)}`:state.turn!==state.human?'等待电脑应手':'轮到你落子';
  turn.innerHTML=`<span></span>${status}`;
  $('#move-count').textContent=replay?`第 ${replay.cursor} / ${replay.record.moves.length} 手`:`第 ${state.moves.length} 手`;
  $('#game-time').textContent=formatTime(replay?replay.record.elapsed:elapsed());
  $('#board-tip').hidden=!!state.moves.length||!!puzzle||!!replay||state.status!=='playing';
  $('#undo-button').disabled=!state.moves.length||!!replay||state.status==='finished'||state.status==='scoring';
  $('#hint-button').disabled=!canMove||!!puzzle;$('#resign-button').disabled=!state.moves.length||!canMove||!!puzzle;
  $('#pass-button').hidden=!isGo||!!replay||!!puzzle;$('#pass-button').disabled=!canMove;
  $('#board-area').classList.toggle('scoring',state.status==='scoring');
  $('#board').setAttribute('aria-label',`${state.size} 路${gameName(state.game)}棋盘。${status}。方向键选择交叉点，回车落子。`);
  $('#board').setAttribute('aria-rowcount',state.size);$('#board').setAttribute('aria-colcount',state.size);
  $('#replay-controls').hidden=!replay;$('.board-toolbar').hidden=!!replay;
  $('#insight-title').textContent=isGo?'留一点气，走得更远。':'好棋，从观察开始。';
  $('#insight-text').textContent=isGo?'相连的棋子共享「气」。先照顾自己的棋形，再寻找对手的薄弱之处。':'别急着进攻，也看看对手的下一步。攻守之间，藏着五子棋的乐趣。';
  if(state.status==='scoring'){
    const score=scoreGo(state.board,state.size,[...dead]);
    $('#hint-button').disabled=false;$('#hint-button').innerHTML=icon('check')+'<span>确认数子</span>';
    $('#restart-button').innerHTML=icon('play')+'<span>继续对局</span>';
    $('#move-count').textContent=`黑 ${score.black} · 白 ${score.white}（含贴目）`;
  }else{$('#hint-button').innerHTML=icon('bulb')+'<span>提示</span>';$('#restart-button').innerHTML=icon('plus')+'<span>重新开始</span>';}
  const completed=records.filter(r=>r.finishedAt&&new Date(r.finishedAt).toLocaleDateString('en-CA')===today()).length;
  $('#daily-count').textContent=`${completed} / 3 局`;$('#daily-progress').style.width=`${Math.min(100,completed/3*100)}%`;
  updateExperience();
  renderBoard();
}
function boardPoint(index){return [boardGeometry.margin+(index%state.size)*boardGeometry.step,boardGeometry.margin+Math.floor(index/state.size)*boardGeometry.step];}
function renderBoard(){
  const w=canvas.clientWidth;if(!w)return;const ratio=Math.min(window.devicePixelRatio||1,2.5);
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(w*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(w*ratio);}
  canvasSize=w;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,w);
  const theme=THEMES[preferences.theme]||THEMES.lime;const gradient=ctx.createLinearGradient(0,0,w,w);gradient.addColorStop(0,theme.board[0]);gradient.addColorStop(.45,theme.board[1]);gradient.addColorStop(1,theme.board[2]);ctx.fillStyle=gradient;ctx.fillRect(0,0,w,w);
  // Fine maple grain and a soft daylight wash keep the board tactile at any size.
  let seed=1287;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let i=0;i<150;i++){const y=rand()*w;ctx.strokeStyle=`rgba(147,112,54,${.012+rand()*.024})`;ctx.lineWidth=.35+rand()*.55;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(w*.29,y+rand()*4,w*.71,y-rand()*5,w,y+rand()*3);ctx.stroke();}
  const daylight=ctx.createRadialGradient(w*.20,w*.12,w*.03,w*.48,w*.43,w*.82);daylight.addColorStop(0,'rgba(255,253,232,.27)');daylight.addColorStop(.58,'rgba(255,250,222,.02)');daylight.addColorStop(1,'rgba(115,87,37,.10)');ctx.fillStyle=daylight;ctx.fillRect(0,0,w,w);
  const rim=ctx.createLinearGradient(0,0,w,w);rim.addColorStop(0,'rgba(255,255,240,.85)');rim.addColorStop(.5,'rgba(255,252,229,.25)');rim.addColorStop(1,'rgba(152,116,59,.23)');ctx.strokeStyle=rim;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(.7,.7,w-1.4,w-1.4,Math.max(8,w*.02));ctx.stroke();
  const margin=w*(preferences.coords?.071:.055), step=(w-margin*2)/(state.size-1);boardGeometry={margin,step};
  ctx.lineWidth=.65;ctx.strokeStyle=theme.grid;
  for(let i=0;i<state.size;i++){const p=margin+i*step;ctx.beginPath();ctx.moveTo(margin,p);ctx.lineTo(w-margin,p);ctx.moveTo(p,margin);ctx.lineTo(p,w-margin);ctx.stroke();}
  ctx.strokeStyle=theme.grid;ctx.lineWidth=1;ctx.strokeRect(margin,margin,w-margin*2,w-margin*2);
  const stars=state.size===19?[3,9,15]:state.size===15?[3,7,11]:state.size===13?[3,6,9]:[2,4,6];
  for(const x of stars)for(const y of stars){if((state.size===9||state.size===13||state.size===15)&&((x===stars[1])!==(y===stars[1])))continue;ctx.fillStyle=theme.grid;ctx.beginPath();ctx.arc(margin+x*step,margin+y*step,Math.max(1.6,w/215),0,Math.PI*2);ctx.fill();}
  if(preferences.coords){const letters='ABCDEFGHJKLMNOPQRST';ctx.fillStyle=theme.coordinate;ctx.font=`500 ${Math.max(8,w*.019)}px 'DM Sans',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<state.size;i++){const p=margin+i*step;ctx.fillText(letters[i],p,margin*.42);ctx.fillText(letters[i],p,w-margin*.39);ctx.fillText(String(state.size-i),margin*.41,p);ctx.fillText(String(state.size-i),w-margin*.41,p);}}
  if(together){const stage=TOGETHER_STAGES.find(s=>s.id===together.stageId);for(const i of stage.blocked){const[x,y]=boardPoint(i);ctx.fillStyle='#b7954c';ctx.font=`${step*.66}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',x,y);}}
  const r=step*.455,last=state.moves.at(-1),numbers=new Map();
  if(preferences.numbers)state.moves.forEach((m,i)=>{if(m.index>=0)numbers.set(m.index,i+1);});
  state.board.forEach((c,i)=>{if(!c)return;const [x,y]=boardPoint(i);drawStone(x,y,r,c,dead.has(i)?.35:1);
    if(preferences.numbers&&numbers.has(i)){ctx.fillStyle=c===1?'#f5f4dd':'#6d7462';ctx.font=`500 ${Math.max(7,r*.85)}px 'DM Sans',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(numbers.get(i),x,y+.5);}
    else if(last?.index===i){ctx.fillStyle=c===1?theme.signature:theme.accent;if(preferences.bloomMark){drawBloom(ctx,x,y,r*.43);}else{ctx.beginPath();ctx.arc(x,y,Math.max(2,r*.19),0,Math.PI*2);ctx.fill();}}
    if(dead.has(i)){ctx.strokeStyle='#b0644c';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(x-r*.4,y-r*.4);ctx.lineTo(x+r*.4,y+r*.4);ctx.moveTo(x+r*.4,y-r*.4);ctx.lineTo(x-r*.4,y+r*.4);ctx.stroke();}
  });
  if(state.line){const set=new Set(state.line);state.line.forEach(i=>{const [x,y]=boardPoint(i);ctx.strokeStyle=theme.signature;ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(x,y,r*.72,0,Math.PI*2);ctx.stroke();});}
  if(state.status==='scoring'){
    const score=scoreGo(state.board,state.size,[...dead]);for(const [i,owner]of Object.entries(score.territory)){if(!owner||dead.has(+i))continue;const [x,y]=boardPoint(+i);ctx.fillStyle=owner===1?'#3e473d77':'#fff9e3c9';ctx.fillRect(x-step*.11,y-step*.11,step*.22,step*.22);}
  }
  if(hint>=0&&!state.board[hint]){const[x,y]=boardPoint(hint);ctx.strokeStyle=theme.accent;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r*.79,0,Math.PI*2);ctx.stroke();ctx.fillStyle=theme.accent;ctx.font=`${r*1.2}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',x,y+1);}
  if(pending>=0){const[x,y]=boardPoint(pending);ctx.strokeStyle=theme.accent;ctx.lineWidth=2;ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(x,y,r*1.2,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
  if(reviewOverlay&&replay&&reviewOverlay.actual!==reviewOverlay.recommended&&reviewOverlay.actual>=0&&!state.board[reviewOverlay.actual]){const[x,y]=boardPoint(reviewOverlay.actual);drawStone(x,y,r,state.turn,.20);ctx.strokeStyle='#c49756';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(x,y,r*.90,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#a77d41';ctx.font=`600 ${Math.max(7,r*.75)}px 'Noto Sans SC',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('原',x,y);}
  const preview=pending>=0?pending:hover>=0?hover:keyboard;
  if(preview>=0&&!state.board[preview]&&state.status==='playing'&&!thinking&&!replay){const[x,y]=boardPoint(preview);drawStone(x,y,r,state.turn,.35);}
}
function drawStone(x,y,r,color,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;
  ctx.shadowColor='rgba(66,52,25,.27)';ctx.shadowBlur=r*.29;ctx.shadowOffsetX=r*.10;ctx.shadowOffsetY=r*.24;
  const fill=ctx.createRadialGradient(x-r*.32,y-r*.40,r*.03,x,y,r);
  if(color===1){fill.addColorStop(0,'#738b78');fill.addColorStop(.18,'#526b56');fill.addColorStop(.46,'#304b37');fill.addColorStop(.81,'#203b29');fill.addColorStop(1,'#152a1d');}
  else{fill.addColorStop(0,'#fffef9');fill.addColorStop(.38,'#fffdf1');fill.addColorStop(.72,'#f3eedb');fill.addColorStop(.91,'#e4e2cb');fill.addColorStop(1,'#d1d5bc');}
  ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  ctx.shadowColor='transparent';ctx.lineWidth=Math.max(.4,r*.025);ctx.strokeStyle=color===1?'rgba(25,55,33,.55)':'rgba(192,190,159,.55)';ctx.stroke();
  ctx.save();ctx.beginPath();ctx.arc(x,y,r*.97,0,Math.PI*2);ctx.clip();
  ctx.fillStyle=color===1?'rgba(244,255,232,.15)':'rgba(255,255,255,.58)';ctx.beginPath();ctx.ellipse(x-r*.27,y-r*.49,r*.29,r*.105,-.43,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=color===1?'rgba(158,189,142,.10)':'rgba(255,255,248,.45)';ctx.lineWidth=r*.055;ctx.beginPath();ctx.arc(x-r*.05,y-r*.05,r*.87,.4,1.55);ctx.stroke();ctx.restore();ctx.restore();
}
function indexFromPointer(e){const rect=canvas.getBoundingClientRect(),{margin,step}=boardGeometry,x=Math.round((e.clientX-rect.left-margin)/step),y=Math.round((e.clientY-rect.top-margin)/step);if(x<0||x>=state.size||y<0||y>=state.size)return -1;return y*state.size+x;}
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const index=indexFromPointer(e);if(hover!==index){hover=index;renderBoard();}});
canvas.addEventListener('pointerleave',()=>{hover=-1;renderBoard();});
canvas.addEventListener('click',e=>{if(e.detail===0)return;const i=indexFromPointer(e);if(i>=0)place(i);});
canvas.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)){
    e.preventDefault();if(keyboard<0)keyboard=Math.floor(state.size/2)*state.size+Math.floor(state.size/2);
    if(e.key==='Enter'||e.key===' '){place(keyboard,true);return;}
    const x=keyboard%state.size,y=Math.floor(keyboard/state.size);
    if(e.key==='ArrowLeft'&&x>0)keyboard--;if(e.key==='ArrowRight'&&x<state.size-1)keyboard++;
    if(e.key==='ArrowUp'&&y>0)keyboard-=state.size;if(e.key==='ArrowDown'&&y<state.size-1)keyboard+=state.size;
    hover=-1;renderBoard();canvas.setAttribute('aria-label',`${gameName(state.game)}棋盘，已选择 ${'ABCDEFGHJKLMNOPQRST'[keyboard%state.size]}${state.size-Math.floor(keyboard/state.size)}。回车落子。`);
  }
});
canvas.addEventListener('blur',()=>{keyboard=-1;renderBoard();});
new ResizeObserver(()=>requestAnimationFrame(renderBoard)).observe($('#board-area'));
function place(index,confirmed=false){
  if(replay)return;
  if(state.status==='scoring'){if(state.board[index]){const g=groupAt(state.board,index,state.size);const wasDead=dead.has(index);g.stones.forEach(i=>wasDead?dead.delete(i):dead.add(i));state.pendingDead=[...dead];persist();update();}return;}
  if(together){playTogether(index);return;}
  if(state.status!=='playing'){showResult();return;}if(thinking)return;
  if(state.opponent==='computer'&&state.turn!==state.human&&!puzzle)return;
  if(puzzle){attemptPuzzle(index);return;}
  const safe=preferences.confirmMode==='always'||(preferences.confirmMode==='auto'&&state.game==='go'&&state.size===19&&matchMedia('(max-width:760px)').matches);
  if(!confirmed&&safe&&pending!==index&&!state.board[index]){pending=index;update();return;}
  pending=-1;executeMove(index);
}
function executeMove(index,isComputer=false){
  const result=applyMove(state,index);
  if(result.error){if(!isComputer)notify({occupied:'这里已经有一颗棋子，换个位置试试。',suicide:'这一步没有气，且不能提子，请换个位置。',ko:'打劫不能立即回提，也不能重复之前的盘面。',outside:'请在棋盘交叉点落子。',finished:'这一局已经结束了。'}[result.error]||'这一步暂时不能落子。');update();return false;}
  if(!isComputer&&index>=0)insight=moveInsight(state.board,index,state.turn,state.game,state.size,state.positions);
  state=result.state;pending=-1;hint=-1;hover=-1;startClock();if(index>=0){playSound();animateLanding(index);}
  if(state.status==='finished'){finishGame('line');return true;}
  if(state.status==='scoring'){stopClock();cancelComputer();dead=new Set();update();persist();showScoringHelp();return true;}
  persist();update();if(state.opponent==='computer'&&state.turn!==state.human)computerTurn();return true;
}
function calculateMove(callback,level=state.level){
  const request=++workerRequest;
  worker?.terminate();
  if(state.game==='go'&&state.goEngine==='katago'){
    coach.play(state,level).then(result=>{if(request!==workerRequest)return;state.engine={name:'KataGo',model:result.model,backend:result.backend,visits:result.visits,searchMs:result.searchMs};callback(result.index);}).catch(e=>{if(request!==workerRequest||e.name==='AbortError')return;thinking=false;update();notify(e.message);});return;
  }
  try{
    worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.onmessage=e=>{if(e.data.id!==request||request!==workerRequest)return;worker?.terminate();worker=null;if(e.data.error){notify('电脑暂时没有回应，请重新尝试。');thinking=false;update();return;}callback(e.data.index);};
    worker.onerror=()=>{if(request!==workerRequest)return;worker?.terminate();worker=null;const index=bestMove(state.board,state.size,state.turn,state.game,level,state.positions);callback(index);};
    worker.postMessage({id:request,board:state.board,size:state.size,color:state.turn,game:state.game,level,history:state.positions});
  }catch{setTimeout(()=>{if(request===workerRequest)callback(bestMove(state.board,state.size,state.turn,state.game,level,state.positions));},10);}
}
function computerTurn(){
  if(thinking||replay||puzzle||together||variation||state.status!=='playing'||state.opponent!=='computer'||state.turn===state.human)return;
  thinking=true;update();const id=state.id;
  thinkTimeout=setTimeout(()=>{
    if(state.id!==id||!thinking)return;
    calculateMove(index=>{if(state.id!==id)return;thinking=false;
      // Once the user passes on a settled Go board, the practice engine also passes.
      if(state.game==='go'&&state.goEngine!=='katago'&&state.passes===1){const capture=index>=0?playMove(state.board,index,state.turn,'go',state.size,state.positions):null;if(!capture?.captured?.length){executeMove(-1,true);return;}}
      if(index<0&&state.game==='gomoku'){notify('棋盘已满');return;}
      executeMove(index,true);
    });
  },preferences.reduceMotion?30:420);
}
function finishGame(reason){
  if(variation){cancelComputer();stopClock();state.status='finished';state.reason=reason;update();showVariationResult();return;}
  cancelComputer();stopClock();state.status='finished';state.reason=reason;state.finishedAt=new Date().toISOString();state.elapsed=elapsed();
  if(!records.some(r=>r.id===state.id)){records.unshift({...state});records=records.slice(0,100);if(!storage.write('records',records))notify('当前浏览器存储已满，这局记录未能保存。');}
  persist();update();playSound('win');setTimeout(()=>{if(state.status==='finished'&&!replay&&!puzzle)showResult();},300);
}
function showResult(){
  if(variation){showVariationResult();return;}
  if(puzzle){showPuzzleResult();return;}
  if(together){showTogetherResult();return;}
  if(state.status!=='finished'||replay)return;
  const draw=state.winner===3,humanWon=state.winner===state.human;
  const title=draw?'棋逢对手，好局值得。':state.opponent==='local'?`${colorName(state.winner)}获胜，精彩的一局。`:humanWon?'这一局，你下得漂亮。':'每一局，都有新的收获。';
  const desc=state.reason==='resign'?`${colorName(other(state.winner))}认输，${colorName(state.winner)}获胜。`:draw?'棋盘已满，双方和棋。':state.game==='gomoku'?`${colorName(state.winner)}率先连成五子，获得胜利。`:`按中国数子法计分，白棋贴 7.5 目，${colorName(state.winner)}获胜。`;
  showModal(`<div class="modal-icon">${icon(humanWon||state.opponent==='local'?'trophy':'leaf')}</div><h2>${title}</h2><p>${desc}<br>共 ${state.moves.length} 手 · 用时 ${formatTime(state.elapsed)}<br>棋谱已保存到「对局记录」。</p>${kindMoment(state)}${state.score?`<div class="result-score"><div>黑方<strong>${state.score.black}</strong></div><div>白方 · 含贴目<strong>${state.score.white}</strong></div></div>`:''}<button class="primary-button result-teach" id="result-teach">看懂这局的关键手 ${icon('bulb')}</button><div class="modal-actions"><button class="secondary-button" id="result-review">回味棋局</button><button class="primary-button" id="result-again">再来一局 ${icon('arrow')}</button></div>`,()=>{bindKindMoment(state);$('#result-teach').onclick=()=>{closeModal();const record=records.find(r=>r.id===state.id);if(record)startTeaching(record);};$('#result-again').onclick=()=>{closeModal();newGame();};$('#result-review').onclick=()=>{closeModal();const record=records.find(r=>r.id===state.id);if(record)startReplay(record);};});
}
function showScoringHelp(){showModal(`<div class="modal-icon">${icon('check')}</div><h2>棋局收官，一起数子。</h2><p>双方连续停一手，进入数子阶段。<strong>请先点击棋盘上已确认无法存活的整块棋子，将其标为死子</strong>；再次点击可取消。</p><p>标记完成后，点击棋盘下方的「确认数子」。采用中国数子法，棋子与所围空点相加，白方贴 7.5 目。尚未分清的棋形可选择「继续对局」。</p><button class="primary-button" id="scoring-ok">明白，去标记</button>`,()=>{$('#scoring-ok').onclick=closeModal;});}
function finalizeScore(){const score=scoreGo(state.board,state.size,[...dead]);showModal(`<h2>确认这一局的结果</h2><p>已标记 ${dead.size} 颗死子。请确保双方对死活与边界没有争议；尚未确定时，可以继续对局。</p><div class="result-score"><div>黑方<strong>${score.black}</strong></div><div>白方 · 含 7.5 目贴目<strong>${score.white}</strong></div></div><p>${colorName(score.winner)}领先 ${Math.abs(score.black-score.white)} 点。</p><div class="modal-actions"><button class="secondary-button" id="score-back">再检查一下</button><button class="primary-button" id="score-confirm">确认结果</button></div>`,()=>{$('#score-back').onclick=closeModal;$('#score-confirm').onclick=()=>{closeModal();state.score={black:score.black,white:score.white};state.dead=[...dead];state.winner=score.winner;finishGame('score');};});}
function undo(){
  if(together){if(together.moves.length){together=restoreTogether(together.stageId,together.moves.slice(0,-1));syncTogether();persist();update();}return;}
  if(variation&&state.moves.length<=variation.cursor){notify('已经回到这个分支的起点。');return;}
  if(!state.moves.length||replay||state.status!=='playing')return;
  cancelComputer();stopClock();
  let count=1;if(state.opponent==='computer'&&!puzzle&&state.turn===state.human&&state.moves.length>=2)count=2;
  if(puzzle){state.board=[...puzzle.board];state.moves=[];state.positions=[key(state.board)];state.turn=1;state.captures={1:0,2:0};}
  else{const time=state.elapsed;state=replayState(state,state.moves.slice(0,-count));state.elapsed=time;}
  hint=-1;hover=-1;pending=-1;insight=null;dead.clear();startClock();persist();update();notify('已回到上一步。');
  if(state.opponent==='computer'&&state.turn!==state.human&&!puzzle&&!variation)computerTurn();
}
function showHint(){
  if(state.status==='scoring'){finalizeScore();return;}if(thinking||replay||state.status!=='playing'||puzzle)return;
  thinking=true;update();
  calculateMove(index=>{thinking=false;hint=index;insight=moveInsight(state.board,index,state.turn,state.game,state.size,state.positions);update();notify(index<0?'当前可以考虑停一手，等待双方确认收官。':`试着观察 ${'ABCDEFGHJKLMNOPQRST'[index%state.size]}${state.size-Math.floor(index/state.size)}，这一手也许有新的可能。`);},'hard');
}
function navigate(next){
  if(!['play','garden','puzzles','records','learn'].includes(next))next='play';
  const previous=page;
  if(previous==='garden'&&next!=='garden')garden?.leave();
  if(next==='garden'){stopClock();cancelComputer();gardenPaused=true;persist();}
  page=next;releaseLayout?.navigate(next);
  $$('.page').forEach(p=>p.hidden=p.id!=='page-'+next);$$('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===next);b.setAttribute('aria-current',b.dataset.page===next?'page':'false');});
  if(next!=='play')coach?.cancelReview();
  $('#page-crumb').textContent={play:'对弈大厅',garden:'成长花园',puzzles:'每日挑战',records:'对局记录',learn:'入门课堂'}[next];
  if(next==='garden')garden?.open();if(next==='puzzles')renderPuzzles();if(next==='records')renderRecords();if(next==='learn')renderLearn();
  if(next==='play'){coach?.update();requestAnimationFrame(renderBoard);if(gardenPaused){gardenPaused=false;startClock();if(state.opponent==='computer'&&state.turn!==state.human)computerTurn();}}
  if(location.hash!=='#'+next)history.replaceState(null,'','#'+next);
  document.body.classList.remove('focus-mode');window.scrollTo({top:0,behavior:'instant'});
}

// Curated one-move problems. Display and play use the same board positions.
function position(size,black,white){const b=Array(size*size).fill(0);for(const[x,y]of black)b[y*size+x]=1;for(const[x,y]of white)b[y*size+x]=2;return b;}
const puzzles=[
  {id:'connect',game:'gomoku',size:15,title:'最后一颗星',tag:'五子棋 · 连珠入门',desc:'黑棋已经蓄势待发。执黑先行，用一手连成五子。',goal:'win',board:position(15,[[5,7],[6,7],[7,7],[8,7],[7,6]],[[4,7],[6,6],[8,6],[9,8],[8,8]])},
  {id:'gap',game:'gomoku',size:15,title:'藏在中间的答案',tag:'五子棋 · 观察棋形',desc:'连线不一定从两端延伸。找到空缺，让黑棋一手获胜。',goal:'win',board:position(15,[[4,5],[5,6],[7,8],[8,9],[8,6]],[[3,4],[7,6],[8,7],[9,9],[6,8]])},
  {id:'capture',game:'go',size:9,title:'只差一口气',tag:'围棋 · 提子练习',desc:'这块白棋只剩最后一口气。执黑先行，一手提掉两颗白子。',goal:'capture',target:2,board:position(9,[[2,3],[3,2],[3,4],[4,2],[4,4]],[[3,3],[4,3]])}
];
function puzzleGraphic(p){
  const size=p.game==='go'?7:9,fromX=p.game==='go'?1:3,fromY=p.game==='go'?1:3,step=26,m=17,w=m*2+(size-1)*step;
  let s=`<svg viewBox="0 0 ${w} ${w}" aria-label="${p.title}棋形预览" role="img"><defs><radialGradient id="pb-${p.id}" cx="33%" cy="27%"><stop stop-color="#69705f"/><stop offset="1" stop-color="#303b2c"/></radialGradient><radialGradient id="pw-${p.id}" cx="33%" cy="27%"><stop stop-color="#fffef8"/><stop offset="1" stop-color="#e9e7d8"/></radialGradient></defs>`;
  for(let i=0;i<size;i++){let c=m+i*step;s+=`<path d="M${m} ${c}H${w-m}M${c} ${m}V${w-m}" stroke="#c7b180" stroke-width=".8"/>`;}
  p.board.forEach((c,i)=>{const x=i%p.size-fromX,y=Math.floor(i/p.size)-fromY;if(c&&x>=0&&y>=0&&x<size&&y<size)s+=`<circle cx="${m+x*step+1}" cy="${m+y*step+2}" r="11.7" fill="#7c683b25" stroke="none"/><circle cx="${m+x*step}" cy="${m+y*step}" r="11.5" fill="url(#p${c===1?'b':'w'}-${p.id})" stroke="${c===1?'#3e4633':'#d9d2bb'}" stroke-width=".5"/>`;});
  return s+'</svg>';
}
function renderPuzzles(){
  const solved=storage.read('solved',{}),date=new Date();$('#puzzle-date').textContent=`${date.getFullYear()} 年 ${date.getMonth()+1} 月 ${date.getDate()} 日 · 给今天一点小小的挑战`;
  $('#puzzle-grid').innerHTML=puzzles.map((p,i)=>`<article class="puzzle-card"><div class="puzzle-preview">${puzzleGraphic(p)}</div><div class="puzzle-tag"><span>0${i+1} / ${p.tag}</span>${solved[today()+p.id]?'<span class="solved-label">已完成 ✓</span>':''}</div><h2>${p.title}</h2><p>${p.desc}</p><button class="primary-button" data-puzzle="${p.id}">${solved[today()+p.id]?'再想一遍':'开始挑战'} ${icon('arrow')}</button></article>`).join('');
  $$('[data-puzzle]').forEach(b=>b.onclick=()=>confirmAction('给自己一个小挑战？','进入棋题会替换当前未完成的对局。完成的棋谱仍然保存在对局记录中。',()=>startPuzzle(puzzles.find(p=>p.id===b.dataset.puzzle)),'开始挑战'));
}
function startPuzzle(p){
  coach?.cancelReview();reviewOverlay=null;stopClock();cancelComputer();together=null;variation=null;pending=-1;insight=null;storage.write('last-mode','classic');replay=null;puzzle=p;dead.clear();hint=-1;hover=-1;
  state=createGame({game:p.game,size:p.size,opponent:'local',human:1});state.board=[...p.board];state.positions=[key(state.board)];
  config={game:p.game,size:p.game==='go'?p.size:9,opponent:'computer',level:'easy',human:1,goEngine:'katago'};
  navigate('play');updateConfig();update();notify(p.desc);
}
function attemptPuzzle(index){
  const move=playMove(state.board,index,1,puzzle.game,state.size,state.positions);
  if(move.error){notify(move.error==='occupied'?'这里已有棋子，再观察一下。':'这一步无法落子，换个位置试试。');return;}
  const correct=puzzle.goal==='win'?move.winner===1:move.captured.length>=puzzle.target;
  if(!correct){hint=index;notify('再想一想：'+(puzzle.goal==='win'?'哪一手能让五颗黑子连成一线？':'白棋最后一口气，在哪里？'));renderBoard();return;}
  state.board=move.board;state.moves=[{index,color:1,captured:move.captured}];state.line=move.line;state.status='finished';state.winner=1;hint=-1;playSound('win');update();
  const solved=storage.read('solved',{});solved[today()+puzzle.id]=true;storage.write('solved',solved);
  showPuzzleResult();
}
function renderRecords(){
  const humanGames=records.filter(r=>r.opponent==='computer'),wins=humanGames.filter(r=>r.winner===r.human).length;
  $('#stats-row').innerHTML=`<div class="stat-card"><small>留下的棋局</small><strong>${records.length}<span>局</span></strong></div><div class="stat-card"><small>人机获胜</small><strong>${wins}<span>局</span></strong></div><div class="stat-card"><small>认真走过</small><strong>${records.reduce((n,r)=>n+r.moves.length,0)}<span>手</span></strong></div>`;
  $('#export-all').disabled=!records.length;
  if(!records.length){$('#record-list').innerHTML=`<div class="empty-state"><div class="empty-icon">${icon('history')}</div><h2>故事，从第一局开始。</h2><p>完成一局对弈后，棋谱会自动保存在这里。<br>回看每一次思考，收藏每一次进步。</p><button class="primary-button" id="empty-play">去下一局 ${icon('arrow')}</button></div>`;$('#empty-play').onclick=()=>navigate('play');return;}
  $('#record-list').innerHTML=records.map((r,i)=>`<article class="record-card ${r.favorite?'cherished':''}"><span class="record-icon">${icon(r.game==='go'?'grid':'spark')}</span><div class="record-details"><h3>${gameName(r.game)} · ${r.opponent==='local'?'同屏双人':levelNames[r.level]||'人机练习'}</h3><p>${escape(new Date(r.finishedAt||r.createdAt).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}))} · ${r.size} 路 · ${r.moves.length} 手 · ${formatTime(r.elapsed||0)}</p>${r.kindNote?`<div class="record-kind-note">♡ ${escape(r.kindNote)}</div>`:''}</div><span class="record-result">${r.winner===3?'和棋':colorName(r.winner)+'获胜'}</span><div class="record-actions"><button class="record-favorite ${r.favorite?'selected':''}" data-favorite="${i}" aria-label="${r.favorite?'取消珍藏':'珍藏这局棋'}" aria-pressed="${!!r.favorite}" title="${r.favorite?'取消珍藏':'珍藏这局棋'}">${icon('heart')}</button><button class="small-button" data-review="${i}">${icon('play')}回放</button><button class="small-button" data-teach="${i}">${icon('bulb')}教学</button><button class="small-button" data-signature="${i}">${icon('spark')}签名卡</button><button class="small-button" data-export="${i}" aria-label="导出第 ${i+1} 局棋谱">${icon('download')}棋谱</button></div></article>`).join('');
  $$('[data-review]').forEach(b=>b.onclick=()=>confirmAction('回到这局棋的起点','开始回放将替换当前未完成的棋局。已完成的棋谱会继续保存在这里。',()=>startReplay(records[+b.dataset.review]),'查看回放'));
  $$('[data-teach]').forEach(b=>b.onclick=()=>confirmAction('看懂这一局，发现下一步','进入教学复盘会替换当前未完成的对局，完成的棋谱继续保存在记录中。',()=>startTeaching(records[+b.dataset.teach]),'开始复盘'));
  $$('[data-signature]').forEach(b=>b.onclick=()=>showSignature(records[+b.dataset.signature]));
  $$('[data-favorite]').forEach(b=>b.onclick=()=>{const r=records[+b.dataset.favorite];r.favorite=!r.favorite;storage.write('records',records);renderRecords();});
  $$('[data-export]').forEach(b=>b.onclick=()=>download(`MYSKME-${records[+b.dataset.export].createdAt.slice(0,10)}.sgf`,exportSGF(records[+b.dataset.export]),'application/x-go-sgf'));
}
function startReplay(record){
  coach?.cancelReview();reviewOverlay=null;stopClock();cancelComputer();together=null;variation=null;pending=-1;insight=null;storage.write('last-mode','classic');puzzle=null;hint=-1;hover=-1;dead.clear();
  replay={record,cursor:record.moves.length};state=replayState(record,record.moves);state.winner=record.winner;state.status='finished';state.reason=record.reason;state.score=record.score;
  if(record.dead)dead=new Set(record.dead);
  config={game:state.game,size:state.game==='go'?state.size:9,opponent:state.opponent,level:state.level,human:state.human,goEngine:state.goEngine||'light'};
  navigate('play');$('#replay-range').max=record.moves.length;$('#replay-range').value=record.moves.length;updateConfig();update();
}
function seekReplay(cursor,fromCoach=false){if(!replay)return;reviewOverlay=null;hint=-1;if(!fromCoach)coach?.clearSelection();replay.cursor=Math.max(0,Math.min(replay.record.moves.length,cursor));state=replayState(replay.record,replay.record.moves.slice(0,replay.cursor));if(replay.cursor===replay.record.moves.length){state.winner=replay.record.winner;state.status='finished';}dead.clear();$('#replay-range').value=replay.cursor;update();}
function download(filename,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已生成下载文件。');}
const lessons=[
  ['01','五子棋 · 先连五子，就赢了','双方轮流在交叉点落下一颗棋子，黑棋先行。横、竖或斜线，<strong>任意方向连续五颗同色棋子</strong>即可获胜。本棋室采用自由规则：不设三三、四四禁手，长连也算获胜。','five'],
  ['02','五子棋 · 看见进攻，也看见防守','「活三」是两端都能延伸的连续三子，「冲四」只差一步就能成五。<strong>对手已成四时，先挡住关键点</strong>；进攻时，试着创造两个方向的威胁。','four'],
  ['03','围棋 · 气，是棋子的呼吸','棋子上下左右相邻的空点叫「气」。相连的同色棋子共享气；<strong>一整块棋子的气被占完，就会被提走</strong>。斜角相邻不算直接相连。不能下没有气又无法提子的自杀棋。','liberty'],
  ['04','围棋 · 围住空间，走向收官','黑棋先行，不想落子可以「停一手」。为避免无穷循环，<strong>不允许重复已出现的盘面</strong>。双方连续停一手后，标记死子并数子：活子与所围空点相加，白方贴 7.5 目。','territory']
];
function renderLearn(){
  $('#learn-grid').innerHTML=lessons.map(([n,title,text,visual])=>`<article class="lesson-card"><div class="lesson-top"><span class="lesson-number">${n}</span><h2>${title}</h2></div><p>${text}</p><div class="lesson-visual ${visual}">${visual==='liberty'?'<span class="liberty-dot"></span><span class="lesson-stone"></span><span class="liberty-dot"></span>':visual==='territory'?'<span class="lesson-stone"></span><span class="lesson-stone white"></span><span class="lesson-stone"></span><span class="lesson-stone white"></span>':Array(visual==='five'?5:4).fill('<span class="lesson-stone"></span>').join('')}</div></article>`).join('');
}
function showRules(){const go=state.game==='go';showModal(`<div class="modal-icon">${icon(go?'grid':'spark')}</div><h2>${gameName(state.game)}，从这一步开始。</h2>${go?'<ul><li>黑先白后，棋子落在交叉点，相连同色棋子共享气。</li><li>对手整块棋子的气为零时，提走这块棋子。</li><li>不可自杀，也不可重复已出现的盘面（超级劫规则）。</li><li>双方连续停一手后，点击标记死子，再确认数子。</li><li>中国数子法：活子 + 所围空点，白方贴 7.5 目。</li></ul><p>围棋可选择 KataGo 神经网络陪练或轻量练习。模型与搜索在本机运行，有限预算不对应官方段位。复杂死活与争议棋形请继续下清楚后再数子。</p>':'<ul><li>黑棋先行，双方轮流落下一颗棋子。</li><li>棋子落在棋盘交叉点，落下后不能移动。</li><li>横、竖、斜任意方向连成五子，即可获胜。</li><li>本棋室采用自由规则，不设禁手，长连也算胜。</li><li>人机练习可一次悔回你与电脑的上一轮。</li></ul><p>提示来自本地棋形分析，仅供思考参考。所有对局均在当前设备上进行。</p>'}<button class="primary-button" id="rules-ok">明白了，开始思考 ${icon('arrow')}</button>`,()=>{$('#rules-ok').onclick=closeModal;});}
function showSettings(){showModal(`<div class="modal-icon">${icon('settings')}</div><h2>让棋室，更像你。</h2><p>偏好会自动保存在当前浏览器中。</p><label class="settings-row">落子音效<input type="checkbox" id="pref-sound" ${preferences.sound?'checked':''}></label><label class="settings-row">棋盘坐标<input type="checkbox" id="pref-coords" ${preferences.coords?'checked':''}></label><label class="settings-row">显示手数<input type="checkbox" id="pref-numbers" ${preferences.numbers?'checked':''}></label><label class="settings-row">减少动画<input type="checkbox" id="pref-motion" ${preferences.reduceMotion?'checked':''}></label><section class="backup-panel"><h3>保管你的棋局与成长</h3><p>导出一份备份，换设备或网址时再带回来。导入时会合并棋谱与花园，已有内容优先保留。</p><div><button class="small-button" id="backup-export">导出完整备份 ${icon('download')}</button><button class="small-button" id="backup-import">导入备份 ${icon('leaf')}</button></div><small class="release-version">MYSKME 棋室 · 正式版 ${APP_VERSION}<br>棋谱、昵称和成长进度保存在当前浏览器；围棋模型按需加载，棋谱不上传。</small></section><div class="modal-actions"><button class="primary-button" id="settings-done">刚刚好 ${icon('check')}</button></div>`,()=>{for(const[id,k]of [['sound','sound'],['coords','coords'],['numbers','numbers'],['motion','reduceMotion']])$('#pref-'+id).onchange=e=>{preferences[k]=e.target.checked;savePreferences();renderBoard();};$('#settings-done').onclick=closeModal;backupUI?.bind();});}
function applyTheme(){
  if(!Object.hasOwn(THEMES,preferences.theme)||garden&&!garden.themeUnlocked(preferences.theme))preferences.theme='lime';
  if(!garden?.markUnlocked(preferences.markStyle))preferences.markStyle='bloom';
  if(!garden?.cardUnlocked(preferences.cardDecoration))preferences.cardDecoration='plain';
  if(!['auto','always','off'].includes(preferences.confirmMode))preferences.confirmMode='auto';
  preferences.nickname=typeof preferences.nickname==='string'?preferences.nickname.slice(0,12):'自在棋手';
  const t=THEMES[preferences.theme],root=document.documentElement;root.dataset.theme=preferences.theme;
  for(const[k,v]of Object.entries({'--green':t.accent,'--green-dark':t.accent,'--ink':t.ink,'--brand-soft':t.soft,'--brand-pop':t.signature,'--board-rim':t.board[1],'--board-depth':({lime:'#d1b98c',peach:'#d7b8a0',sky:'#b1cbc5',mint:'#adcbb8',honey:'#d9bf88'})[preferences.theme],'--bg':preferences.theme==='peach'?'#fbf7f3':preferences.theme==='sky'?'#f3f8fa':preferences.theme==='mint'?'#f3f9f5':preferences.theme==='honey'?'#fbf8ef':'#f6f8f3'}))root.style.setProperty(k,v);
  $('#profile-name').textContent=preferences.nickname.trim()||'自在棋手';
  $$('[data-theme]').forEach(b=>{const selected=b.dataset.theme===preferences.theme;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
}
function setTheme(name){if(!Object.hasOwn(THEMES,name)||garden&&!garden.themeUnlocked(name))return;preferences.theme=name;savePreferences();renderBoard();garden?.refresh();}
function animateLanding(index){if(preferences.reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const ripple=document.createElement('span');ripple.className='stone-ripple';const[x,y]=boardPoint(index);ripple.style.left=`${x/canvasSize*100}%`;ripple.style.top=`${y/canvasSize*100}%`;ripple.style.width=boardGeometry.step+'px';ripple.style.height=boardGeometry.step+'px';$('#board-area').appendChild(ripple);const a=ripple.animate([{transform:'translate(-50%,-50%) scale(.65)',opacity:.55},{transform:'translate(-50%,-50%) scale(1.8)',opacity:0}],{duration:460,easing:'ease-out'});a.onfinish=()=>ripple.remove();}
function drawBloom(c,x,y,r){drawGardenMark(c,x,y,r,preferences.markStyle||'bloom');}
function showStudio(){
  showModal(`<div class="studio-modal-head"><span class="studio-number">MY / 01</span><img src="./brand-bloom.svg" alt=""></div><h2>你的棋室，<br>就该有你的样子。</h2><p>MAKE YOURSELF <strong>SPECIAL</strong> &amp; KIND<br>选一种心情，把特别留在每一步里。</p><div class="theme-grid">${Object.entries(THEMES).filter(([id])=>!garden||garden.themeUnlocked(id)).map(([id,t])=>`<button class="theme-option ${id===preferences.theme?'selected':''}" data-theme="${id}"><span class="theme-preview" style="--swatch:${t.soft};--swatch-ink:${t.accent};--swatch-board:${t.board[1]}"><i></i><b></b><em>✳</em></span><strong>${t.name}</strong><small>${t.subtitle}</small>${icon('check')}</button>`).join('')}</div>${garden?.studioMarks()||''}<label class="studio-name-label" for="studio-name">你的棋手签名 <span>也会出现在棋局签名卡上</span></label><input class="studio-name-input" id="studio-name" maxlength="12" value="${escape(preferences.nickname)}" placeholder="自在棋手" autocomplete="off"><label class="settings-row">MYSKME 花印标记<input type="checkbox" id="pref-bloom" ${preferences.bloomMark?'checked':''}></label><label class="settings-row">精确落子<select id="pref-confirm"><option value="auto" ${preferences.confirmMode==='auto'?'selected':''}>19 路手机棋盘自动确认</option><option value="always" ${preferences.confirmMode==='always'?'selected':''}>每次落子前确认</option><option value="off" ${preferences.confirmMode==='off'?'selected':''}>直接落子</option></select></label><div class="modal-actions"><button class="primary-button" id="studio-done">特别，刚刚好 ${icon('heart')}</button></div>`,()=>{
    $$('.theme-option').forEach(b=>b.onclick=()=>setTheme(b.dataset.theme));
    $$('[data-growth-mark]').forEach(b=>b.onclick=()=>{if(!garden.markUnlocked(b.dataset.growthMark))return;preferences.markStyle=b.dataset.growthMark;preferences.bloomMark=true;$('#pref-bloom').checked=true;$$('[data-growth-mark]').forEach(n=>n.classList.toggle('selected',n===b));savePreferences();renderBoard();});
    $('#studio-name').oninput=e=>{preferences.nickname=e.target.value;savePreferences();};
    $('#pref-bloom').onchange=e=>{preferences.bloomMark=e.target.checked;savePreferences();renderBoard();};
    $('#pref-confirm').onchange=e=>{preferences.confirmMode=e.target.value;pending=-1;savePreferences();update();};
    $('#studio-done').onclick=closeModal;
  });
}
function showBrandStory(){showModal(`<div class="brand-story-art"><img src="./brand-bloom.svg" alt="MYSKME 善意之芽"><span>BE SPECIAL.<br><i>PLAY KIND.</i></span></div><div class="story-eyebrow">MAKE YOURSELF SPECIAL &amp; KIND</div><h2>特别一点，<br>温柔一点。</h2><p>我们把两片不同的叶子，画成一颗向上的心。这是 MYSKME 的「善意之芽」：保留自己的方向，也给彼此生长的空间。</p><div class="brand-values"><div><b>01 / SPECIAL</b><strong>下出自己的样子</strong><p>挑一种配色，试一条新分支，允许自己与众不同。</p></div><div><b>02 / KIND</b><strong>为对手留一份温柔</strong><p>合作时彼此成全，终局后留一句善意，也对自己少一点苛责。</p></div></div><button class="primary-button" id="brand-done">让下一步，开始生长 ${icon('leaf')}</button>`,()=>{$('#brand-done').onclick=closeModal;});}
function updateExperience(){
  document.body.classList.toggle('together-mode',!!together);
  $('#together-panel').hidden=!together;$('.setup-card').hidden=!!together||!!replay;
  $('#hint-button').hidden=!!together;$('#resign-button').hidden=!!together||!!variation;
  $('#review-tools').hidden=!replay;$('#branch-button').disabled=!replay||state.status!=='playing';
  $('#variation-banner').hidden=!variation;
  if(variation){$('#board-title').textContent='变化推演';$('#variation-origin').textContent=`从第 ${variation.cursor} 手出发 · 原谱完整保留`;$('#undo-button').disabled=state.moves.length<=variation.cursor||state.status!=='playing';}
  $('#move-confirm').hidden=pending<0||thinking||!!replay||state.status!=='playing';
  if(pending>=0)$('#pending-coordinate').textContent=`${'ABCDEFGHJKLMNOPQRST'[pending%state.size]}${state.size-Math.floor(pending/state.size)} · ${colorName(state.turn)}的下一步`;
  if(insight&&!together){$('#insight-title').textContent=insight.title;$('#insight-text').textContent=insight.text;$('#insight-tag').textContent=insight.tag;}
  else $('#insight-tag').textContent='慢慢想，也很好';
  coach?.update();garden?.refreshMini();releaseLayout?.schedule();
  if(!together){$('#learn-more').innerHTML='多学一招 '+icon('arrow');return;}
  const stage=TOGETHER_STAGES.find(s=>s.id===together.stageId),saved=storage.read('together-blooms',[]),completed=Array.isArray(saved)?saved:[];
  $('#board-title').textContent=stage.name;$('#board-rule').textContent='9 路 · 原创合作棋';
  $('#black-name').textContent='黑棋搭档';$('#white-name').textContent='白棋搭档';
  $('#black-detail').textContent=together.blooms[1]?'已经绽放 ✳':'为彼此留一点空间';$('#white-detail').textContent=together.blooms[2]?'已经绽放 ✳':'一起，让五子成花';
  $('#turn-status').innerHTML=`<span></span>${together.status==='success'?'两朵花，一起开':together.status==='retry'?'换条路，再一起试':`轮到${colorName(together.turn)}搭档`}`;
  $('#move-count').textContent=`共同走过 ${together.moves.length} / ${stage.limit} 手`;$('#game-time').textContent='KIND TOGETHER';
  $('#board-tip').hidden=true;$('#pass-button').hidden=true;$('#undo-button').disabled=!together.moves.length;
  $('#restart-button').innerHTML=icon('leaf')+'<span>重新共弈</span>';
  $('#together-budget').innerHTML=`${together.moves.length} <small>/ ${stage.limit} 手</small>`;
  $('#turn-petals').innerHTML=Array.from({length:stage.limit},(_,i)=>`<i class="${i<together.moves.length?'used':''}" aria-hidden="true"></i>`).join('');
  for(const color of [1,2]){const b=$(color===1?'#bloom-black':'#bloom-white');b.classList.toggle('bloomed',!!together.blooms[color]);b.querySelector('b').textContent=together.blooms[color]?'绽放 ✳':'含苞';}
  $('#stage-select').innerHTML=TOGETHER_STAGES.map((s,i)=>`<button data-stage="${s.id}" class="${s.id===stage.id?'selected':''}"><span>0${i+1}</span><strong>${s.name}</strong><small>${completed.includes(s.id)?'已绽放 ✳':'6 手同行'}</small></button>`).join('');
  $$('[data-stage]').forEach(b=>b.onclick=()=>{if(b.dataset.stage!==together.stageId)startTogether(b.dataset.stage);});
  $('#insight-title').textContent=stage.word;$('#insight-text').textContent=stage.note;$('#insight-tag').textContent='合作，不抢功';
  $('#learn-more').innerHTML='共弈玩法 '+icon('arrow');
}
function syncTogether(){
  const base=createGame({game:'gomoku',opponent:'local'});
  state={...base,id:together.id,board:together.board,size:9,turn:together.turn,moves:together.moves,status:together.status==='playing'?'playing':'finished',winner:together.status==='success'?3:0,line:[...(together.blooms[1]||[]),...(together.blooms[2]||[])]};
}
function startTogether(stageId=TOGETHER_STAGES[0].id){
  coach?.cancelReview();reviewOverlay=null;stopClock();cancelComputer();puzzle=null;replay=null;variation=null;pending=-1;hover=-1;hint=-1;keyboard=-1;insight=null;dead.clear();
  together=createTogether(stageId);syncTogether();storage.write('last-mode','together');persist();navigate('play');updateConfig();update();
}
function restoreTogetherSession(){
  if(storage.read('last-mode','classic')!=='together')return;
  const saved=storage.read('together-active',{});
  if(!TOGETHER_STAGES.some(s=>s.id===saved.stageId)||!Array.isArray(saved.moves)||saved.moves.length>6)return;
  together=restoreTogether(saved.stageId,saved.moves.filter(m=>m&&Number.isInteger(m.index)));syncTogether();
}
function playTogether(index){
  if(together.status!=='playing'){showTogetherResult();return;}
  const result=togetherMove(together,index);
  if(result.error){notify(result.error==='seed'?'这是琥珀种子，换个交叉点，让路线绕过它。':'这里已经有一颗棋子，试试别的方向。');return;}
  together=result.session;syncTogether();playSound();persist();update();animateLanding(index);
  if(together.status==='success'){
    const saved=storage.read('together-blooms',[]),completed=Array.isArray(saved)?saved:[];
    if(!completed.includes(together.stageId)){completed.push(together.stageId);storage.write('together-blooms',completed);}
    garden?.togetherBloom(together.stageId);playSound('win');update();showTogetherResult();
  }else if(together.status==='retry')showTogetherResult();
}
function showTogetherRules(){showModal(`<div class="modal-icon">${icon('heart')}</div><h2>这一次，赢在一起。</h2><p>「双生共弈」是 MYSKME 设计的同屏合作棋题，可以一个人解，也可以和身边的人轮流落子。</p><ul><li>棋盘已放好黑白种子棋。黑先白后，轮流落子。</li><li>共享 6 手，让黑棋和白棋各连成至少一条五子线。</li><li>横、竖、斜均可。琥珀色星形种子不能落子，也不能参与连线。</li><li>一方先连五不会结束游戏；双方都连五，才一起获胜。</li><li>可以悔棋、换思路；三道合作棋题均可独立选择。</li></ul><p>特别，是找到自己的路。善意，是也让对方的那朵花开出来。</p><button class="primary-button" id="together-rules-ok">明白了，一起开花 ${icon('leaf')}</button>`,()=>{$('#together-rules-ok').onclick=closeModal;});}
function showTogetherResult(){
  if(!together||together.status==='playing')return;
  const success=together.status==='success',idx=TOGETHER_STAGES.findIndex(s=>s.id===together.stageId),all=storage.read('together-blooms',[]);
  showModal(`<div class="together-result-art ${success?'success':''}"><img src="./brand-bloom.svg" alt=""><span>${success?'✳':'✧'}</span></div><div class="story-eyebrow">${success?'TWO FLOWERS. ONE BEAUTIFUL WIN.':'EVERY TRY IS A LITTLE GROWTH.'}</div><h2>${success?'你们，让彼此都开花了。':'换一条路，花还会开。'}</h2><p>${success?'两条五子线，两个不同的方向。谢谢你们，为彼此留出了一点空间。':'六手已经用完，黑白还没有同时连成五子。可以悔回关键一步，先讨论各自的路线，再一起出发。'}</p>${success?`<div class="together-collection">共弈花园 <strong>${Array.isArray(all)?all.length:1} / 3</strong> 朵已绽放</div>`:''}<div class="modal-actions"><button class="secondary-button" id="together-result-back">${success?'看看两朵花':'回到棋盘悔一步'}</button><button class="primary-button" id="together-result-next">${success&&idx<2?'下一颗种子':'再试一种可能'} ${icon('arrow')}</button></div>`,()=>{
    $('#together-result-back').onclick=closeModal;
    $('#together-result-next').onclick=()=>{closeModal();startTogether(success&&idx<2?TOGETHER_STAGES[idx+1].id:together.stageId);};
  });
}
function showVariationResult(){if(!variation)return;showModal(`<div class="modal-icon">${icon('branch')}</div><h2>另一种可能，也走到了终点。</h2><p>这段变化只用于练习，原来的棋谱完整保留。回到原谱，继续发现新的思路。</p><button class="primary-button" id="variation-finished">回到原谱</button>`,()=>{$('#variation-finished').onclick=()=>{closeModal();returnVariation();};});}
function showPuzzleResult(){if(!puzzle)return;showModal(`<div class="modal-icon">${icon('spark')}</div><h2>灵光一现，答对了！</h2><p>${puzzle.goal==='win'?'连接五子，胜负就在这一手之间。先观察已有的连线，再寻找突破口。':'找到最后一口气，成功提走两颗白子！提子之后，黑棋也有了更多活动空间。'}</p><div class="modal-actions"><button class="secondary-button" id="puzzle-back">返回挑战</button><button class="primary-button" id="puzzle-play">来一局实战 ${icon('arrow')}</button></div>`,()=>{$('#puzzle-back').onclick=()=>{closeModal();navigate('puzzles');};$('#puzzle-play').onclick=()=>{closeModal();newGame(config);};});}
function startTeaching(record){startReplay(record);coach.open(record,true);}
function startVariation(){
  if(!replay||state.status!=='playing')return;
  const record=replay.record,cursor=replay.cursor;reviewOverlay=null;coach?.cancelReview();stopClock();cancelComputer();variation={record,cursor};replay=null;pending=-1;hint=-1;insight=null;
  state=replayState(record,record.moves.slice(0,cursor));state.opponent='local';state.elapsed=0;update();
  notify('试试另一手。原谱完整保留，随时可以回去。');
}
function returnVariation(){if(!variation)return;const{record,cursor}=variation;startReplay(record);seekReplay(cursor);}
function kindMoment(record){return `<div class="kind-moment"><div>${icon('heart')}<strong>为这局，留一句善意</strong><span>KIND / 02</span></div><p>写进自己的棋谱，也留给一起下棋的人。</p><div class="kind-note-options">${KIND_NOTES.map((n,i)=>`<button data-kind-note="${i}" class="${record.kindNote===n?'selected':''}">${n}<span>♡</span></button>`).join('')}</div><button class="text-button" id="open-signature">生成我的棋局签名卡 ${icon('arrow')}</button></div>`;}
function bindKindMoment(record){
  $$('[data-kind-note]').forEach(b=>b.onclick=()=>{const note=KIND_NOTES[+b.dataset.kindNote],saved=records.find(r=>r.id===record.id);if(!saved)return;saved.kindNote=note;record.kindNote=note;storage.write('records',records);$$('[data-kind-note]').forEach(n=>n.classList.toggle('selected',n===b));notify('这句善意，已写进这局棋谱。');garden?.kindNote(saved);});
  $('#open-signature').onclick=()=>showSignature(records.find(r=>r.id===record.id)||record);
}
function showSignature(record){
  showModal(`<div class="signature-modal-title"><span class="story-eyebrow">MY SPECIAL LITTLE MOMENT</span><h2>这一局，独一无二。</h2><p>用真实的终局棋形，生成属于你的 MYSKME 签名卡。</p></div><div class="signature-preview"><canvas id="signature-canvas" aria-label="MYSKME 棋局签名卡预览"></canvas></div><div class="signature-palette"><span>选择一份心情</span>${Object.entries(THEMES).filter(([id])=>!garden||garden.themeUnlocked(id)).map(([id,t])=>`<button data-card-theme="${id}" aria-label="${t.name}" title="${t.name}" style="background:${t.signature}" class="${id===preferences.theme?'selected':''}"></button>`).join('')}</div>${garden?.cardControls()||''}<button class="primary-button" id="signature-download">${icon('download')}保存签名卡 PNG</button><p class="signature-note">MAKE YOURSELF SPECIAL &amp; KIND · 只保存图片，由你决定分享给谁。</p>`,()=>{
    const card=$('#signature-canvas');let theme=preferences.theme;
    const draw=()=>drawSignature(card,record,theme,preferences.nickname.trim()||'自在棋手',record.kindNote||'',preferences.cardDecoration);draw();
    $$('[data-card-theme]').forEach(b=>b.onclick=()=>{theme=b.dataset.cardTheme;$$('[data-card-theme]').forEach(n=>n.classList.toggle('selected',n===b));draw();});
    $$('[data-card-decoration]').forEach(b=>b.onclick=()=>{if(!garden.cardUnlocked(b.dataset.cardDecoration))return;preferences.cardDecoration=b.dataset.cardDecoration;$$('[data-card-decoration]').forEach(n=>n.classList.toggle('selected',n===b));savePreferences();draw();});
    if($('#card-garden'))$('#card-garden').onclick=()=>{closeModal();navigate('garden');};
    $('#signature-download').onclick=()=>card.toBlob(blob=>{if(!blob){notify('图片暂未生成，请再试一次。');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`MYSKME-${record.createdAt.slice(0,10)}-${record.id.slice(-6)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);notify('特别的一局，已经生成图片。');},'image/png');
  });
}

$$('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
$('.brand').onclick=e=>{e.preventDefault();navigate('play');};
$$('[data-game]').forEach(b=>b.onclick=()=>{if(b.dataset.game===state.game&&!puzzle&&!replay&&!together&&!variation)return;const next={...config,game:b.dataset.game,size:9};confirmAction('换一种思路，开始新一局。','切换棋类后，当前未完成的棋局会被替换。已完成的棋谱仍保存在对局记录中。',()=>newGame(next),'切换到'+gameName(next.game));});
$$('[data-opponent]').forEach(b=>b.onclick=()=>{config.opponent=b.dataset.opponent;updateConfig();});
$$('[data-go-engine]').forEach(b=>b.onclick=()=>{config.goEngine=b.dataset.goEngine;updateConfig();});
$$('[data-level]').forEach(b=>b.onclick=()=>{config.level=b.dataset.level;updateConfig();});
$$('[data-color]').forEach(b=>b.onclick=()=>{config.human=+b.dataset.color;updateConfig();});
$$('[data-size]').forEach(b=>b.onclick=()=>{config.size=+b.dataset.size;updateConfig();});
$('#start-button').onclick=requestNew;$('#top-new').onclick=()=>{if(page!=='play')navigate('play');requestNew();};
$('#restart-button').onclick=()=>{if(together){startTogether(together.stageId);return;}if(puzzle){startPuzzle(puzzle);return;}if(state.status==='scoring'){state.status='playing';state.passes=0;if(state.moves.length)state.moves.at(-1).resumed=true;dead.clear();startClock();persist();update();notify('已继续对局，轮到'+colorName(state.turn)+'落子。');if(state.opponent==='computer'&&state.turn!==state.human)computerTurn();return;}requestNew();};
$('#undo-button').onclick=undo;$('#hint-button').onclick=showHint;
$('#resign-button').onclick=()=>{if(state.status!=='playing'||thinking||!state.moves.length)return;const resignColor=state.opponent==='computer'?state.human:state.turn;showModal(`<h2>这一局，先到这里？</h2><p>${colorName(resignColor)}认输后，本局将结束并保存棋谱。休息一下，再来一局也很好。</p><div class="modal-actions"><button class="secondary-button" id="resign-cancel">继续思考</button><button class="primary-button" id="resign-confirm">确认认输</button></div>`,()=>{$('#resign-cancel').onclick=closeModal;$('#resign-confirm').onclick=()=>{closeModal();state.winner=other(resignColor);finishGame('resign');};});};
$('#pass-button').onclick=()=>{if(state.status!=='playing'||thinking||puzzle||replay)return;executeMove(-1);notify('已停一手。双方连续停一手后进入数子。');};
$('#focus-button').onclick=()=>{const on=document.body.classList.toggle('focus-mode');$('#focus-button').setAttribute('aria-label',on?'退出专注模式':'进入专注模式');$('#focus-button').title=on?'退出专注模式':'专注模式';requestAnimationFrame(renderBoard);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').open&&!$('#room-drawer').open&&document.body.classList.contains('focus-mode')){$('#focus-button').click();}});
$('#sound-button').onclick=()=>{preferences.sound=!preferences.sound;savePreferences();if(preferences.sound)playSound();notify(preferences.sound?'落子音效已开启。':'已关闭音效，享受安静的思考。');};
$('#coords-button').onclick=()=>{preferences.coords=!preferences.coords;savePreferences();renderBoard();};$('#numbers-button').onclick=()=>{preferences.numbers=!preferences.numbers;savePreferences();renderBoard();};
$('#rules-button').onclick=()=>together?showTogetherRules():showRules();$('#settings-button').onclick=showSettings;$('#panel-settings').onclick=showSettings;$('#learn-more').onclick=()=>together?showTogetherRules():navigate('learn');$('#daily-challenge').onclick=()=>navigate('puzzles');$('#learn-play').onclick=()=>navigate('play');
$('#replay-start').onclick=()=>seekReplay(0);$('#replay-prev').onclick=()=>seekReplay(replay.cursor-1);$('#replay-next').onclick=()=>seekReplay(replay.cursor+1);$('#replay-end').onclick=()=>seekReplay(replay.record.moves.length);$('#replay-range').oninput=e=>seekReplay(+e.target.value);
$('#export-all').onclick=()=>{if(records.length)download('MYSKME-棋谱合集.sgf',records.map(exportSGF).join('\n'),'application/x-go-sgf');};
$('#tab-together').onclick=()=>{if(together){navigate('play');return;}confirmAction('一起，赢得这一局。','进入原创双生共弈，将替换当前未完成的对局。黑白是搭档，一起让两条五子线绽放。',()=>startTogether(),'开始共弈');};
$('#together-reset').onclick=()=>startTogether(together?.stageId);
$('#studio-button').onclick=showStudio;$('#inline-studio').onclick=showStudio;$('#brand-story').onclick=showBrandStory;
$$('.quick-themes [data-theme]').forEach(b=>b.onclick=()=>setTheme(b.dataset.theme));
$('#branch-button').onclick=startVariation;$('#variation-return').onclick=returnVariation;
$('#confirm-placement').onclick=()=>{if(pending>=0)place(pending,true);};
$('#cancel-placement').onclick=()=>{pending=-1;hover=-1;update();};
window.addEventListener('beforeunload',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden){stopClock();persist();}else startClock();});
setInterval(()=>{if(page==='play'&&!replay&&!together)$('#game-time').textContent=formatTime(elapsed());},1000);
setInterval(persist,10000);
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
releaseLayout=createReleaseLayout({isReplay:()=>!!replay,showRules:()=>together?showTogetherRules():showRules()});
backupUI=bindBackupUI({read:storage.read,icon,showModal,closeModal,notify,download,beforeExport:()=>{persist();storage.write('records',records);garden?.leave();},prepareRestore:()=>{cancelComputer();stopClock();persist();garden?.leave();restoringBackup=true;},restoreFailed:()=>{restoringBackup=false;if(page==='play'){startClock();computerTurn();}}});
garden=createGardenController({
 read:storage.read,write:storage.write,isImporting:()=>restoringBackup,onTrainingMode:value=>releaseLayout.trainingMode(value),onTrainingStart:()=>releaseLayout.trainingStart(),onFeedback:()=>releaseLayout.feedback(),getRecords:()=>records,getPreferences:()=>preferences,
 navigate,notify,showModal,closeModal,playSound,
 startTogether:()=>confirmAction('一起，让善意之花开起来。','进入双生共弈将替换当前未完成的对局，已完成的棋谱会保留。',()=>startTogether(),'开始共弈'),
 applyReward:reward=>{if(reward.type==='theme')setTheme(reward.id);else{if(reward.type==='mark'){preferences.markStyle=reward.id;preferences.bloomMark=true;}else preferences.cardDecoration=reward.id;savePreferences();renderBoard();}notify(`已用上「${reward.name}」，让棋室更像你。`);}
});
$('#open-garden-hero').onclick=()=>navigate('garden');$('#garden-mini').onclick=()=>navigate('garden');$('#learn-garden').onclick=()=>navigate('garden');
coach=createCoachController({
 getState:()=>state,getConfig:()=>config,getReplay:()=>replay,getRecords:()=>records,
 saveRecords:()=>storage.write('records',records),isSpecial:()=>!!together||!!puzzle,
 showModal,closeModal,notify,
 savePractice:(record,key)=>garden.fromReview(record,key),
 onReviewViewed:(record,key,view)=>garden.reviewViewed(record,key,view),
 onEngineStatus:()=>releaseLayout.schedule(),
 retryPlay:()=>{if(state.turn!==state.human&&state.opponent==='computer')computerTurn();else showHint();},
 useLight:()=>{cancelComputer();state.goEngine='light';config.goEngine='light';state.engine=null;persist();updateConfig();update();notify('本局改用轻量陪练继续。');if(state.opponent==='computer'&&state.turn!==state.human)computerTurn();},
 showKey:(key,view)=>{releaseLayout.close();seekReplay(view==='actual'?key.ply:key.ply-1,true);reviewOverlay=view==='reference'?key:null;hint=view==='reference'?key.recommended:-1;renderBoard();},
 tryKey:key=>{releaseLayout.close();seekReplay(key.ply-1,true);startVariation();place(key.recommended,true);}
});
savePreferences();restoreTogetherSession();updateConfig();navigate(location.hash.slice(1)||'play');update();startClock();
if(state.status==='scoring'){dead=new Set(state.pendingDead||[]);update();if(page!=='garden')showScoringHelp();}else if(page!=='garden'&&!together&&state.opponent==='computer'&&state.turn!==state.human)computerTurn();
