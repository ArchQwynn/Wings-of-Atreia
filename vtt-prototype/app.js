const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const selectionEl = document.getElementById('selection');
const altitudeEl = document.getElementById('altitude');
const tokenList = document.getElementById('tokens');

const state = {
  camera: { yaw: -0.65, pitch: 0.72, zoom: 1 },
  selected: 'ranger',
  drag: null,
  pointers: new Map(),
  pinchDistance: null,
  view2d: false,
  tokens: [
    { id:'ranger', name:'Ranger', x:-4, y:1, z:60, glyph:'R', size:1.25 },
    { id:'balaur', name:'Balaur Soldier', x:3, y:0, z:30, glyph:'B', size:1.25 },
    { id:'enemy', name:'Aerial Enemy', x:1, y:-3, z:90, glyph:'E', size:1.25 }
  ]
};

function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const r=canvas.getBoundingClientRect();
  canvas.width=Math.max(1,Math.floor(r.width*dpr));
  canvas.height=Math.max(1,Math.floor(r.height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize',resize);
resize();

function project(x,y,z){
  if(state.view2d) return {x:canvas.clientWidth/2+x*34,y:canvas.clientHeight/2-y*34};
  const cy=Math.cos(state.camera.yaw),sy=Math.sin(state.camera.yaw);
  const x1=x*cy-y*sy, y1=x*sy+y*cy;
  const cp=Math.cos(state.camera.pitch),sp=Math.sin(state.camera.pitch);
  const y2=y1*cp-z/30*sp, depth=y1*sp+z/30*cp;
  const scale=state.camera.zoom*210/(depth+14);
  return {x:canvas.clientWidth/2+x1*scale,y:canvas.clientHeight/2-y2*scale,depth,scale};
}

function line(a,b){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}
function drawGrid(){
  ctx.save();
  ctx.lineWidth=1;
  for(let i=-10;i<=10;i++){
    const a=project(i,-10,0),b=project(i,10,0);
    const c=project(-10,i,0),d=project(10,i,0);
    ctx.beginPath();line(a,b);line(c,d);ctx.stroke();
  }
  ctx.restore();
}

// Keep altitude references out of the 3D scene so they never obscure tokens or camera movement.
// The small fixed scale is intentionally screen-space and remains readable on phones.
function drawAltitudeScale(){
  const h=canvas.clientHeight;
  const x=16;
  const top=Math.max(92,h*.18);
  const bottom=Math.min(h-32,Math.max(top+180,h*.78));
  const layers=[{z:120,label:'120 ft'},{z:90,label:'90 ft'},{z:60,label:'60 ft'},{z:30,label:'30 ft'}];
  ctx.save();
  ctx.font='10px system-ui';
  ctx.textAlign='left';
  ctx.textBaseline='middle';
  ctx.strokeStyle='rgba(143,211,255,.28)';
  ctx.fillStyle='rgba(201,216,235,.72)';
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x+34,top);ctx.lineTo(x+34,bottom);ctx.stroke();
  layers.forEach((layer,i)=>{
    const y=top+(bottom-top)*(i/(layers.length-1));
    ctx.strokeStyle='rgba(143,211,255,.24)';
    ctx.beginPath();ctx.moveTo(x+27,y);ctx.lineTo(x+42,y);ctx.stroke();
    ctx.fillText(layer.label,x+48,y);
  });
  ctx.fillStyle='rgba(154,168,189,.62)';
  ctx.fillText('ALT',x,y-12);
  ctx.restore();
}

function drawToken(t){
  const p=project(t.x,t.y,t.z);
  const h=Math.max(34,p.scale*42*t.size), w=h*.58;
  const selected=t.id===state.selected;
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.fillStyle=selected?'rgba(143,211,255,.18)':'rgba(255,255,255,.08)';
  ctx.strokeStyle=selected?'#8fd3ff':'#aab7ca';
  ctx.lineWidth=selected?2.5:1.5;
  ctx.beginPath();ctx.roundRect(-w/2,-h,w,h,5);ctx.fill();ctx.stroke();
  ctx.fillStyle='#eef3ff';ctx.font=`700 ${Math.max(14,h*.28)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.glyph,0,-h*.52);
  ctx.fillStyle='#9aa8bd';ctx.font=`${Math.max(9,h*.12)}px system-ui`;ctx.fillText(`${t.z} ft`,0,-h*.12);
  ctx.restore();
  t._screen={x:p.x,y:p.y,w,h};
}

function render(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#05070d';ctx.fillRect(0,0,w,h);
  if(!state.view2d){drawGrid();drawAltitudeScale();}
  const sorted=[...state.tokens].sort((a,b)=>a.z-b.z);
  sorted.forEach(drawToken);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function select(id){
  state.selected=id;
  const t=state.tokens.find(x=>x.id===id);
  selectionEl.textContent=`${t.name} · X ${t.x} · Y ${t.y} · Z ${t.z} ft`;
  altitudeEl.textContent=`Altitude: ${t.z} ft`;
  [...tokenList.children].forEach(e=>e.classList.toggle('selected',e.dataset.id===id));
}

function rebuildList(){
  tokenList.innerHTML='';
  state.tokens.forEach(t=>{
    const el=document.createElement('div');el.className='token';el.dataset.id=t.id;
    el.innerHTML=`<span>${t.name}</span><small>${t.z} ft</small>`;
    el.onclick=()=>select(t.id);tokenList.appendChild(el);
  });
  select(state.selected);
}
rebuildList();

function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture(e.pointerId);
  state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(state.pointers.size===1){
    state.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
  } else if(state.pointers.size===2){
    const pts=[...state.pointers.values()];
    state.pinchDistance=distance(pts[0],pts[1]);
    state.drag=null;
  }
});

canvas.addEventListener('pointermove',e=>{
  if(!state.pointers.has(e.pointerId))return;
  state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});

  if(state.pointers.size>=2 && !state.view2d){
    const pts=[...state.pointers.values()];
    const d=distance(pts[0],pts[1]);
    if(state.pinchDistance){
      const ratio=d/state.pinchDistance;
      state.camera.zoom=Math.max(.55,Math.min(2.2,state.camera.zoom*ratio));
    }
    state.pinchDistance=d;
    return;
  }

  if(!state.drag)return;
  const dx=e.clientX-state.drag.lastX,dy=e.clientY-state.drag.lastY;
  if(Math.abs(e.clientX-state.drag.x)+Math.abs(e.clientY-state.drag.y)>6)state.drag.moved=true;
  if(!state.view2d){
    state.camera.yaw+=dx*.014;
    state.camera.pitch=Math.max(.35,Math.min(1.2,state.camera.pitch+dy*.010));
  }
  state.drag.lastX=e.clientX;state.drag.lastY=e.clientY;
});

function finishPointer(e){
  const wasSingle=state.pointers.size===1;
  if(wasSingle && state.drag && !state.drag.moved){
    const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    let hit=null,best=Infinity;
    for(const t of state.tokens){const s=t._screen||{};if(Math.abs(x-s.x)<s.w/2&&y<s.y&&y>s.y-s.h){const d=Math.abs(x-s.x)+Math.abs(y-(s.y-s.h/2));if(d<best){best=d;hit=t}}}
    if(hit)select(hit.id);
  }
  state.pointers.delete(e.pointerId);
  if(state.pointers.size===0){state.drag=null;state.pinchDistance=null;}
  else if(state.pointers.size===1){
    const p=[...state.pointers.values()][0];
    state.drag={x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:true};
    state.pinchDistance=null;
  }
}
canvas.addEventListener('pointerup',finishPointer);
canvas.addEventListener('pointercancel',finishPointer);
canvas.addEventListener('wheel',e=>{e.preventDefault();state.camera.zoom=Math.max(.55,Math.min(2.2,state.camera.zoom*(e.deltaY>0?.9:1.1)));},{passive:false});

for(const b of document.querySelectorAll('button'))b.onclick=()=>{
  const a=b.dataset.action,t=state.tokens.find(x=>x.id===state.selected);
  if(a==='reset'){state.camera={yaw:-0.65,pitch:.72,zoom:1};state.view2d=false;}
  if(a==='2d'){state.view2d=!state.view2d;b.textContent=state.view2d?'3D View':'2D Fallback';}
  if(a==='up')if(t)t.z=Math.min(120,t.z+30);
  if(a==='down')if(t)t.z=Math.max(0,t.z-30);
  if(a==='yaw-left')state.camera.yaw-=.18;
  if(a==='yaw-right')state.camera.yaw+=.18;
  if(a==='pitch-up')state.camera.pitch=Math.max(.35,state.camera.pitch-.12);
  if(a==='pitch-down')state.camera.pitch=Math.min(1.2,state.camera.pitch+.12);
  rebuildList();
};

window.addEventListener('keydown',e=>{
  if(e.key==='ArrowUp')state.camera.pitch=Math.max(.35,state.camera.pitch-.04);
  if(e.key==='ArrowDown')state.camera.pitch=Math.min(1.2,state.camera.pitch+.04);
  if(e.key==='ArrowLeft')state.camera.yaw-=.05;
  if(e.key==='ArrowRight')state.camera.yaw+=.05;
});
