/* Wings of Atreia VTT — Tactical Overlay layer
 * Separate map objects: auras, line/cone/circle/cube areas, and directional arrows.
 * Uses the existing canvas projection and grid scale; no token/asset records are modified.
 */
(() => {
  if (!window.localStorage) return;
  const KEY = "woa-vtt-tactical-overlays-v1";
  const tools = [
    ["select","Select / Move"],["aura","Token Aura"],["line","Line"],["cone","Cone"],
    ["circle","Circle / Radius"],["cube","Cube"],["arrow","Direction Arrow"]
  ];
  const ui = document.createElement("section");
  ui.className = "tactical-overlay-panel";
  ui.innerHTML = `
    <div class="eyebrow">TACTICAL OVERLAYS · GM</div>
    <div class="overlay-tool-grid">${tools.map(([v,l])=>`<button type="button" data-overlay-tool="${v}" aria-pressed="${v==="select"?"true":"false"}">${l}</button>`).join("")}</div>
    <div class="overlay-form-grid">
      <label>Range (ft)<input id="overlay-range" type="number" min="5" max="300" step="5" value="30"></label>
      <label>Width (ft)<input id="overlay-width" type="number" min="5" max="100" step="5" value="10"></label>
      <label>Cone angle<select id="overlay-angle"><option value="30">30°</option><option value="45">45°</option><option value="60" selected>60°</option><option value="90">90°</option><option value="120">120°</option></select></label>
      <label>Color<input id="overlay-color" type="color" value="#55c8ff"></label>
      <label>Opacity <span id="overlay-opacity-value">28%</span><input id="overlay-opacity" type="range" min="8" max="75" value="28"></label>
      <label class="overlay-check"><input id="overlay-snap" type="checkbox" checked> Snap to 5-ft grid</label>
      <label class="overlay-check"><input id="overlay-attach" type="checkbox"> Attach aura to selected token</label>
    </div>
    <div class="editor-row"><button type="button" id="overlay-delete">Delete Selected</button><button type="button" id="overlay-clear">Clear Overlays</button></div>
    <p id="overlay-status" class="note">Choose a tool, then drag on the map. Auras can follow the selected token. Overlays are saved locally in this browser.</p>
  `;
  const style = document.createElement("style");
  style.textContent = `
    .tactical-overlay-panel{display:grid;gap:9px;padding:12px;border:1px solid #3a526d;border-radius:10px;background:linear-gradient(145deg,rgba(16,31,49,.98),rgba(12,19,33,.98))}
    .overlay-tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .overlay-tool-grid button{font-size:.72rem;padding:8px 6px}
    .overlay-tool-grid button[aria-pressed="true"]{border-color:#8fd3ff;background:#21415a;box-shadow:inset 0 0 0 1px #8fd3ff}
    .overlay-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .overlay-form-grid label{display:grid;gap:4px;font-size:.7rem;color:#9aa8bd}
    .overlay-form-grid input:not([type=checkbox]):not([type=range]),.overlay-form-grid select{width:100%;min-width:0;padding:7px;border:1px solid #263247;border-radius:7px;background:#0d1626;color:#eef3ff}
    .overlay-form-grid input[type=color]{height:34px;padding:2px}
    .overlay-form-grid input[type=range]{width:100%;accent-color:#8fd3ff}
    .overlay-form-grid .overlay-check{display:flex;align-items:center;gap:6px}
    .overlay-form-grid .overlay-check input{accent-color:#8fd3ff}
    .tactical-overlay-panel .note{margin:0;line-height:1.4}
    @media(max-width:700px){.overlay-tool-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
  const panel = document.querySelector(".panel");
  const mapSection = [...(panel?.querySelectorAll("section") || [])].find(s => s.textContent.includes("BATTLEFIELD MAP"));
  if (mapSection) panel.insertBefore(ui, mapSection);
  else panel?.appendChild(ui);
  const $ = id => ui.querySelector("#"+id);
  const status = $("overlay-status");
  const shapes = [];
  try { const saved = JSON.parse(localStorage.getItem(KEY)||"[]"); if (Array.isArray(saved)) shapes.push(...saved.filter(s=>s&&typeof s==="object")); } catch {}
  let tool = "select", selected = null, drawing = null, dragging = null, currentOpacity = opacityFallback();
  function opacityFallback(){return 0.28;}
  const active = () => (typeof state !== "undefined" && state);
  const gm = () => !active() || !sessionRoleEl || sessionRoleEl.value === "gm";
  const clamp = (v,min,max) => Math.max(min,Math.min(max,Number(v)||min));
  const range = () => clamp($("overlay-range").value,5,300)/FEET_PER_GRID;
  const width = () => clamp($("overlay-width").value,5,100)/FEET_PER_GRID;
  const opacity = () => clamp($("overlay-opacity").value,8,75)/100;
  const snap = p => $("overlay-snap").checked ? {x:Math.round(p.x),y:Math.round(p.y)} : p;
  function save(){try{localStorage.setItem(KEY,JSON.stringify(shapes));}catch{status.textContent="Overlay storage is full; export your scene and remove unused overlays."}}
  function worldAt(clientX,clientY){
    const r=canvas.getBoundingClientRect(),sx=clientX-r.left,sy=clientY-r.top,{w,h}=size();
    if(state.view2d)return {x:(sx-w/2-state.camera.panX)/(CELL_PX*state.camera.zoom),y:-(sy-h/2-state.camera.panY)/(CELL_PX*state.camera.zoom)};
    const b=basis(),focal=Math.min(w,h)*.86*state.camera.zoom,cx=(sx-w/2)/focal,cy=(h*.56-sy)/focal;
    const den=b.f.z+cx*b.r.z+cy*b.u.z;
    if(Math.abs(den)<1e-5)return{x:0,y:0};
    const d=-b.pos.z/den;
    return {x:b.pos.x+d*(b.f.x+cx*b.r.x+cy*b.u.x),y:b.pos.y+d*(b.f.y+cx*b.r.y+cy*b.u.y)};
  }
  function tokenCenter(id){
    const t=state.tokens.find(t=>t.id===id);if(!t)return null;
    const p=tokenWorld(t);return{x:p.x,y:p.y};
  }
  function origin(s){if(s.kind==="aura"&&s.tokenId){const p=tokenCenter(s.tokenId);if(p)return p;}return{x:s.x,y:s.y};}
  function path(points,fill,stroke,color,lineWidth=2){
    if(points.length<2)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
    if(fill){ctx.closePath();ctx.globalAlpha=currentOpacity;ctx.fillStyle=color;ctx.fill();ctx.globalAlpha=1;}
    if(stroke){ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();}
  }
  function worldCircle(x,y,r,steps=48){const a=[];for(let i=0;i<=steps;i++){const q=i/steps*Math.PI*2;a.push(project(x+Math.cos(q)*r,y+Math.sin(q)*r,terrainHeightAt(x,y)));}return a;}
  function screenGeometry(s){
    const o=origin(s);if(!o)return {polygon:[],segments:[]};
    const r=Math.max(1,Number(s.range)||6),w=Math.max(1,Number(s.width)||2);
    const end={x:Number(s.endX??o.x+r),y:Number(s.endY??o.y)},dx=end.x-o.x,dy=end.y,len=Math.hypot(dx,dy)||r,ang=Math.atan2(dy,dx);
    const P=(x,y)=>project(x,y,terrainHeightAt(x,y));
    let polygon=[],segments=[];
    if(s.kind==="aura"||s.kind==="circle"){
      polygon=worldCircle(o.x,o.y,r,64);
    }else if(s.kind==="line"){
      const half=w/2,px=-Math.sin(ang)*half,py=Math.cos(ang)*half;
      polygon=[[o.x+px,o.y+py],[o.x-px,o.y-py],[o.x+dx-px,o.y+dy-py],[o.x+dx+px,o.y+dy+py]].map(([x,y])=>P(x,y));
    }else if(s.kind==="cone"){
      const a=(Number(s.angle)||60)*Math.PI/180;polygon=[P(o.x,o.y)];
      for(let i=0;i<=32;i++){const q=ang-a/2+i*a/32;polygon.push(P(o.x+Math.cos(q)*r,o.y+Math.sin(q)*r));}
    }else if(s.kind==="cube"){
      const half=r/2,cs=Math.cos(ang),sn=Math.sin(ang);
      polygon=[[-half,-half],[half,-half],[half,half],[-half,half]].map(([x,y])=>P(o.x+x*cs-y*sn,o.y+x*sn+y*cs));
    }else if(s.kind==="arrow"){
      const a=P(o.x,o.y),b=P(end.x,end.y);
      segments=[[a,b]];
      const head=Math.max(10,Math.min(22,Math.hypot(b.x-a.x,b.y-a.y)*.18)),theta=Math.atan2(b.y-a.y,b.x-a.x);
      segments.push([b,{x:b.x-head*Math.cos(theta-.48),y:b.y-head*Math.sin(theta-.48)}]);
      segments.push([b,{x:b.x-head*Math.cos(theta+.48),y:b.y-head*Math.sin(theta+.48)}]);
    }
    if(polygon.length)segments=polygon.map((p,i)=>[p,polygon[(i+1)%polygon.length]]);
    return {polygon,segments};
  }
  function pointInPolygon(p,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y||1e-9)+a.x))inside=!inside;
    }
    return inside;
  }
  function distanceToSegment(p,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
    return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
  }
  function hitTestShape(s,p){
    const g=screenGeometry(s);
    if(g.polygon.length>=3&&pointInPolygon(p,g.polygon))return true;
    return g.segments.some(([a,b])=>distanceToSegment(p,a,b)<=12);
  }
  function drawShape(s){
    const o=origin(s);if(!o)return;
    const color=s.color||"#55c8ff",r=Math.max(1,Number(s.range)||6),w=Math.max(1,Number(s.width)||2);
    const end={x:Number(s.endX??o.x+r),y:Number(s.endY??o.y)},dx=end.x-o.x,dy=end.y,len=Math.hypot(dx,dy)||r,ang=Math.atan2(dy,dx);
    const P=(x,y)=>project(x,y,terrainHeightAt(x,y));
    if(s.kind==="aura"||s.kind==="circle"){
      path(worldCircle(o.x,o.y,r),true,true,color);
    }else if(s.kind==="line"){
      const half=w/2,px=-Math.sin(ang)*half,py=Math.cos(ang)*half;
      path([[o.x+px,o.y+py],[o.x-px,o.y-py],[o.x+dx-px,o.y+dy-py],[o.x+dx+px,o.y+dy+py]].map(([x,y])=>P(x,y)),true,true,color);
    }else if(s.kind==="cone"){
      const a=Number(s.angle)||60,pts=[P(o.x,o.y)];
      for(let i=0;i<=24;i++){const q=ang-a*Math.PI/360+i*(a*Math.PI/180)/24;pts.push(P(o.x+Math.cos(q)*r,o.y+Math.sin(q)*r));}
      path(pts,true,true,color);
    }else if(s.kind==="cube"){
      const half=r/2,cs=Math.cos(ang),sn=Math.sin(ang);
      const corners=[[-half,-half],[half,-half],[half,half],[-half,half]].map(([x,y])=>P(o.x+x*cs-y*sn,o.y+x*sn+y*cs));
      path([...corners,corners[0]],true,true,color);
    }else if(s.kind==="arrow"){
      const a=P(o.x,o.y),b=P(end.x,end.y),head=Math.max(10,Math.min(22,Math.hypot(b.x-a.x,b.y-a.y)*.18)),theta=Math.atan2(b.y-a.y,b.x-a.x);
      path([a,b],false,true,color,3);path([b,{x:b.x-head*Math.cos(theta-.48),y:b.y-head*Math.sin(theta-.48)},{x:b.x-head*Math.cos(theta+.48),y:b.y-head*Math.sin(theta+.48)}],false,true,color,3);
    }
    if(s.id===selected){const p=P(o.x,o.y);ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();}
  }
  function render(){if(!ctx||!active())return;ctx.save();for(const s of shapes){try{drawShape(s)}catch{}}if(drawing){try{drawShape(drawing)}catch{}}ctx.restore();requestAnimationFrame(render);}
  function choose(t){tool=t;ui.querySelectorAll("[data-overlay-tool]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.overlayTool===tool)));status.textContent=t==="select"?"Select an overlay to move it, then drag.":t==="aura"?"Choose or select a token, then click the map to place its aura.":"Drag on the map to set the shape's direction and size.";}
  ui.querySelectorAll("[data-overlay-tool]").forEach(b=>b.addEventListener("click",()=>choose(b.dataset.overlayTool)));
  $("overlay-opacity").addEventListener("input",()=>{$("overlay-opacity-value").textContent=$("overlay-opacity").value+"%";const s=shapes.find(s=>s.id===selected);if(s){s.opacity=opacity();save();}});
  $("overlay-delete").addEventListener("click",()=>{const i=shapes.findIndex(s=>s.id===selected);if(i>=0){shapes.splice(i,1);selected=null;save();}});
  $("overlay-clear").addEventListener("click",()=>{if(!gm())return;if(confirm("Delete every tactical overlay?")){shapes.length=0;selected=null;save();}});
  canvas.addEventListener("pointerdown",e=>{
    if(!gm())return;
    if(tool==="select"){
      const rect=canvas.getBoundingClientRect(),p={x:e.clientX-rect.left,y:e.clientY-rect.top};
      let best=null;
      // Test in reverse paint order so the visually topmost overlay is selected first.
      for(let i=shapes.length-1;i>=0;i--){if(hitTestShape(shapes[i],p)){best=shapes[i];break;}}
      selected=best?.id||null;
      if(best){
        e.preventDefault();e.stopImmediatePropagation();
        if(!(best.kind==="aura"&&best.tokenId)){dragging={id:best.id};canvas.setPointerCapture?.(e.pointerId);}
        status.textContent=best.kind==="aura"&&best.tokenId
          ?"Aura selected. It follows its attached token."
          :"Overlay selected. Click anywhere inside its shape or on its outline; drag to reposition.";
      }
      return;
    }
    e.preventDefault();e.stopImmediatePropagation();
    const p=snap(worldAt(e.clientX,e.clientY)),token=state.tokens.find(t=>t.id===state.selected);
    if(tool==="aura"){
      const s={id:crypto.randomUUID?.()||String(Date.now()+Math.random()),kind:"aura",x:p.x,y:p.y,range:range(),width:width(),color:$("overlay-color").value,opacity:opacity(),tokenId:$("overlay-attach").checked&&token?token.id:null};
      shapes.push(s);selected=s.id;save();return;
    }
    drawing={id:"preview",kind:tool,x:p.x,y:p.y,endX:p.x,endY:p.y,range:range(),width:width(),angle:Number($("overlay-angle").value),color:$("overlay-color").value,opacity:opacity()};
    canvas.setPointerCapture?.(e.pointerId);
  },true);
  canvas.addEventListener("pointermove",e=>{
    if(dragging){e.preventDefault();e.stopImmediatePropagation();const s=shapes.find(s=>s.id===dragging.id);if(s){const p=snap(worldAt(e.clientX,e.clientY));s.x=p.x;s.y=p.y;}return;}
    if(!drawing)return;e.preventDefault();e.stopImmediatePropagation();
    const p=snap(worldAt(e.clientX,e.clientY));drawing.endX=p.x;drawing.endY=p.y;
    const d=Math.hypot(p.x-drawing.x,p.y-drawing.y);
    if(d>.1)drawing.range=d;
  },true);
  canvas.addEventListener("pointerup",e=>{
    if(dragging){e.preventDefault();e.stopImmediatePropagation();dragging=null;save();return;}
    if(!drawing)return;e.preventDefault();e.stopImmediatePropagation();
    drawing.id=crypto.randomUUID?.()||String(Date.now()+Math.random());
    if(["line","arrow","cone"].includes(drawing.kind)&&Math.hypot(drawing.endX-drawing.x,drawing.endY-drawing.y)<.1)drawing.endX=drawing.x+drawing.range;
    if(drawing.kind==="circle"||drawing.kind==="cube")drawing.range=Math.max(1,Math.hypot(drawing.endX-drawing.x,drawing.endY-drawing.y));
    shapes.push(drawing);selected=drawing.id;drawing=null;save();choose("select");
  },true);
  canvas.addEventListener("pointercancel",()=>{drawing=null;dragging=null;},true);
  $("overlay-range").addEventListener("change",()=>{const s=shapes.find(s=>s.id===selected);if(s){s.range=range();save();}});
  $("overlay-width").addEventListener("change",()=>{const s=shapes.find(s=>s.id===selected);if(s){s.width=width();save();}});
  // Keep the overlay renderer on top of the existing canvas scene.
  requestAnimationFrame(render);
})();
