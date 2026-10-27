/* The board stays in the viewport; long settings and teaching use a dialog. */
export function createReleaseLayout(hooks){
 const $=s=>document.querySelector(s),sheet=$('#room-drawer'),slot=$('#room-drawer-content'),side=$('.game-side'),note=$('#coach-board-note'),trainingSide=$('.garden-training-side');
 const sideHome=document.createComment('room settings'),noteHome=document.createComment('review explanation'),trainingHome=document.createComment('training explanation');side.before(sideHome);note.before(noteHome);trainingSide.before(trainingHome);
 let page='play',training=false,frame=0,lastWidth=-1;
 const compact=()=>matchMedia('(max-width:1000px)').matches;
 function close(){if(sheet.open)sheet.close();}
 function restore(node,placeholder){if(node.previousSibling!==placeholder)placeholder.after(node);}
 function open(kind='room'){
  close();restore(note,noteHome);restore(side,sideHome);restore(trainingSide,trainingHome);
  slot.replaceChildren();$('#room-drawer-title').textContent=kind==='training'?'这一手的提示与发现':hooks.isReplay()?'这一局的教学复盘':'这一局，由你做主';
  $('#room-sheet-rules').hidden=kind==='training';
  if(kind==='training')slot.append(trainingSide);else{if(!note.hidden)slot.append(note);if(compact())slot.append(side);}
  sheet.showModal();schedule();
 }
 function fit(canvas,area,card,landscape=false){
  if(!canvas||!area||!card||!card.clientHeight)return;
  let available=card.clientHeight;
  if(landscape)available-=20;
  else{for(const child of card.children){if(child===area||getComputedStyle(child).display==='none')continue;const rect=child.getBoundingClientRect(),style=getComputedStyle(child);available-=rect.height+(child.matches('.board-bottom,.garden-training-coordinate')?0:(parseFloat(style.marginTop)||0))+(parseFloat(style.marginBottom)||0);}const style=getComputedStyle(card);available-=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);}
  const side=Math.max(60,Math.floor(Math.min(available-8,card.clientWidth-(landscape?252:30))));
  if(Math.abs(parseFloat(area.style.width)-side)>1||!area.style.width){area.style.width=side+'px';area.style.height=side+'px';}
 }
 function perform(){
  frame=0;const isCompact=compact();document.body.classList.toggle('compact-room',isCompact);
  const isRoom=page==='play',isTraining=page==='garden'&&training;document.body.classList.toggle('formal-room',isRoom);document.body.classList.toggle('training-room',isTraining);
  $('#room-open-panel').hidden=!isCompact;$('#room-open-panel').setAttribute('aria-label',hooks.isReplay()?'查看教学复盘':'对局设置');$('#room-open-panel').firstChild.textContent=hooks.isReplay()?'复盘 ':'设置 ';$('#room-open-note').hidden=isCompact||!hooks.isReplay()||note.hidden;
  if(!sheet.open){restore(side,sideHome);restore(note,noteHome);restore(trainingSide,trainingHome);}
  // Explanation must leave the board's flex layout even while its sheet is shut.
  if(!sheet.open){slot.replaceChildren();slot.append(note);if(isCompact){slot.append(side);slot.append(trainingSide);}}
  if(isRoom)fit($('#board'),$('#board-area'),$('.board-card'),matchMedia('(max-height:500px) and (min-width:650px)').matches);
  if(isTraining)fit($('#garden-training-board'),$('.garden-training-board-wrap'),$('.garden-training-board-card'),matchMedia('(max-height:500px) and (min-width:650px)').matches);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(perform);}
 function navigate(next){close();page=next;if(next!=='garden')training=false;schedule();}
 function trainingMode(value){training=value;if(!value)close();schedule();}
 $('#room-open-panel').onclick=()=>open();$('#room-open-note').onclick=()=>open();$('#room-drawer-close').onclick=close;$('#training-open-guide').onclick=()=>open('training');$('#room-sheet-rules').onclick=hooks.showRules;
 sheet.addEventListener('close',schedule);sheet.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});sheet.addEventListener('click',e=>{if(e.target===sheet){const r=sheet.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
 window.addEventListener('resize',()=>{if(lastWidth!==innerWidth){lastWidth=innerWidth;close();}schedule();});window.visualViewport?.addEventListener('resize',schedule);
 new ResizeObserver(schedule).observe($('.content'));
 return {navigate,schedule,close,trainingMode,trainingStart:close,feedback:()=>{if(compact())open('training');},open};
}
