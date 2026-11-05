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
 const C={ink:'#454a4c',fur:'#93999c',light:'#fbfaf4',shade:'#727a7d',pink:'#d98f79',hat:'#e6d86b',hatLight:'#f7eb96',paper:'#fffdf5',blue:'#83aaba',green:'#5d9c63'};
 let frame=0,state='ready',resting=false,actionTimer,idleTimer,tick;
 ctx.imageSmoothingEnabled=false;
 const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
 function shape(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
 function helmet(){
  shape([[9,13],[11,8],[15,5],[25,5],[29,8],[31,13],[34,13],[34,15],[8,15],[8,13]],C.ink);
  shape([[10,13],[12,9],[16,6],[24,6],[28,9],[30,13]],C.hat);
  rect(15,7,11,2,C.hatLight);rect(9,13,24,1,C.hat);
  rect(20,9,2,4,C.green);rect(19,10,4,2,C.green);
 }
 function draw(){
  ctx.clearRect(0,0,40,40);
  const blink=state==='sleep'||(frame%25===24&&state==='ready');
  const bob=!motion.matches&&['copy','round','export'].includes(state)?frame%2:0;
  ctx.save();ctx.translate(0,-bob);
  rect(8,38,25,1,'#c7d5df');
  const tail=motion.matches?0:frame%4<2?0:1;
  shape([[27,28],[31,29],[35,33-tail],[38,35-tail],[37,37-tail],[33,35],[28,33]],C.ink);
  shape([[28,29],[31,30],[35,34-tail],[37,35-tail],[36,36-tail],[32,34],[28,32]],C.fur);
  shape([[14,23],[26,23],[29,27],[29,34],[26,36],[14,35],[11,32],[12,27]],C.ink);
  rect(14,25,13,9,C.fur);rect(17,26,8,7,C.light);rect(18,33,6,1,C.light);
  // Bent legs and white paws give the little cat a pointing-check stance.
  shape([[13,31],[18,32],[16,35],[16,37],[10,38],[8,36],[10,33]],C.ink);
  rect(12,32,4,2,C.fur);rect(11,34,4,3,C.light);rect(9,36,5,1,C.light);
  shape([[23,33],[27,33],[27,36],[30,37],[30,39],[24,38],[22,36]],C.ink);
  rect(24,34,2,3,C.light);rect(25,37,4,1,C.light);
  shape([[10,14],[10,5],[12,4],[18,11],[24,11],[29,5],[31,6],[32,15]],C.ink);
  shape([[11,12],[11,7],[13,8],[16,12]],C.light);
  shape([[27,12],[29,8],[30,8],[31,13]],C.light);
  shape([[12,12],[29,12],[33,16],[33,21],[29,25],[13,25],[8,21],[8,16]],C.ink);
  shape([[13,13],[28,13],[32,17],[32,20],[28,24],[14,24],[9,20],[9,17]],C.fur);
  // White blaze, muzzle and dark whiskers; warm yellow eyes.
  shape([[20,15],[22,18],[22,20],[26,22],[26,24],[16,24],[15,22],[19,19]],C.light);
  helmet();
  if(blink){rect(14,19,4,1,C.ink);rect(24,19,4,1,C.ink);}
  else{
   rect(14,17,4,4,C.ink);rect(24,17,4,4,C.ink);
   rect(15,17,3,3,C.hat);rect(25,17,3,3,C.hat);
   rect(16,17,1,3,C.ink);rect(26,17,1,3,C.ink);
  }
  rect(20,21,2,1,C.ink);rect(19,22,1,1,C.ink);rect(22,22,1,1,C.ink);
  rect(10,21,5,1,C.ink);rect(27,21,5,1,C.ink);
  rect(18,23,1,1,C.ink);rect(23,23,1,1,C.ink);
  if(state!=='sleep')rect(20,24,2,1,C.pink);
  if(state==='copy'){
   rect(25,23,12,14,C.ink);rect(26,24,10,12,C.paper);rect(28,22,6,3,C.ink);rect(29,23,4,1,C.hat);
   rect(28,29,2,2,C.green);rect(30,31,2,2,C.green);rect(32,27,2,4,C.green);
   rect(24,31,3,3,C.light);
  }else if(state==='round'){
   rect(29,28,3,10,C.ink);rect(30,29,1,8,C.blue);
   rect(26,24,9,5,C.ink);rect(27,23,2,4,C.blue);rect(32,23,2,4,C.blue);rect(29,27,3,1,C.blue);
   rect(27,31,3,3,C.light);
  }else if(state==='sleep'){
   rect(13,28,15,7,C.fur);rect(16,29,10,4,C.light);rect(12,34,14,2,C.shade);
   rect(33,4,5,1,C.blue);rect(36,5,1,1,C.blue);rect(35,6,1,1,C.blue);rect(34,7,5,1,C.blue);
  }else if(state==='typing'){
   rect(15,26,13,11,C.ink);rect(16,27,11,9,'#70929f');rect(17,28,9,3,'#d6e7d8');
   for(let y=32;y<36;y+=2)for(let x=18;x<26;x+=3)rect(x,y,2,1,C.paper);
   rect(frame%2&&!motion.matches?17:13,30,4,3,C.light);rect(26,30,3,3,C.light);
  }else{
   // Raised left paw points outwards. This pose is visible even while idle.
   shape([[14,26],[10,26],[8,23],[5,22],[2,22],[1,24],[5,25],[6,28],[10,30],[14,29]],C.ink);
   rect(10,27,4,2,C.fur);rect(7,25,3,3,C.fur);rect(3,23,4,1,C.light);rect(6,24,2,2,C.light);
   rect(28,28,4,4,C.ink);rect(29,29,2,2,C.light);
  }
  if(state==='export'){rect(35,9,1,5,C.green);rect(33,11,5,1,C.green);}
  if(state==='error'){rect(36,18,1,4,C.blue);rect(36,24,1,1,C.blue);}
  ctx.restore();
 }
 function pose(type){
  state=type;dock.dataset.state=type;
  const words={ready:'',typing:'計算中だにゃ',copy:'コピー、ヨシ！',round:'端数、ヨシ！',reset:'また一緒につくろう',error:'入力を見てみよう',export:'できあがり！',sleep:'すやすや…'};
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
