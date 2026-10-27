import {createGame,applyMove,scoreGo} from './engine.js';
import {hasValidReview} from './review-core.js';
import {normaliseGarden} from './garden-core.js';
import {THEMES,KIND_NOTES,TOGETHER_STAGES,restoreTogether} from './special.js';
export const APP_VERSION='3.2.0';
export const BACKUP_FORMAT='myskme-boardroom-backup';
export const BACKUP_KEYS=['preferences','records','active','garden-v1','garden-draft-v1','together-active','together-blooms','last-mode','solved'];
export const MAX_BACKUP_BYTES=8*1024*1024;
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const validDate=x=>typeof x==='string'&&x.length<=40&&Number.isFinite(Date.parse(x));
const error=message=>{throw new Error(message);};
function preferences(p){
 if(!obj(p))return {};
 const out={};for(const key of ['sound','coords','numbers','reduceMotion','bloomMark'])if(typeof p[key]==='boolean')out[key]=p[key];
 if(typeof p.nickname==='string')out.nickname=p.nickname.slice(0,12);
 if(Object.hasOwn(THEMES,p.theme))out.theme=p.theme;
 if(['auto','always','off'].includes(p.confirmMode))out.confirmMode=p.confirmMode;
 if(['bloom','daisy','spark'].includes(p.markStyle))out.markStyle=p.markStyle;
 if(['plain','botanical','constellation'].includes(p.cardDecoration))out.cardDecoration=p.cardDecoration;
 return out;
}
export function restoreBackupGame(r,finished=false){
 if(!obj(r)||typeof r.id!=='string'||!r.id||r.id.length>100||!['go','gomoku'].includes(r.game)||(r.game==='go'?![9,13,19].includes(r.size):r.size!==15)||!Array.isArray(r.moves)||r.moves.length>=3000||!validDate(r.createdAt))error('备份中有无法识别的棋谱。');
 let s=createGame({game:r.game,size:r.size,opponent:r.opponent==='local'?'local':'computer',human:r.human===2?2:1,level:['easy','medium','hard'].includes(r.level)?r.level:'easy',goEngine:r.goEngine==='katago'?'katago':'light'});
 for(let n=0;n<r.moves.length;n++){
  const m=r.moves[n];if(!obj(m)||m.color!==s.turn||!Number.isInteger(m.index))error(`棋谱第 ${n+1} 手的顺序不正确。`);
  const result=applyMove(s,m.index);if(!result.state)error(`棋谱第 ${n+1} 手不符合规则。`);s=result.state;
  if(m.resumed){if(m.index!==-1||s.status!=='scoring')error('棋谱中的继续数子标记不正确。');s.status='playing';s.passes=0;s.moves.at(-1).resumed=true;}
 }
 s.id=r.id;s.createdAt=r.createdAt;s.startedAt=Number.isFinite(r.startedAt)?r.startedAt:Date.parse(r.createdAt);s.elapsed=Number.isFinite(r.elapsed)?Math.min(Math.max(0,r.elapsed),31536000000):0;
 if(finished||r.status==='finished'){
  if(r.reason==='resign'&&[1,2].includes(r.winner)){s.winner=r.winner;s.reason='resign';}
  else if(s.game==='gomoku'&&s.status==='finished'){s.reason='line';}
  else if(s.game==='go'&&s.status==='scoring'&&r.reason==='score'){
   const dead=Array.isArray(r.dead)?[...new Set(r.dead.filter(i=>Number.isInteger(i)&&i>=0&&i<s.board.length&&s.board[i]))]:[];
   const score=scoreGo(s.board,s.size,dead);s.dead=dead;s.score={black:score.black,white:score.white};s.winner=score.winner;s.reason='score';
  }else error('终局棋谱的结果无法核对。');
  s.status='finished';s.finishedAt=validDate(r.finishedAt)?r.finishedAt:r.createdAt;
  if(typeof r.favorite==='boolean')s.favorite=r.favorite;if(KIND_NOTES.includes(r.kindNote))s.kindNote=r.kindNote;
  if(hasValidReview({...s,review:r.review})&&JSON.stringify(r.review).length<40000)s.review=copy(r.review);
 }else if(s.status==='scoring')s.pendingDead=Array.isArray(r.pendingDead)?r.pendingDead.filter(i=>Number.isInteger(i)&&i>=0&&i<s.board.length&&s.board[i]):[];
 return s;
}
function cleanData(d){
 if(!obj(d))error('备份没有可读取的数据。');const out={};
 out.preferences=preferences(d.preferences);
 if(d.records!==undefined&&!Array.isArray(d.records))error('备份中的对局记录格式不正确。');
 if((d.records?.length||0)>100)error('单份备份最多包含 100 局棋谱。');
 out.records=(d.records||[]).map(r=>restoreBackupGame(r,true));
 const ids=new Set();for(const r of out.records){if(ids.has(r.id))error('备份中存在重复的棋谱编号。');ids.add(r.id);}
 out.active=d.active?restoreBackupGame(d.active):null;
 out['garden-v1']=normaliseGarden(d['garden-v1']);
 const draft=d['garden-draft-v1'];out['garden-draft-v1']=obj(draft)&&['lesson','practice'].includes(draft.type)&&typeof draft.id==='string'&&draft.id.length<100?{
  type:draft.type,id:draft.id,daily:!!draft.daily,hint:Math.max(0,Math.min(3,Number(draft.hint)||0)),choice:Number.isInteger(draft.choice)?draft.choice:null,selected:Number.isInteger(draft.selected)?draft.selected:null,compared:!!draft.compared,mode:['question','explore','pv'].includes(draft.mode)?draft.mode:'question',trail:Array.isArray(draft.trail)?draft.trail.filter(Number.isInteger).slice(0,128):[],linePosition:Math.max(0,Math.min(5,Number(draft.linePosition)||0))
 }:null;
 const together=d['together-active'];out['together-active']=null;
 if(obj(together)&&TOGETHER_STAGES.some(s=>s.id===together.stageId)&&Array.isArray(together.moves)&&together.moves.length<=6){const s=restoreTogether(together.stageId,together.moves);if(s.moves.length===together.moves.length)out['together-active']={stageId:together.stageId,moves:s.moves};}
 out['together-blooms']=Array.isArray(d['together-blooms'])?[...new Set(d['together-blooms'].filter(id=>TOGETHER_STAGES.some(s=>s.id===id)))]:[];
 out['last-mode']=d['last-mode']==='together'&&out['together-active']?'together':'classic';
 out.solved={};if(obj(d.solved))for(const[k,v]of Object.entries(d.solved).slice(-3650))if(k.length<48&&/^\d{4}-\d{2}-\d{2}[a-z-]+$/.test(k)&&v===true)out.solved[k]=true;
 return out;
}
export function readBackupData(read){const data={};for(const key of BACKUP_KEYS)data[key]=read(key,null);return data;}
export function makeBackup(read){const raw=readBackupData(read);if(!Array.isArray(raw.records))raw.records=[];return {format:BACKUP_FORMAT,version:1,appVersion:APP_VERSION,createdAt:new Date().toISOString(),data:cleanData(raw)};}
export function parseBackup(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_BACKUP_BYTES)error('备份文件过大，请使用 8 MB 以内的棋室备份。');
 let value;try{value=JSON.parse(text);}catch{error('文件不是有效的 JSON 备份。');}
 if(!obj(value)||value.format!==BACKUP_FORMAT||value.version!==1||!validDate(value.createdAt))error('这不是可识别的 MYSKME 棋室备份。');
 return {...value,data:cleanData(value.data)};
}
export function mergeBackup(read,incoming,{usePreferences=true}={}){
 const before=readBackupData(read),data=cleanData(incoming.data),currentRecords=Array.isArray(before.records)?before.records:[];
 const records=currentRecords.slice(0,100).map(copy),ids=new Set(records.map(r=>r.id));let added=0,skipped=0;
 for(const r of data.records){if(ids.has(r.id)){const local=records.find(x=>x.id===r.id);if(local&&!local.review&&hasValidReview(r))local.review=r.review;continue;}if(records.length===100){skipped++;continue;}records.push(r);ids.add(r.id);added++;}
 records.sort((a,b)=>Date.parse(b.finishedAt||b.createdAt)-Date.parse(a.finishedAt||a.createdAt));
 const a=normaliseGarden(before['garden-v1']),b=data['garden-v1'],sessions={...b.sessions,...a.sessions};
 for(const [id,s]of Object.entries(sessions)){const other=a.sessions[id]&&b.sessions[id];if(other)s.solved=[...new Set([...a.sessions[id].solved,...b.sessions[id].solved])].filter(k=>s.ids.includes(k));}
 const practices=[...a.practices];for(const p of b.practices)if(!practices.some(x=>x.id===p.id)&&practices.length<24)practices.push(p);
 const garden=normaliseGarden({...a,events:{...b.events,...a.events},lessons:{...b.lessons,...a.lessons},sessions,practices,selectedGame:Object.keys(a.events).length||a.practices.length?a.selectedGame:b.selectedGame});
 const active=before.active?.status!=='finished'&&before.active?.moves?.length?before.active:data.active;
 const together=before['together-active']?.moves?.length?before['together-active']:data['together-active'];
 const mode=before['last-mode']==='together'&&before['together-active']?.moves?.length?'together':active===before.active&&before.active?.moves?.length?'classic':data['last-mode'];
 return {data:{preferences:usePreferences?{...preferences(before.preferences),...data.preferences}:preferences(before.preferences),records,active,'garden-v1':garden,'garden-draft-v1':before['garden-draft-v1']||data['garden-draft-v1'],'together-active':together,'together-blooms':[...new Set([...(Array.isArray(before['together-blooms'])?before['together-blooms']:[]),...data['together-blooms']])],'last-mode':mode,solved:{...(obj(before.solved)?before.solved:{}),...data.solved}},summary:{added,skipped,records:records.length,practices:practices.length,seeds:Object.keys(garden.events).length,keptActive:active===before.active}};
}
export function commitBackup(storage,data){
 const previous=new Map(BACKUP_KEYS.map(k=>[k,storage.getItem('myskme:'+k)]));
 try{for(const k of BACKUP_KEYS)storage.removeItem('myskme:'+k);for(const k of BACKUP_KEYS)storage.setItem('myskme:'+k,JSON.stringify(data[k]??null));}
 catch(e){for(const k of BACKUP_KEYS)storage.removeItem('myskme:'+k);for(const[k,v]of previous)if(v!==null)storage.setItem('myskme:'+k,v);error('浏览器空间不足，已保留原有数据。请先导出备份，再整理旧棋谱后重试。');}
}
export function bindBackupUI(hooks){
 const $=s=>document.querySelector(s);let input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
 function bind(){
  const exportButton=$('#backup-export'),importButton=$('#backup-import');
  if(exportButton)exportButton.onclick=()=>{try{hooks.beforeExport();const backup=makeBackup(hooks.read);hooks.download('MYSKME-棋室备份-'+backup.createdAt.slice(0,10)+'.json',JSON.stringify(backup),'application/json');}catch(e){hooks.notify(e.message);}};
  if(importButton)importButton.onclick=()=>{input.value='';input.click();};
 }
 input.onchange=async()=>{
  const file=input.files[0];if(!file)return;
  try{
   if(file.size>MAX_BACKUP_BYTES)error('备份文件过大，请使用 8 MB 以内的棋室备份。');
   const backup=parseBackup(await file.text()),preview=mergeBackup(hooks.read,backup);
   hooks.showModal(`<div class="modal-icon">${hooks.icon('leaf')}</div><h2>把这份成长，带回来。</h2><p>将补入 ${preview.summary.added} 局棋谱，合并后有 ${preview.summary.practices} 个个人练习、${preview.summary.seeds} 颗成长种子。${preview.summary.keptActive?'本机正在进行的棋局会保留。':''}${preview.summary.skipped?`本机记录已满，另有 ${preview.summary.skipped} 局将保留在备份文件中。`:''}</p><p>已有棋谱与花园收藏优先保留。文件只在当前浏览器读取。</p><label class="settings-row">使用备份中的昵称与配色<input id="backup-use-prefs" type="checkbox" checked></label><div class="modal-actions"><button id="backup-cancel" class="secondary-button">先不导入</button><button id="backup-confirm" class="primary-button">合并这份备份 ${hooks.icon('check')}</button></div>`,()=>{
    $('#backup-cancel').onclick=hooks.closeModal;
    $('#backup-confirm').onclick=()=>{try{hooks.prepareRestore();const merged=mergeBackup(hooks.read,backup,{usePreferences:$('#backup-use-prefs').checked});commitBackup(localStorage,merged.data);location.reload();}catch(e){hooks.restoreFailed();hooks.notify(e.message);}};
   });
  }catch(e){hooks.notify(e.message);}
 };
 return {bind};
}
