const canvas=document.getElementById('scene');
const ctx=canvas&&canvas.getContext('2d');
const selectionEl=document.getElementById('selection');
const altitudeEl=document.getElementById('altitude');
const tokenList=document.getElementById('tokens');
const ALTITUDE_STEP=5,MAX_ALTITUDE=120,MIN_ZOOM=.2,MAX_ZOOM=6;
const state={camera:{yaw:-.65,pitch:.78,zoom:1,panX:0,panY:0},selected:'ranger',drag:null,pointers:new Map(),pinchDistance:null,view2d:false,tokens:[
{id:'ranger',name:'Ranger',x:-4,y:1,z:60,glyph:'R',size:1.25,color:'#65d6a1'},
{id:'balaur',name:'Balaur Soldier',x:3,y:0,z:30,glyph:'B',size:1.25,color:'#e06b6b'},
{id:'enemy',name:'Aerial Enemy',x:1,y:-3,z:90,glyph:'E',size:1.25,color:'#e3b65b'}]};
function resize(){if(!ctx)return;const dpr=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect(),w=Math.max(320,Math.floor(r.width)),h=Math.max(360,Math.floor(r.height));canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize);resize();
function size(){const r=canvas.getBoundingClientRect();return{w:Math.max(320,r.width),h:Math.max(360,r.height)}}

// Natural tabletop camera: yaw rotates the battlefield horizontally and pitch tilts the
// tabletop. This is intentionally orthographic/lightweight so it remains stable on phones.
// Tokens are drawn as flat circles after projection, making them camera-facing billboards.
function project(x,y,z){
 const{w,h}=size();
 if(state.view2d)return{x:w/2+x*42*state.camera.zoom+state.camera.panX,y:h/2-y*42*state.camera.zoom+state.camera.panY};
 const yaw=state.camera.yaw,pitch=state.camera.pitch,cy=Math.cos(yaw),sy=Math.sin(yaw);
 const rx=x*cy-y*sy,ry=x*sy+y*cy;
 const cp=Math.cos(pitch),sp=Math.sin(pitch),grid=42*state.camera.zoom;
 // A modest pitch keeps the tabletop visibly horizontal instead of becoming a wall/floor.
 const screenY=ry*cp-z/30*sp;
 return{x:w/2+rx*grid+state.camera.panX,y:h*.57-screenY*grid+state.camera.panY};
}
function line(a,b){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}
function drawGrid(){ctx.save();ctx.strokeStyle='rgba(143,211,255,.38)';ctx.lineWidth=1;for(let i=-10;i<=10;i++){const a=project(i,-10,0),b=project(i,10,0),c=project(-10,i,0),d=project(10,i,0);ctx.beginPath();line(a,b);line(c,d);ctx.stroke()}ctx.strokeStyle='rgba(143,211,255,.9)';ctx.lineWidth=2;const xa=project(-10,0,0),xb=project(10,0,0),ya=project(0,-10,0),yb=project(0,10,0);ctx.beginPath();line(xa,xb);line(ya,yb);ctx.stroke();const n=project(0,8,0),e=project(8,0,0);ctx.fillStyle='#fff';ctx.font='700 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('N',n.x,n.y-12);ctx.fillText('E',e.x+12,e.y);ctx.restore()}
function drawAltitudeScale(){const{h}=size(),x=18,top=Math.max(100,h*.18),bottom=Math.min(h-40,Math.max(top+180,h*.78)),layers=[{label:'120 ft'},{label:'90 ft'},{label:'60 ft'},{label:'30 ft'}];ctx.save();ctx.font='10px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';ctx.strokeStyle='rgba(143,211,255,.45)';ctx.fillStyle='rgba(201,216,235,.92)';ctx.beginPath();ctx.moveTo(x+34,top);ctx.lineTo(x+34,bottom);ctx.stroke();layers.forEach((q,i)=>{const y=top+(bottom-top)*i/3;ctx.beginPath();ctx.moveTo(x+27,y);ctx.lineTo(x+42,y);ctx.stroke();ctx.fillText(q.label,x+48,y)});ctx.fillStyle='rgba(154,168,189,.9)';ctx.fillText('ALT',x,top-12);ctx.restore()}
function drawToken(t){const p=project(t.x,t.y,t.z),radius=Math.max(20,Math.min(44,24*state.camera.zoom*t.size)),selected=t.id===state.selected;ctx.save();ctx.translate(p.x,p.y);ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fillStyle=t.color;ctx.globalAlpha=.98;ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.lineWidth=selected?4:2;ctx.strokeStyle=selected?'#fff':'#0b1320';ctx.stroke();ctx.fillStyle='#08111d';ctx.font=`800 ${Math.max(15,radius*.75)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.glyph,0,-2);ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(9,Math.min(13,radius*.32))}px system-ui`;ctx.fillText(`${t.z} ft`,0,radius*.52);ctx.restore();t._screen={x:p.x,y:p.y,radius}}
function hud(){const el=document.getElementById('camera-readout');if(!el)return;el.textContent=state.view2d?`2D View · pan ${Math.round(state.camera.panX)},${Math.round(state.camera.panY)} · zoom ${state.camera.zoom.toFixed(2)}×`:`Yaw ${Math.round(state.camera.yaw*57.3)}° · Pitch ${Math.round(state.camera.pitch*57.3)}° · Zoom ${state.camera.zoom.toFixed(2)}×`}
function render(){if(!ctx)return;const{w,h}=size();ctx.clearRect(0,0,w,h);ctx.fillStyle='#101927';ctx.fillRect(0,0,w,h);if(!state.view2d){ctx.fillStyle='rgba(50,70,94,.48)';ctx.fillRect(0,h*.42,w,h*.58);drawGrid();drawAltitudeScale()}else drawGrid();[...state.tokens].sort((a,b)=>a.z-b.z).forEach(drawToken);hud();requestAnimationFrame(render)}
requestAnimationFrame(render);
function select(id){state.selected=id;const t=state.tokens.find(q=>q.id===id);if(!t)return;selectionEl.textContent=`${t.name} · X ${t.x} · Y ${t.y} · Z ${t.z} ft`;altitudeEl.textContent=`Altitude: ${t.z} ft`;[...tokenList.children].forEach(e=>e.classList.toggle('selected',e.dataset.id===id))}
function rebuildList(){tokenList.innerHTML='';state.tokens.forEach(t=>{const el=document.createElement('div');el.className='token';el.dataset.id=t.id;el.innerHTML=`<span>${t.name}</span><small>${t.z} ft</small>`;el.onclick=()=>select(t.id);tokenList.appendChild(el)});select(state.selected)}rebuildList();
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pointers.size===1)state.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};else{const p=[...state.pointers.values()];state.pinchDistance=dist(p[0],p[1]);state.drag=null}},{passive:false});
canvas.addEventListener('pointermove',e=>{if(!state.pointers.has(e.pointerId))return;e.preventDefault();state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pointers.size>1){const p=[...state.pointers.values()],d=dist(p[0],p[1]);if(state.pinchDistance){state.camera.zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,state.camera.zoom*d/state.pinchDistance))}state.pinchDistance=d;return}if(!state.drag)return;const dx=e.clientX-state.drag.lastX,dy=e.clientY-state.drag.lastY;if(Math.abs(e.clientX-state.drag.x)+Math.abs(e.clientY-state.drag.y)>6)state.drag.moved=true;if(state.view2d){state.camera.panX+=dx;state.camera.panY+=dy}else{state.camera.yaw+=dx*.018;state.camera.pitch=Math.max(.38,Math.min(1.12,state.camera.pitch+dy*.012))}state.drag.lastX=e.clientX;state.drag.lastY=e.clientY},{passive:false});
function finish(e){const one=state.pointers.size===1;if(one&&state.drag&&!state.drag.moved&&!state.view2d){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let hit,best=1e9;for(const t of state.tokens){const s=t._screen;if(s&&Math.hypot(x-s.x,y-s.y)<=s.radius){const d=Math.hypot(x-s.x,y-s.y);if(d<best){best=d;hit=t}}}if(hit)select(hit.id)}state.pointers.delete(e.pointerId);if(!state.pointers.size){state.drag=null;state.pinchDistance=null}else if(state.pointers.size===1){const p=[...state.pointers.values()][0];state.drag={x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:true};state.pinchDistance=null}}
canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('wheel',e=>{e.preventDefault();state.camera.zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,state.camera.zoom*(e.deltaY>0?.88:1.14)))},{passive:false});
for(const b of document.querySelectorAll('button'))b.onclick=()=>{const a=b.dataset.action,t=state.tokens.find(q=>q.id===state.selected);if(a==='reset'){state.camera={yaw:-.65,pitch:.78,zoom:1,panX:0,panY:0};state.view2d=false}if(a==='2d'){state.view2d=!state.view2d;b.textContent=state.view2d?'3D View':'2D Fallback'}if(a==='up'&&t)t.z=Math.min(MAX_ALTITUDE,t.z+ALTITUDE_STEP);if(a==='down'&&t)t.z=Math.max(0,t.z-ALTITUDE_STEP);if(a==='yaw-left')state.camera.yaw-=Math.PI/6;if(a==='yaw-right')state.camera.yaw+=Math.PI/6;if(a==='pitch-up')state.camera.pitch=Math.max(.38,state.camera.pitch-.12);if(a==='pitch-down')state.camera.pitch=Math.min(1.12,state.camera.pitch+.12);rebuildList()};
addEventListener('keydown',e=>{if(e.key==='ArrowUp')state.camera.pitch=Math.max(.38,state.camera.pitch-.04);if(e.key==='ArrowDown')state.camera.pitch=Math.min(1.12,state.camera.pitch+.04);if(e.key==='ArrowLeft')state.camera.yaw-=.08;if(e.key==='ArrowRight')state.camera.yaw+=.08});
