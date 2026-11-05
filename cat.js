/* A decorative companion. It receives operation names, never estimate values. */
(()=>{
 'use strict';
 const dock=document.getElementById('pixel-companion');
 const canvas=document.getElementById('cat-canvas');
 const content=document.getElementById('cat-content');
 const toggle=document.getElementById('cat-toggle');
 const message=document.getElementById('cat-message');
 const ctx=canvas.getContext('2d');
 if(!ctx){dock.hidden=true;return;}
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const C={ink:'#394958',fur:'#edc18d',light:'#ffe2b2',shade:'#ce9a67',pink:'#dd9e96',hat:'#efbb50',hatLight:'#ffe095',paper:'#fffdf5',blue:'#83aaba',green:'#5f927c'};
 let frame=0,state='ready',resting=false,actionTimer,idleTimer,tick;
 ctx.imageSmoothingEnabled=false;
 const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
 function shape(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
 function helmet(x=0,y=0){
  rect(12+x,8+y,18,6,C.ink);rect(15+x,6+y,12,2,C.ink);
  rect(13+x,9+y,16,4,C.hat);rect(16+x,7+y,10,2,C.hat);
  rect(18+x,8+y,3,4,C.hatLight);rect(8+x,13+y,26,3,C.ink);rect(9+x,14+y,24,1,C.hat);
 }
 function draw(){
  ctx.clearRect(0,0,40,40);
  const blink=state==='sleep'||(frame%25===24&&state==='ready');
  const bob=!motion.matches&&['copy','round','export'].includes(state)?frame%2:0;
  ctx.save();ctx.translate(0,-bob);
  // Ground shadow, tail and little work boots.
  rect(9,36,24,1,'#c7d5df');
  const tail=motion.matches?0:frame%4<2?0:1;
  rect(28,26,6,7,C.ink);rect(32,23-tail,3,7,C.ink);rect(29,27,4,5,C.shade);rect(33,24-tail,1,5,C.fur);
  shape([[13,23],[27,23],[29,27],[29,34],[26,36],[12,36],[11,33],[11,27]],C.ink);
  rect(13,25,14,9,C.fur);rect(16,26,8,8,C.light);
  rect(11,34,8,2,C.ink);rect(23,34,7,2,C.ink);rect(13,34,4,1,C.shade);rect(24,34,4,1,C.shade);
  // Ears and face: all coordinates are on the pixel grid.
  shape([[9,15],[9,8],[12,8],[17,13],[25,13],[29,8],[32,8],[32,16]],C.ink);
  rect(10,10,3,6,C.fur);rect(29,10,2,6,C.fur);
  shape([[11,13],[30,13],[33,17],[33,22],[29,26],[12,26],[8,22],[8,17]],C.ink);
  shape([[12,14],[29,14],[32,18],[32,21],[28,25],[13,25],[9,21],[9,18]],C.fur);
  rect(13,17,15,7,C.light);
  helmet();
  if(blink){rect(14,19,4,1,C.ink);rect(24,19,4,1,C.ink);}
  else{rect(15,18,2,3,C.ink);rect(25,18,2,3,C.ink);rect(15,18,1,1,C.paper);rect(25,18,1,1,C.paper);}
  rect(20,21,2,1,C.pink);rect(19,22,1,1,C.ink);rect(22,22,1,1,C.ink);
  rect(11,21,3,1,C.pink);rect(28,21,3,1,C.pink);
  if(state==='copy'){
   rect(25,20,12,15,C.ink);rect(26,21,10,13,C.paper);rect(28,19,6,3,C.ink);rect(29,20,4,1,C.hat);
   rect(28,27,2,2,C.green);rect(30,29,2,2,C.green);rect(32,25,2,4,C.green);
   rect(24,29,3,3,C.fur);
  }else if(state==='round'){
   rect(28,25,3,10,C.ink);rect(29,26,1,8,C.blue);
   rect(25,21,9,5,C.ink);rect(26,20,2,4,C.blue);rect(31,20,2,4,C.blue);rect(28,24,3,1,C.blue);
   rect(26,29,3,3,C.fur);
  }else if(state==='sleep'){
   rect(13,27,15,7,C.fur);rect(16,28,11,5,C.light);rect(13,32,12,2,C.shade);
   rect(32,6,5,1,C.blue);rect(35,7,1,1,C.blue);rect(34,8,1,1,C.blue);rect(33,9,5,1,C.blue);
  }else if(state!=='reset'&&state!=='error'){
   rect(15,25,13,11,C.ink);rect(16,26,11,9,'#70929f');rect(17,27,9,3,'#d6e7d8');
   for(let y=31;y<35;y+=2)for(let x=18;x<26;x+=3)rect(x,y,2,1,C.paper);
   rect(state==='typing'&&frame%2?17:13,29,4,3,C.fur);rect(26,29,3,3,C.fur);
  }
  if(state==='export'){rect(33,4,2,7,C.hat);rect(30,7,8,2,C.hat);}
  if(state==='error'){rect(35,18,1,4,C.blue);rect(35,24,1,1,C.blue);}
  ctx.restore();
 }
 function pose(type){
  state=type;dock.dataset.state=type;
  const words={ready:'',typing:'計算中だにゃ',copy:'コピーできたにゃ',round:'端数、整ったにゃ',reset:'また一緒につくろう',error:'入力を見てみよう',export:'できあがり！',sleep:'すやすや…'};
  message.textContent=words[type]||'';message.hidden=!words[type];draw();
 }
 function idle(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(!resting)pose('sleep');},30000);}
 function react(type){
  if(resting)return;
  clearTimeout(actionTimer);idle();pose(type);
  if(type!=='sleep')actionTimer=setTimeout(()=>pose('ready'),type==='typing'?900:2400);
 }
 function startTick(){clearInterval(tick);if(!document.hidden&&!resting&&!motion.matches)tick=setInterval(()=>{frame++;draw();},320);}
 document.addEventListener('estimate:feedback',event=>{
  if(['typing','copy','round','reset','error','export'].includes(event.detail?.type))react(event.detail.type);
 });
 for(const name of ['pointerdown','keydown','scroll'])document.addEventListener(name,()=>{if(resting)return;if(state==='sleep')pose('ready');idle();},{passive:true});
 toggle.addEventListener('click',()=>{
  resting=!resting;content.hidden=resting;dock.dataset.resting=String(resting);
  toggle.textContent=resting?'猫':'☾';toggle.title=resting?'猫を表示':'猫を休ませる';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(!resting));
  clearTimeout(actionTimer);clearTimeout(idleTimer);startTick();
  if(!resting){pose('ready');idle();}
 });
 document.addEventListener('visibilitychange',()=>{startTick();clearTimeout(idleTimer);if(!document.hidden&&!resting){pose('ready');idle();}});
 motion.addEventListener('change',()=>{startTick();draw();});
 pose('ready');idle();startTick();
})();
