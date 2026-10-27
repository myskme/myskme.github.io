import {drawGardenMark} from './garden-art.js';
export function drawGardenBoard(canvas,state,{theme,selected=null,reference=null,showReference=false,mark='bloom',territory=false}={}){
 const w=canvas.getBoundingClientRect().width;if(!w)return null;const ratio=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(w*ratio);canvas.height=Math.round(w*ratio);const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);
 const margin=w*.075,step=(w-margin*2)/(state.size-1),radius=step*.44;
 const fill=c.createLinearGradient(0,0,w,w);theme.board.forEach((v,i)=>fill.addColorStop(i/2,v));c.fillStyle=fill;c.fillRect(0,0,w,w);
 c.save();c.globalAlpha=.09;c.strokeStyle=theme.grid;c.lineWidth=.7;for(let i=0;i<48;i++){const y=w*(i+.4)/48;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(w*.3,y-3,w*.7,y+2,w,y);c.stroke();}c.restore();
 c.strokeStyle=theme.grid;c.lineWidth=.7;for(let i=0;i<state.size;i++){const p=margin+i*step;c.beginPath();c.moveTo(margin,p);c.lineTo(w-margin,p);c.moveTo(p,margin);c.lineTo(p,w-margin);c.stroke();}
 c.textAlign='center';c.textBaseline='middle';c.font=`500 ${Math.max(8,w*.019)}px 'DM Sans',sans-serif`;c.fillStyle=theme.coordinate;
 for(let i=0;i<state.size;i++){const p=margin+i*step;c.fillText('ABCDEFGHJKLMNOPQRST'[i],p,margin*.43);c.fillText(String(state.size-i),margin*.44,p);}
 const star=state.size===19?[3,9,15]:state.size===15?[3,7,11]:state.size===13?[3,6,9]:[2,4,6];c.fillStyle=theme.grid;
 for(const x of star)for(const y of star){if(state.size!==19&&((x===star[1])!==(y===star[1])))continue;c.beginPath();c.arc(margin+x*step,margin+y*step,Math.max(1.3,w/250),0,Math.PI*2);c.fill();}
 const point=i=>[margin+i%state.size*step,margin+Math.floor(i/state.size)*step];
 function stone(i,color,alpha=1){const[x,y]=point(i);c.save();c.globalAlpha=alpha;c.shadowColor='#594d2939';c.shadowBlur=radius*.25;c.shadowOffsetY=radius*.17;const g=c.createRadialGradient(x-radius*.34,y-radius*.42,1,x,y,radius);g.addColorStop(0,color===1?'#79917a':'#fffef7');g.addColorStop(.55,color===1?'#3b5a40':'#f8f4e4');g.addColorStop(1,color===1?'#1d3825':'#d7d9bf');c.fillStyle=g;c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.fill();c.restore();}
 state.board.forEach((v,i)=>{if(v)stone(i,v);});
 const last=state.moves.at(-1)?.index;if(last>=0&&state.board[last]){const[x,y]=point(last);c.fillStyle=state.board[last]===1?theme.signature:theme.accent;if(mark==='dot'){c.beginPath();c.arc(x,y,radius*.2,0,Math.PI*2);c.fill();}else drawGardenMark(c,x,y,radius*.43,mark);}
 if(selected!==null&&selected>=0&&!state.board[selected]){const[x,y]=point(selected);if(!territory)stone(selected,state.turn,.35);c.strokeStyle=theme.accent;c.lineWidth=1.6;c.setLineDash([3,3]);c.beginPath();c.arc(x,y,radius*1.1,0,Math.PI*2);c.stroke();c.setLineDash([]);}
 if(showReference&&reference!==null&&reference>=0){const[x,y]=point(reference);c.strokeStyle=theme.accent;c.lineWidth=2;c.beginPath();c.arc(x,y,radius*.86,0,Math.PI*2);c.stroke();if(!state.board[reference]){c.fillStyle=theme.accent;drawGardenMark(c,x,y,radius*.43,'spark');}}
 if(state.line?.length){c.strokeStyle=theme.accent;c.lineWidth=2;for(const i of state.line){const[x,y]=point(i);c.beginPath();c.arc(x,y,radius*.77,0,Math.PI*2);c.stroke();}}
 return {margin,step,width:w};
}
