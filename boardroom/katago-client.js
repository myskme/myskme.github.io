export const ENGINE_PROFILES={
 easy:{model:'b6',visits:3,ms:400,label:'轻松 · 小模型短思考'},
 medium:{model:'b6',visits:20,ms:1400,label:'进阶 · 小模型多步搜索'},
 hard:{model:'b10',visits:48,ms:3200,label:'挑战 · 深度模型搜索'}
};
export const MODEL_LABELS={b6:'KataGo b6c96',b10:'KataGo b10c128'};
export class KataGoClient{
 constructor(){this.worker=null;this.key='';this.pending=null;this.sequence=0;}
 request(payload,onProgress){
  const key=`${payload.size}:${payload.model||'b6'}`;
  if(this.pending)this.cancel();
  if(this.key!==key){this.worker?.terminate();this.worker=null;this.key=key;}
  if(!this.worker){
   this.worker=new Worker(new URL('./katago-worker.js',import.meta.url));
   this.worker.onmessage=({data})=>{const p=this.pending;if(!p||data.id!==p.id)return;if(data.progress){p.progress?.(data);return;}clearTimeout(p.timer);this.pending=null;if(data.error){this.worker?.terminate();this.worker=null;this.key='';p.reject(new Error(data.error));}else p.resolve(data.result);};
   this.worker.onerror=()=>{const p=this.pending;if(p)clearTimeout(p.timer);this.pending=null;this.worker?.terminate();this.worker=null;this.key='';if(p)p.reject(new Error('本机引擎未能启动，请重试或切换轻量陪练。'));};
  }
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(this.pending?.id!==id)return;this.worker?.terminate();this.worker=null;this.pending=null;reject(new Error('本次分析用时较长，请重试快速模式。'));},payload.type==='review'?240000:90000);this.pending={id,resolve,reject,progress:onProgress,timer};this.worker.postMessage({...payload,id});});
 }
 cancel(){if(this.pending){clearTimeout(this.pending.timer);const e=new Error('已取消');e.name='AbortError';this.pending.reject(e);this.pending=null;}this.worker?.terminate();this.worker=null;this.key='';this.sequence++;}
}
