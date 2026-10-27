import {KataGoClient,ENGINE_PROFILES,MODEL_LABELS} from './katago-client.js';
import {hasValidReview,coord,reviewFingerprint,REVIEW_VERSION} from './review-core.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ico=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const color=c=>c===1?'黑方':'白方';
const mb=n=>(n/1048576).toFixed(1);
function stageText(p){if(!p)return '准备分析';if(p.stage==='download')return `加载${p.file?.includes('wasm')?'引擎':'模型'} · ${mb(p.loaded||0)} / ${mb(p.total||1)} MB`;if(p.stage==='initialize')return '正在唤醒本机引擎';if(p.stage==='search')return '正在比较后续变化';if(p.stage==='scan')return `观察候选节点 · ${p.done} / ${p.total}`;if(p.stage==='refine')return `深入比较走法 · ${p.done} / ${p.total}`;if(p.stage==='ready')return '模型已就绪';return '准备本机分析资源';}
function stageFraction(p){if(!p)return null;if(p.stage==='download')return Math.min(1,(p.loaded||0)/(p.total||1));if(['scan','refine'].includes(p.stage))return (p.done||0)/(p.total||1);return null;}
export function createCoachController(hooks){
 const player=new KataGoClient(),reviewer=new KataGoClient();
 let engine={phase:'idle',data:null,error:'',progress:null},record=null,report=null,busy=false,progress=null,error='',precision='fast',sequence=0,selected=-1,view='reference',gomokuWorker=null;
 function renderEngine(){
  const state=hooks.getState(),show=state.game==='go'&&state.opponent==='computer'&&!hooks.getReplay()&&!hooks.isSpecial();$('#engine-card').hidden=!show;$('#room-engine-inline').hidden=!show||state.goEngine==='light'||!['loading','error'].includes(engine.phase);if(!show){hooks.onEngineStatus?.();return;}
  const light=state.goEngine==='light';$('#engine-badge').textContent=light?'轻量陪练':engine.data?MODEL_LABELS[engine.data.model]||'KataGo':'KataGo · 本机陪练';
  $('#engine-badge').classList.toggle('light',light);$('#engine-copy').textContent=light?'棋形启发式，适合快速入门练习。':engine.phase==='error'?engine.error:engine.phase==='loading'?stageText(engine.progress):engine.data?`本轮搜索 ${engine.data.visits} 次 · ${engine.data.searchMs} ms · ${engine.data.backend==='WebGPU'?'GPU 加速':'本机计算'}`:'首次按需加载模型，完成后保存在本机缓存中。';
  $('#engine-activity').hidden=light||engine.phase!=='loading';$('#engine-errors').hidden=light||engine.phase!=='error';
  $('#room-engine-status').textContent=engine.phase==='error'?engine.error:stageText(engine.progress);$('#room-inline-errors').hidden=engine.phase!=='error';hooks.onEngineStatus?.();
  const ratio=stageFraction(engine.progress);$('#engine-meter').style.width=ratio===null?'30%':`${ratio*100}%`;$('#engine-activity').classList.toggle('indeterminate',ratio===null);
 }
 function renderBoardNote(){
  const rp=hooks.getReplay(),key=report?.keys?.[selected];$('#coach-board-note').hidden=!rp||!key;if(!rp||!key)return;
  $('#coach-board-note').innerHTML=`<div class="coach-board-heading"><span>${ico('bulb')}第 ${key.ply} 手 · ${color(key.color)}</span><strong>${esc(key.title)}</strong></div><p>${esc(key.text)}</p><div class="coach-legend"><span>○ 原手 ${coord(key.actual,rp.record.size)}</span><span>✦ 参考 ${coord(key.recommended,rp.record.size)}</span></div><div class="coach-view-buttons"><button data-coach-view="actual" class="${view==='actual'?'selected':''}">看原手</button><button data-coach-view="reference" class="${view==='reference'?'selected':''}">看建议</button><button id="coach-save-practice">收进成长花园 ❋</button><button id="coach-try">亲手试一试 ↗</button></div>${key.pv?.length?`<div class="coach-pv">参考变化 <span>${key.pv.map(i=>coord(i,rp.record.size)).join(' → ')}</span></div>`:''}`;
  $$('[data-coach-view]').forEach(b=>b.onclick=()=>choose(selected,b.dataset.coachView));$('#coach-try').onclick=()=>hooks.tryKey(key);$('#coach-save-practice').onclick=()=>hooks.savePractice?.(rp.record,key);
 }
 function renderReview(){
  const rp=hooks.getReplay();$('#coach-panel').hidden=!rp;if(!rp){$('#coach-board-note').hidden=true;return;}
  const go=record?.game==='go';
  $('#coach-title').textContent=report?`这局的关键 ${report.keys.length} 手`:'下完一局，学会一招。';
  $('#coach-subtitle').textContent=go?'从棋形和不同阶段筛选候选，再由 KataGo 比较原手与参考手。':'先校验直接成五与防守事实，再用有限深度搜索寻找值得比较的走法。';
  $('#coach-depth').hidden=!go;$$('[data-coach-depth]').forEach(b=>{b.classList.toggle('selected',b.dataset.coachDepth===precision);b.disabled=busy;});
  $('#coach-analyze').hidden=busy;$('#coach-analyze').textContent=report?'重新分析这局':'发现这局的关键手';$('#coach-cancel').hidden=!busy;
  $('#coach-progress').hidden=!busy;$('#coach-progress-text').textContent=stageText(progress);
  const ratio=stageFraction(progress);$('#coach-progress').classList.toggle('indeterminate',ratio===null);$('#coach-progress-fill').style.width=ratio===null?'30%':`${ratio*100}%`;
  $('#coach-error').hidden=!error;$('#coach-error').textContent=error;
  $('#coach-empty').hidden=!!report||busy||!!error;
  $('#coach-empty').innerHTML=`<span>✦</span><p>看见好棋，也看见另一种可能。<br>${go?'快速模式使用 b6 模型；深入模式使用更大的 b10 模型。':'无需下载围棋模型，直接分析本局的战术与搜索建议。'}</p>`;
  $('#coach-report').hidden=!report;if(!report){$('#coach-keys').innerHTML='';renderBoardNote();return;}
  $('#coach-source').textContent=`${report.engine}${go?' '+report.model:''} · ${go?(report.backend==='WebGPU'?'GPU 加速':'本机计算'):'本机战术分析'}`;
  $('#coach-coverage').textContent=go?`本轮观察 ${report.sampled} / ${report.totalEligible} 个可复盘节点，深入比较 ${report.refined} 处。`:`本轮检查 ${report.totalEligible} 个可复盘节点，精选 ${report.keys.length} 处。`;
  $('#coach-keys').innerHTML=report.keys.map((key,i)=>`<button class="coach-key ${selected===i?'selected':''}" data-coach-key="${i}" aria-pressed="${selected===i}"><span class="coach-key-label"><i>0${i+1}</i>第 ${key.ply} 手 · ${color(key.color)}<b class="${key.positive?'positive':''}">${esc(key.tag)}</b></span><strong>${esc(key.title)}</strong><span class="coach-coordinates">原手 ${coord(key.actual,record.size)} <em>→</em> 参考 ${coord(key.recommended,record.size)}</span>${go?`<span class="coach-difference">参考相对原手的估计点差 <b>${key.difference>0?'+':''}${key.difference.toFixed(1)}</b><small>从落子方看</small></span>`:''}</button>`).join('');
  $$('[data-coach-key]').forEach(b=>b.onclick=()=>choose(+b.dataset.coachKey,'reference',true));
  $('#coach-disclaimer').textContent=go?'有限模型和搜索预算下的参考估计，候选来自抽样筛选；不能视为整局最大失误排名，也不替代终局数子。':'直接成五和威胁来自规则校验；其余为有限深度搜索建议，适合在分支里继续验证。';
  renderBoardNote();
 }
 function choose(index,nextView='reference',scroll=false){
  if(!report?.keys[index]||!hooks.getReplay())return;selected=index;view=nextView;hooks.showKey(report.keys[index],view);hooks.onReviewViewed?.(record,report.keys[index],view);renderReview();
  if(scroll&&matchMedia('(max-width:760px)').matches)$('#board').scrollIntoView({block:'center',behavior:document.body.classList.contains('reduced-motion')?'auto':'smooth'});
 }
 function clearSelection(){selected=-1;renderBoardNote();}
 function update(){renderEngine();const rp=hooks.getReplay();if(rp&&record?.id!==rp.record.id){cancelReview();record=rp.record;report=hasValidReview(record)?record.review:null;selected=-1;error='';precision=report?.precision==='deep'?'deep':'fast';}renderReview();}
 async function play(state,level){
  const profile=ENGINE_PROFILES[level]||ENGINE_PROFILES.medium;engine={phase:'loading',data:null,error:'',progress:{stage:'prepare'}};renderEngine();
  try{const result=await player.request({type:'play',size:state.size,model:profile.model,moves:state.moves,board:state.board,color:state.turn,level,visits:profile.visits,ms:profile.ms},p=>{engine.progress=p;renderEngine();});engine={phase:'ready',data:result,error:'',progress:null};renderEngine();return result;}
  catch(e){if(e.name!=='AbortError'){engine={phase:'error',data:null,error:e.message,progress:null};renderEngine();}throw e;}
 }
 function cancelPlay(){player.cancel();engine={phase:'idle',data:null,error:'',progress:null};renderEngine();}
 function cancelReview(){sequence++;reviewer.cancel();gomokuWorker?.terminate();gomokuWorker=null;busy=false;progress=null;}
 async function analyze(target=record){
  if(!target||busy)return;cancelReview();record=target;const my=++sequence;busy=true;error='';progress={stage:'prepare'};renderReview();
  const onProgress=p=>{if(my!==sequence)return;progress=p;renderReview();};
  try{
   let result;
   if(target.game==='go')result=await reviewer.request({type:'review',record:target,size:target.size,precision,model:precision==='deep'?'b10':'b6'},onProgress);
   else result=await new Promise((resolve,reject)=>{gomokuWorker=new Worker(new URL('./review-worker.js',import.meta.url),{type:'module'});gomokuWorker.onmessage=({data})=>{if(my!==sequence)return;if(data.progress){onProgress(data);return;}gomokuWorker?.terminate();gomokuWorker=null;if(data.error)reject(new Error(data.error));else resolve(data.result);};gomokuWorker.onerror=()=>reject(new Error('本次五子棋复盘未完成，请重试。'));gomokuWorker.postMessage({id:my,record:target});});
   if(my!==sequence||hooks.getReplay()?.record.id!==target.id)return;
   if(result.version!==REVIEW_VERSION||result.fingerprint!==reviewFingerprint(target)||!result.keys?.length)throw new Error('这局暂时没有可呈现的关键手。');
   const saved=hooks.getRecords().find(r=>r.id===target.id);if(!saved)throw new Error('未能找到原始棋谱。');
   saved.review=result;target.review=result;hooks.saveRecords();report=result;busy=false;progress=null;selected=-1;renderReview();choose(0,'reference');hooks.notify('这局的关键手，已经准备好了。');
  }catch(e){if(my!==sequence||e.name==='AbortError')return;busy=false;progress=null;error=e.message;renderReview();}
 }
 function open(target,auto=true){record=target;report=hasValidReview(target)?target.review:null;selected=-1;error='';renderReview();if(report){choose(0,'reference');}else if(auto)analyze(target);}
 function stopReview(){cancelReview();error='分析已停止，可以稍后重新开始。';renderReview();}
 function info(){hooks.showModal(`<div class="modal-icon">${ico('bulb')}</div><h2>让每一次思考，都有依据。</h2><p>围棋使用 KataGo 原生规则与神经网络评估，经浏览器版 PUCT 搜索比较走法。WebGPU 可用时尝试加速，其余设备在本机 CPU 上运行；棋谱不上传。</p><ul><li>轻松：b6c96 模型，最多 3 次搜索，约 0.4 秒预算，在高概率合法候选中适度随机。</li><li>进阶：b6c96 模型，最多 20 次搜索，约 1.4 秒预算。</li><li>挑战：b10c128 模型，最多 48 次搜索，约 3.2 秒预算。</li></ul><p>首轮需加载约 5 MB（b6）或 12 MB（b10）资源，之后由本机缓存复用。实际耗时随设备而变，搜索次数与时间均受预算限制，不对应官方段位。</p><p>复盘先抽样观察关键棋形和各阶段，再比较参考手；点差是模型估计，不能代替终局死子确认与数子。</p><p class="engine-license-links"><a href="https://github.com/lightvector/KataGo" target="_blank" rel="noreferrer">KataGo 项目 ↗</a><a href="./vendor/katago/NOTICE.txt" target="_blank">引擎与模型来源 / 开源许可 ↗</a></p><button class="primary-button" id="engine-info-ok">明白，去认真下一局</button>`,()=>{$('#engine-info-ok').onclick=hooks.closeModal;});}
 $('#go-engine-info').onclick=info;$('#coach-engine-info').onclick=info;$('#engine-retry').onclick=hooks.retryPlay;$('#engine-light').onclick=hooks.useLight;$('#room-engine-retry').onclick=hooks.retryPlay;$('#room-engine-light').onclick=hooks.useLight;
 $('#coach-analyze').onclick=()=>analyze(record);$('#coach-cancel').onclick=stopReview;
 $$('[data-coach-depth]').forEach(b=>b.onclick=()=>{precision=b.dataset.coachDepth;renderReview();});
 return {play,cancelPlay,cancelReview,update,open,analyze,clearSelection,isBusy:()=>busy,hasEngineError:()=>engine.phase==='error'};
}
