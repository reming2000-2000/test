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
 const sprite=new Image();
 let spriteReady=false,cellWidth=0,cellHeight=0,inset=0;
 let frame=0,state='ready',resting=false,actionTimer,idleTimer,tick;
 function draw(){
  if(!spriteReady)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const cells={ready:0,copy:1,typing:2,round:2,sleep:3,reset:0,error:0,export:0};
  const cell=cells[state]??0;
  const bob=!motion.matches&&['copy','round','export'].includes(state)?frame%2*Math.round(canvas.height*0.02):0;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,(cell%2)*cellWidth+inset,Math.floor(cell/2)*cellHeight+inset,cellWidth-2*inset,cellHeight-2*inset,0,-bob,canvas.width,canvas.height);
 }
 sprite.onload=()=>{
  cellWidth=sprite.naturalWidth/2;cellHeight=sprite.naturalHeight/2;
  // Ignore only the transparent outer padding; keep all four poses inside their cells.
  inset=Math.floor(Math.min(cellWidth,cellHeight)*0.05);
  canvas.width=cellWidth-2*inset;canvas.height=cellHeight-2*inset;
  spriteReady=true;dock.dataset.spriteLoaded='true';draw();
 };
 sprite.onerror=()=>{resting=true;dock.hidden=true;clearInterval(tick);clearTimeout(actionTimer);clearTimeout(idleTimer);};
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
 sprite.src=new URL('assets/cat-sprites.png',document.baseURI).href;
 pose('ready');idle();startTick();
})();
