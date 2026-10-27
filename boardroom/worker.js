import {bestMove} from './engine.js';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,index:bestMove(data.board,data.size,data.color,data.game,data.level,data.history)});}catch(e){self.postMessage({id:data.id,error:e.message});}};
