const sessionRoleEl=document.getElementById('session-role'),sessionPlayerNameEl=document.getElementById('session-player-name'),playerNameWrap=document.getElementById('player-name-wrap'),permissionStatusEl=document.getElementById('permission-status');
const tokenNameEl=document.getElementById('token-name'),tokenGlyphEl=document.getElementById('token-glyph'),tokenColorEl=document.getElementById('token-color'),tokenFootprintEl=document.getElementById('token-footprint'),tokenVisibilityEl=document.getElementById('token-visibility'),tokenAssignmentEl=document.getElementById('token-assignment'),tokenPlayersEl=document.getElementById('token-players'),tokenImageFileEl=document.getElementById('token-image-file'),tokenImageStatusEl=document.getElementById('token-image-status');
const tokenImageCache=new Map();
const tokenImageZoomEl=document.getElementById('token-image-zoom'),tokenImageXEl=document.getElementById('token-image-x'),tokenImageYEl=document.getElementById('token-image-y');

const canvas=document.getElementById('scene'),ctx=canvas?.getContext('2d'),selectionEl=document.getElementById('selection'),altitudeEl=document.getElementById('altitude'),movementEl=document.getElementById('movement-readout'),tokenList=document.getElementById('tokens');
const FEET_PER_GRID=5,ALTITUDE_STEP=5,MAX_ALTITUDE=120,MIN_ZOOM=.35,MAX_ZOOM=10,GRID_RADIUS=30,CELL_PX=42,NEAR=.5;
const terrainTypeEl=document.getElementById('terrain-type'),terrainHeightEl=document.getElementById('terrain-height'),terrainStatusEl=document.getElementById('terrain-status');
const assetNameEl=document.getElementById('asset-name'),assetImageFileEl=document.getElementById('asset-image-file'),assetSwapImageFileEl=document.getElementById('asset-swap-image-file'),assetWidthEl=document.getElementById('asset-width'),assetDepthEl=document.getElementById('asset-depth'),assetRotationEl=document.getElementById('asset-rotation'),assetAltitudeEl=document.getElementById('asset-altitude'),assetVisibilityEl=document.getElementById('asset-visibility'),assetStatusEl=document.getElementById('asset-status');
const assetImageCache=new Map();
function applyMobileLayout(){const narrow=window.innerWidth<=520,layout=document.querySelector('.layout'),stage=document.querySelector('.stage-card'),panel=document.querySelector('.panel');if(!layout||!stage||!panel)return;if(narrow){Object.assign(layout.style,{display:'flex',flexDirection:'column',width:'100%',minWidth:'0',height:'auto',minHeight:'0'});Object.assign(stage.style,{order:'1',width:'100%',minWidth:'0',height:'58dvh',minHeight:'320px',flex:'none',borderRight:'0'});Object.assign(panel.style,{order:'2',width:'100%',minWidth:'0',maxWidth:'100%',height:'auto',minHeight:'0',maxHeight:'none',display:'block',overflow:'visible'});}else{layout.style.removeProperty('display');layout.style.removeProperty('flex-direction');layout.style.removeProperty('width');layout.style.removeProperty('min-width');layout.style.removeProperty('height');layout.style.removeProperty('min-height');stage.style.removeProperty('order');stage.style.removeProperty('width');stage.style.removeProperty('min-width');stage.style.removeProperty('height');stage.style.removeProperty('min-height');stage.style.removeProperty('flex');stage.style.removeProperty('border-right');panel.style.removeProperty('order');panel.style.removeProperty('width');panel.style.removeProperty('min-width');panel.style.removeProperty('max-width');panel.style.removeProperty('height');panel.style.removeProperty('min-height');panel.style.removeProperty('max-height');panel.style.removeProperty('display');panel.style.removeProperty('overflow');}}
addEventListener('resize',applyMobileLayout);applyMobileLayout();
const state={combatRound:1,combatTurn:0,camera:{yaw:-.65,elevation:.68,distance:60,zoom:1,targetX:0,targetY:0,targetZ:0,selected:'ranger',selectedTokenIds:['ranger'],selectedAssetIds:[],selectionBox:null,drag:null,pointers:new Map(),pinchDistance:null,lastPinchMid:null,view2d:false,panMode:false,movingToken:null,moveOffset:{x:0,y:0},moveStart:null,moveUndoSnapshot:null,moveDistance:0,terrain:{},terrainMode:false,mapImage:null,mapWidth:24,mapHeight:24,mapOpacity:.78,assets:[],selectedAsset:null,movingAsset:null,assetMoveOffset:{x:0,y:0},groupMoveStart:null,attachments:[],pendingAssetImage:null,tokens:[{id:'ranger',name:'Ranger',x:-4,y:1,z:60,glyph:'R',size:1,color:'#65d6a1',footprint:1,assignment:'all',players:[]},{id:'balaur',name:'Balaur Soldier',x:3,y:0,z:30,glyph:'B',size:1,color:'#e06b6b',footprint:1,assignment:'gm',players:[]},{id:'enemy',name:'Aerial Enemy',x:1,y:-3,z:90,glyph:'E',size:1,color:'#e3b65b',footprint:1,assignment:'unassigned',players:[]}]};
function resize(){if(!ctx)return;const d=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0)}
addEventListener('resize',resize);resize();
function size(){const r=canvas.getBoundingClientRect();return{w:Math.max(1,r.width),h:Math.max(1,r.height)}}
function tokenWorld(t){const f=Math.max(1,t.footprint||1),bx=t._dragX??t.x,by=t._dragY??t.y;return{x:bx+(f-1)/2,y:by+(f-1)/2}}
function objectKey(type,id){return type+':'+id}
function objectFromKey(key){if(!key)return null;const i=key.indexOf(':'),type=key.slice(0,i),id=key.slice(i+1);return type==='token'?state.tokens.find(o=>o.id===id):type==='asset'?state.assets.find(o=>o.id===id):null}
function objectLabel(key){const o=objectFromKey(key);return o?(o.name|| (key.startsWith('token:')?'Token':'Asset'))+' ['+(key.startsWith('token:')?'Token':'Asset')+']':key}
function attachmentGroup(startKey){const seen=new Set([startKey]),queue=[startKey];while(queue.length){const k=queue.shift();for(const edge of state.attachments||[]){const next=edge.a===k?edge.b:edge.b===k?edge.a:null;if(next&&!seen.has(next)&&objectFromKey(next)){seen.add(next);queue.push(next)}}}return [...seen].map(key=>({key,obj:objectFromKey(key)})).filter(x=>x.obj)}
function captureGroupPositions(type,id){return attachmentGroup(objectKey(type,id)).map(({key,obj})=>({key,x:Number(obj._dragX??obj.x)||0,y:Number(obj._dragY??obj.y)||0,z:Number(obj.z)||0}))}
function refreshAttachmentControls(){const a=document.getElementById('attachment-object-a'),b=document.getElementById('attachment-object-b'),listEl=document.getElementById('attachment-list');if(!a||!b)return;const oldA=a.value,oldB=b.value,items=[...state.tokens.map(t=>({key:objectKey('token',t.id),label:'Token: '+t.name})),...state.assets.map(x=>({key:objectKey('asset',x.id),label:'Asset: '+x.name}))];for(const sel of [a,b]){sel.innerHTML='';const first=document.createElement('option');first.value='';first.textContent='Choose an object';sel.appendChild(first);items.forEach(item=>{const o=document.createElement('option');o.value=item.key;o.textContent=item.label;sel.appendChild(o)})}if(items.some(x=>x.key===oldA))a.value=oldA;if(items.some(x=>x.key===oldB))b.value=oldB;if(listEl){listEl.textContent=state.attachments.length?state.attachments.map(e=>objectLabel(e.a)+' ↔ '+objectLabel(e.b)).join(' · '):'No attached objects.'}}
function applyGroupPositionDelta(startPositions,dx,dy){for(const p of startPositions){const obj=objectFromKey(p.key);if(!obj)continue;if(p.key.startsWith('token:')){obj._dragX=p.x+dx;obj._dragY=p.y+dy}else{obj.x=p.x+dx;obj.y=p.y+dy}}}
function changeGroupAltitude(type,id,nextZ){const anchor=objectFromKey(objectKey(type,id));if(!anchor)return;const group=captureGroupPositions(type,id),old=Number(anchor.z)||0;let dz=Number(nextZ)-old;const minDz=Math.max(...group.map(p=>-p.z)),maxDz=Math.min(...group.map(p=>MAX_ALTITUDE-p.z));dz=Math.max(minDz,Math.min(maxDz,dz));group.forEach(p=>{const obj=objectFromKey(p.key);if(obj)obj.z=Math.max(0,Math.min(MAX_ALTITUDE,p.z+dz))})}
let pendingAttachmentAction=null;
function hideObjectContextMenu(){const menu=document.getElementById('object-context-menu');if(menu)menu.hidden=true}
function setAttachmentMode(action,key){pendingAttachmentAction={action,key};hideObjectContextMenu();const obj=objectFromKey(key);if(sceneSaveStatus)sceneSaveStatus.textContent=(action==='attach'?'Attach '+(obj?.name||'object')+': click another object.':'Detach '+(obj?.name||'object')+': click an object directly attached to it.')+' Press Escape to cancel.'}
function applyPendingAttachment(targetKey){const pending=pendingAttachmentAction;if(!pending)return true;pendingAttachmentAction=null;if(targetKey===pending.key){if(sceneSaveStatus)sceneSaveStatus.textContent='Choose a different object.';return true}const exists=objectFromKey(targetKey),source=objectFromKey(pending.key);if(!exists||!source)return true;const same=e=>(e.a===pending.key&&e.b===targetKey)||(e.a===targetKey&&e.b===pending.key);if(pending.action==='attach'){if(state.attachments.some(same)){if(sceneSaveStatus)sceneSaveStatus.textContent='Those objects are already attached.';return true}recordUndo();state.attachments.push({a:pending.key,b:targetKey});if(sceneSaveStatus)sceneSaveStatus.textContent='Attached '+objectLabel(pending.key)+' to '+objectLabel(targetKey)+'.'}else{if(!state.attachments.some(same)){if(sceneSaveStatus)sceneSaveStatus.textContent='Those objects are not directly attached.';return true}recordUndo();state.attachments=state.attachments.filter(e=>!same(e));if(sceneSaveStatus)sceneSaveStatus.textContent='Detached '+objectLabel(pending.key)+' from '+objectLabel(targetKey)+'.'}saveSceneToBrowser();return true}
function setupObjectContextMenu(){const menu=document.getElementById('object-context-menu');if(!menu)return;menu.addEventListener('click',e=>{const button=e.target.closest('button[data-object-action]');if(!button)return;const key=menu.dataset.objectKey,action=button.dataset.objectAction,obj=objectFromKey(key);hideObjectContextMenu();if(!obj)return;if(action==='rename'){const next=prompt('Enter a name for this '+(key.startsWith('token:')?'token':'prop / asset')+':',obj.name||'');if(next===null)return;const name=next.trim().slice(0,120);if(!name){if(sceneSaveStatus)sceneSaveStatus.textContent='Name cannot be empty.';return}recordUndo();obj.name=name;if(key.startsWith('token:')){list();select(obj.id)}else{syncAssetEditor(obj);refreshAttachmentControls()}saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Renamed object to '+name+'.'}else if(action==='attach'||action==='detach')setAttachmentMode(action,key)});document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))hideObjectContextMenu()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){pendingAttachmentAction=null;hideObjectContextMenu();if(sceneSaveStatus)sceneSaveStatus.textContent='Object action cancelled.'}});canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(!isGM())return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,t=hit(x,y),a=t?null:hitAsset(x,y),obj=t||a;if(!obj)return;const key=objectKey(t?'token':'asset',obj.id);menu.dataset.objectKey=key;const attached=state.attachments.filter(edge=>edge.a===key||edge.b===key).length;menu.querySelector('[data-object-action="detach"]').disabled=!attached;menu.hidden=false;menu.style.left=Math.max(8,Math.min(window.innerWidth-menu.offsetWidth-8,e.clientX))+'px';menu.style.top=Math.max(8,Math.min(window.innerHeight-menu.offsetHeight-8,e.clientY))+'px'});}

function basis(){const c=state.camera,cp=Math.cos(c.elevation),sp=Math.sin(c.elevation),sy=Math.sin(c.yaw),cy=Math.cos(c.yaw);const f={x:sy*cp,y:cy*cp,z:-sp},r={x:cy,y:-sy,z:0},u={x:r.y*f.z,y:-r.x*f.z,z:r.x*f.y-r.y*f.x},pos={x:c.targetX-f.x*c.distance,y:c.targetY-f.y*c.distance,z:c.targetZ/5-f.z*c.distance};return{pos,f,r,u}}
function project(x,y,z){const{w,h}=size();if(state.view2d)return{x:w/2+x*CELL_PX*state.camera.zoom+state.camera.panX,y:h/2-y*CELL_PX*state.camera.zoom+state.camera.panY,depth:1,scale:state.camera.zoom};const b=basis(),q={x:x-b.pos.x,y:y-b.pos.y,z:z/5-b.pos.z},cx=q.x*b.r.x+q.y*b.r.y+q.z*b.r.z,cy=q.x*b.u.x+q.y*b.u.y+q.z*b.u.z,depth=q.x*b.f.x+q.y*b.f.y+q.z*b.f.z,focal=Math.min(w,h)*.86*state.camera.zoom,s=focal/Math.max(NEAR,depth);return{x:w/2+cx*s,y:h*.56-cy*s,depth,scale:s/CELL_PX}}
function terrainHeightAt(x,y){const gx=snapCell(x),gy=snapCell(y),tile=state.terrain[gx+','+gy];if(!tile)return 0;const high=Math.max(0,Number(tile.height)||0);if(tile.type!=='ramp')return high;const low=Math.max(0,Math.min(high,Number(tile.startHeight)||0)),fx=x-gx,fy=y-gy;switch(tile.direction||'north'){case'east':return low+(high-low)*(fx+.5);case'west':return low+(high-low)*(.5-fx);case'south':return low+(high-low)*(.5-fy);default:return low+(high-low)*(fy+.5)}}
function tokenProject(t){const p=tokenWorld(t),terrainZ=terrainHeightAt(p.x,p.y),altitude=Math.max(0,Math.min(MAX_ALTITUDE,Number(t.z)||0));return project(p.x,p.y,terrainZ+altitude)}
function groundProject(t){const p=tokenWorld(t);return project(p.x,p.y,terrainHeightAt(p.x,p.y))}
function tokenRadius(t){const f=Math.max(1,t.footprint||1),p=groundProject(t);if(state.view2d)return Math.max(4,CELL_PX*state.camera.zoom*f*.5);if(!Number.isFinite(p.scale)||p.scale<=0)return 8;return Math.max(5,p.scale*CELL_PX*f*.5)}
const line=(a,b)=>{ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)};
function gridPointValid(p){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.depth)&&p.depth>NEAR&&Math.abs(p.x)<1e5&&Math.abs(p.y)<1e5}
function drawGridLine(points){let drawing=false,last=null;for(const p of points){const ok=gridPointValid(p);if(ok&&!drawing){ctx.beginPath();ctx.moveTo(p.x,p.y);drawing=true;last=p}else if(ok&&drawing){if(last&&Math.abs(p.x-last.x)<Math.max(250,window.innerWidth*2)&&Math.abs(p.y-last.y)<Math.max(250,window.innerHeight*2)){ctx.lineTo(p.x,p.y);last=p}else{ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y);last=p}}else if(drawing){ctx.stroke();drawing=false;last=null}}if(drawing)ctx.stroke()}
function gridBoundary(min,max){const world=[[min,min],[max,min],[max,max],[min,max]];if(state.view2d)return world.map(([x,y])=>project(x,y,0));const{w,h}=size(),b=basis(),focal=Math.min(w,h)*.86*state.camera.zoom;const camera=world.map(([x,y])=>{const q={x:x-b.pos.x,y:y-b.pos.y,z:-b.pos.z};return{cx:q.x*b.r.x+q.y*b.r.y+q.z*b.r.z,cy:q.x*b.u.x+q.y*b.u.y+q.z*b.u.z,depth:q.x*b.f.x+q.y*b.f.y+q.z*b.f.z}});const clipped=[];for(let i=0;i<camera.length;i++){const a=camera[i],b2=camera[(i+1)%camera.length],ain=a.depth>NEAR,bin=b2.depth>NEAR;if(ain)clipped.push(a);if(ain!==bin){const t=(NEAR+.001-a.depth)/(b2.depth-a.depth);clipped.push({cx:a.cx+(b2.cx-a.cx)*t,cy:a.cy+(b2.cy-a.cy)*t,depth:NEAR+.001})}}return clipped.map(p=>({x:w/2+p.cx*focal/p.depth,y:h*.56-p.cy*focal/p.depth,depth:p.depth,scale:focal/(p.depth*CELL_PX)}))}
const mapImageCache=new Map();
function getMapImage(src){if(!src)return null;let img=mapImageCache.get(src);if(!img){img=new Image();img.src=src;mapImageCache.set(src,img)}return img}
function drawMapImage(){
 if(!state.mapImage)return;
 const img=getMapImage(state.mapImage);if(!img||!img.complete||!img.naturalWidth)return;
 const mw=Math.max(1,Math.min(200,Number(state.mapWidth)||24)),mh=Math.max(1,Math.min(200,Number(state.mapHeight)||24)),cx=Number(state.mapX)||0,cy=Number(state.mapY)||0;
 const sw=img.naturalWidth,sh=img.naturalHeight,alpha=Math.max(.05,Math.min(1,Number(state.mapOpacity)||.78));
 // Subdivide the map into small projected quads. This approximates perspective
 // projection much more closely than stretching the whole image across two
 // large affine triangles, which can look like it wobbles while orbiting.
 const divisions=16,projected=[];
 for(let j=0;j<=divisions;j++){
  projected[j]=[];
  for(let i=0;i<=divisions;i++){
   const wx=cx-mw/2+mw*i/divisions,wy=cy+mh/2-mh*j/divisions;
   projected[j][i]=project(wx,wy,0);
  }
 }
 const triangle=(src,dst)=>{
  const [s0,s1,s2]=src,[d0,d1,d2]=dst,den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(Math.abs(den)<.0001)return;
  const a=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
  const c=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
  const e=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
  const b=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
  const d=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
  const f=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  ctx.save();ctx.beginPath();ctx.moveTo(d0.x,d0.y);ctx.lineTo(d1.x,d1.y);ctx.lineTo(d2.x,d2.y);ctx.closePath();ctx.clip();ctx.globalAlpha=alpha;ctx.transform(a,b,c,d,e,f);ctx.drawImage(img,0,0,sw,sh);ctx.restore();
 };
 for(let j=0;j<divisions;j++)for(let i=0;i<divisions;i++){
  const x0=sw*i/divisions,x1=sw*(i+1)/divisions,y0=sh*j/divisions,y1=sh*(j+1)/divisions;
  const s00={x:x0,y:y0},s10={x:x1,y:y0},s11={x:x1,y:y1},s01={x:x0,y:y1};
  const p00=projected[j][i],p10=projected[j][i+1],p11=projected[j+1][i+1],p01=projected[j+1][i];
  if([p00,p10,p11,p01].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR))continue;
  triangle([s00,s10,s11],[p00,p10,p11]);triangle([s00,s11,s01],[p00,p11,p01]);
 }
}
function grid(){const{w,h}=size(),min=-GRID_RADIUS-.5,max=GRID_RADIUS+.5,boundary=gridBoundary(min,max);if(boundary.length<3||boundary.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;const pathBoundary=()=>{ctx.beginPath();ctx.moveTo(boundary[0].x,boundary[0].y);for(let i=1;i<boundary.length;i++)ctx.lineTo(boundary[i].x,boundary[i].y);ctx.closePath()};ctx.save();pathBoundary();ctx.fillStyle='#172230';ctx.fill();ctx.clip();drawMapImage();ctx.strokeStyle='rgba(143,211,255,.30)';ctx.lineWidth=1;for(let i=-GRID_RADIUS;i<=GRID_RADIUS+1;i++){const a=[],b=[],fixed=i-.5;for(let s=0;s<=82;s++){const q=min+(max-min)*s/82;a.push(project(fixed,q,0));b.push(project(q,fixed,0))}drawGridLine(a);drawGridLine(b)}ctx.restore();ctx.save();pathBoundary();ctx.strokeStyle='rgba(143,211,255,.42)';ctx.lineWidth=1.5;ctx.stroke();ctx.restore()}
function drawTerrain(){
 const palette={ground:'#58734d',hill:'#79965a',mountain:'#8b929c',cliff:'#77717a',canopy:'#286b45',platform:'#9a7955',ramp:'#b58b58'};
 const sideColors=['#303943','#39434d','#424d58','#353e48'];
 const tiles=Object.entries(state.terrain).map(([key,t])=>{const xy=key.split(',').map(Number);const height=Math.max(0,Math.min(120,Number(t.height)||0));return{x:xy[0],y:xy[1],type:t.type||'hill',height,startHeight:Math.max(0,Math.min(height,Number(t.startHeight)||0)),direction:['north','south','east','west'].includes(t.direction)?t.direction:'north'};});
 const tileMap=new Map(tiles.map(t=>[t.x+','+t.y,t]));
 const corners=t=>[[t.x-.5,t.y-.5],[t.x+.5,t.y-.5],[t.x+.5,t.y+.5],[t.x-.5,t.y+.5]];
 const cornerHeights=t=>{if(t.type!=='ramp')return[t.height,t.height,t.height,t.height];const lo=Math.max(0,Math.min(t.height,Number(t.startHeight)||0)),hi=t.height;return({north:[lo,lo,hi,hi],south:[hi,hi,lo,lo],east:[lo,hi,hi,lo],west:[hi,lo,lo,hi]}[t.direction])};
 const poly=(pts,color,outline=true)=>{if(pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=color;ctx.fill();if(outline){ctx.strokeStyle='#17212a';ctx.lineWidth=1;ctx.stroke()}};
 const surfaces=[];
 for(const t of tiles){
  const c=corners(t),hs=cornerHeights(t),topWorld=c.map((p,i)=>({x:p[0],y:p[1],z:hs[i]}));
  // Every raised tile has four opaque sides. Adjacent terrain only reduces the
  // wall to the actual exposed height difference; no transparent canvas fills.
  if(!state.view2d&&t.height>0){
   const neighbors=[[t.x,t.y-1],[t.x+1,t.y],[t.x,t.y+1],[t.x-1,t.y]];
   for(let i=0;i<4;i++){
    const j=(i+1)%4,n=tileMap.get(neighbors[i][0]+','+neighbors[i][1]);let lowA=0,lowB=0;
    if(n){const nh=cornerHeights(n),nc=corners(n),findHeight=pt=>{for(let k=0;k<4;k++)if(Math.abs(nc[k][0]-pt[0])<.001&&Math.abs(nc[k][1]-pt[1])<.001)return nh[k];return n.height};const neighborA=findHeight(c[i]),neighborB=findHeight(c[j]);
     // Resolve the shared edge as one height profile. Where this tile is lower
     // than its neighbor, it contributes no wall; where it is higher, its wall
     // ends exactly at the neighbor's corresponding corner heights.
     if(hs[i]<=neighborA+.001&&hs[j]<=neighborB+.001)continue;
     lowA=Math.min(hs[i],neighborA);lowB=Math.min(hs[j],neighborB);
    }
    if(Math.abs(hs[i]-lowA)<.001&&Math.abs(hs[j]-lowB)<.001)continue;
    // Build the exposed wall from the shared edge's exact corner heights.
    // Clip each endpoint independently so sloped ramp joins produce a tapered
    // wall instead of a full-height rectangular slab or a gap at one corner.
    const world=[{x:c[i][0],y:c[i][1],z:hs[i]},{x:c[j][0],y:c[j][1],z:hs[j]},{x:c[j][0],y:c[j][1],z:lowB},{x:c[i][0],y:c[i][1],z:lowA}];
    if(world.every((p,k)=>k<2||Math.abs(p.z-world[k===2?1:0].z)<.001))continue;
    const pts=world.map(p=>project(p.x,p.y,p.z));
    const depths=world.map(p=>project(p.x,p.y,p.z).depth),depth=depths.reduce((sum,d)=>sum+d,0)/depths.length;
    // Shade taller exposed drops more deeply so stepped cliffs and ramp joins
    // remain legible without drawing diagonal outlines across triangulated faces.
    const exposedHeight=(Math.max(0,hs[i]-lowA)+Math.max(0,hs[j]-lowB))/2;
    const wallColor=exposedHeight>=40?'#252e38':exposedHeight>=20?sideColors[i]:exposedHeight>=10?'#46525e':'#53606b';
    surfaces.push({kind:'wall',points:pts,vertexDepths:depths,color:wallColor,depth,faceDepthMin:Math.min(...depths)});
   }
  }
  const worldTop=topWorld,pts=worldTop.map(p=>project(p.x,p.y,p.z)),depth=worldTop.reduce((sum,p)=>sum+project(p.x,p.y,p.z).depth,0)/worldTop.length;
  surfaces.push({kind:'top',tile:t,points:pts,vertexDepths:worldTop.map(p=>project(p.x,p.y,p.z).depth),color:palette[t.type]||palette.hill,depth});
 }
 // Use average camera-space depth of each actual face; farther terrain is drawn
 // first and nearer opaque walls naturally cover whatever lies behind them.
 const triangles=[];
 for(const f of surfaces){for(const ids of [[0,1,2],[0,2,3]])triangles.push({points:ids.map(i=>f.points[i]),depths:ids.map(i=>f.vertexDepths?.[i]||f.depth||Infinity),color:f.color,kind:f.kind,tile:f.tile,depth:ids.reduce((sum,i)=>sum+(f.vertexDepths?.[i]||f.depth||0),0)/3})}
 triangles.sort((a,b)=>(b.depth||0)-(a.depth||0));
 // Render surfaces and labels in one back-to-front pass. Nearer terrain triangles are
 // painted after farther labels, so opaque walls naturally cover text behind them.
 for(const tri of triangles)poly(tri.points,tri.color,false);
 // Labels are indivisible text: interleaving them with depth-sorted triangles
 // lets nearer triangles slice through individual letters. Draw each label after
 // terrain, but suppress it entirely when another terrain face covers its anchor.
 const labelEvents=[];for(const f of surfaces){if(f.kind!=='top')continue;const t=f.tile,c=project(t.x,t.y,t.type==='ramp'?((Math.max(0,Math.min(t.height,Number(t.startHeight)||0))+t.height)/2):t.height),cellPixels=(c.scale||0)*CELL_PX;if(cellPixels<38||c.depth<=NEAR||c.x<-100||c.x>size().w+100||c.y<-100||c.y>size().h+100)continue;labelEvents.push({tile:t,c,label:t.type==='ramp'?'Ramp '+t.direction+' '+t.height+'ft':t.type+' '+t.height+'ft'})}
 const pointInTriangle=(p,a,b,c)=>{const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-8)return false;const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/den,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/den,w=1-u-v;return u>=-1e-5&&v>=-1e-5&&w>=-1e-5};
 for(const {tile,c,label} of labelEvents){ctx.save();ctx.font='700 10px system-ui';const textWidth=ctx.measureText(label).width,textHeight=12;const samples=[];for(let sx=-textWidth/2;sx<=textWidth/2;sx+=Math.max(2,Math.min(5,textWidth/8)))for(let sy=-textHeight/2;sy<=textHeight/2;sy+=3)samples.push({x:c.x+sx,y:c.y+sy});samples.push({x:c.x+textWidth/2,y:c.y},{x:c.x-textWidth/2,y:c.y});let hidden=false;for(const tri of triangles){if(tri.tile===tile||tri.depth>=c.depth-.75)continue;if(samples.some(p=>pointInTriangle(p,tri.points[0],tri.points[1],tri.points[2]))){hidden=true;break}}if(!hidden){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,c.x,c.y)}ctx.restore()}
}
function ground(t){const g=groundProject(t),p=tokenProject(t);if(g.depth<=NEAR||p.depth<=NEAR)return;const f=Math.max(1,t.footprint||1),rr=Math.max(7,Math.min(32,7+g.scale*CELL_PX*f*.12)),alt=Math.max(0,Number(t.z)||0);ctx.save();ctx.fillStyle='rgba(3,7,13,.7)';ctx.beginPath();ctx.ellipse(g.x,g.y,rr,rr*.32,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=t.id===state.selected?'rgba(255,255,255,.9)':'rgba(143,211,255,.7)';ctx.lineWidth=t.id===state.selected?2.5:1.5;ctx.stroke();if(alt>0){ctx.strokeStyle=t.id===state.selected?'rgba(255,255,255,.9)':'rgba(143,211,255,.7)';ctx.setLineDash([5,5]);ctx.beginPath();line(g,p);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#e6f0fa';ctx.font='700 9px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(`${alt} ft`,g.x,g.y-rr-3)}ctx.restore()}
function drawAsset(a){
 const terrainZ=terrainHeightAt(a.x,a.y),altitude=Math.max(0,Math.min(MAX_ALTITUDE,Number(a.z)||0));
 const groundPoint=project(a.x,a.y,terrainZ),elevatedPoint=project(a.x,a.y,terrainZ+altitude);
 const standee=a.displayStyle!=='flat',p=standee?elevatedPoint:groundPoint;
 if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR||groundPoint.depth<=NEAR)return;
 const img=getAssetImage(a.image);if(!img||!img.complete||!img.naturalWidth)return;
 const width=Math.max(1,Number(a.width)||1),depth=Math.max(1,Number(a.depth)||1),scale=state.view2d?CELL_PX*state.camera.zoom:Math.max(4,groundPoint.scale*CELL_PX),rotation=(Number(a.rotation)||0)*Math.PI/180;
 const pixelMode=a.sizeMode==='pixel',w=pixelMode?Math.max(16,Math.min(1200,Number(a.imageWidthPx)||180)):width*scale,h=pixelMode?Math.max(16,Math.min(1200,Number(a.imageHeightPx)||180)):depth*scale;
 const standW=Math.max(width*scale,w)+20,standH=Math.max(depth*scale,h)+16;
 if(standee){
  // Draw a visible stand base on the battlefield surface, then anchor the upright
  // image by its bottom edge so it rises from the base instead of extending below it.
  const baseWidth=Math.max(12,Math.min(width*scale*.72,standW*.72));
  const baseDepth=Math.max(5,Math.min(scale*.2,standH*.12));
  ctx.save();ctx.translate(groundPoint.x,groundPoint.y);ctx.rotate(rotation);
  ctx.fillStyle='rgba(3,7,13,.88)';ctx.strokeStyle=(state.selectedAssetIds||[]).includes(a.id)||a.id===state.selectedAsset?'rgba(255,224,138,.98)':'rgba(210,220,232,.88)';ctx.lineWidth=1.25;
  ctx.beginPath();ctx.ellipse(0,0,baseWidth/2,baseDepth,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.restore();
  if(altitude>0){
   ctx.save();ctx.strokeStyle=a.id===state.selectedAsset?'rgba(255,224,138,.98)':'rgba(143,211,255,.95)';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(groundPoint.x,groundPoint.y);ctx.lineTo(elevatedPoint.x,elevatedPoint.y);ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle='#e6f0fa';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(altitude+' ft',groundPoint.x,groundPoint.y-7);ctx.restore();
  }
  const imageBottom=p.y-baseDepth*.45;
  ctx.save();ctx.translate(p.x,imageBottom-h/2);ctx.rotate(rotation);ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
  a._screen={x:p.x,y:imageBottom-h/2,width:w,height:h,hitWidth:standW+20,hitHeight:standH+16,rotation:Number(a.rotation)||0};
  return;
 }
 // Flat assets are textures laid onto the world ground plane, like the battle map,
 // rather than camera-facing billboards. Subdivide the texture to follow perspective.
 const cos=Math.cos(rotation),sin=Math.sin(rotation),divisions=10,sw=img.naturalWidth,sh=img.naturalHeight,projected=[];
 for(let j=0;j<=divisions;j++){
  projected[j]=[];
  for(let i=0;i<=divisions;i++){
   const lx=(i/divisions-.5)*width,ly=(.5-j/divisions)*depth;
   const wx=a.x+lx*cos-ly*sin,wy=a.y+lx*sin+ly*cos,wz=terrainHeightAt(wx,wy);
   projected[j][i]=project(wx,wy,wz);
  }
 }
 const triangle=(src,dst)=>{
  const [s0,s1,s2]=src,[d0,d1,d2]=dst,den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(Math.abs(den)<.0001)return;
  const aa=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
  const cc=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
  const ee=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
  const bb=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
  const dd=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
  const ff=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  ctx.save();ctx.beginPath();ctx.moveTo(d0.x,d0.y);ctx.lineTo(d1.x,d1.y);ctx.lineTo(d2.x,d2.y);ctx.closePath();ctx.clip();ctx.transform(aa,bb,cc,dd,ee,ff);ctx.drawImage(img,0,0,sw,sh);ctx.restore();
 };
 for(let j=0;j<divisions;j++)for(let i=0;i<divisions;i++){
  const x0=sw*i/divisions,x1=sw*(i+1)/divisions,y0=sh*j/divisions,y1=sh*(j+1)/divisions;
  const s00={x:x0,y:y0},s10={x:x1,y:y0},s11={x:x1,y:y1},s01={x:x0,y:y1};
  const p00=projected[j][i],p10=projected[j][i+1],p11=projected[j+1][i+1],p01=projected[j+1][i];
  if([p00,p10,p11,p01].some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.depth<=NEAR))continue;
  triangle([s00,s10,s11],[p00,p10,p11]);triangle([s00,s11,s01],[p00,p11,p01]);
 }
 a._screen={x:groundPoint.x,y:groundPoint.y,width:width*scale,height:depth*scale,hitWidth:width*scale+12,hitHeight:depth*scale+12,rotation:Number(a.rotation)||0};
}
function getAssetImage(src){if(!src)return null;let img=assetImageCache.get(src);if(!img){img=new Image();img.onload=()=>{};img.src=src;assetImageCache.set(src,img)}return img}
function syncAssetEditor(a){
 if(!a)return;
 const mode=document.getElementById('asset-size-mode'),iw=document.getElementById('asset-image-width-px'),ih=document.getElementById('asset-image-height-px'),display=document.getElementById('asset-display-style');
 if(assetNameEl)assetNameEl.value=a.name||'Prop';
 if(mode)mode.value=a.sizeMode==='pixel'?'pixel':'grid';
 if(display)display.value=a.displayStyle==='flat'?'flat':'standee';
 if(assetVisibilityEl)assetVisibilityEl.value=a.visibility==='gm'?'gm':'players';
 if(iw)iw.value=String(Math.round(Number(a.imageWidthPx)||180));
 if(ih)ih.value=String(Math.round(Number(a.imageHeightPx)||180));
 if(assetWidthEl)assetWidthEl.value=String(a.width||2);
 if(assetDepthEl)assetDepthEl.value=String(a.depth||2);
 if(assetRotationEl)assetRotationEl.value=String(Number(a.rotation)||0);
 if(assetAltitudeEl)assetAltitudeEl.value=String(Number(a.z)||0);
 if(assetStatusEl)assetStatusEl.textContent='Selected: '+(a.name||'Prop')+'. Change sizing, footprint, rotation, or height here; changes apply to the placed asset.';
}
function updateSelectedAssetFromEditor(){
 const a=state.assets.find(item=>item.id===state.selectedAsset);
 if(!a||!isGM())return;
 const mode=document.getElementById('asset-size-mode'),iw=document.getElementById('asset-image-width-px'),ih=document.getElementById('asset-image-height-px'),display=document.getElementById('asset-display-style');
 a.name=assetNameEl.value.trim()||'Prop';
 a.visibility=assetVisibilityEl?.value==='gm'?'gm':'players';
 a.sizeMode=mode?.value==='pixel'?'pixel':'grid';
 a.displayStyle=display?.value==='flat'?'flat':'standee';
 a.imageWidthPx=Math.max(16,Math.min(1200,Number(iw?.value)||180));
 a.imageHeightPx=Math.max(16,Math.min(1200,Number(ih?.value)||180));
 a.width=Math.max(1,Math.min(12,Number(assetWidthEl.value)||1));
 a.depth=Math.max(1,Math.min(12,Number(assetDepthEl.value)||1));
 a.rotation=Number(assetRotationEl.value)||0;
 changeGroupAltitude('asset',a.id,Math.max(0,Math.min(MAX_ALTITUDE,Number(assetAltitudeEl.value)||0)));
 if(assetStatusEl)assetStatusEl.textContent='Updated placed asset: '+a.name+'.';
 saveSceneToBrowser();
}
function hitAsset(x,y){let found=null,best=Infinity;for(const a of state.assets.filter(canSeeAsset)){const s=a._screen;if(!s)continue;const dx=x-s.x,dy=y-s.y,ang=-(s.rotation||0)*Math.PI/180,rx=dx*Math.cos(ang)-dy*Math.sin(ang),ry=dx*Math.sin(ang)+dy*Math.cos(ang);if(Math.abs(rx)<=(s.hitWidth||s.width)/2+8&&Math.abs(ry)<=(s.hitHeight||s.height)/2+8){const d=Math.hypot(dx,dy);if(d<best){best=d;found=a}}}return found}
function drawToken(t){const p=tokenProject(t);if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR)return;const r=tokenRadius(t);if(!Number.isFinite(r)||r<=0)return;ground(t);ctx.save();ctx.translate(p.x,p.y-r);ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=6;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=t.color||'#7aa7ff';ctx.fill();ctx.shadowBlur=0;ctx.save();ctx.beginPath();ctx.arc(0,0,Math.max(1,r-2),0,Math.PI*2);ctx.clip();const tokenImage=t.image?getTokenImage(t.image):null;if(tokenImage?.complete&&tokenImage.naturalWidth>0){const side=Math.max(tokenImage.naturalWidth,tokenImage.naturalHeight),zoom=Math.max(1,Math.min(10,Number(t.imageZoom)||1)),base=Math.min(tokenImage.naturalWidth,tokenImage.naturalHeight),drawSide=(r-2)*2*zoom,dx=(Number(t.imageX)||0)*(r-2)*2*zoom,dy=(Number(t.imageY)||0)*(r-2)*2*zoom;ctx.drawImage(tokenImage,-drawSide/2+dx,-drawSide/2+dy,drawSide*tokenImage.naturalWidth/side,drawSide*tokenImage.naturalHeight/side)}else{ctx.fillStyle='#08111d';ctx.font=`800 ${Math.max(12,r*.72)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.glyph||'•',0,-2)}ctx.restore();const tokenSelected=(state.selectedTokenIds||[]).includes(t.id)||t.id===state.selected;ctx.lineWidth=tokenSelected?4:2;ctx.strokeStyle=tokenSelected?'#fff':'#0b1320';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(8,Math.min(12,r*.3))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=3;ctx.fillText(`${t.z} ft`,0,r*.52);ctx.restore();t._screen={x:p.x,y:p.y-r,radius:r}}
function getTokenImage(src){if(!src)return null;let img=tokenImageCache.get(src);if(!img){img=new Image();img.onload=()=>{};img.src=src;tokenImageCache.set(src,img)}return img}
function applyImageFraming(){const zoomValue=document.getElementById('token-image-zoom-value');if(zoomValue&&tokenImageZoomEl)zoomValue.textContent=Number(tokenImageZoomEl.value).toFixed(2)+'×';const t=state.tokens.find(x=>x.id===state.selected);if(!t||!t.image||t.locked||!isGM())return;t.imageZoom=Math.max(1,Math.min(10,Number(tokenImageZoomEl?.value)||1));t.imageX=Math.max(-.8,Math.min(.8,Number(tokenImageXEl?.value)||0));t.imageY=Math.max(-.8,Math.min(.8,Number(tokenImageYEl?.value)||0));if(tokenImageStatusEl)tokenImageStatusEl.textContent='Image framing updated.';saveSceneToBrowser()}
[tokenImageZoomEl,tokenImageXEl,tokenImageYEl].forEach(el=>el?.addEventListener('input',applyImageFraming));
document.querySelector('[data-action="token-image-reset"]')?.addEventListener('click',()=>{const t=state.tokens.find(x=>x.id===state.selected);if(!t||!t.image||t.locked||!isGM())return;recordUndo();delete t.imageZoom;delete t.imageX;delete t.imageY;loadEditor(t);saveSceneToBrowser()});



function resetCamera(){state.camera={yaw:-.65,elevation:.68,distance:60,zoom:1,targetX:0,targetY:0,targetZ:0,panX:0,panY:0};state.drag=null;state.pointers.clear();state.pinchDistance=null;state.lastPinchMid=null;state.movingToken=null;state.moveStart=null;state.panMode=false;document.querySelectorAll('[data-action="toggle-pan"]').forEach(x=>{x.textContent='Pan: Off';x.setAttribute('aria-pressed','false');x.classList.remove('active')});resize()}
function drawMovementRuler(){if(!state.movingToken||!state.moveStart)return;const t=state.movingToken,f=Math.max(1,t.footprint||1),sx=state.moveStart.x,sy=state.moveStart.y,ex=snapCell(t._dragX??t.x),ey=snapCell(t._dragY??t.y);const start={...t,x:sx,y:sy},end={...t,x:ex,y:ey};const a=tokenProject(start),b=tokenProject(end);if(!Number.isFinite(a.x)||!Number.isFinite(b.x)||a.depth<=NEAR||b.depth<=NEAR)return;const squares=Math.max(Math.abs(ex-sx),Math.abs(ey-sy)),feet=squares*FEET_PER_GRID;ctx.save();ctx.strokeStyle='rgba(255,235,120,.95)';ctx.fillStyle='rgba(255,235,120,.95)';ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(b.x,b.y,Math.max(6,tokenRadius(t)*.28),0,Math.PI*2);ctx.fill();const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-12;ctx.font='700 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';const label=`${feet} ft · ${squares} square${squares===1?'':'s'}`;const tw=ctx.measureText(label).width+16;ctx.fillStyle='rgba(5,8,15,.9)';ctx.beginPath();ctx.roundRect(mx-tw/2,my-12,tw,24,7);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(label,mx,my);ctx.restore()}
function drawSelectionBox(){const b=state.selectionBox;if(!b)return;const x=Math.min(b.x,b.x2),y=Math.min(b.y,b.y2),w=Math.abs(b.x2-b.x),h=Math.abs(b.y2-b.y);ctx.save();ctx.fillStyle=b.type==='token'?'rgba(83,174,255,.16)':'rgba(255,194,92,.16)';ctx.strokeStyle=b.type==='token'?'rgba(105,190,255,.98)':'rgba(255,205,112,.98)';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.restore()}
function completeBoxSelection(){const b=state.selectionBox;if(!b)return;const x1=Math.min(b.x,b.x2),x2=Math.max(b.x,b.x2),y1=Math.min(b.y,b.y2),y2=Math.max(b.y,b.y2);if(b.type==='token'){const ids=visibleTokens().filter(t=>{const p=t._screen;return p&&p.x>=x1&&p.x<=x2&&p.y>=y1&&p.y<=y2}).map(t=>t.id);state.selectedTokenIds=ids;state.selectedAssetIds=[];state.selectedAsset=null;state.selected=ids[0]||null;if(ids.length){select(ids[0]);state.selectedTokenIds=ids;[...tokenList.children].forEach(el=>el.classList.toggle('selected',ids.includes(el.dataset.id)))}else{state.selected=null;selectionEl.hidden=true;selectionEl.textContent='';altitudeEl.textContent='Altitude: —';[...tokenList.children].forEach(el=>el.classList.remove('selected'))}if(sceneSaveStatus)sceneSaveStatus.textContent=ids.length+' token'+(ids.length===1?'':'s')+' selected.'}else{const ids=state.assets.filter(canSeeAsset).filter(a=>{const p=a._screen;if(!p)return false;const hw=(p.hitWidth||p.width||0)/2,hh=(p.hitHeight||p.height||0)/2;return p.x+hw>=x1&&p.x-hw<=x2&&p.y+hh>=y1&&p.y-hh<=y2}).map(a=>a.id);state.selectedAssetIds=ids;state.selectedTokenIds=[];state.selected=null;state.selectedAsset=ids[0]||null;if(ids.length)syncAssetEditor(state.assets.find(o=>o.id===ids[0]));if(sceneSaveStatus)sceneSaveStatus.textContent=ids.length+' prop/asset'+(ids.length===1?'':'s')+' selected.'}state.selectionBox=null}
function render(){const{w,h}=size();updateSelectionInfo();updateConditionsPanel(state.tokens.find(t=>t.id===state.selected));ctx.clearRect(0,0,w,h);ctx.fillStyle='#101927';ctx.fillRect(0,0,w,h);grid();drawTerrain();state.assets.filter(canSeeAsset).filter(a=>a.displayStyle==='flat').forEach(drawAsset);if(typeof window.drawTacticalOverlays==='function')window.drawTacticalOverlays();state.assets.filter(canSeeAsset).filter(a=>a.displayStyle!=='flat').forEach(drawAsset);visibleTokens().sort((a,b)=>tokenProject(b).depth-tokenProject(a).depth).forEach(drawToken);drawMovementRuler();drawSelectionBox();const hud=document.getElementById('camera-readout');if(hud)hud.textContent=`${state.view2d?'2D':'3D'} · Each grid = ${FEET_PER_GRID} ft · zoom ${state.camera.zoom.toFixed(2)}×`;const altitudeHud=document.getElementById('altitude'),selectedToken=state.tokens.find(t=>t.id===state.selected);if(altitudeHud){if(selectedToken&&canSeeToken(selectedToken)){const wp=tokenWorld(selectedToken),terrain=Math.round(terrainHeightAt(wp.x,wp.y)*10)/10,above=Math.round(Number(selectedToken.z)||0),overall=Math.round((terrain+above)*10)/10;altitudeHud.textContent=`Overall altitude: ${overall} ft · Terrain: ${terrain} ft · Above terrain: ${above} ft`}else altitudeHud.textContent='Altitude: —'}if(movementEl){if(state.movingToken)movementEl.textContent=`Horizontal movement: ${state.moveDistance} ft · ${Math.ceil(state.moveDistance/FEET_PER_GRID)} square${Math.ceil(state.moveDistance/FEET_PER_GRID)===1?'':'s'}`;else if(state.moveDistance)movementEl.textContent=`Last horizontal movement: ${state.moveDistance} ft · ${Math.ceil(state.moveDistance/FEET_PER_GRID)} square${Math.ceil(state.moveDistance/FEET_PER_GRID)===1?'':'s'}`;else movementEl.textContent='Horizontal movement: — · Adjust altitude separately'}requestAnimationFrame(render)}requestAnimationFrame(render);
function isGM(){return sessionRoleEl.value==='gm'}
function currentPlayer(){return sessionPlayerNameEl.value.trim().toLowerCase()}
function canSeeAsset(a){return isGM()||a.visibility!=='gm'}
function canSeeToken(t){if(isGM())return true;if(t.visibility==='gm'||t.assignment==='gm')return false;if(t.assignment==='specific')return (t.players||[]).some(p=>p.trim().toLowerCase()===currentPlayer());return true}
function canControlToken(t){if(t.locked)return false;if(isGM())return true;if(t.assignment==='all')return true;if(t.assignment==='specific')return (t.players||[]).some(p=>p.trim().toLowerCase()===currentPlayer());return false}
function visibleTokens(){return state.tokens.filter(canSeeToken)}
function updateIdentityUI(){const gm=isGM();playerNameWrap.hidden=gm;permissionStatusEl.textContent=gm?'GM preview: all tokens and management controls are available.':'Player preview: GM-only tokens are hidden; you can control All Players tokens and tokens assigned to your name. Unassigned tokens are visible but not controllable.';document.querySelectorAll('[data-action="token-add"],[data-action="token-update"],[data-action="token-delete"],[data-action="token-lock"],[data-action="save-scene"],[data-action="load-scene"],[data-action="export-scene"],[data-action="import-scene"],[data-action="terrain-toggle"],[data-action="asset-add"],[data-action="asset-delete"]').forEach(b=>b.disabled=!gm);assetEditControls?.forEach(el=>el.disabled=!gm);if(!gm&&state.terrainMode){state.terrainMode=false;const terrainButton=document.querySelector('[data-action="terrain-toggle"]');if(terrainButton){terrainButton.textContent="Paint Terrain: Off";terrainButton.classList.remove("active");}}const t=state.tokens.find(x=>x.id===state.selected);if(t&&!canSeeToken(t)){state.selected=visibleTokens()[0]?.id||null;state.movingToken=null;state.moveStart=null}list()}
sessionRoleEl.onchange=updateIdentityUI;sessionPlayerNameEl.oninput=updateIdentityUI;
function assignmentLabel(t){if(t.assignment==='specific')return t.players?.length?`Players: ${t.players.join(", ")}`:'Specific players';if(t.assignment==='gm')return 'GM Only';if(t.assignment==='unassigned')return 'Unassigned';return 'All Players'}
function loadEditor(t){if(!t)return;tokenNameEl.value=t.name;tokenGlyphEl.value=t.glyph||'';tokenColorEl.value=t.color||'#65d6a1';tokenFootprintEl.value=String(t.footprint||1);if(tokenVisibilityEl)tokenVisibilityEl.value=t.visibility==='gm'?'gm':'players';tokenAssignmentEl.value=t.assignment||'all';tokenPlayersEl.value=(t.players||[]).join(', ');tokenPlayersEl.hidden=tokenAssignmentEl.value!=='specific';if(tokenImageStatusEl)tokenImageStatusEl.textContent=t.image?'Custom image attached. Drag the preview or use zoom and offsets to align it.':'No custom image; using the token glyph.';if(tokenImageFileEl)tokenImageFileEl.value='';if(tokenImageZoomEl)tokenImageZoomEl.value=String(t.imageZoom||1);if(tokenImageXEl)tokenImageXEl.value=String(t.imageX||0);if(tokenImageYEl)tokenImageYEl.value=String(t.imageY||0);updateImageControlState(t)}
function updateImageControlState(t){const disabled=!t?.image||!!t?.locked||!isGM();[tokenImageZoomEl,tokenImageXEl,tokenImageYEl].forEach(el=>{if(el)el.disabled=disabled});const reset=document.querySelector('[data-action="token-image-reset"]');if(reset)reset.disabled=disabled}
function updateAltitudeDisplay(t){const slider=document.getElementById('token-altitude-slider'),value=document.getElementById('altitude-value'),detail=document.getElementById('altitude-detail');if(slider)slider.value=String(Math.max(0,Math.min(MAX_ALTITUDE,Math.round((Number(t?.z)||0)/ALTITUDE_STEP)*ALTITUDE_STEP)));if(value)value.textContent=t?`${t.z} ft above terrain`:'— ft';if(detail){if(!t){detail.textContent='Select a token to adjust its altitude.'}else{const p=tokenWorld(t),terrain=Math.round(terrainHeightAt(p.x,p.y)*10)/10,above=Math.round(Number(t.z)||0),overall=Math.round((terrain+above)*10)/10;detail.textContent=`${t.name} · Overall altitude: ${overall} ft · Terrain: ${terrain} ft · Height above terrain: ${above} ft`}}}
const APPROVED_CONDITIONS=["Blinded","Charmed","Deafened","Frightened","Grappled","Incapacitated","Invisible","Paralyzed","Petrified","Poisoned","Prone","Restrained","Stunned","Unconscious"];
function normalizeTokenConditions(conditions){
 if(!Array.isArray(conditions))return [];
 const result=[];
 conditions.forEach(entry=>{
  const name=typeof entry==='string'?entry:String(entry?.name||'');
  if(!APPROVED_CONDITIONS.includes(name)||result.some(c=>c.name===name))return;
  const type=entry&&typeof entry==='object'&&['turn','round'].includes(entry.durationType)?entry.durationType:'until-removed';
  const remaining=type==='until-removed'?null:Math.max(1,Math.min(99,Math.floor(Number(entry.remaining)||1)));
  result.push({name,durationType:type,remaining});
 });
 return result;
}
function updateTurnCounter(){
 const el=document.getElementById('turn-counter');
 if(el)el.textContent='Round '+Math.max(1,Number(state.combatRound)||1)+' · Turn '+Math.max(0,Number(state.combatTurn)||0);
}
updateTurnCounter();
function updateConditionsPanel(token){
 const nameEl=document.getElementById('condition-token-name'),listEl=document.getElementById('condition-list');
 const controls=document.getElementById('condition-controls'),selectEl=document.getElementById('condition-select'),removeList=document.getElementById('condition-remove-list'),applyButton=document.querySelector('[data-condition-apply]');
 if(!nameEl||!listEl)return;
 const valid=!!token&&canSeeToken(token);
 if(!valid){
  nameEl.textContent='No token selected';listEl.textContent='Select a token to view its active Conditions.';
  if(controls)controls.hidden=true;if(removeList){removeList.replaceChildren();removeList.dataset.conditionsKey='';}return;
 }
 nameEl.textContent=token.name||'Unnamed Token';
 const active=normalizeTokenConditions(token.conditions);
 listEl.replaceChildren();
 if(!active.length)listEl.textContent='No active Conditions.';
 else active.forEach(condition=>{
  const item=document.createElement('div');item.className='condition-entry';
  const label=document.createElement('span');label.textContent=condition.name;
  const duration=document.createElement('small');
  duration.textContent=condition.durationType==='until-removed'?'Until removed':condition.remaining+' '+(condition.durationType==='turn'?'turn(s)':'round(s)');
  item.append(label,duration);listEl.appendChild(item);
 });
 if(controls)controls.hidden=!isGM();
 if(selectEl){const selected=selectEl.value;for(const option of selectEl.options)if(option.value)option.disabled=active.some(c=>c.name===option.value);if(selected&&active.some(c=>c.name===selected))selectEl.value='';}
 if(applyButton)applyButton.disabled=!isGM()||!selectEl||!selectEl.value||active.some(c=>c.name===selectEl.value);
 if(removeList){
  const removeKey=(isGM()?active.map(c=>c.name+':'+c.durationType+':'+c.remaining).join('|'):'')+'|'+(isGM()?'gm':'player');
  if(removeList.dataset.conditionsKey!==removeKey){
   removeList.replaceChildren();removeList.dataset.conditionsKey=removeKey;
   if(isGM()&&active.length){
    const heading=document.createElement('div');heading.className='condition-remove-heading';heading.textContent='Remove Condition';removeList.appendChild(heading);
    active.forEach(condition=>{
     const button=document.createElement('button');button.type='button';button.className='condition-remove-button';button.dataset.conditionRemove=condition.name;button.textContent='Remove '+condition.name;removeList.appendChild(button);
    });
   }
  }
 }
}
function advanceCombatClock(type){
 if(!isGM()){if(sceneSaveStatus)sceneSaveStatus.textContent='Only the GM can advance combat turns.';return;}
 recordUndo();
 const key=type==='turn'?'combatTurn':'combatRound';
 if(type==='turn')state.combatTurn=Math.max(0,Number(state.combatTurn)||0)+1;
 else{state.combatRound=Math.max(1,Number(state.combatRound)||1)+1;state.combatTurn=0;}
 let expired=0;
 state.tokens.forEach(token=>{
  const before=normalizeTokenConditions(token.conditions);
  token.conditions=before.flatMap(condition=>{
   if(condition.durationType!==type)return [condition];
   const remaining=condition.remaining-1;
   if(remaining<=0){expired++;return [];}
   return [{...condition,remaining}];
  });
 });
 updateTurnCounter();saveSceneToBrowser();
 if(sceneSaveStatus)sceneSaveStatus.textContent=(type==='turn'?'Turn advanced.':'Round '+state.combatRound+' started.')+(expired?' '+expired+' Condition'+(expired===1?'':'s')+' expired.':'');
 render();
}
const conditionPanel=document.getElementById('condition-panel');
if(conditionPanel)conditionPanel.addEventListener('click',event=>{
 const apply=event.target.closest('[data-condition-apply]'),remove=event.target.closest('[data-condition-remove]');
 if(!apply&&!remove)return;
 if(!isGM()){if(sceneSaveStatus)sceneSaveStatus.textContent='Only the GM can change token Conditions.';return;}
 const token=state.tokens.find(t=>t.id===state.selected);
 if(!token||!canSeeToken(token)){if(sceneSaveStatus)sceneSaveStatus.textContent='Select a token before changing its Conditions.';return;}
 const current=normalizeTokenConditions(token.conditions);
 if(apply){
  const selectEl=document.getElementById('condition-select'),typeEl=document.getElementById('condition-duration-type'),valueEl=document.getElementById('condition-duration-value'),name=selectEl?.value,type=typeEl?.value||'until-removed';
  if(!APPROVED_CONDITIONS.includes(name)||current.some(c=>c.name===name))return;
  const remaining=type==='until-removed'?null:Math.max(1,Math.min(99,Math.floor(Number(valueEl?.value)||1)));
  recordUndo();token.conditions=[...current,{name,durationType:['turn','round'].includes(type)?type:'until-removed',remaining}];
  selectEl.value='';saveSceneToBrowser();
  if(sceneSaveStatus)sceneSaveStatus.textContent=name+' applied to '+(token.name||'token')+'.';
 }else if(remove){
  const name=remove.dataset.conditionRemove;
  if(!current.some(c=>c.name===name))return;
  recordUndo();token.conditions=current.filter(c=>c.name!==name);saveSceneToBrowser();
  if(sceneSaveStatus)sceneSaveStatus.textContent=name+' removed from '+(token.name||'token')+'.';
 }
 updateConditionsPanel(token);
});
if(conditionPanel){
 const selectEl=document.getElementById('condition-select'),applyButton=conditionPanel.querySelector('[data-condition-apply]');
 const typeEl=document.getElementById('condition-duration-type'),valueWrap=document.getElementById('condition-duration-value-wrap');
 const refreshApply=()=>{if(applyButton)applyButton.disabled=!isGM()||!selectEl?.value;};
 selectEl?.addEventListener('change',refreshApply);
 typeEl?.addEventListener('change',()=>{if(valueWrap)valueWrap.hidden=typeEl.value==='until-removed';});
}
function updateSelectionInfo(){
 const asset=state.selectedAsset?state.assets.find(a=>a.id===state.selectedAsset):null;
 const token=!asset&&state.selected?state.tokens.find(t=>t.id===state.selected):null;
 if(asset&&canSeeAsset(asset)){
  const x=Math.round((Number(asset.x)||0)*FEET_PER_GRID*10)/10,y=Math.round((Number(asset.y)||0)*FEET_PER_GRID*10)/10,z=Math.round(Number(asset.z)||0);
  selectionEl.hidden=false;selectionEl.textContent=`${asset.name||'Unnamed Prop / Asset'} · Prop / Asset\nX: ${x} ft · Y: ${y} ft · Elevation: ${z} ft`;
 }else if(token&&canSeeToken(token)){
  const p=tokenWorld(token),x=Math.round(p.x*FEET_PER_GRID*10)/10,y=Math.round(p.y*FEET_PER_GRID*10)/10,terrain=Math.round(terrainHeightAt(p.x,p.y)*10)/10,above=Math.round(Number(token.z)||0),overall=Math.round((terrain+above)*10)/10;
  selectionEl.hidden=false;selectionEl.textContent=`${token.name||'Unnamed Token'} · Token${token.locked?' · 🔒 LOCKED':''}\nX: ${x} ft · Y: ${y} ft · Overall altitude: ${overall} ft`;
 }else{selectionEl.hidden=true;selectionEl.textContent=''}
}
function select(id){const t=state.tokens.find(x=>x.id===id);if(!t||!canSeeToken(t))return;state.selected=id;state.selectedTokenIds=[id];state.selectedAssetIds=[];const p=tokenWorld(t);selectionEl.textContent=`${t.name}${t.locked?' · 🔒 LOCKED':''} · X ${p.x*FEET_PER_GRID} ft · Y ${p.y*FEET_PER_GRID} ft · Z ${t.z} ft · ${t.footprint||1}×${t.footprint||1} squares · ${assignmentLabel(t)}`;altitudeEl.textContent=`Altitude: ${t.z} ft`;updateAltitudeDisplay(t);[...tokenList.children].forEach(e=>e.classList.toggle('selected',(state.selectedTokenIds||[state.selected]).includes(e.dataset.id)));loadEditor(t);const lockButton=document.querySelector('[data-action="token-lock"]');if(lockButton){lockButton.textContent=t.locked?'Unlock Token':'Lock Token';lockButton.disabled=!isGM()}updateImageControlState(t)}
function list(){tokenList.innerHTML='';visibleTokens().forEach(t=>{const e=document.createElement('div');e.className='token';e.dataset.id=t.id;const p=tokenWorld(t),f=t.footprint||1;e.innerHTML=`<span>${t.name}<small>${t.locked?'🔒 Locked · ':''}${assignmentLabel(t)}</small></span><small>${t.z} ft · (${p.x*FEET_PER_GRID}, ${p.y*FEET_PER_GRID}) · ${f}×${f} squares</small>`;e.onclick=()=>select(t.id);tokenList.appendChild(e)});refreshAttachmentControls();select(state.selected)}
list();
setupObjectContextMenu();
document.getElementById('token-altitude-slider')?.addEventListener('input',e=>{const t=state.tokens.find(x=>x.id===state.selected);if(!t||!canControlToken(t)||t.locked){updateAltitudeDisplay(t);return}const next=Math.max(0,Math.min(MAX_ALTITUDE,Math.round(Number(e.target.value)/ALTITUDE_STEP)*ALTITUDE_STEP));if(next===t.z)return;recordUndo();changeGroupAltitude('token',t.id,next);e.target.value=String(t.z);altitudeEl.textContent=`Altitude: ${t.z} ft`;updateAltitudeDisplay(t);const p=tokenWorld(t);selectionEl.textContent=`${t.name}${t.locked?' · 🔒 LOCKED':''} · X ${p.x*FEET_PER_GRID} ft · Y ${p.y*FEET_PER_GRID} ft · Z ${t.z} ft · ${t.footprint||1}×${t.footprint||1} squares · ${assignmentLabel(t)}`;saveSceneToBrowser();});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function hit(x,y){let out=null,bd=1e9;const touchPad=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches?14:6;for(const t of visibleTokens()){const s=t._screen;if(s){const d=Math.hypot(x-s.x,y-s.y);if(d<=s.radius+touchPad&&d<bd){bd=d;out=t}}}return out}
function screenToGround(sx,sy){const{w,h}=size();if(state.view2d)return{x:(sx-w/2-state.camera.panX)/(CELL_PX*state.camera.zoom),y:-(sy-h/2-state.camera.panY)/(CELL_PX*state.camera.zoom)};const b=basis(),f=Math.min(w,h)*.86*state.camera.zoom,nx=(sx-w/2)/f,ny=-(sy-h*.56)/f,dir={x:b.f.x+nx*b.r.x+ny*b.u.x,y:b.f.y+nx*b.r.y+ny*b.u.y,z:b.f.z+nx*b.r.z+ny*b.u.z};if(Math.abs(dir.z)<.001)return{x:0,y:0};const tt=-b.pos.z/dir.z;return{x:b.pos.x+dir.x*tt,y:b.pos.y+dir.y*tt}}
function snapCell(v){return Math.floor(v+0.5)}
canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(e.button===2){const rightToken=hit(x,y),rightAsset=rightToken?null:hitAsset(x,y);if(rightToken||rightAsset){state.drag=null;state.movingToken=null;state.movingAsset=null;state.moveStart=null;state.pointers.delete(e.pointerId);return}}if(pendingAttachmentAction&&e.button===0&&state.pointers.size===1){const target=hit(x,y),assetTarget=target?null:hitAsset(x,y),targetKey=target?objectKey('token',target.id):assetTarget?objectKey('asset',assetTarget.id):null;if(targetKey){e.preventDefault();applyPendingAttachment(targetKey);state.pointers.delete(e.pointerId);state.drag=null;state.movingToken=null;state.movingAsset=null;return}}if(state.pointers.size===1&&e.button===2&&isGM()&&state.terrainMode){const g=screenToGround(x,y),cx=snapCell(g.x),cy=snapCell(g.y),key=cx+','+cy;if(state.terrain[key]){recordUndo();delete state.terrain[key];terrainStatusEl.textContent='Erased terrain at ('+cx+', '+cy+').'}else terrainStatusEl.textContent='No terrain tile at ('+cx+', '+cy+').';state.drag=null;state.movingToken=null;state.moveStart=null;state.pointers.delete(e.pointerId);return}if(state.pointers.size===1&&e.button===1){state.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,mode:(state.view2d||state.panMode)?'pan':'rotate'};state.movingToken=null;state.moveStart=null;return}if(state.terrainMode&&isGM()&&e.button===0&&state.pointers.size===1){const g=screenToGround(x,y),cx=snapCell(g.x),cy=snapCell(g.y),key=cx+','+cy,type=terrainTypeEl.value,height=Number(terrainHeightEl.value)||0,direction=document.getElementById('terrain-direction').value,startHeight=type==='ramp'?Math.min(height,Number(document.getElementById('terrain-start-height').value)||0):0;if(type==='erase'){if(state.terrain[key])recordUndo();delete state.terrain[key];terrainStatusEl.textContent='Choose a terrain type to paint; right-click erases while Paint Terrain is On.'}else{recordUndo();state.terrain[key]={type,height,direction,...(type==='ramp'?{startHeight}:{})};terrainStatusEl.textContent=type==='ramp'?'Painted ramp from '+startHeight+' ft to '+height+' ft, high edge '+direction+' at ('+cx+', '+cy+').':'Painted '+type+' at ('+cx+', '+cy+') · '+height+' ft.'}state.pointers.delete(e.pointerId);saveSceneToBrowser();return}if(state.pointers.size===1&&e.button===0&&isGM()&&(e.ctrlKey||e.shiftKey)){state.selectionBox={type:e.ctrlKey?'token':'asset',x,y,x2:x,y2:y};state.drag=null;state.movingToken=null;state.movingAsset=null;state.groupMoveStart=null;return}if(state.pointers.size===1){const t=hit(x,y);if(t&&(canControlToken(t)||(isGM()&&t.locked))){state.selectedAsset=null;state.selectedAssetIds=[];state.selectedTokenIds=[t.id];state.selected=t.id;select(t.id);if(canControlToken(t)){state.movingToken=t;const g=screenToGround(x,y),tw=tokenWorld(t);state.moveOffset={x:tw.x-g.x,y:tw.y-g.y};state.moveStart={x:t.x,y:t.y,z:t.z};state.moveUndoSnapshot=captureUndoSnapshot();state.moveDistance=0;t._dragX=t.x;t._dragY=t.y;state.groupMoveStart=captureGroupPositions('token',t.id)}}else{const a=hitAsset(x,y);if(a&&isGM()){state.selectedAsset=a.id;state.selectedAssetIds=[a.id];state.selectedTokenIds=[];state.selected=null;syncAssetEditor(a);state.movingAsset=a;const g=screenToGround(x,y);state.assetMoveOffset={x:a.x-g.x,y:a.y-g.y};state.groupMoveStart=captureGroupPositions('asset',a.id);state.moveUndoSnapshot=captureUndoSnapshot();state.drag=null;return}state.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,mode:e.button===0?'pan':e.button===2?'rotate':(state.view2d||state.panMode)?'pan':'rotate'}}}else{const p=[...state.pointers.values()];state.pinchDistance=dist(p[0],p[1]);state.lastPinchMid=mid(p[0],p[1]);state.drag=null;state.movingToken=null;state.moveStart=null;state.moveUndoSnapshot=null}},{passive:false});
canvas.addEventListener('pointermove',e=>{if(!state.pointers.has(e.pointerId))return;e.preventDefault();state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(state.selectionBox&&state.pointers.size===1){state.selectionBox.x2=x;state.selectionBox.y2=y;return}if(state.movingAsset&&state.pointers.size===1){const g=screenToGround(x,y),a=state.movingAsset,desiredX=g.x+state.assetMoveOffset.x,desiredY=g.y+state.assetMoveOffset.y,base=state.groupMoveStart?.find(p=>p.key===objectKey('asset',a.id));if(base)applyGroupPositionDelta(state.groupMoveStart,desiredX-base.x,desiredY-base.y);return}if(state.movingToken&&state.pointers.size===1){const g=screenToGround(x,y),t=state.movingToken,f=Math.max(1,t.footprint||1),desiredX=g.x+state.moveOffset.x-(f-1)/2,desiredY=g.y+state.moveOffset.y-(f-1)/2,base=state.groupMoveStart?.find(p=>p.key===objectKey('token',t.id));if(base)applyGroupPositionDelta(state.groupMoveStart,desiredX-base.x,desiredY-base.y);const snappedX=snapCell(desiredX),snappedY=snapCell(desiredY);if(state.moveStart)state.moveDistance=Math.max(Math.abs(snappedX-state.moveStart.x),Math.abs(snappedY-state.moveStart.y))*FEET_PER_GRID;select(t.id);return}if(state.pointers.size>1){const q=[...state.pointers.values()],d=dist(q[0],q[1]),m=mid(q[0],q[1]);if(state.pinchDistance){state.camera.zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,state.camera.zoom*d/state.pinchDistance));if(state.lastPinchMid){if(state.view2d){state.camera.panX+=m.x-state.lastPinchMid.x;state.camera.panY+=m.y-state.lastPinchMid.y}else{state.camera.targetX-=(m.x-state.lastPinchMid.x)/(CELL_PX*state.camera.zoom);state.camera.targetY+=(m.y-state.lastPinchMid.y)/(CELL_PX*state.camera.zoom)}}}state.pinchDistance=d;state.lastPinchMid=m;return}if(!state.drag)return;const dx=e.clientX-state.drag.lastX,dy=e.clientY-state.drag.lastY;if(state.view2d){state.camera.panX+=dx;state.camera.panY+=dy}else if(state.drag.mode==='pan'){const scale=Math.max(1.5,Math.min(8,state.camera.distance/(8*state.camera.zoom)))*1.8, b=basis(), right=b.r, upLen=Math.hypot(b.u.x,b.u.y)||1, upX=b.u.x/upLen, upY=b.u.y/upLen, sx=dx/(CELL_PX*state.camera.zoom)*scale, sy=dy/(CELL_PX*state.camera.zoom)*scale;state.camera.targetX-=right.x*sx;state.camera.targetY-=right.y*sx;state.camera.targetX+=upX*sy;state.camera.targetY+=upY*sy}else{state.camera.yaw+=dx*.012;state.camera.elevation=Math.max(.38,Math.min(.95,state.camera.elevation+dy*.006))}state.drag.lastX=e.clientX;state.drag.lastY=e.clientY});
function end(e){if(state.selectionBox){completeBoxSelection();state.pointers.delete(e.pointerId);if(!state.pointers.size){state.drag=null;state.pinchDistance=null;state.lastPinchMid=null}return}if(state.movingAsset||state.movingToken){const moved=state.groupMoveStart||[];let changed=false;for(const p of moved){const obj=objectFromKey(p.key);if(!obj)continue;if(p.key.startsWith('token:')){const nx=snapCell(obj._dragX??obj.x),ny=snapCell(obj._dragY??obj.y);if(nx!==p.x||ny!==p.y)changed=true;obj.x=nx;obj.y=ny;delete obj._dragX;delete obj._dragY}else{const nx=snapCell(obj.x),ny=snapCell(obj.y);if(nx!==p.x||ny!==p.y)changed=true;obj.x=nx;obj.y=ny}}if(changed&&state.moveUndoSnapshot)recordUndo(state.moveUndoSnapshot);state.groupMoveStart=null;state.moveUndoSnapshot=null;state.movingAsset=null;state.movingToken=null;state.moveStart=null;list()}state.pointers.delete(e.pointerId);if(!state.pointers.size){state.drag=null;state.pinchDistance=null;state.lastPinchMid=null}}canvas.addEventListener('pointerup',e=>{end(e);saveSceneToBrowser()});canvas.addEventListener('pointercancel',end);canvas.addEventListener('wheel',e=>{e.preventDefault();const previousZoom=state.camera.zoom,nextZoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,previousZoom*(e.deltaY>0?.9:1.11)));if(state.view2d&&previousZoom>0){const ratio=nextZoom/previousZoom;state.camera.panX*=ratio;state.camera.panY*=ratio;}state.camera.zoom=nextZoom;saveSceneToBrowser()},{passive:false});
function editorData(){const assignment=tokenAssignmentEl.value;return{name:tokenNameEl.value.trim()||'New Token',glyph:tokenGlyphEl.value.trim().slice(0,2)||'•',color:tokenColorEl.value,footprint:Math.max(1,Math.min(4,Number(tokenFootprintEl.value)||1)),visibility:tokenVisibilityEl?.value==='gm'?'gm':'players',assignment,players:assignment==='specific'?tokenPlayersEl.value.split(',').map(x=>x.trim()).filter(Boolean):[]}}
async function prepareTokenImage(file){if(!file||!/^image\/(png|webp|jpeg)$/.test(file.type))throw new Error('Choose a PNG, WebP, or JPG image.');if(file.size>12*1024*1024)throw new Error('Image is too large. Choose a file under 12 MB.');const source=await createImageBitmap(file);try{const side=1024,scale=Math.min(1,side/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.drawImage(source,0,0,w,h);let data=canvas.toDataURL('image/webp',.9);if(!data.startsWith('data:image/webp'))data=canvas.toDataURL('image/png');if(data.length>900000)throw new Error('The optimized image is still too large. Try a simpler or smaller image.');return data}finally{source.close?.()}}
assetImageFileEl?.addEventListener('change',async()=>{const file=assetImageFileEl.files?.[0];if(!file)return;if(!isGM()){assetStatusEl.textContent='Only the GM can add assets.';assetImageFileEl.value='';return}try{if(!/^image\/(png|webp|jpeg)$/.test(file.type))throw new Error('Choose a PNG, WebP, or JPG image.');if(file.size>12*1024*1024)throw new Error('Choose an image under 12 MB.');const source=await createImageBitmap(file);try{const side=1024,scale=Math.min(1,side/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(source,0,0,w,h);let data=c.toDataURL('image/webp',.9);if(!data.startsWith('data:image/webp'))data=c.toDataURL('image/png');if(data.length>900000)throw new Error('Optimized image exceeds 900 KB. Try a smaller or simpler image.');state.pendingAssetImage=data;assetStatusEl.textContent='Image ready. Set its footprint, rotation, and height, then add it.'}finally{source.close?.()}}catch(err){assetStatusEl.textContent=err.message||'Could not load image.';state.pendingAssetImage=null}finally{assetImageFileEl.value=''}});
assetSwapImageFileEl?.addEventListener('change',async()=>{const file=assetSwapImageFileEl.files?.[0];if(!file)return;if(!isGM()){assetStatusEl.textContent='Only the GM can swap asset images.';assetSwapImageFileEl.value='';return}const a=state.assets.find(item=>item.id===state.selectedAsset);if(!a){assetStatusEl.textContent='Select a placed prop or asset on the battlefield first.';assetSwapImageFileEl.value='';return}try{const data=await prepareTokenImage(file);recordUndo();a.image=data;syncAssetEditor(a);assetStatusEl.textContent='Image swapped for '+(a.name||'asset')+'. Position, size, altitude, rotation, and other settings were preserved.';saveSceneToBrowser()}catch(err){assetStatusEl.textContent=err.message||'Could not read that image.'}finally{assetSwapImageFileEl.value=''}});
tokenImageFileEl?.addEventListener('change',async()=>{const file=tokenImageFileEl.files?.[0],t=state.tokens.find(x=>x.id===state.selected);if(!file)return;if(!isGM()){tokenImageStatusEl.textContent='Only the GM can change token images.';tokenImageFileEl.value='';return}if(!t){tokenImageStatusEl.textContent='Select a token first.';tokenImageFileEl.value='';return}if(t.locked){tokenImageStatusEl.textContent='Unlock this token before changing its image.';tokenImageFileEl.value='';return}try{const data=await prepareTokenImage(file);recordUndo();t.image=data;tokenImageCache.delete(data);tokenImageStatusEl.textContent='Token image swapped. Position, size, altitude, access, and other settings were preserved. Choose another image anytime to swap again.';list();select(t.id);saveSceneToBrowser()}catch(err){tokenImageStatusEl.textContent=err.message||'Could not read that image.'}finally{tokenImageFileEl.value=''}});

document.querySelectorAll('[data-image-slot-action]').forEach(button=>button.addEventListener('click',()=>{
 const kind=button.dataset.imageSlotAction,slot=Number(button.dataset.imageSlot),isToken=kind.startsWith('token-');
 if(!isGM()){(isToken?tokenImageStatusEl:assetStatusEl).textContent='Only the GM can save or use image slots.';return}
 if(isToken){
  const t=state.tokens.find(x=>x.id===state.selected);
  if(!t){tokenImageStatusEl.textContent='Select a token first.';return}
  if(t.locked){tokenImageStatusEl.textContent='Unlock this token before changing its saved images.';return}
  if(kind==='token-save'){
   if(!t.image){tokenImageStatusEl.textContent='Swap in an image first, then save it to a slot.';return}
   recordUndo();t.imageSlots=Array.isArray(t.imageSlots)?t.imageSlots.slice(0,3):[];t.imageSlots[slot]=t.image;tokenImageStatusEl.textContent='Current token image saved to slot '+(slot+1)+'.';saveSceneToBrowser();return;
  }
  const saved=t.imageSlots?.[slot];if(!saved){tokenImageStatusEl.textContent='Token image slot '+(slot+1)+' is empty. Swap in an image and save it to this slot first.';return}
  recordUndo();t.image=saved;tokenImageCache.delete(saved);tokenImageStatusEl.textContent='Switched to saved token image '+(slot+1)+'.';list();select(t.id);saveSceneToBrowser();return;
 }
 const a=state.assets.find(x=>x.id===state.selectedAsset);
 if(!a){assetStatusEl.textContent='Select a placed prop or asset first.';return}
 if(kind==='asset-save'){
  if(!a.image){assetStatusEl.textContent='Swap in an image first, then save it to a slot.';return}
  recordUndo();a.imageSlots=Array.isArray(a.imageSlots)?a.imageSlots.slice(0,3):[];a.imageSlots[slot]=a.image;assetStatusEl.textContent='Current prop/asset image saved to slot '+(slot+1)+'.';saveSceneToBrowser();return;
 }
 const saved=a.imageSlots?.[slot];if(!saved){assetStatusEl.textContent='Prop/asset image slot '+(slot+1)+' is empty. Swap in an image and save it to this slot first.';return}
 recordUndo();a.image=saved;syncAssetEditor(a);assetStatusEl.textContent='Switched to saved prop/asset image '+(slot+1)+'. Position, size, altitude, and other settings were preserved.';saveSceneToBrowser();
}));
document.querySelector('[data-action="token-image-remove"]')?.addEventListener('click',()=>{const t=state.tokens.find(x=>x.id===state.selected);if(!t||!isGM()||t.locked)return;if(!t.image){tokenImageStatusEl.textContent='This token has no custom image.';return}recordUndo();delete t.image;list();select(t.id);saveSceneToBrowser();tokenImageStatusEl.textContent='Custom image removed.'});
const mapFileEl=document.getElementById('map-image-file'),mapWidthEl=document.getElementById('map-width'),mapHeightEl=document.getElementById('map-height'),mapXEl=document.getElementById('map-x'),mapYEl=document.getElementById('map-y'),mapOpacityEl=document.getElementById('map-opacity'),mapStatusEl=document.getElementById('map-status');
mapFileEl?.addEventListener('change',async()=>{const file=mapFileEl.files?.[0];if(!file)return;if(!isGM()){mapStatusEl.textContent='Only the GM can set the battlefield map.';mapFileEl.value='';return}try{if(!/^image\/(png|webp|jpeg)$/.test(file.type))throw new Error('Choose a PNG, WebP, or JPG image.');if(file.size>20*1024*1024)throw new Error('Choose a map image under 20 MB.');const source=await createImageBitmap(file);try{const side=2048,scale=Math.min(1,side/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(source,0,0,w,h);let data=c.toDataURL('image/webp',.86);if(data.length>1800000)data=c.toDataURL('image/jpeg',.78);if(data.length>1800000)throw new Error('Map image is still too large after optimization. Try a smaller image.');recordUndo();state.mapImage=data;mapWidthEl.value=String(state.mapWidth||24);mapHeightEl.value=String(state.mapHeight||24);mapXEl.value=String(state.mapX||0);mapYEl.value=String(state.mapY||0);mapOpacityEl.value=String(Math.round((state.mapOpacity??.78)*100));mapStatusEl.textContent='Map image loaded ('+w+' × '+h+' px). Set its grid dimensions, then click Apply Map Settings.';saveSceneToBrowser()}finally{source.close?.()}}catch(err){mapStatusEl.textContent=err.message||'Could not load map image.'}finally{mapFileEl.value=''}});
document.querySelector('[data-action="map-apply"]')?.addEventListener('click',()=>{if(!isGM())return;recordUndo();state.mapWidth=Math.max(1,Math.min(200,Number(mapWidthEl.value)||24));state.mapHeight=Math.max(1,Math.min(200,Number(mapHeightEl.value)||24));state.mapX=Math.max(-200,Math.min(200,Number(mapXEl.value)||0));state.mapY=Math.max(-200,Math.min(200,Number(mapYEl.value)||0));state.mapOpacity=Math.max(.05,Math.min(1,(Number(mapOpacityEl.value)||78)/100));if(!state.mapImage){mapStatusEl.textContent='Upload a map image first.';return}mapStatusEl.textContent='Map applied: '+state.mapWidth+' × '+state.mapHeight+' squares.';saveSceneToBrowser()});
document.querySelector('[data-action="map-clear"]')?.addEventListener('click',()=>{if(!isGM())return;recordUndo();state.mapImage=null;mapStatusEl.textContent='Map image removed.';saveSceneToBrowser()});
const assetEditControls=[assetNameEl,assetWidthEl,assetDepthEl,assetRotationEl,assetAltitudeEl,assetVisibilityEl,tokenVisibilityEl,document.getElementById('asset-size-mode'),document.getElementById('asset-display-style'),document.getElementById('asset-image-width-px'),document.getElementById('asset-image-height-px')].filter(Boolean);
assetEditControls.forEach(el=>el.addEventListener('change',()=>{if(!state.assets.some(a=>a.id===state.selectedAsset))return;recordUndo();updateSelectedAssetFromEditor()}));
tokenAssignmentEl.onchange=()=>{tokenPlayersEl.hidden=tokenAssignmentEl.value!=='specific'};
const undoHistory=[];
const MAX_UNDO_ACTIONS=20;
function captureUndoSnapshot(){try{return JSON.parse(JSON.stringify(sceneSnapshot()))}catch(e){return null}}
function recordUndo(snapshot=captureUndoSnapshot()){if(!snapshot)return;undoHistory.push(snapshot);if(undoHistory.length>MAX_UNDO_ACTIONS)undoHistory.shift()}
function undoLastAction(){if(!undoHistory.length){if(sceneSaveStatus)sceneSaveStatus.textContent='Nothing to undo.';return}const previous=undoHistory.pop();try{applyScene(previous);saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Undo complete · '+undoHistory.length+' undo action'+(undoHistory.length===1?'':'s')+' remaining.'}catch(e){if(sceneSaveStatus)sceneSaveStatus.textContent='Undo failed: '+(e.message||'could not restore previous state')}}
for(const b of document.querySelectorAll('button'))b.onclick=()=>{const a=b.dataset.action,t=state.tokens.find(x=>x.id===state.selected);if(!isGM()&&['token-add','token-update','token-delete','token-lock'].includes(a))return;if((a==='up'||a==='down')&&t&&!canControlToken(t))return;if(['token-update','token-delete'].includes(a)&&t?.locked)return;if(a==='asset-add'&&isGM()){if(!state.pendingAssetImage){assetStatusEl.textContent='Choose an image file first.';return}recordUndo();const asset={id:'asset-'+Date.now(),name:assetNameEl.value.trim()||'Prop',image:state.pendingAssetImage,x:0,y:0,z:Math.max(0,Math.min(MAX_ALTITUDE,Number(assetAltitudeEl.value)||0)),width:Math.max(1,Math.min(12,Number(assetWidthEl.value)||1)),depth:Math.max(1,Math.min(12,Number(assetDepthEl.value)||1)),sizeMode:document.getElementById('asset-size-mode')?.value||'grid',displayStyle:document.getElementById('asset-display-style')?.value||'standee',visibility:assetVisibilityEl?.value==='gm'?'gm':'players',imageWidthPx:Math.max(16,Math.min(1200,Number(document.getElementById('asset-image-width-px')?.value)||180)),imageHeightPx:Math.max(16,Math.min(1200,Number(document.getElementById('asset-image-height-px')?.value)||180)),rotation:Number(assetRotationEl.value)||0};state.assets.push(asset);state.selectedAsset=asset.id;state.selected=null;syncAssetEditor(asset);refreshAttachmentControls();assetStatusEl.textContent='Asset added at the map origin. Drag it to position it on the grid.';saveSceneToBrowser();return}if(a==='asset-delete'&&isGM()){const i=state.assets.findIndex(x=>x.id===state.selectedAsset);if(i>=0){recordUndo();const removed=state.assets[i];state.assets.splice(i,1);state.attachments=state.attachments.filter(e=>e.a!==objectKey('asset',removed.id)&&e.b!==objectKey('asset',removed.id));state.selectedAsset=null;refreshAttachmentControls();assetStatusEl.textContent='Selected asset removed.';saveSceneToBrowser()}else assetStatusEl.textContent='Select an asset on the battlefield first.';return}if(a==='token-add'){recordUndo();const d=editorData(),n={id:'token-'+Date.now(),name:d.name,x:0,y:0,z:0,glyph:d.glyph,color:d.color,footprint:d.footprint,visibility:d.visibility,assignment:d.assignment,players:d.players};state.tokens.push(n);select(n.id);list();return}if(a==='token-update'&&t&&isGM()){recordUndo();Object.assign(t,editorData());list();select(t.id);return}if(a==='token-delete'&&t&&isGM()){recordUndo();const i=state.tokens.indexOf(t);if(i>=0)state.tokens.splice(i,1);state.attachments=state.attachments.filter(e=>e.a!==objectKey('token',t.id)&&e.b!==objectKey('token',t.id));state.selected=state.tokens[0]?.id||null;list();return}if(a==='token-lock'&&t&&isGM()){recordUndo();t.locked=!t.locked;list();select(t.id);if(sceneSaveStatus)sceneSaveStatus.textContent=t.locked?'Token locked against movement, altitude changes, editing, and deletion.':'Token unlocked.'}if(a==='terrain-toggle'&&isGM()){state.terrainMode=!state.terrainMode;b.textContent=state.terrainMode?'Paint Terrain: On':'Paint Terrain: Off';b.classList.toggle('active',state.terrainMode);terrainStatusEl.textContent=state.terrainMode?'Click grid squares to paint.':'Terrain painting paused.'}if(a==='terrain-ramp'&&isGM()){terrainTypeEl.value='ramp';state.terrainMode=true;document.querySelectorAll('[data-action="terrain-toggle"]').forEach(x=>{x.textContent='Paint Terrain: On';x.classList.add('active')});b.classList.add('active');terrainStatusEl.textContent='Ramp mode selected. Set the lower edge elevation and high edge elevation, then click a grid square.'}if(a==='reset')resetCamera();if(a==='toggle-pan'){state.panMode=!state.panMode;document.querySelectorAll('[data-action="toggle-pan"]').forEach(x=>{x.textContent=state.panMode?'Pan: On':'Pan: Off';x.setAttribute('aria-pressed',String(state.panMode));x.classList.toggle('active',state.panMode)})}if(a==='2d'){state.view2d=!state.view2d;state.camera.panX=0;state.camera.panY=0;if(!state.view2d){state.camera.targetX=0;state.camera.targetY=0}b.textContent='2D / 3D';b.setAttribute('aria-pressed',String(state.view2d));b.title=state.view2d?'Switch to 3D View':'Switch to 2D Fallback'}if(a==='up'&&t&&t.z<MAX_ALTITUDE&&canControlToken(t)&&!t.locked){recordUndo();changeGroupAltitude('token',t.id,Math.min(MAX_ALTITUDE,t.z+ALTITUDE_STEP));updateAltitudeDisplay(t)}if(a==='down'&&t&&t.z>0&&canControlToken(t)&&!t.locked){recordUndo();changeGroupAltitude('token',t.id,Math.max(0,t.z-ALTITUDE_STEP));updateAltitudeDisplay(t)}if(a==='yaw-left')state.camera.yaw-=.28;if(a==='yaw-right')state.camera.yaw+=.28;if(a==='pitch-up')state.camera.elevation=Math.min(.95,state.camera.elevation+.1);if(a==='pitch-down')state.camera.elevation=Math.max(.38,state.camera.elevation-.1);if(a==='end-turn'){advanceCombatClock('turn');return}if(a==='end-round'){advanceCombatClock('round');return}list();saveSceneToBrowser()};

const SCENE_STORAGE_KEY='woa-vtt-scene-v1';
const sceneSaveStatus=document.getElementById('scene-save-status');
const sceneImportFile=document.getElementById('scene-import-file');
function sceneSnapshot(){
  return {format:'wings-of-atreia-vtt-scene',version:1,savedAt:new Date().toISOString(),
    combatTracker:{round:Math.max(1,Number(state.combatRound)||1),turn:Math.max(0,Number(state.combatTurn)||0)},
    terrain:state.terrain,
    map:state.mapImage?{image:state.mapImage,width:Math.max(1,Math.min(200,Number(state.mapWidth)||24)),height:Math.max(1,Math.min(200,Number(state.mapHeight)||24)),x:Number(state.mapX)||0,y:Number(state.mapY)||0,opacity:Math.max(.05,Math.min(1,Number(state.mapOpacity)||.78))}:null,
    attachments:state.attachments.map(e=>({a:String(e.a),b:String(e.b)})),
    assets:state.assets.map(a=>({id:String(a.id),name:String(a.name||'Prop'),image:typeof a.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(a.image)&&a.image.length<=900000?a.image:'',imageSlots:Array.isArray(a.imageSlots)?a.imageSlots.slice(0,3):[],x:Number(a.x)||0,y:Number(a.y)||0,z:Math.max(0,Math.min(MAX_ALTITUDE,Number(a.z)||0)),width:Math.max(1,Math.min(12,Number(a.width)||1)),depth:Math.max(1,Math.min(12,Number(a.depth)||1)),sizeMode:a.sizeMode==='pixel'?'pixel':'grid',displayStyle:a.displayStyle==='flat'?'flat':'standee',visibility:a.visibility==='gm'?'gm':'players',imageWidthPx:Math.max(16,Math.min(1200,Number(a.imageWidthPx)||180)),imageHeightPx:Math.max(16,Math.min(1200,Number(a.imageHeightPx)||180)),rotation:Number(a.rotation)||0})).filter(a=>a.image),
    tokens:state.tokens.map(t=>({id:String(t.id),name:String(t.name||'Token'),visibility:t.visibility==='gm'?'gm':'players',x:Number.isFinite(t._dragX)?t._dragX:Number(t.x)||0,y:Number.isFinite(t._dragY)?t._dragY:Number(t.y)||0,z:Math.max(0,Math.min(MAX_ALTITUDE,Number(t.z)||0)),glyph:String(t.glyph||'•'),color:/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:'#65d6a1',footprint:Math.max(1,Math.min(4,Math.round(Number(t.footprint)||1))),assignment:['gm','specific','all','unassigned'].includes(t.assignment)?t.assignment:'all',players:Array.isArray(t.players)?t.players.map(String):[],...(typeof t.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(t.image)&&t.image.length<=900000?{image:t.image}:{}),...(t.image?{imageZoom:Math.max(1,Math.min(10,Number(t.imageZoom)||1)),imageX:Math.max(-.8,Math.min(.8,Number(t.imageX)||0)),imageY:Math.max(-.8,Math.min(.8,Number(t.imageY)||0))}:{}),imageSlots:Array.isArray(t.imageSlots)?t.imageSlots.slice(0,3):[],locked:!!t.locked,conditions:normalizeTokenConditions(t.conditions)})),
    selected:state.selected,camera:{yaw:state.camera.yaw,elevation:state.camera.elevation,distance:state.camera.distance,zoom:state.camera.zoom,targetX:state.camera.targetX,targetY:state.camera.targetY,targetZ:state.camera.targetZ,panX:state.camera.panX,panY:state.camera.panY},
    view2d:state.view2d,panMode:state.panMode,identity:{role:sessionRoleEl.value,playerName:sessionPlayerNameEl.value}
  };
}
function validateScene(data){
  if(!data||data.format!=='wings-of-atreia-vtt-scene'||data.version!==1||!Array.isArray(data.tokens)||data.tokens.length>500)throw new Error('This is not a supported Wings of Atreia scene file.');
  const ids=new Set();
  const tokens=data.tokens.map((t,i)=>{
    if(!t||typeof t!=='object')throw new Error('Scene contains an invalid token.');
    const id=String(t.id||'token-'+i);if(ids.has(id))throw new Error('Scene contains duplicate token IDs.');ids.add(id);
    const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
    const assignment=['gm','specific','all','unassigned'].includes(t.assignment)?t.assignment:'all';
    const visibility=t.visibility==='gm'?'gm':'players';
    return{id,name:String(t.name||'Token').slice(0,120),imageSlots:Array.isArray(t.imageSlots)?t.imageSlots.slice(0,3).filter(v=>typeof v==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(v)&&v.length<=900000):[],x:num(t.x),y:num(t.y),z:Math.max(0,Math.min(MAX_ALTITUDE,num(t.z))),glyph:String(t.glyph||'•').slice(0,2),color:/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:'#65d6a1',footprint:Math.max(1,Math.min(4,Math.round(num(t.footprint,1)))),visibility,assignment,players:Array.isArray(t.players)?t.players.map(p=>String(p).slice(0,80)).slice(0,50):[],...(typeof t.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(t.image)&&t.image.length<=900000?{image:t.image}:{}),...(typeof t.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(t.image)?{imageZoom:Math.max(1,Math.min(10,num(t.imageZoom,1))),imageX:Math.max(-.8,Math.min(.8,num(t.imageX,0))),imageY:Math.max(-.8,Math.min(.8,num(t.imageY,0)))}:{}),locked:!!t.locked,conditions:normalizeTokenConditions(t.conditions)};
  });
  const c=data.camera&&typeof data.camera==='object'?data.camera:{};
  const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
  const camera={yaw:num(c.yaw,-.65),elevation:Math.max(.38,Math.min(.95,num(c.elevation,.68))),distance:Math.max(5,Math.min(500,num(c.distance,60))),zoom:Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,num(c.zoom,1))),targetX:num(c.targetX,0),targetY:num(c.targetY,0),targetZ:num(c.targetZ,0),panX:num(c.panX,0),panY:num(c.panY,0)};
  const terrain={};if(data.terrain&&typeof data.terrain==='object')Object.entries(data.terrain).slice(0,5000).forEach(([key,t])=>{if(!/^-?\d+,-?\d+$/.test(key)||!t)return;const type=['ground','hill','mountain','cliff','canopy','platform','ramp'].includes(t.type)?t.type:'hill',direction=['north','south','east','west'].includes(t.direction)?t.direction:'north',height=Math.max(0,Math.min(120,Math.round((Number(t.height)||0)/5)*5));if(height)terrain[key]={type,height,direction,...(type==='ramp'?{startHeight:Math.max(0,Math.min(height,Math.round((Number(t.startHeight)||0)/5)*5))}:{})}});
  const assets=Array.isArray(data.assets)?data.assets.slice(0,300).filter(a=>a&&typeof a.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(a.image)&&a.image.length<=900000).map((a,i)=>({id:String(a.id||'asset-'+i),name:String(a.name||'Prop').slice(0,120),image:a.image,imageSlots:Array.isArray(a.imageSlots)?a.imageSlots.slice(0,3).filter(v=>typeof v==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(v)&&v.length<=900000):[],x:num(a.x),y:num(a.y),z:Math.max(0,Math.min(MAX_ALTITUDE,num(a.z))),width:Math.max(1,Math.min(12,num(a.width,1))),depth:Math.max(1,Math.min(12,num(a.depth,1))),sizeMode:a.sizeMode==='pixel'?'pixel':'grid',displayStyle:a.displayStyle==='flat'?'flat':'standee',visibility:a.visibility==='gm'?'gm':'players',imageWidthPx:Math.max(16,Math.min(1200,num(a.imageWidthPx,180))),imageHeightPx:Math.max(16,Math.min(1200,num(a.imageHeightPx,180))),rotation:num(a.rotation)})):[];
  const map=data.map&&typeof data.map==='object'&&typeof data.map.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(data.map.image)&&data.map.image.length<=1800000?{image:data.map.image,width:Math.max(1,Math.min(200,num(data.map.width,24))),height:Math.max(1,Math.min(200,num(data.map.height,24))),x:num(data.map.x),y:num(data.map.y),opacity:Math.max(.05,Math.min(1,num(data.map.opacity,.78)))}:null;
  const validKeys=new Set([...tokens.map(t=>objectKey('token',t.id)),...assets.map(a=>objectKey('asset',a.id))]);const edgeSet=new Set();const attachments=Array.isArray(data.attachments)?data.attachments.slice(0,1000).filter(e=>e&&validKeys.has(e.a)&&validKeys.has(e.b)&&e.a!==e.b).filter(e=>{const k=[e.a,e.b].sort().join('|');if(edgeSet.has(k))return false;edgeSet.add(k);return true}).map(e=>({a:e.a,b:e.b})):[];
  return{tokens,terrain,assets,attachments,map,camera,combatTracker:data.combatTracker&&typeof data.combatTracker==='object'?{round:Math.max(1,Math.min(99999,Math.floor(num(data.combatTracker.round,1)))),turn:Math.max(0,Math.min(999999,Math.floor(num(data.combatTracker.turn,0))))}:{round:1,turn:0},selected:tokens.some(t=>t.id===data.selected)?data.selected:(tokens[0]?.id||null),view2d:!!data.view2d,panMode:!!data.panMode,identity:data.identity&&typeof data.identity==='object'?data.identity:{}};
}
function applyScene(data){
  const scene=validateScene(data);
  state.tokens=scene.tokens;state.combatRound=scene.combatTracker.round;state.combatTurn=scene.combatTracker.turn;updateTurnCounter();state.attachments=scene.attachments||[];state.terrain=scene.terrain;state.mapImage=scene.map?.image||null;state.mapWidth=scene.map?.width||24;state.mapHeight=scene.map?.height||24;state.mapX=scene.map?.x||0;state.mapY=scene.map?.y||0;state.mapOpacity=scene.map?.opacity??.78;state.assets=scene.assets||[];state.selectedAsset=null;state.movingAsset=null;state.camera=scene.camera;state.selected=scene.selected;state.view2d=scene.view2d;state.panMode=scene.panMode;
  state.drag=null;state.pointers.clear();state.pinchDistance=null;state.lastPinchMid=null;state.movingToken=null;state.moveStart=null;state.moveDistance=0;
  if(scene.identity.role==='player'||scene.identity.role==='gm')sessionRoleEl.value=scene.identity.role;
  if(typeof scene.identity.playerName==='string')sessionPlayerNameEl.value=scene.identity.playerName;
  document.querySelectorAll('[data-action="toggle-pan"]').forEach(b=>{b.textContent=state.panMode?'Pan: On':'Pan: Off';b.setAttribute('aria-pressed',String(state.panMode));b.classList.toggle('active',state.panMode)});
  document.querySelectorAll('[data-action="2d"]').forEach(b=>{b.textContent='2D / 3D';b.setAttribute('aria-pressed',String(state.view2d));b.title=state.view2d?'Switch to 3D View':'Switch to 2D Fallback'});
  updateIdentityUI();resize();list();refreshAttachmentControls();if(state.selected)select(state.selected);
}
function saveSceneToBrowser(){
  try{localStorage.setItem(SCENE_STORAGE_KEY,JSON.stringify(sceneSnapshot()));sceneSaveStatus.textContent='Scene saved in this browser on this device.'}
  catch(e){sceneSaveStatus.textContent='Could not save locally. Browser storage may be unavailable or full.'}
}
function restoreSceneOnStartup(){try{const raw=localStorage.getItem(SCENE_STORAGE_KEY);if(!raw)return;applyScene(JSON.parse(raw));sceneSaveStatus.textContent='Restored your last scene from this browser.'}catch(e){sceneSaveStatus.textContent='Saved scene could not be restored: '+(e.message||'invalid scene data')}}
document.querySelector('[data-action="save-scene"]').onclick=saveSceneToBrowser;
document.querySelector('[data-action="load-scene"]').onclick=()=>{
  try{const raw=localStorage.getItem(SCENE_STORAGE_KEY);if(!raw){sceneSaveStatus.textContent='No saved scene found in this browser yet.';return}recordUndo();applyScene(JSON.parse(raw));sceneSaveStatus.textContent='Saved scene loaded.'}
  catch(e){sceneSaveStatus.textContent='Could not load the saved scene: '+(e.message||'invalid scene data')}
};
document.querySelector('[data-action="export-scene"]').onclick=()=>{
  try{const blob=new Blob([JSON.stringify(sceneSnapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wings-of-atreia-scene.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);sceneSaveStatus.textContent='Scene JSON export started.'}
  catch(e){sceneSaveStatus.textContent='Could not export the scene.'}
};
document.querySelector('[data-action="import-scene"]').onclick=()=>sceneImportFile.click();
sceneImportFile.addEventListener('change',async()=>{
  const file=sceneImportFile.files?.[0];if(!file)return;
  try{if(file.size>25_000_000)throw new Error('Scene file is too large (maximum 25 MB).');const data=JSON.parse(await file.text());recordUndo();applyScene(data);saveSceneToBrowser();sceneSaveStatus.textContent='Scene imported and saved in this browser.'}
  catch(e){sceneSaveStatus.textContent='Import failed: '+(e.message||'could not read scene file')}
  finally{sceneImportFile.value=''}
});

let vttClipboard=null;
function selectedClipboardObject(){
 const token=state.tokens.find(t=>t.id===state.selected);
 if(token&&canControlToken(token))return{type:'token',data:JSON.parse(JSON.stringify(token))};
 const asset=state.assets.find(a=>a.id===state.selectedAsset);
 if(asset&&isGM())return{type:'asset',data:JSON.parse(JSON.stringify(asset))};
 return null;
}
function pasteClipboardObject(){
 if(!vttClipboard)return;
 if(vttClipboard.type==='asset'&&!isGM())return;
 const rect=canvas.getBoundingClientRect(),ground=screenToGround(rect.width/2,rect.height/2),x=snapCell(ground.x),y=snapCell(ground.y);
 recordUndo();
 const copy=JSON.parse(JSON.stringify(vttClipboard.data));
 copy.id=(vttClipboard.type==='token'?'token-copy-':'asset-copy-')+Date.now()+'-'+Math.floor(Math.random()*100000);
 copy.name=String(copy.name|| (vttClipboard.type==='token'?'Token':'Prop')).slice(0,108)+' (Copy)';
 copy.x=x;copy.y=y;
 delete copy._screen;delete copy._dragX;delete copy._dragY;
 if(vttClipboard.type==='token'){
  if(!isGM()&&copy.assignment==='gm')copy.assignment='specific';
  state.tokens.push(copy);state.selectedAsset=null;select(copy.id);list();
 }else{
  state.assets.push(copy);state.selectedAsset=copy.id;state.selected=null;syncAssetEditor(copy);refreshAttachmentControls();
 }
 saveSceneToBrowser();
}
document.addEventListener('keydown',e=>{
 const mod=e.ctrlKey||e.metaKey;if(!mod||e.altKey)return;
 const key=e.key.toLowerCase(),target=e.target,typing=target&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable);
 if(key==='z'&&!e.shiftKey){if(!isGM()||typing)return;e.preventDefault();undoLastAction();return}
 if(key==='s'){if(typing||!isGM())return;e.preventDefault();saveSceneToBrowser();return}
 if(key==='l'){if(typing||!isGM())return;e.preventDefault();const raw=localStorage.getItem(SCENE_STORAGE_KEY);if(!raw){if(sceneSaveStatus)sceneSaveStatus.textContent='No saved scene found in this browser yet.';return}try{recordUndo();applyScene(JSON.parse(raw));sceneSaveStatus.textContent='Saved scene loaded.'}catch(err){sceneSaveStatus.textContent='Could not load the saved scene: '+(err.message||'invalid scene data')}return}
 if(typing)return;
 if(key==='c'){const selected=selectedClipboardObject();if(!selected)return;e.preventDefault();vttClipboard=selected;if(sceneSaveStatus)sceneSaveStatus.textContent='Copied '+(selected.data.name||'object')+' to the VTT clipboard.';return}
 if(key==='x'){if(!isGM())return;const selected=selectedClipboardObject();if(!selected)return;e.preventDefault();vttClipboard=selected;recordUndo();if(selected.type==='token'){state.tokens=state.tokens.filter(t=>t.id!==selected.data.id);state.attachments=state.attachments.filter(edge=>edge.a!==objectKey('token',selected.data.id)&&edge.b!==objectKey('token',selected.data.id));state.selected=state.tokens[0]?.id||null;select(state.selected);list()}else{state.assets=state.assets.filter(a=>a.id!==selected.data.id);state.attachments=state.attachments.filter(edge=>edge.a!==objectKey('asset',selected.data.id)&&edge.b!==objectKey('asset',selected.data.id));state.selectedAsset=null;refreshAttachmentControls()}saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Cut '+(selected.data.name||'object')+'.';return}
 if(key==='v'){if(!vttClipboard)return;e.preventDefault();pasteClipboardObject()}
});
// Ctrl+Shift+L is provided as a reliable alternative because browsers reserve Ctrl+L for the address bar.
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='l'&&!e.altKey){if(e.target&&(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable))return;if(!isGM())return;e.preventDefault();const raw=localStorage.getItem(SCENE_STORAGE_KEY);if(!raw){if(sceneSaveStatus)sceneSaveStatus.textContent='No saved scene found in this browser yet.';return}try{recordUndo();applyScene(JSON.parse(raw));sceneSaveStatus.textContent='Saved scene loaded.'}catch(err){sceneSaveStatus.textContent='Could not load the saved scene: '+(err.message||'invalid scene data')}}});

// Restore the most recent local scene only after all scene controls are registered.
restoreSceneOnStartup();
