import {THEMES,moveInsight,KIND_NOTES,TOGETHER_STAGES,winningPoints} from './special.js';
import {applyMove,groupAt,other} from './engine.js';
import {coord,hasValidReview,reviewFingerprint} from './review-core.js';
import {GARDEN_KEY,GARDEN_REWARDS,GARDEN_LESSONS,normaliseGarden,dayKey,routeFor,lessonById,lessonState,checkLesson,completeLesson,dailyPlan,ensureDaily,gardenSeeds,gardenStats,unlockedRewards,hasReward,creditGarden,makePractice,savePractice,practiceState,completePractice} from './garden-core.js';
import {gardenArtwork} from './garden-art.js';
import {drawGardenBoard} from './garden-board.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ico=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const name=game=>game==='go'?'围棋':'五子棋';
const phases=[[0,'一颗好奇的种子'],[2,'新芽，正向着光'],[7,'枝叶慢慢舒展'],[16,'认真，终于开了花'],[23,'你的特别小花园']];
const goalText=l=>({win:'执黑，用一手连成五子。',block:'执黑，挡住白棋下一手的直接成五点。',double:'执黑，让下一手出现两个直接成五点。',capture:`执黑，一手提走至少 ${l.goal.count||1} 颗白棋。`,rescue:'执黑，让中间被打吃的黑棋获得至少 3 口气。',connect:'执黑，把两块黑棋连起来，共享更多的气。',territory:'找出被黑棋围住的空点，选择后确认。'}[l.goal.type]);
function rewardPreview(r,small=false){return `<span class="garden-reward-art ${r.type} ${small?'small':''} ${r.id}" style="--reward-color:${r.color}" aria-hidden="true">${r.type==='theme'?'<i></i><b></b><em>✦</em>':r.type==='mark'?`<i>${r.id==='daisy'?'❋':'✦'}</i>`:'<i><span>MYSKME</span><b></b><em>✦</em></i>'}</span>`;}
export function createGardenController(hooks){
 let g=normaliseGarden(hooks.read(GARDEN_KEY,null)),active=null,geometry=null,storageWarning=false,lastDay=dayKey();const touches=new Map();
 const canvas=$('#garden-training-board');
 function store(next,{quiet=false}={}){
  const old=gardenSeeds(g),oldRewards=unlockedRewards(g).map(r=>r.id);g=normaliseGarden(next);
  if(!hooks.write(GARDEN_KEY,g)&&!storageWarning){storageWarning=true;hooks.notify('浏览器存储空间不足，新的成长暂时只能留在当前页面。');}
  renderMini();if(!active)renderHome();
  const earned=unlockedRewards(g).filter(r=>!oldRewards.includes(r.id));
  if(!quiet&&!storageWarning){if(earned.length)hooks.notify(`新收藏已解锁：${earned.map(x=>x.name).join('、')}。`);else if(gardenSeeds(g)>old)hooks.notify(`收下 ${gardenSeeds(g)-old} 颗成长种子，让好奇慢慢开花。`);}
 }
 function renderMini(){
  const n=gardenSeeds(g),phase=[...phases].reverse().find(x=>n>=x[0]);$('#garden-mini-title').textContent=phase[1];$('#garden-mini-copy').textContent=n?`已收下 ${n} 颗成长种子 · 去看看新发现`:'每天 3 题，让好奇慢慢开花。';
 }
 function renderHome(){
  if(visible())hooks.onTrainingMode?.(false);
  const stats=gardenStats(g),n=stats.seeds,phase=[...phases].reverse().find(x=>n>=x[0]),next=GARDEN_REWARDS.find(r=>n<r.at),plan=dailyPlan(g,g.selectedGame),route=routeFor(g.selectedGame);
  $('#garden-seed-count').textContent=n;$('#garden-stage-name').textContent=phase[1];$('#garden-stage-fill').style.width=`${Math.min(100,n/23*100)}%`;$('#garden-stage-caption').textContent=next?`再成长 ${next.at-n} 颗种子，收下「${next.name}」。`:'特别收藏已全部解锁。新的发现，继续在每一局生长。';
  $('#garden-art').innerHTML=gardenArtwork(stats);
  $('#garden-flower-stats').innerHTML=[['practice','练习之花',stats.practice,'从每一个小发现开始','garden-daily'],['discovery','发现之花',stats.discovery,'在自己的棋局里成长','garden-rethink'],['kindness','善意之花',stats.kindness,'为彼此留一点温柔','garden-kind-play']].map(([kind,title,count,copy,target])=>`<button class="garden-flower-stat ${kind}" data-garden-scroll="${target}" aria-label="${title}，${count} 颗成长种子"><span>${kind==='practice'?'❋':kind==='discovery'?'✦':'♡'}</span><div><strong>${title}<b>${count}<em>颗</em></b></strong><small>${copy}</small></div><em>↗</em></button>`).join('');
  $$('[data-garden-scroll]').forEach(b=>b.onclick=()=>$('#'+b.dataset.gardenScroll).scrollIntoView({behavior:motion(),block:'center'}));
  $('#garden-local-date').textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric'});
  $$('[data-garden-game]').forEach(b=>{const selected=b.dataset.gardenGame===g.selectedGame;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  $('#garden-daily-list').innerHTML=plan.ids.map((id,i)=>{const l=lessonById(id),done=plan.solved.includes(id);return `<button class="garden-daily-item ${done?'done':''}" data-daily-lesson="${id}"><span class="garden-daily-number">${done?ico('check'):'0'+(i+1)}</span><div><strong>${l.title}</strong><small>${l.concept} · ${g.lessons[id]?'再巩固一次':'一个新发现'}</small></div><span class="garden-lesson-flower">${done?'❋':'↗'}</span></button>`;}).join('');
  $$('[data-daily-lesson]').forEach(b=>b.onclick=()=>startLesson(b.dataset.dailyLesson,true));
  $('#garden-daily-progress').innerHTML=`<b>${plan.solved.length}</b> / 3 题已浇水`;
  $('#garden-start-daily').innerHTML=plan.solved.length===3?'今日已开花 · 再练一遍 '+ico('leaf'):'开始今天的 3 分钟 '+ico('arrow');
  $('#garden-daily-complete').hidden=plan.solved.length!==3;$('#garden-daily-complete').textContent='今天的三颗灵感，已经开花。明天再来，会有新的练习组合。';
  const preview=next||GARDEN_REWARDS.at(-1);$('#garden-next-preview').innerHTML=rewardPreview(preview);$('#garden-next-name').textContent=next?preview.name:'特别，都属于你。';$('#garden-next-copy').textContent=next?preview.note:'配色、花印与签名卡装饰，都可以随心使用。';$('#garden-next-distance').textContent=next?`${n} / ${next.at} 颗成长种子`:'继续发现每一步的可能';
  $('#garden-route-title').textContent=`你的${name(g.selectedGame)}成长路线`;$('#garden-route-count').textContent=`${route.filter(l=>g.lessons[l.id]).length} / ${route.length} 站已发现`;
  $('#garden-route-grid').innerHTML=route.map((l,i)=>`<button class="garden-route-stop ${g.lessons[l.id]?'learned':''}" data-route-lesson="${l.id}"><span>${g.lessons[l.id]?ico('check'):String(i+1).padStart(2,'0')}</span><strong>${l.concept}</strong><small>${g.lessons[l.id]?'回看这一站':'去发现 ↗'}</small></button>`).join('');
  $$('[data-route-lesson]').forEach(b=>b.onclick=()=>startLesson(b.dataset.routeLesson,false));
  $('#garden-practice-count').textContent=`${g.practices.length} / 24 个自己的局面`;
  $('#garden-practices').innerHTML=g.practices.length?`<div class="garden-practice-grid">${g.practices.map(p=>`<article class="garden-practice-card"><div class="garden-practice-kicker"><span>${name(p.game)} · 原局第 ${p.ply} 手</span><button class="garden-remove" data-practice-remove="${p.id}" aria-label="移除第 ${p.ply} 手练习" title="移除这份练习">×</button></div><h3>${esc(p.title)}</h3><p>${g.events['practice:'+p.id]?'已经认真比较过，也可以再发现一次。':'先走出你的选择，再展开本轮参考。'}</p><button class="text-button" data-practice-start="${p.id}">${g.events['practice:'+p.id]?'再想一遍':'再想一手'} ${ico('arrow')}</button></article>`).join('')}</div>`:`<div class="garden-practice-empty"><span>✦</span><div><strong>下一道好问题，就藏在你的棋谱里。</strong><p>在教学复盘中，点击「收进成长花园」。<br>这里会留下完整局面，随时回来再想一手。</p></div></div>`;
  $$('[data-practice-start]').forEach(b=>b.onclick=()=>startPractice(b.dataset.practiceStart));
  $$('[data-practice-remove]').forEach(b=>b.onclick=()=>{store({...g,practices:g.practices.filter(p=>p.id!==b.dataset.practiceRemove)},{quiet:true});hooks.notify('已移除这份练习，原棋谱仍在对局记录中。');});
  renderRewards();
 }
 function rewardInUse(r){const p=hooks.getPreferences();return r.type==='theme'?p.theme===r.id:r.type==='mark'?p.bloomMark&&p.markStyle===r.id:p.cardDecoration===r.id;}
 function renderRewards(){const n=gardenSeeds(g);$('#garden-rewards').innerHTML=GARDEN_REWARDS.map(r=>{const owned=hasReward(g,r.id),using=rewardInUse(r);return `<article class="garden-reward ${owned?'owned':'locked'}"><span class="garden-reward-state">${owned?'已收藏 ✦':r.at+' 颗种子解锁'}</span>${rewardPreview(r)}<h3>${r.name}</h3><p>${r.note}</p><button class="${owned?'small-button':'garden-locked-label'}" data-garden-reward="${r.id}" ${!owned||using?'disabled':''}>${using?'正在使用':owned?(r.type==='theme'?'换上这个配色':r.type==='mark'?'用作落子花印':'用作卡片装饰'):`再成长 ${r.at-n} 颗种子`}</button></article>`;}).join('');$$('[data-garden-reward]').forEach(b=>b.onclick=()=>{const reward=GARDEN_REWARDS.find(r=>r.id===b.dataset.gardenReward);if(!reward||!hasReward(g,reward.id))return;hooks.applyReward(reward);renderRewards();});}
 function motion(){return hooks.getPreferences().reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';}
 function visible(){return !$('#page-garden').hidden;}
 function open(){lastDay=dayKey();renderMini();if(!active)restoreDraft();if(active)renderTraining();else{$('#garden-dashboard').hidden=false;$('#garden-workbench').hidden=true;renderHome();}}
 function leave(){saveDraft();}
 function saveDraft(){if(!active||hooks.isImporting?.())return;hooks.write('garden-draft-v1',{type:active.type,id:active.id,daily:active.daily,hint:active.hintLevel,choice:active.submitted,selected:active.selected,compared:active.compared,mode:active.mode,trail:active.trail.slice(0,128),linePosition:active.linePosition});}
 function training(type,id,daily=false,draft=null){
  hooks.onTrainingStart?.();
  try{
   const definition=type==='lesson'?lessonById(id):g.practices.find(p=>p.id===id);if(!definition)throw new Error('这份练习已经移除，可以再选一个新发现。');
   const base=type==='lesson'?lessonState(definition):practiceState(definition);
   active={type,id,daily,definition,base,state:base,selected:null,cursor:Math.floor(base.board.length/2),submitted:null,compared:false,done:false,mode:'question',hintLevel:0,feedback:'',trail:[],linePosition:0,seedGain:0,preview:'own'};
   if(draft){active.hintLevel=Math.max(0,Math.min(3,Number(draft.hint)||0));if(Number.isInteger(draft.choice)){const r=type==='lesson'?checkLesson(definition,draft.choice):applyMove(base,draft.choice);if(type==='lesson'?r.ok:!!r.state){active.submitted=draft.choice;active.state=r.state;active.done=type==='lesson'||!!draft.compared;active.compared=type==='practice'&&!!draft.compared;}}
    if(active.submitted===null&&Number.isInteger(draft.selected)&&draft.selected>=0&&draft.selected<base.board.length&&!base.board[draft.selected])active.selected=draft.selected;
    if(draft.mode==='explore'&&Array.isArray(draft.trail)){active.mode='explore';active.state=base;for(const i of draft.trail.slice(0,128)){const r=applyMove(active.state,i);if(!r.state)break;active.state=r.state;active.trail.push(i);}}
   }
   $('#garden-dashboard').hidden=true;$('#garden-workbench').hidden=false;renderTraining();saveDraft();if(!draft)$('#garden-workbench').scrollIntoView({block:'start',behavior:'instant'});
  }catch(e){active=null;hooks.write('garden-draft-v1',null);hooks.notify(e.message);$('#garden-dashboard').hidden=false;$('#garden-workbench').hidden=true;renderHome();}
 }
 function restoreDraft(){const d=hooks.read('garden-draft-v1',null);if(d&&['lesson','practice'].includes(d.type)&&typeof d.id==='string')training(d.type,d.id,!!d.daily,d);}
 function startLesson(id,daily=false){const l=lessonById(id);if(!l)return;const ensured=ensureDaily(g,l.game);g.selectedGame=l.game;ensured.garden.selectedGame=l.game;store(ensured.garden,{quiet:true});training('lesson',id,daily);}
 function startPractice(id){training('practice',id);}
 function startDaily(){const plan=dailyPlan(g,g.selectedGame);startLesson(plan.ids.find(id=>!plan.solved.includes(id))||plan.ids[0],true);}
 function home(){saveDraft();active=null;hooks.write('garden-draft-v1',null);$('#garden-dashboard').hidden=false;$('#garden-workbench').hidden=true;renderHome();window.scrollTo({top:0,behavior:'instant'});}
 function draw(){if(!active||!visible())return;const prefs=hooks.getPreferences();geometry=drawGardenBoard(canvas,active.state,{theme:THEMES[prefs.theme]||THEMES.lime,selected:active.selected,reference:active.type==='lesson'?active.definition.answer:active.definition.recommended,showReference:active.hintLevel>=3&&active.submitted===null||active.type==='lesson'&&active.done&&active.definition.goal.type==='territory',mark:prefs.bloomMark?(prefs.markStyle||'bloom'):'dot',territory:active.type==='lesson'&&active.definition.goal.type==='territory'});}
 function renderTraining(){
  if(!active)return;const a=active,d=a.definition,isLesson=a.type==='lesson',free=a.mode==='explore',pv=a.mode==='pv',plan=isLesson?dailyPlan(g,d.game):null,at=plan?.ids.indexOf(d.id);
  $('#training-step').textContent=isLesson?(a.daily&&at>=0?`今日 ${at+1} / 3`:`路线 ${routeFor(d.game).findIndex(l=>l.id===d.id)+1} / 8`):'来自你的真实棋局';
  $('#training-kicker').textContent=free?'A LITTLE SPACE TO EXPLORE':isLesson?'ONE MOVE. ONE NEW DISCOVERY.':'ANOTHER LOOK. ANOTHER POSSIBILITY.';
  $('#training-title').textContent=free?'试着，走出另一种可能。':isLesson?d.title:'如果重来，你会怎么下？';
  $('#training-description').textContent=free?'黑白轮流，自由推演。这里的每一步，都留在这份练习里。':isLesson?goalText(d):`来自${name(d.game)}原局第 ${d.ply} 手。先给出自己的选择，再比较参考。`;
  $('#training-board-label').textContent=`${d.size} 路 · ${name(d.game)}${free?' · 自由推演':isLesson?' · '+d.concept:' · 再想一手'}`;
  $('#training-turn').textContent=!free&&!pv&&a.submitted!==null?(a.done?(isLesson?'本题已完成':'比较已完成'):'你的尝试已落子'):a.state.status!=='playing'?(a.state.status==='scoring'?'双方已停一手':'这段变化已结束'):free?`轮到${a.state.turn===1?'黑':'白'}方`:`${d.color===1?'执黑':'执白'}思考`;
  canvas.setAttribute('aria-label',`${d.size} 路${name(d.game)}成长练习棋盘，方向键选点，回车确认。`);canvas.setAttribute('aria-rowcount',d.size);canvas.setAttribute('aria-colcount',d.size);
  $('#training-coordinate').textContent=a.selected!==null?`已选择 ${coord(a.selected,d.size)} · 确认后${isLesson&&d.goal.type==='territory'?'查看归属':'落子'}`:pv?'参考变化 · 每一步都按当前规则验证':free?'先选择交叉点，再确认落子。':a.submitted!==null?a.compared?`正在看${a.preview==='reference'?'本轮参考 '+coord(d.recommended,d.size):'你的选择 '+coord(a.submitted,d.size)}`:`你的选择 ${coord(a.submitted,d.size)}`:'选一个交叉点，把你的想法放上棋盘。';
  const confirmText=isLesson&&d.goal.type==='territory'&&!free?'确认这个空点':'就下这里';$('#training-confirm').hidden=pv||!free&&a.submitted!==null;$('#training-confirm').disabled=a.selected===null||a.state.status!=='playing';$('#training-confirm').setAttribute('aria-label',confirmText);$('#training-confirm').innerHTML=`<span class="training-action-wide">${confirmText}</span><span class="training-action-short" aria-hidden="true">确认</span> `+ico('check');
  $('#training-pass').hidden=!(d.game==='go'&&(free||!isLesson&&a.submitted===null)&&a.state.status==='playing');
  const hintText=a.hintLevel>=3?'提示已展开':`给我一点提示${a.hintLevel?' · '+a.hintLevel+'/3':''}`;$('#training-hint').hidden=free||pv||a.submitted!==null;$('#training-hint').disabled=a.hintLevel>=3;$('#training-hint').setAttribute('aria-label',hintText);$('#training-hint').innerHTML=ico('bulb')+`<span class="training-action-wide">${hintText}</span><span class="training-action-short" aria-hidden="true">提示${a.hintLevel?' '+a.hintLevel+'/3':''}</span>`;
  $('#training-explore-controls').hidden=!free;$('#training-undo').disabled=!a.trail.length;$('#training-pv-controls').hidden=!pv;
  if(pv){$('#training-pv-count').textContent=`${a.linePosition} / ${d.pv.length}`;$('#training-pv-prev').disabled=a.linePosition<=0;$('#training-pv-next').disabled=a.linePosition>=d.pv.length;}
  renderGuide();hooks.onTrainingMode?.(true);requestAnimationFrame(draw);
 }
 function renderGuide(){
  const a=active,d=a.definition,isLesson=a.type==='lesson',free=a.mode==='explore',pv=a.mode==='pv';let html='';
  if(free){html=`<span class="garden-training-tag">时光分支 · 练习专属</span><h2>把想法，走下去。</h2><p>黑白双方可以轮流落子、悔棋，试着看清后续。${a.state.status==='playing'?'':a.state.status==='scoring'?'双方连续停一手，这段围棋推演到这里。可以悔棋或重开变化。':'这一段已经结束，可以悔棋或重开变化。'}</p><div class="garden-training-fact">已尝试 <strong>${a.trail.length}</strong> 手变化</div><p class="garden-training-fine">推演不写入经典胜负记录，也不额外计算种子。</p>`;}
  else if(pv){html=`<span class="garden-training-tag">本轮参考变化</span><h2>多看一步，再理解一步。</h2><p>${esc(d.text)}</p><div class="garden-reference-line">${d.pv.map((i,n)=>`<span class="${n<a.linePosition?'played':''}">${n+1}. ${coord(i,d.size)}</span>`).join('')}</div><p class="garden-training-fine">${esc(d.engine)} ${esc(d.model)} 的有限搜索参考。其他合法走法仍可在自由推演中验证。</p>`;}
  else if(a.submitted===null){html=`<span class="garden-training-tag">${isLesson?d.concept:'你的棋局 · 再想一手'}</span><h2>${isLesson?'先观察，再落下你的答案。':'先把参考藏起来，听听自己的想法。'}</h2><p>${isLesson?goalText(d):'选一手你愿意尝试的走法。完成一次落子并展开参考比较，就能收下一颗成长种子。'}</p>${a.feedback?`<div class="garden-answer-note" role="status">${esc(a.feedback)}</div>`:''}${a.hintLevel?`<div class="garden-hint-note"><span>一点小提示 · ${a.hintLevel} / 3</span><p>${esc(a.hintLevel===3?`可以观察 ${coord(isLesson?d.answer:d.recommended,d.size)}。提示是帮助思考的一条路，确认后仍可以重新尝试。`:isLesson?d.hints[a.hintLevel-1]:a.hintLevel===1?'先留意眼前的直接威胁，再看看自己的棋形。':d.game==='go'?'先数相邻棋块的气，看看有没有提子、连接或解救的机会。':'依次检查横、竖和两条斜线，先看能否成五或必须防守。')}</p></div>`:''}<div class="garden-training-seed"><span>❋</span><p>用提示，也会收下成长。<br>理解这一手，比赶时间更重要。</p></div>`;}
  else if(isLesson){html=`<span class="garden-training-tag success">${a.seedGain?`收下 ${a.seedGain} 颗成长种子`:'又认真巩固了一遍'}</span><div class="garden-success-flower">❋</div><h2>这一手，有了新的收获。</h2><p>${esc(d.takeaway)}</p><div class="garden-takeaway"><small>今天带走一个发现</small><strong>${d.concept}</strong></div><button class="primary-button" id="training-next">${nextLabel()} ${ico('arrow')}</button><div class="garden-guide-links"><button id="training-retry">再想一遍</button><button id="training-free">从原局面自由推演 ↗</button></div>`;}
  else if(!a.compared){const insight=moveInsight(a.base.board,a.submitted,d.color,d.game,d.size,a.base.positions);html=`<span class="garden-training-tag">你的选择 · ${coord(a.submitted,d.size)}</span><h2>先看见，自己这一步。</h2><p>${esc(insight.text)}</p><button class="primary-button" id="training-compare">展开参考，完成比较 ${ico('bulb')}</button><p class="garden-training-fine">参考来自已保存的复盘报告。这里会比较走法与棋形，不把模型首选当作唯一正确答案。</p><div class="garden-guide-links"><button id="training-retry">再换一个选择</button></div>`;}
  else{const same=a.submitted===d.recommended;html=`<span class="garden-training-tag success">${a.seedGain?'收下一颗成长种子':'再一次，看见新的可能'}</span><h2>${same?'这一次，你与参考想到了一起。':'同一局面，可以多看一个方向。'}</h2><div class="garden-compare-choices"><button id="training-own" class="${a.preview==='own'?'selected':''}">你的选择<strong>${coord(a.submitted,d.size)}</strong></button><button id="training-ref" class="${a.preview==='reference'?'selected':''}">本轮参考<strong>${coord(d.recommended,d.size)}</strong></button></div><div class="garden-source-summary"><small>原谱复盘摘要 · ${esc(d.engine)} ${esc(d.model)}</small><p>${esc(d.text)}</p>${d.game==='go'&&d.difference!==null?`<span>原谱参考相对原手的点差估计：${d.difference>0?'+':''}${d.difference.toFixed(1)} 点</span>`:''}</div><p class="garden-training-fine">${d.game==='go'?'上面的点差描述原谱中的原手与参考，不是对你这次新选择的重新估分。':'成五与防守事实按棋盘规则校验，其余为有限搜索方向。'} 可以继续走一段变化，验证自己的想法。</p><button class="primary-button" id="training-next">${nextLabel()} ${ico('arrow')}</button><div class="garden-guide-links"><button id="training-retry">再想一遍</button><button id="training-free">自由推演 ↗</button>${d.pv.length>1?'<button id="training-show-pv">逐手看参考变化 →</button>':''}</div>`;}
  $('#training-guide').innerHTML=html;
  const bind=(id,fn)=>{const el=$('#'+id);if(el)el.onclick=fn;};
  bind('training-next',next);bind('training-retry',retry);bind('training-free',explore);bind('training-compare',compare);bind('training-own',()=>{a.state=applyMove(a.base,a.submitted).state;a.preview='own';renderTraining();});bind('training-ref',()=>{const r=applyMove(a.base,d.recommended);if(r.state){a.state=r.state;a.preview='reference';renderTraining();}});bind('training-show-pv',()=>{a.mode='pv';a.linePosition=1;rebuildPv();renderTraining();saveDraft();});
 }
 function nextLabel(){if(!active)return '回到花园';if(active.type==='practice')return g.practices.some(p=>p.id!==active.id&&!g.events['practice:'+p.id])?'再想一个局面':'带着发现，回到花园';if(active.daily)return dailyPlan(g,active.definition.game).solved.length===3?'完成今天的浇水':'去发现下一题';return routeFor(active.definition.game).at(-1).id===active.id?'这条路线，已走到最后一站':'继续下一站';}
 function next(){const a=active;if(!a)return;if(a.type==='practice'){const p=g.practices.find(p=>p.id!==a.id&&!g.events['practice:'+p.id]);if(p)startPractice(p.id);else home();return;}if(a.daily){const plan=dailyPlan(g,a.definition.game),id=plan.ids.find(id=>!plan.solved.includes(id));if(id)startLesson(id,true);else home();}else{const route=routeFor(a.definition.game),i=route.findIndex(l=>l.id===a.id);if(route[i+1])startLesson(route[i+1].id,false);else home();}}
 function select(index){if(!active||active.mode==='pv'||active.mode!=='explore'&&active.submitted!==null)return;const a=active;if(a.state.status!=='playing')return;if(index!==-1&&(index<0||index>=a.state.board.length||a.state.board[index])){hooks.notify('这里已有棋子，换个交叉点试试。');return;}a.selected=index;a.cursor=index>=0?index:a.cursor;a.feedback='';renderTraining();saveDraft();}
 function submit(){
  const a=active;if(!a||a.selected===null)return;const index=a.selected;
  if(a.mode==='explore'){if(a.trail.length>=128){hooks.notify('这段推演已走过 128 手，可以重开变化继续探索。');return;}const r=applyMove(a.state,index);if(r.error){hooks.notify(errorText(r.error));return;}a.state=r.state;a.trail.push(index);a.selected=null;renderTraining();saveDraft();return;}
  if(a.submitted!==null||a.mode==='pv')return;
  if(a.type==='lesson'){
   const l=a.definition,r=checkLesson(l,index);if(!r.ok){a.feedback=r.error?errorText(r.error):wrongText(l,index,r.state);renderTraining();saveDraft();hooks.onFeedback?.();return;}
   const previous=gardenSeeds(g),result=completeLesson(g,l.id,index);store(result.garden);a.seedGain=gardenSeeds(g)-previous;a.submitted=index;a.selected=null;a.state=r.state;a.done=true;hooks.playSound?.('win');
  }else{const r=applyMove(a.base,index);if(r.error){a.feedback=errorText(r.error);renderTraining();return;}a.submitted=index;a.selected=null;a.state=r.state;}
  renderTraining();saveDraft();hooks.onFeedback?.();
 }
 function errorText(e){return {occupied:'这里已有棋子，换个交叉点试试。',suicide:'这手无法提走对方，自己的棋也没有气。再找找其他方向。',ko:'这一步会重复已出现的盘面，需要换一种走法。',outside:'请选择棋盘里的交叉点。',finished:'这段变化已结束，可以悔棋或重开。',pass:'五子棋需要落子，不能停一手。'}[e]||'这一步暂时无法落子，再看看棋盘。';}
 function wrongText(l,index,s){if(l.goal.type==='win')return '若下在这里，还没有连成五子。再看看能直接连起的一条线。';if(l.goal.type==='capture')return `若下在这里，会提走 ${s?.moves.at(-1)?.captured.length||0} 颗白棋。再数一数目标棋块最后的气。`;if(l.goal.type==='rescue')return `若下在这里，原来那块黑棋仍有 ${groupAt(s.board,l.goal.anchor,l.size).liberties.size} 口气。试着让它获得更多呼吸空间。`;if(l.goal.type==='block')return `若下在这里，白棋仍有 ${winningPoints(s.board,l.size,2).length} 个下一手成五点。先照顾这条直接威胁。`;if(l.goal.type==='double')return `若下在这里，黑棋会有 ${winningPoints(s.board,l.size,1).length} 个下一手成五点。看看怎样同时留下两处机会。`;if(l.goal.type==='connect')return '若下在这里，两块黑棋还没有直接连起来。看看它们之间的空点。';return '这个空点没有被黑棋独占包围。再看看相邻空点和它们的边界。';}
 function compare(){const a=active;if(!a||a.type!=='practice'||a.submitted===null)return;const previous=gardenSeeds(g);try{const result=completePractice(g,a.id,a.submitted,true);if(!result.ok)return;store(result.garden);a.seedGain=gardenSeeds(g)-previous;a.compared=true;a.done=true;renderTraining();saveDraft();hooks.onFeedback?.();}catch(e){hooks.notify(e.message);}}
 function retry(){if(!active)return;const {type,id,daily}=active;training(type,id,daily);}
 function explore(){if(!active)return;hooks.onTrainingStart?.();active.mode='explore';active.state=active.base;active.trail=[];active.selected=null;renderTraining();saveDraft();}
 function rebuildExplore(){let s=active.base;const good=[];for(const i of active.trail){const r=applyMove(s,i);if(!r.state)break;s=r.state;good.push(i);}active.state=s;active.trail=good;active.selected=null;}
 function rebuildPv(){let s=active.base;for(const i of active.definition.pv.slice(0,active.linePosition)){const r=applyMove(s,i);if(!r.state)break;s=r.state;}active.state=s;active.selected=null;}
 function fromReview(record,key){try{const p=makePractice(record,key);store(savePractice(g,p),{quiet:true});hooks.notify('这手已收进成长花园，随时回来再想一次。');return true;}catch(e){hooks.notify(e.message);return false;}}
 function reviewViewed(record,key,view){if(!hasValidReview(record)||!['actual','reference'].includes(view))return;const fp=reviewFingerprint(record),id=`${fp}:${key.ply}`,seen=touches.get(id)||new Set();seen.add(view);touches.set(id,seen);if(touches.size>100)touches.delete(touches.keys().next().value);if(seen.size===2){const result=creditGarden(g,'review',fp);if(result.credited)store(result.garden);}}
 function kindNote(record){if(!record?.id||!KIND_NOTES.includes(record.kindNote))return;const result=creditGarden(g,'kind',record.id);if(result.credited)store(result.garden);}
 function togetherBloom(id){if(!TOGETHER_STAGES.some(s=>s.id===id))return;const result=creditGarden(g,'together',id);if(result.credited)store(result.garden);}
 function themeUnlocked(id){return ['lime','peach','sky'].includes(id)||hasReward(g,id)&&GARDEN_REWARDS.some(r=>r.id===id&&r.type==='theme');}
 function markUnlocked(id){return id==='bloom'||hasReward(g,id)&&GARDEN_REWARDS.some(r=>r.id===id&&r.type==='mark');}
 function cardUnlocked(id){return id==='plain'||hasReward(g,id)&&GARDEN_REWARDS.some(r=>r.id===id&&r.type==='card');}
 function studioMarks(){const pref=hooks.getPreferences();return `<div class="garden-studio-marks"><label>你的成长花印 <small>让最后一手，有自己的样子。</small></label><div>${[{id:'bloom',name:'善意花印'},...GARDEN_REWARDS.filter(r=>r.type==='mark'&&hasReward(g,r.id))].map(r=>`<button class="${pref.markStyle===r.id?'selected':''}" data-growth-mark="${r.id}"><span>${r.id==='spark'?'✦':r.id==='daisy'?'❋':'✳'}</span>${r.name}</button>`).join('')}</div></div>`;}
 function cardControls(){const pref=hooks.getPreferences(),options=[{id:'plain',name:'素净留白'},...GARDEN_REWARDS.filter(r=>r.type==='card'&&hasReward(g,r.id))];return `<div class="garden-card-options"><span>签名卡装饰</span><div>${options.map(r=>`<button data-card-decoration="${r.id}" class="${pref.cardDecoration===r.id?'selected':''}">${r.name}</button>`).join('')}</div>${options.length===1?'<button class="text-button" id="card-garden">去成长花园，收藏卡片装饰 ↗</button>':''}</div>`;}
 function refresh(){renderMini();if(visible()){if(active)renderTraining();else renderHome();}}
 $('#garden-start-daily').onclick=startDaily;$('#garden-training-home').onclick=home;$('#garden-find-record').onclick=()=>hooks.navigate('records');$('#garden-kind-play').onclick=hooks.startTogether;
 $('#garden-show-rewards').onclick=()=>$('#garden-collection').scrollIntoView({behavior:motion(),block:'start'});
 $$('[data-garden-game]').forEach(b=>b.onclick=()=>{store({...g,selectedGame:b.dataset.gardenGame},{quiet:true});});
 $('#training-confirm').onclick=submit;$('#training-pass').onclick=()=>select(-1);$('#training-hint').onclick=()=>{if(!active||active.submitted!==null)return;active.hintLevel=Math.min(3,active.hintLevel+1);renderTraining();saveDraft();hooks.onFeedback?.();};
 $('#training-undo').onclick=()=>{if(!active||active.mode!=='explore')return;active.trail.pop();rebuildExplore();renderTraining();saveDraft();};$('#training-explore-reset').onclick=explore;$('#training-question').onclick=retry;
 $('#training-pv-prev').onclick=()=>{active.linePosition=Math.max(0,active.linePosition-1);rebuildPv();renderTraining();saveDraft();};$('#training-pv-next').onclick=()=>{active.linePosition=Math.min(active.definition.pv.length,active.linePosition+1);rebuildPv();renderTraining();saveDraft();};$('#training-pv-back').onclick=()=>{active.mode='question';active.state=applyMove(active.base,active.submitted).state;renderTraining();saveDraft();};
 canvas.addEventListener('click',e=>{if(!geometry||!active)return;const r=canvas.getBoundingClientRect(),x=Math.round((e.clientX-r.left-geometry.margin)/geometry.step),y=Math.round((e.clientY-r.top-geometry.margin)/geometry.step);if(x<0||y<0||x>=active.state.size||y>=active.state.size)return;select(y*active.state.size+x);});
 canvas.addEventListener('keydown',e=>{if(!active||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;e.preventDefault();const size=active.state.size;if(['Enter',' '].includes(e.key)){if(active.selected===null)select(active.cursor);submit();return;}const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-size,ArrowDown:size}[e.key],i=Math.max(0,Math.min(size*size-1,active.cursor+delta));active.cursor=i;if(!active.state.board[i])select(i);});
 new ResizeObserver(()=>requestAnimationFrame(draw)).observe(canvas);
 $('#garden-about').onclick=()=>hooks.showModal(`<div class="modal-icon">${ico('leaf')}</div><h2>每一颗种子，都来自一次认真。</h2><p>每课首次完成 +1 颗；当天每条路线的 3 题都完成，再 +1 颗。提示随时可用。</p><p>自己的收藏局面，实际尝试并展开参考比较，首次 +1 颗；同一局复盘切换原手与建议，首次 +1 颗；为一局棋留句善意、完成一关双生共弈，各首次 +1 颗。</p><p>同一项完成记录不会重复计种子。种子用来解锁特别收藏，配色、花印与卡片装饰可反复使用。</p><p>成长记录与局面保存在当前浏览器，不跨设备同步。清除站点数据会移除花园。围棋参考为有限搜索估计，不是唯一正确答案。</p><button class="primary-button" id="garden-about-done">明白，慢慢生长 ${ico('leaf')}</button>`,()=>{$('#garden-about-done').onclick=hooks.closeModal;});
 window.addEventListener('storage',e=>{if(e.key==='myskme:'+GARDEN_KEY){g=normaliseGarden(hooks.read(GARDEN_KEY,null));refresh();}});
 window.addEventListener('beforeunload',saveDraft);setInterval(()=>{if(dayKey()!==lastDay){lastDay=dayKey();if(visible())refresh();}},30000);
 // Existing cooperative blooms and kindness notes are genuine completed actions.
 const oldBlooms=hooks.read('together-blooms',[]);
 for(const id of Array.isArray(oldBlooms)?oldBlooms:[]){if(TOGETHER_STAGES.some(s=>s.id===id)&&!g.events['together:'+id])g=creditGarden(g,'together',id).garden;}
 for(const r of hooks.getRecords()){if(KIND_NOTES.includes(r.kindNote)&&!g.events['kind:'+r.id])g=creditGarden(g,'kind',r.id).garden;}
 hooks.write(GARDEN_KEY,g);renderMini();
 return {open,leave,refresh,refreshMini:renderMini,fromReview,reviewViewed,kindNote,togetherBloom,themeUnlocked,markUnlocked,cardUnlocked,studioMarks,cardControls,getData:()=>g};
}
