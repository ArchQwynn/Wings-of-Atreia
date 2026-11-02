(() => {
'use strict';
const bridge=window.WoADungeonBridge;
if(!bridge||!bridge.state||!bridge.canvas)return;
const {state,ctx,canvas}=bridge;
state.dungeonStructures=Array.isArray(state.dungeonStructures)?state.dungeonStructures:[];
let tool='select',draft=null,pendingDoor=null,selectedIds=[],drag=null,polyPoints=[],arcPoints=[];
const $=id=>document.getElementById(id), feet=5;
const id=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
const gm=()=>bridge.isGM();
const snap=(v,enabled)=>enabled?Math.round(v):v;
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const round5=v=>Math.max(0,Math.min(120,Math.round(num(v)/5)*5));
const structures=()=>state.dungeonStructures;
const selected=()=>structures().filter(x=>selectedIds.includes(x.id));
const wallById=id=>structures().find(x=>x.id===id&&x.kind!=='door');
const allPoints=w=>{
 if(w.kind==='circle'||w.kind==='arc'){
  const start=w.kind==='circle'?0:num(w.startAngle,0),end=w.kind==='circle'?Math.PI*2:num(w.endAngle,Math.PI*2),steps=Math.max(16,Math.ceil(Math.abs(end-start)*Math.max(1,w.radius)*3));
  return Array.from({length:steps+1},(_,i)=>{const a=start+(end-start)*i/steps;return{x:w.center.x+Math.cos(a)*w.radius,y:w.center.y+Math.sin(a)*w.radius}});
 }
 return Array.isArray(w.points)?w.points:[];
};
function segments(w){
 const pts=allPoints(w);return pts.slice(1).map((p,i)=>({a:pts[i],b:p,index:i}));
}
function wallBase(w,p){return Math.max(0,num(w.altitude))+bridge.terrainHeightAt(p.x,p.y)}
function projectAt(w,p,z){return bridge.project(p.x,p.y,wallBase(w,p)+z)}
function nearestWall(x,y){
 let best=null,dist=18;
 for(const w of structures().filter(o=>o.kind!=='door')){
  for(const s of segments(w)){
   const a=projectAt(w,s.a,0),b=projectAt(w,s.b,0);if(a.depth<=.5||b.depth<=.5)continue;
   const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/l));
   const d=Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy));
   if(d<dist){dist=d;best={wall:w,segment:s,t,point:{x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t}}}
  }
 }
 return best;
}
function doorWidth(d){return Math.max(5,round5(d.width||5));}
function drawWallSegment(w,s){
 const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,len=Math.hypot(dx,dy)||1;
 const attached=structures().filter(d=>d.kind==='door'&&d.wallId===w.id&&d.segmentIndex===s.index);
 const cuts=attached.map(d=>{const half=doorWidth(d)/(2*feet*len);return{a:Math.max(0,d.t-half),b:Math.min(1,d.t+half),door:d}}).sort((a,b)=>a.a-b.a);
 const visibleCuts=gm()?cuts:cuts.filter(c=>!(c.door.type==='secret'&&c.door.secretVisibility!=='revealed'));
 const parts=[];let cursor=0;
 visibleCuts.forEach(c=>{if(c.a>cursor)parts.push([cursor,c.a]);cursor=Math.max(cursor,c.b)});if(cursor<1)parts.push([cursor,1]);
 const point=t=>({x:s.a.x+dx*t,y:s.a.y+dy*t});
 const face=(a,b,color,height,altitude)=>{
  const p1=point(a),p2=point(b),base1=projectAt(w,p1,altitude),base2=projectAt(w,p2,altitude),top1=projectAt(w,p1,altitude+height),top2=projectAt(w,p2,altitude+height);
  if([base1,base2,top1,top2].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=.5))return;
  ctx.save();ctx.fillStyle=color;ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(base1.x,base1.y);ctx.lineTo(base2.x,base2.y);ctx.lineTo(top2.x,top2.y);ctx.lineTo(top1.x,top1.y);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
 };
 parts.forEach(([a,b])=>face(a,b,w.color,w.height,w.altitude));
 cuts.forEach(c=>drawDoor(c.door,w,point(c.door.t),point(c.door.t+Math.min(.05,Math.max(.01,doorWidth(c.door)/(feet*len)*.12)))));
}
function drawDoor(d,w,center,edge){
 const hidden=!gm()&&d.type==='secret'&&d.secretVisibility!=='revealed';
 if(hidden){return;}
 const dx=edge.x-center.x,dy=edge.y-center.y,scale=Math.max(.02,Math.hypot(dx,dy)),half=doorWidth(d)/(2*feet);
 const nx=-dy/scale*half,ny=dx/scale*half;
 const a={x:center.x-nx,y:center.y-ny},b={x:center.x+nx,y:center.y+ny};
 const baseA=projectAt(w,a,num(d.altitude)),baseB=projectAt(w,b,num(d.altitude));
 const topA=projectAt(w,a,num(d.altitude)+num(d.height,10)),topB=projectAt(w,b,num(d.altitude)+num(d.height,10));
 if([baseA,baseB,topA,topB].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=.5))return;
 ctx.save();ctx.fillStyle=d.color||w.color;ctx.strokeStyle='#080b10';ctx.lineWidth=1.5;ctx.beginPath();
 if(d.state==='open'){const hinge=baseA,far=projectAt(w,{x:center.x-nx+dy/scale*half,y:center.y-ny-dx/scale*half},num(d.altitude)+num(d.height,10));ctx.moveTo(hinge.x,hinge.y);ctx.lineTo(far.x,far.y);ctx.lineTo(far.x+(topA.x-baseA.x),far.y+(topA.y-baseA.y));ctx.lineTo(topA.x,topA.y);}
 else{ctx.moveTo(baseA.x,baseA.y);ctx.lineTo(baseB.x,baseB.y);ctx.lineTo(topB.x,topB.y);ctx.lineTo(topA.x,topA.y);}
 ctx.closePath();ctx.fill();ctx.stroke();
 if(d.locked){ctx.fillStyle='#f2cc68';ctx.beginPath();ctx.arc((baseA.x+baseB.x)/2,(topA.y+topB.y)/2,3,0,Math.PI*2);ctx.fill();}
 ctx.restore();
}
function draw(){
 if(pendingDoor){const w=pendingDoor.wall,seg=pendingDoor.segment,p={x:seg.a.x+(seg.b.x-seg.a.x)*pendingDoor.t,y:seg.a.y+(seg.b.y-seg.a.y)*pendingDoor.t},q=projectAt(w,p,Number(w.altitude));if(q.depth>.5){ctx.save();ctx.strokeStyle='#ffe08a';ctx.lineWidth=4;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(q.x-12,q.y);ctx.lineTo(q.x+12,q.y);ctx.stroke();ctx.restore()}}
 structures().filter(x=>x.kind!=='door').forEach(w=>segments(w).forEach(s=>drawWallSegment(w,s)));
 if(gm())selected().filter(x=>x.kind!=='door').forEach(w=>drawHandles(w));
}
function drawHandles(w){
 const pts=allPoints(w);ctx.save();ctx.fillStyle='#ffe08a';ctx.strokeStyle='#111';ctx.lineWidth=1.5;
 const handles=w.kind==='circle'||w.kind==='arc'?[w.center,{x:w.center.x+w.radius,y:w.center.y}]:pts;
 handles.forEach(p=>{const q=projectAt(w,p,Number(w.altitude)+Number(w.height));if(q.depth<=.5)return;ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.fill();ctx.stroke()});ctx.restore();
}
function drawDraft(){
 if(!draft)return;const pts=draft.points||[];if(pts.length<1)return;ctx.save();ctx.strokeStyle=draft.color||'#777';ctx.lineWidth=3;ctx.setLineDash([7,5]);ctx.beginPath();let p=bridge.project(pts[0].x,pts[0].y,0);ctx.moveTo(p.x,p.y);pts.slice(1).forEach(v=>{p=bridge.project(v.x,v.y,0);ctx.lineTo(p.x,p.y)});ctx.stroke();ctx.restore();
}
const oldDraw=bridge.draw;bridge.draw=()=>{oldDraw?.();draw();drawDraft()};
function selectIds(ids){selectedIds=[...new Set(ids)];const w=selected()[0];$('dw-selected').textContent=w?(w.kind==='door'?'Door selected':'Wall selected')+' · '+selectedIds.length+' selected':'Nothing selected';if(w)loadProperties(w)}
function loadProperties(w){
 $('dw-color').value=w.color||'#333333';$('dw-height').value=String(w.height||10);$('dw-altitude').value=String(w.altitude||0);
 const isDoor=w.kind==='door';$('dw-wall-properties').hidden=isDoor;$('dw-door-properties').hidden=!isDoor;
 if(isDoor){$('dw-door-type').value=w.type;$('dw-door-width').value=String(w.width||5);$('dw-door-state').value=w.state||'closed';$('dw-door-lock').checked=!!w.locked;$('dw-secret-visibility').value=w.secretVisibility||'hidden';$('dw-door-height').value=String(w.height||10);$('dw-door-altitude').value=String(w.altitude||0)}
}
function addWall(kind,props){
 const w={id:id('wall'),kind,color:props.color,height:round5(props.height),altitude:round5(props.altitude),groupId:null,...props};delete w.pointsPreview;structures().push(w);selectIds([w.id]);bridge.saveSceneToBrowser();bridge.status('Wall created.');bridge.render();
}
function finishPolyline(){if(polyPoints.length>=2)addWall('polyline',{points:polyPoints.map(p=>({...p})),color:$('dw-color').value,height:$('dw-height').value,altitude:$('dw-altitude').value});polyPoints=[];draft=null;bridge.render()}
function wallToolButton(name,fn){$(name)?.addEventListener('click',fn)}
wallToolButton('dw-select',()=>{tool='select';polyPoints=[];draft=null;setStatus('Select walls, doors, or edit handles.')});
wallToolButton('dw-line',()=>{tool='line';setStatus('Drag from the wall start point to its endpoint.')});
wallToolButton('dw-polyline',()=>{tool='polyline';polyPoints=[];setStatus('Click successive wall corners; double-click to finish.')});
wallToolButton('dw-circle',()=>{tool='circle';setStatus('Drag from the circle center to set its radius.')});
wallToolButton('dw-arc',()=>{tool='arc';arcPoints=[];setStatus('Click arc center, start point, then end point.')});
wallToolButton('dw-door',()=>{tool='door';pendingDoor=null;setStatus('Click an existing wall to preview a door position.')});
wallToolButton('dw-finish',finishPolyline);
wallToolButton('dw-door-confirm',()=>{
 if(!pendingDoor||!gm())return;const {wall,segment,t}=pendingDoor,type=$('dw-door-type').value,width=round5($('dw-door-width').value||(type==='double'?10:5));
 const door={id:id('door'),kind:'door',wallId:wall.id,segmentIndex:segment.index,t,type,width,height:round5($('dw-door-height').value||10),altitude:round5($('dw-door-altitude').value),color:$('dw-color').value,state:$('dw-door-state').value,locked:$('dw-door-lock').checked,secretVisibility:$('dw-secret-visibility').value};
 bridge.recordUndo();structures().push(door);pendingDoor=null;selectIds([door.id]);bridge.saveSceneToBrowser();bridge.status('Door placed in wall.');bridge.render();
});
wallToolButton('dw-delete',()=>{if(!gm()||!selectedIds.length)return;bridge.recordUndo();const remove=new Set(selectedIds);const removedWalls=structures().filter(w=>remove.has(w.id)&&w.kind!=='door').map(w=>w.id);state.dungeonStructures=structures().filter(x=>!remove.has(x.id)&&!(x.kind==='door'&&removedWalls.includes(x.wallId)));selectIds([]);bridge.saveSceneToBrowser();bridge.render();setStatus('Selected structure removed.')});
wallToolButton('dw-group',()=>{const walls=selected().filter(x=>x.kind!=='door');if(!gm()||walls.length<2)return;bridge.recordUndo();const group=id('room');walls.forEach(w=>w.groupId=group);setStatus('Grouped '+walls.length+' wall segments.') ;bridge.saveSceneToBrowser()});
wallToolButton('dw-ungroup',()=>{if(!gm())return;const groups=new Set(selected().map(w=>w.groupId).filter(Boolean));if(!groups.size)return;bridge.recordUndo();structures().forEach(w=>{if(groups.has(w.groupId))w.groupId=null});bridge.saveSceneToBrowser();setStatus('Wall group separated.')});
$('dw-door-type').addEventListener('change',()=>{const type=$('dw-door-type').value;$('dw-door-width').value=String(type==='double'?10:5)});
function setStatus(msg){$('dw-status').textContent=msg;bridge.status(msg)}
function pointFromEvent(e){const r=canvas.getBoundingClientRect(),g=bridge.screenToGround(e.clientX-r.left,e.clientY-r.top),grid=$('dw-grid-snap').checked;return{x:snap(g.x,grid),y:snap(g.y,grid)}}
function handlePointerDown(e){
 if(!gm()||e.button!==0)return;
 const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
 if(tool==='select'){
  const hit=nearestWall(x,y);
  if(hit){
   const wall=hit.wall,handles=wall.kind==='circle'||wall.kind==='arc'?[wall.center,{x:wall.center.x+wall.radius,y:wall.center.y}]:allPoints(wall);
   let handleIndex=-1,handleDistance=11;
   handles.forEach((p,i)=>{const q=projectAt(wall,p,Number(wall.altitude)+Number(wall.height)),d=Math.hypot(x-q.x,y-q.y);if(q.depth>.5&&d<handleDistance){handleDistance=d;handleIndex=i}});
   if(handleIndex>=0){selectIds(e.shiftKey?[...selectedIds,wall.id]:[wall.id]);drag={item:wall,handleIndex,start:pointFromEvent(e),original:JSON.parse(JSON.stringify(wall)),moved:true};e.preventDefault();e.stopImmediatePropagation();return}
   const door=structures().find(d=>d.kind==='door'&&d.wallId===hit.wall.id&&d.segmentIndex===hit.segment.index&&Math.abs(d.t-hit.t)<doorWidth(d)/(feet*Math.max(.1,Math.hypot(hit.segment.b.x-hit.segment.a.x,hit.segment.b.y-hit.segment.a.y))));const item=door||hit.wall;selectIds(e.shiftKey?[...selectedIds,item.id]:[item.id]);drag={item,handleIndex:-1,start:pointFromEvent(e),original:JSON.parse(JSON.stringify(item)),moved:false};e.preventDefault();e.stopImmediatePropagation();return}
  if(!e.shiftKey)selectIds([]);
  return;
 }
 if(tool==='door'){const hit=nearestWall(x,y);if(!hit){setStatus('Doors must be placed on an existing wall.');return}pendingDoor=hit;$('dw-door-confirm').disabled=false;setStatus('Door position previewed. Confirm placement to create the opening.');e.preventDefault();e.stopImmediatePropagation();return}
 if(tool==='polyline'){const p=pointFromEvent(e);if(e.detail>=2){finishPolyline();}else{polyPoints.push(p);draft={points:polyPoints,color:$('dw-color').value}}e.preventDefault();e.stopImmediatePropagation();return}
 if(tool==='arc'){arcPoints.push(pointFromEvent(e));if(arcPoints.length===3){const [center,start,end]=arcPoints,radius=Math.hypot(start.x-center.x,start.y-center.y),startAngle=Math.atan2(start.y-center.y,start.x-center.x),endAngle=Math.atan2(end.y-center.y,end.x-center.x);let sweep=endAngle-startAngle;if(sweep<=0)sweep+=Math.PI*2;addWall('arc',{center,radius,startAngle,endAngle:startAngle+sweep,color:$('dw-color').value,height:$('dw-height').value,altitude:$('dw-altitude').value});arcPoints=[];draft=null}e.preventDefault();e.stopImmediatePropagation();return}
 const p=pointFromEvent(e);drag={tool,start:p,current:p,moved:false};draft={points:[p,p],color:$('dw-color').value};e.preventDefault();e.stopImmediatePropagation();
}
function handlePointerMove(e){
 if(!drag||!gm())return;const p=pointFromEvent(e);drag.current=p;drag.moved=true;
 if(drag.tool==='line')draft={points:[drag.start,p],color:$('dw-color').value};
 if(drag.tool==='circle'){const radius=Math.hypot(p.x-drag.start.x,p.y-drag.start.y);draft={points:Array.from({length:33},(_,i)=>({x:drag.start.x+Math.cos(i*Math.PI/16)*radius,y:drag.start.y+Math.sin(i*Math.PI/16)*radius})),color:$('dw-color').value}}
 e.preventDefault();e.stopImmediatePropagation();
}
function handlePointerUp(e){
 if(!drag||!gm())return;
 if(drag.item){const d=drag,p=pointFromEvent(e),dx=p.x-d.start.x,dy=p.y-d.start.y;if(Math.abs(dx)+Math.abs(dy)>.02){bridge.recordUndo();if(d.item.kind==='circle'||d.item.kind==='arc'){d.item.center.x=d.original.center.x+dx;d.item.center.y=d.original.center.y+dy}else if(d.item.kind==='polyline')d.item.points=d.original.points.map(p=>({x:p.x+dx,y:p.y+dy}));else{}structures().filter(x=>x.kind==='door'&&x.wallId===d.item.id).forEach(x=>{x._moveOffset={dx,dy}});bridge.saveSceneToBrowser()}}
 else if(drag.tool==='line'){const p=drag.current;if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>.05)addWall('polyline',{points:[drag.start,p],color:$('dw-color').value,height:$('dw-height').value,altitude:$('dw-altitude').value})}
 else if(drag.tool==='circle'){const radius=Math.hypot(drag.current.x-drag.start.x,drag.current.y-drag.start.y);if(radius>.05)addWall('circle',{center:drag.start,radius,color:$('dw-color').value,height:$('dw-height').value,altitude:$('dw-altitude').value})}
 drag=null;draft=null;bridge.render();e.preventDefault();e.stopImmediatePropagation();
}
canvas.addEventListener('pointerdown',handlePointerDown,true);
canvas.addEventListener('pointermove',handlePointerMove,true);
canvas.addEventListener('pointerup',handlePointerUp,true);
canvas.addEventListener('pointercancel',()=>{drag=null;draft=null},true);
function applyWallProps(){
 if(!gm())return;const targets=selected();if(!targets.length)return;bridge.recordUndo();
 targets.forEach(w=>{w.color=$('dw-color').value;w.height=round5(w.kind==='door'&&$('dw-door-properties').hidden?$('dw-height').value:w.kind==='door'?$('dw-door-height').value:$('dw-height').value);w.altitude=round5(w.kind==='door'&&$('dw-door-properties').hidden?$('dw-altitude').value:w.kind==='door'?$('dw-door-altitude').value:$('dw-altitude').value);
 if(w.kind==='door'){w.type=$('dw-door-type').value;w.width=round5($('dw-door-width').value);w.state=$('dw-door-state').value;w.locked=$('dw-door-lock').checked;w.secretVisibility=$('dw-secret-visibility').value;}
 });bridge.saveSceneToBrowser();bridge.render();
}
['dw-color','dw-height','dw-altitude','dw-door-width','dw-door-height','dw-door-altitude','dw-door-state','dw-door-lock','dw-secret-visibility','dw-door-type'].forEach(id=>$(id)?.addEventListener('change',applyWallProps));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){draft=null;polyPoints=[];arcPoints=[];pendingDoor=null;drag=null;bridge.render();setStatus('Drawing cancelled.')}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='g'&&gm()){e.preventDefault();$('dw-group').click()}});
function normalize(){
 state.dungeonStructures=structures().filter(w=>w&&typeof w==='object'&&typeof w.id==='string').slice(0,2000);
 state.dungeonStructures.forEach(w=>{
  w.height=round5(w.height||10);w.altitude=round5(w.altitude||0);w.color=/^#[0-9a-f]{6}$/i.test(w.color||'')?w.color:'#333333';
  if(w.kind==='door'){w.width=round5(w.width||5);w.height=round5(w.height||10);w.type=['single','double','secret'].includes(w.type)?w.type:'single';w.state=w.state==='open'?'open':'closed';w.secretVisibility=['hidden','disguised','revealed'].includes(w.secretVisibility)?w.secretVisibility:'hidden';w.locked=!!w.locked}
 });
}
function replaceStructures(data){
 state.dungeonStructures=Array.isArray(data)?data.slice(0,2000).filter(w=>w&&typeof w==='object'&&typeof w.id==='string').map(w=>{
  const base={...w,height:round5(w.height||10),altitude:round5(w.altitude||0),color:/^#[0-9a-f]{6}$/i.test(w.color||'')?w.color:'#333333'};
  if(base.kind==='door')return{...base,kind:'door',wallId:String(w.wallId||''),segmentIndex:Math.max(0,Math.floor(num(w.segmentIndex))),t:Math.max(0,Math.min(1,num(w.t))),type:['single','double','secret'].includes(w.type)?w.type:'single',width:round5(w.width||5),height:round5(w.height||10),state:w.state==='open'?'open':'closed',locked:!!w.locked,secretVisibility:['hidden','disguised','revealed'].includes(w.secretVisibility)?w.secretVisibility:'hidden'};
  if(w.kind==='circle'||w.kind==='arc')return{...base,kind:w.kind,center:{x:num(w.center?.x),y:num(w.center?.y)},radius:Math.max(.1,num(w.radius,1)),startAngle:num(w.startAngle),endAngle:num(w.endAngle,Math.PI*2),groupId:w.groupId||null};
  if(w.kind==='polyline'&&Array.isArray(w.points)&&w.points.length>=2)return{...base,kind:'polyline',points:w.points.slice(0,500).map(p=>({x:num(p.x),y:num(p.y)})),groupId:w.groupId||null};
  return null;
 }).filter(Boolean):[];
}
bridge.replace=replaceStructures;
replaceStructures(structures());
$('dw-door-confirm').disabled=true;
setStatus('GM tools ready. Structures are visual only; all movement remains under GM approval.');
})();