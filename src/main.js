import * as THREE from 'three';
import './style.css';
import { MAP_SIZE, RULES, capacity, population, canPlace, enqueue } from './game.js';
const canvas = document.querySelector('#world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#91a99a');
scene.fog = new THREE.Fog('#91a99a', 650, 1600);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 1, 4000);
const focus = new THREE.Vector3(0, 0, 0);
let zoom = 180;
scene.add(new THREE.HemisphereLight(0xdaf0ec, 0x545c38, 2.5));
const sun = new THREE.DirectionalLight(0xffefd5, 3);
sun.position.set(150, 250, 100); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -250, right: 250, top: 250, bottom: -250, far: 700 });
scene.add(sun); scene.add(sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), new THREE.MeshStandardMaterial({ color: 0x77875c, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(MAP_SIZE, 100, 0x657b53, 0x657b53); grid.position.y = .05; grid.material.transparent = true; grid.material.opacity = .22; scene.add(grid);
function box(group, w, h, d, color, x=0, y=h/2, z=0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({ color, roughness: .8 }));
  mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function model(type) {
  const g = new THREE.Group();
  if (type === 'soldier') {
    box(g,1.4,2.5,1,0x344c35,0,2.4); box(g,1.2,1.1,1.2,0xa6b98b,0,4.1);
    box(g,.45,1.4,.5,0x242f28,-.4,.7); box(g,.45,1.4,.5,0x242f28,.4,.7);
    box(g,.35,.35,2.2,0x182322,.8,2.6,-.7);
  } else if (type === 'tank') {
    box(g,5,1.8,7,0x667d4b,0,1.5); box(g,1.2,1.5,7.5,0x202c25,-2.6,.9); box(g,1.2,1.5,7.5,0x202c25,2.6,.9);
    box(g,3.3,1.6,3.5,0x96ad6c,0,3); box(g,.6,.6,6,0x344938,0,3,-3.7);
  } else {
    const hq = type === 'hq', factory = type === 'factory';
    const w = hq ? 26 : factory ? 28 : 18, d = hq ? 24 : factory ? 25 : 14;
    box(g,w+3,1,d+3,0x5b6151); box(g,w,hq?13:8,d,0xb7bba5,0,hq?7:4.5);
    box(g,w+1,1.8,d+1,0x405847,0,hq?14:9);
    box(g,w*.6,.7,1,0xbde979,0,hq?10:6,-d/2-.1);
    box(g,factory?13:4,factory?6:5,1,0x243d32,0,factory?3.5:3,-d/2-.5);
    if(hq){box(g,10,5,10,0x7f9470,0,17);box(g,.5,13,.5,0xd7dfc8,8,20,4);box(g,5,3,.2,0xbde979,10.5,24,4);}
    if(factory){box(g,3,15,3,0x586252,10,8,7);}
    if(type==='barracks'){for(let i=-1;i<=1;i++)box(g,3,2,.5,0x4b7063,i*5,5,7.4);}
  }
  return g;
}
let seed = 42;
function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
// Instanced scenery keeps the enormous map inexpensive to render.
const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.8,1,7,5),new THREE.MeshStandardMaterial({color:0x5d5540}),1000);
const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(5,15,6),new THREE.MeshStandardMaterial({color:0x405e43}),1000);
const dummy = new THREE.Object3D();
for(let i=0;i<1000;i++) { let x,z; do{x=(random()-.5)*1950;z=(random()-.5)*1950;}while(Math.hypot(x,z)<140); dummy.position.set(x,3.5,z);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=12;dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix); }
scene.add(trunks,crowns);
const state = { money: 3000, units: [], buildings: [] };
let selected = [], placing = null, ghost = null, pointerGround = null;
function ring(radius) {
  const m = new THREE.Mesh(new THREE.RingGeometry(radius,radius+.35,48),new THREE.MeshBasicMaterial({color:0xd1ff87,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.y=.2;m.visible=false;return m;
}
function addBuilding(type,x,z) {
  const group=model(type);group.position.set(x,0,z);scene.add(group);
  const b={type,x,z,group,queue:[],ring:ring(RULES[type].radius)};group.add(b.ring);state.buildings.push(b);return b;
}
function addUnit(type,x,z) {
  const group=model(type);group.position.set(x,0,z);scene.add(group);
  const u={type,x,z,group,target:null,ring:ring(type==='tank'?5:2)};group.add(u.ring);state.units.push(u);return u;
}
const hq=addBuilding('hq',0,0);addBuilding('barracks',-45,0);addBuilding('factory',45,0);
addUnit('soldier',-30,-32);addUnit('soldier',-24,-32);addUnit('tank',30,-35);
function select(items) {selected.forEach(e=>e.ring.visible=false);selected=items;selected.forEach(e=>e.ring.visible=true);renderPanel();}
let toastTimer;
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.style.opacity=1;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.opacity=0,3500);}
function cancelPlacement(){placing=null;if(ghost){scene.remove(ghost);ghost.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});ghost=null;}}
function startPlacement(type){cancelPlacement();placing=type;ghost=model(type);ghost.traverse(o=>{if(o.isMesh){o.material.transparent=true;o.material.opacity=.55;}});scene.add(ghost);toast('Klik op de kaart om te bouwen · Esc om te annuleren');}
function button(label,detail,fn){const b=document.createElement('button');const text=document.createElement('strong');text.textContent=label;const meta=document.createElement('span');meta.textContent=detail;b.append(text,meta);b.onclick=fn;document.querySelector('#actions').append(b);}
function renderPanel(){
  const first=selected[0];document.querySelector('#actions').replaceChildren();
  document.querySelector('#selection').textContent=selected.length>1?`${selected.length} eenheden`:first?RULES[first.type].name:'Basis bouwen';
  document.querySelector('#description').textContent=first?.type==='barracks'?'+20 populatieruimte · Soldaten trainen':first?.type==='factory'?'Pantserproductie · Tank kost 3 populatiepunten':first&&RULES[first.type].population?'Rechterklik op de kaart om te bewegen.':'Hoofdkwartier verdient 30 credits per seconde.';
  if(first?.queue){for(const type of ['soldier','tank'])if(RULES[type].producer===first.type)button(`Train ${RULES[type].name}`,`${RULES[type].cost} cr · ${RULES[type].population} pop`,()=>{const error=enqueue(type,first,state);toast(error||`${RULES[type].name} toegevoegd aan wachtrij`);});}
  button('Bouw barracks','400 cr · +20 pop',()=>startPlacement('barracks'));
  button('Bouw tankfabriek','700 cr',()=>startPlacement('factory'));
  button('Selecteer alle eenheden',`${state.units.length}`,()=>select([...state.units]));
}
select([hq]);
const raycaster=new THREE.Raycaster();const mouse=new THREE.Vector2();
function worldPoint(event){mouse.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);raycaster.setFromCamera(mouse,camera);return raycaster.intersectObject(ground)[0]?.point;}
canvas.addEventListener('pointermove',e=>{pointerGround=worldPoint(e);});
canvas.addEventListener('pointerdown',e=>{
  const p=worldPoint(e);if(!p)return;
  if(e.button===2){cancelPlacement();const units=selected.filter(u=>u.target!==undefined);const cols=Math.ceil(Math.sqrt(units.length));units.forEach((u,i)=>u.target={x:THREE.MathUtils.clamp(p.x+(i%cols-(cols-1)/2)*9,-990,990),z:THREE.MathUtils.clamp(p.z+(Math.floor(i/cols)-(cols-1)/2)*9,-990,990)});return;}
  if(e.button!==0)return;
  if(placing){if(state.money<RULES[placing].cost){toast('Onvoldoende credits.');return;}if(!canPlace(placing,p.x,p.z,state.buildings)){toast('Geen ruimte: kies een vrije plek binnen de kaart.');return;}state.money-=RULES[placing].cost;const b=addBuilding(placing,p.x,p.z);cancelPlacement();select([b]);return;}
  const objects=[...state.units,...state.buildings];const hits=raycaster.intersectObjects(objects.map(o=>o.group),true);
  const hit=hits.find(h=>h.object!==objects.find(o=>o.ring===h.object)?.ring);
  const entity=hit&&objects.find(o=>{let node=hit.object;while(node){if(node===o.group)return true;node=node.parent;}return false;});
  if(entity){if(e.shiftKey&&state.units.includes(entity)){const current=selected.filter(u=>state.units.includes(u));select(current.includes(entity)?current.filter(u=>u!==entity):[...current,entity]);}else select([entity]);}else select([]);
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.15,60,700);},{passive:false});
const keys=new Set();window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.key==='Escape')cancelPlacement();});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();
const minimap=document.querySelector('#minimap');const ctx=minimap.getContext('2d');
minimap.addEventListener('pointerdown',e=>{const r=minimap.getBoundingClientRect();focus.x=((e.clientX-r.left)/r.width-.5)*MAP_SIZE;focus.z=((e.clientY-r.top)/r.height-.5)*MAP_SIZE;});
function mini(){ctx.fillStyle='#4b6046';ctx.fillRect(0,0,200,200);ctx.strokeStyle='#718460';for(let i=0;i<=200;i+=20){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,200);ctx.moveTo(0,i);ctx.lineTo(200,i);ctx.stroke();}for(const e of [...state.buildings,...state.units]){ctx.fillStyle=state.buildings.includes(e)?'#d5f69b':'#fff0b6';const s=state.buildings.includes(e)?4:2;ctx.fillRect((e.x/MAP_SIZE+.5)*200-s/2,(e.z/MAP_SIZE+.5)*200-s/2,s,s);}ctx.strokeStyle='#ffffff';ctx.strokeRect((focus.x/MAP_SIZE+.5)*200-zoom/20,(focus.z/MAP_SIZE+.5)*200-zoom/25,zoom/10,zoom/12.5);}
const clock=new THREE.Clock();let hudElapsed=0;
function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.1);state.money+=dt*30;
  const speed=zoom*.8*dt;if(keys.has('w')||keys.has('arrowup'))focus.z-=speed;if(keys.has('s')||keys.has('arrowdown'))focus.z+=speed;if(keys.has('a')||keys.has('arrowleft'))focus.x-=speed;if(keys.has('d')||keys.has('arrowright'))focus.x+=speed;
  focus.x=THREE.MathUtils.clamp(focus.x,-970,970);focus.z=THREE.MathUtils.clamp(focus.z,-970,970);
  camera.position.set(focus.x,zoom,focus.z+zoom*.85);camera.lookAt(focus);
  sun.position.set(focus.x+150,250,focus.z+100);sun.target.position.copy(focus);
  if(ghost&&pointerGround){ghost.position.set(pointerGround.x,0,pointerGround.z);const valid=canPlace(placing,pointerGround.x,pointerGround.z,state.buildings)&&state.money>=RULES[placing].cost;ghost.traverse(o=>{if(o.isMesh)o.material.color.set(valid?0xbde979:0xe56e5e);});}
  for(const b of state.buildings){const q=b.queue[0];if(q){q.remaining-=dt;if(q.remaining<=0){const angle=random()*Math.PI;addUnit(q.type,b.x+Math.cos(angle)*(RULES[b.type].radius+12),b.z-Math.sin(angle)*(RULES[b.type].radius+12));b.queue.shift();toast(`${RULES[q.type].name} klaar`);}}}
  for(const u of state.units){if(!u.target)continue;const dx=u.target.x-u.x,dz=u.target.z-u.z,d=Math.hypot(dx,dz);if(d<.6){u.target=null;continue;}const step=Math.min(d,RULES[u.type].speed*dt);const nx=u.x+dx/d*step,nz=u.z+dz/d*step;
    // Slide around structures instead of crossing their footprint.
    const blocked=state.buildings.find(b=>Math.hypot(nx-b.x,nz-b.z)<RULES[b.type].radius+3);
    if(blocked){const bx=u.x-blocked.x,bz=u.z-blocked.z;const length=Math.hypot(bx,bz)||1;const sign=(-bz*dx+bx*dz)>=0?1:-1;u.x+=-bz/length*step*sign;u.z+=bx/length*step*sign;}else{u.x=nx;u.z=nz;}
    u.group.position.set(u.x,0,u.z);u.group.rotation.y=Math.atan2(-dx,-dz);
  }
  hudElapsed+=dt;if(hudElapsed>.2){hudElapsed=0;document.querySelector('#resources').innerHTML=`<div><small>CREDITS · +30 / S</small><b>${Math.floor(state.money).toLocaleString('nl-NL')}</b></div><div><small>POPULATIE</small><b>${population(state.units,state.buildings)} / ${capacity(state.buildings)}</b></div><div><small>EENHEDEN</small><b>${state.units.length}</b></div>`;const b=selected[0];document.querySelector('#queue').textContent=b?.queue?.length?b.queue.map((q,i)=>`${RULES[q.type].name} · ${i===0?Math.ceil(q.remaining)+'s':'wacht'}`).join(' | '):'';mini();}
  renderer.render(scene,camera);
}
frame();
