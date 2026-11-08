"use strict";

// ---------- Settings and tower types ----------
const W = 800, H = 520, TILE = 40, MAX_LEVEL = 10, WAVES_PER_LEVEL = 5;
const SAVE_KEY = "towerDefenseBossCampaign_v1";
const TOWERS = [
  {id:0,name:"Basic Tower",icon:"⚒️",cost:50,range:145,damage:12,fireRate:.65,color:"#60a5fa"},
  {id:1,name:"Sniper Tower",icon:"🏹",cost:375,range:230,damage:28,fireRate:1.35,color:"#c084fc"},
  {id:2,name:"Splash Tower",icon:"💎",cost:450,range:115,damage:10,fireRate:.9,splash:48,color:"#f59e0b"},
  {id:3,name:"Laser Tower",icon:"🔥",cost:600,range:190,damage:7,fireRate:.18,color:"#fb7185"}
];
const PATH = [
  {x:-20,y:100},{x:180,y:100},{x:180,y:300},{x:420,y:300},
  {x:420,y:140},{x:660,y:140},{x:660,y:440},{x:820,y:440}
];

// ---------- State ----------
let currentLevel=1, highestUnlockedLevel=1, wave=0, waveActive=false;
let gold=120, lives=20, gameSpeed=1, selectedTowerId=0;
let towers=[], enemies=[], projectiles=[];
let spawnRemaining=0, spawnTimer=0, gameOver=false, lastFrameTime=0, saveTimer=0;

const canvas=document.getElementById("game-canvas"), ctx=canvas.getContext("2d");
const $=id=>document.getElementById(id);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function message(s){$("message").textContent=s;}

function serializableState(){
  return {
    currentLevel, highestUnlockedLevel, wave, gold, lives, selectedTowerId,
    towers:towers.map(t=>({x:t.x,y:t.y,typeId:t.type.id})),
    enemies:enemies.map(e=>({...e})),
    waveActive, spawnRemaining, spawnTimer, gameOver
  };
}
function saveGame(){
  try { localStorage.setItem(SAVE_KEY,JSON.stringify(serializableState())); }
  catch(err){ console.warn("Could not save game progress:",err); }
}
function loadGame(){
  try {
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const s=JSON.parse(raw);
    if(!s || !Number.isInteger(s.currentLevel) || !Array.isArray(s.towers)) return false;
    currentLevel=Math.min(MAX_LEVEL,Math.max(1,s.currentLevel));
    highestUnlockedLevel=Math.min(MAX_LEVEL,Math.max(currentLevel,Number(s.highestUnlockedLevel)||1));
    wave=Math.min(WAVES_PER_LEVEL,Math.max(0,Number(s.wave)||0));
    gold=Math.max(0,Number(s.gold)||0);
    lives=Math.max(0,Number(s.lives)||0);
    selectedTowerId=Number.isInteger(s.selectedTowerId)?s.selectedTowerId:0;
    towers=s.towers.map(t=>{
      const type=TOWERS.find(x=>x.id===t.typeId);
      return type?{x:Number(t.x),y:Number(t.y),type,cooldown:0}:null;
    }).filter(Boolean);
    enemies=Array.isArray(s.enemies)?s.enemies.filter(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.hp)).map(e=>({...e})): [];
    waveActive=Boolean(s.waveActive);
    spawnRemaining=Math.max(0,Number(s.spawnRemaining)||0);
    spawnTimer=Math.max(0,Number(s.spawnTimer)||0);
    gameOver=Boolean(s.gameOver)||lives<=0;
    // Projectiles are deliberately recreated empty after loading; enemies and wave progress remain.
    projectiles=[];
    return true;
  } catch(err){ console.warn("Could not load saved game:",err); return false; }
}

function renderLevelButtons(){
  const bar=$("level-bar"); bar.innerHTML="";
  for(let n=1;n<=MAX_LEVEL;n++){
    const b=document.createElement("button");
    b.className="level-btn"+(n===currentLevel?" active":"")+(n>highestUnlockedLevel?" locked":"");
    b.textContent=n>highestUnlockedLevel?`🔒 ${n}`:`Level ${n}`;
    b.disabled=n>highestUnlockedLevel;
    b.addEventListener("click",()=>changeLevel(n));
    bar.appendChild(b);
  }
}
function buildShop(){
  const shop=$("tower-shop"); shop.innerHTML="";
  for(const t of TOWERS){
    const b=document.createElement("button");
    b.className="tower-option"+(t.id===selectedTowerId?" selected":"");
    b.innerHTML=`<span class="tower-icon">${t.icon}</span><span class="tower-details">${t.name}<small>Cost: ${t.cost} • Range: ${t.range} • Damage: ${t.damage}</small></span>`;
    b.addEventListener("click",()=>{selectedTowerId=t.id;buildShop();message(`${t.name} selected. Click an empty grass tile to place it.`);});
    shop.appendChild(b);
  }
}
function updateHUD(){
  $("gold").textContent=gold; $("lives").textContent=lives;
  $("level-display").textContent=`${currentLevel} / ${MAX_LEVEL}`;
  $("wave-display").textContent=`${wave} / ${WAVES_PER_LEVEL}`;
  $("start-button").disabled=waveActive||gameOver||wave>=WAVES_PER_LEVEL;
  $("start-button").textContent=wave>=WAVES_PER_LEVEL?"Level complete":waveActive?"Wave running…":"Start wave";
  const boss=enemies.find(e=>e.isBoss);
  $("boss-status").style.display=boss?"block":"none";
  if(boss){
    $("boss-label").textContent=`${boss.bossName} — ${Math.ceil(boss.hp)} / ${boss.maxHp} HP`;
    $("boss-health").style.width=`${Math.max(0,100*boss.hp/boss.maxHp)}%`;
  }
}
function changeLevel(n){
  if(n>highestUnlockedLevel||n<1||n>MAX_LEVEL)return;
  if(waveActive&&!confirm("Leave this wave? Your current wave position and enemies will be saved."))return;
  currentLevel=n; wave=0; waveActive=false; enemies=[]; projectiles=[];
  spawnRemaining=0;spawnTimer=0;gameOver=false;
  // Gold, lives and towers deliberately carry over between levels.
  renderLevelButtons();updateHUD();
  message(`Level ${currentLevel}: your towers, gold and lives have carried over. Start wave 1!`);
  saveGame();
}
function restartLevel(){
  if(!confirm("Restart this level? Your towers, gold and lives will be kept, but this level's wave progress will reset."))return;
  wave=0;waveActive=false;enemies=[];projectiles=[];spawnRemaining=0;spawnTimer=0;gameOver=false;
  updateHUD();message(`Level ${currentLevel} restarted. Your towers and resources were kept.`);saveGame();
}
function eraseSave(){
  if(!confirm("Erase all saved campaign progress and start a new game?"))return;
  localStorage.removeItem(SAVE_KEY);
  currentLevel=1;highestUnlockedLevel=1;wave=0;waveActive=false;gold=120;lives=20;selectedTowerId=0;
  towers=[];enemies=[];projectiles=[];spawnRemaining=0;spawnTimer=0;gameOver=false;
  renderLevelButtons();buildShop();updateHUD();message("New campaign started.");saveGame();
}

// ---------- Waves and enemies ----------
function startWave(){
  if(waveActive||gameOver||wave>=WAVES_PER_LEVEL)return;
  wave++;waveActive=true;
  // Later levels send larger groups, and enemies arrive more quickly.
  spawnRemaining=wave===WAVES_PER_LEVEL?1:7+wave*3+currentLevel*3;
  spawnTimer=.2;updateHUD();
  message(wave===WAVES_PER_LEVEL?`BOSS WAVE! Level ${currentLevel}'s boss is coming!`:`Level ${currentLevel}, wave ${wave}: incoming enemies!`);
  saveGame();
}
function createEnemy(){
  // Enemy health now rises much faster than before, so old towers cannot
  // defeat later waves almost instantly. Level 1 remains close to its old difficulty.
  const scale=Math.pow(1.62,currentLevel-1);
  const hp=Math.round((30+wave*12)*scale);
  const speed=50+wave*4+currentLevel*3;
  const armor=Math.min(.38,(currentLevel-1)*.035);
  return {x:PATH[0].x,y:PATH[0].y,waypoint:1,hp,maxHp:hp,speed,radius:12,reward:10+currentLevel*3,armor,isBoss:false};
}
function createBoss(){
  const bossNames=["Stone Golem","Orc Warlord","Frost Dragon","Void Knight","Ancient Treant","Inferno Giant","Storm Behemoth","Shadow Colossus","Dread Titan","The Final Overlord"];
  // Bosses gain substantial health and armor each level. They are intended
  // to survive sustained fire from a developed tower collection.
  const hp=Math.round(900*Math.pow(1.78,currentLevel-1));
  const armor=Math.min(.60,.12+(currentLevel-1)*.045);
  return {
    x:PATH[0].x,y:PATH[0].y,waypoint:1,hp,maxHp:hp,
    speed:Math.max(30,38+currentLevel*1.35),radius:24,
    reward:150+currentLevel*40,armor,isBoss:true,bossName:bossNames[currentLevel-1]
  };
}
function spawnEnemy(){
  if(wave===WAVES_PER_LEVEL) enemies.push(createBoss());
  else enemies.push(createEnemy());
}
function updateEnemies(dt){
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i],target=PATH[e.waypoint];
    if(!target){
      enemies.splice(i,1);lives=Math.max(0,lives-(e.isBoss?8:2));
      if(lives<=0){gameOver=true;waveActive=false;message("Game over! Restart the level or erase the save to begin again.");}
      updateHUD();continue;
    }
    const dx=target.x-e.x,dy=target.y-e.y,len=Math.hypot(dx,dy),step=e.speed*dt;
    if(len<=step){e.x=target.x;e.y=target.y;e.waypoint++;}
    else{e.x+=dx/len*step;e.y+=dy/len*step;}
  }
}
function updateTowers(dt){
  for(const t of towers){
    t.cooldown-=dt;if(t.cooldown>0)continue;
    let target=null,best=Infinity;
    for(const e of enemies){const d=distance(t,e);if(d<=t.type.range&&d<best){target=e;best=d;}}
    if(target){t.cooldown=t.type.fireRate;projectiles.push({x:t.x,y:t.y,target,speed:t.type.id===3?900:420,damage:t.type.damage,splash:t.type.splash||0,color:t.type.color});}
  }
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];
    if(!enemies.includes(p.target)){projectiles.splice(i,1);continue;}
    const dx=p.target.x-p.x,dy=p.target.y-p.y,len=Math.hypot(dx,dy),step=p.speed*dt;
    if(len<=step+p.target.radius){
      const hit=p.target;
      // Armor reduces incoming damage. Bosses have much more armor than regular enemies.
      hit.hp-=Math.max(1,p.damage*(1-(hit.armor||0)));
      if(p.splash)for(const e of enemies)if(e!==hit&&distance(e,hit)<=p.splash)e.hp-=Math.max(1,p.damage*(1-(e.armor||0)));
      projectiles.splice(i,1);
    }else{p.x+=dx/len*step;p.y+=dy/len*step;}
  }
  for(let i=enemies.length-1;i>=0;i--){
    if(enemies[i].hp<=0){gold+=enemies[i].reward;if(enemies[i].isBoss)message(`${enemies[i].bossName} defeated!`);enemies.splice(i,1);updateHUD();}
  }
}
function finishWave(){
  waveActive=false;
  if(wave>=WAVES_PER_LEVEL){
    const bonus=100+currentLevel*30;gold+=bonus;
    if(currentLevel<MAX_LEVEL){
      highestUnlockedLevel=Math.max(highestUnlockedLevel,currentLevel+1);
      message(`Boss defeated! Level ${currentLevel} complete. +${bonus} gold. Level ${currentLevel+1} unlocked — your towers and resources carry over!`);
    }else{
      message(`You defeated the final boss and completed the campaign! +${bonus} gold. Congratulations!`);
    }
    renderLevelButtons();
  }else{
    const bonus=20+currentLevel*5;gold+=bonus;
    message(`Wave ${wave} cleared! +${bonus} bonus gold. Start the next wave when ready.`);
  }
  updateHUD();saveGame();
}
function update(dt){
  if(!waveActive||gameOver)return;
  spawnTimer-=dt;
  if(spawnRemaining>0&&spawnTimer<=0){
    spawnEnemy();spawnRemaining--;
    spawnTimer=wave===WAVES_PER_LEVEL?1.0:Math.max(.22,.72-currentLevel*.045);
  }
  updateEnemies(dt);updateTowers(dt);updateProjectiles(dt);
  if(spawnRemaining===0&&enemies.length===0)finishWave();
}

// ---------- Map and drawing ----------
function pointIsOnPath(x,y){
  for(let i=0;i<PATH.length-1;i++){
    const a=PATH[i],b=PATH[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
    if(distance({x,y},{x:a.x+t*dx,y:a.y+t*dy})<29)return true;
  }
  return false;
}
function placeTower(ev){
  if(gameOver)return;
  const r=canvas.getBoundingClientRect();
  const x=Math.floor(((ev.clientX-r.left)*canvas.width/r.width)/TILE)*TILE+TILE/2;
  const y=Math.floor(((ev.clientY-r.top)*canvas.height/r.height)/TILE)*TILE+TILE/2;
  const type=TOWERS.find(t=>t.id===selectedTowerId);
  if(!type||x<0||y<0||x>=W||y>=H)return;
  if(pointIsOnPath(x,y)){message("You cannot build on the road.");return;}
  if(towers.some(t=>distance(t,{x,y})<30)){message("There is already a tower too close to that spot.");return;}
  if(gold<type.cost){message(`Not enough gold. ${type.name} costs ${type.cost}.`);return;}
  gold-=type.cost;towers.push({x,y,type,cooldown:0});
  updateHUD();saveGame();message(`${type.name} placed. It will remain in your campaign when you advance.`);
}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#244536";ctx.fillRect(0,0,W,H);
  ctx.strokeStyle="rgba(255,255,255,.08)";ctx.lineWidth=1;
  for(let x=0;x<=W;x+=TILE){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=TILE){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(PATH[0].x,PATH[0].y);
  for(let i=1;i<PATH.length;i++)ctx.lineTo(PATH[i].x,PATH[i].y);
  ctx.strokeStyle="#64748b";ctx.lineWidth=54;ctx.stroke();ctx.strokeStyle="#cbd5e1";ctx.lineWidth=2;ctx.setLineDash([10,12]);ctx.stroke();ctx.restore();
  ctx.fillStyle="#f87171";ctx.beginPath();ctx.arc(770,440,15,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.font="12px sans-serif";ctx.textAlign="left";ctx.fillText("EXIT",750,470);
  for(const t of towers){
    ctx.beginPath();ctx.arc(t.x,t.y,17,0,Math.PI*2);ctx.fillStyle="#111827";ctx.fill();ctx.strokeStyle=t.type.color;ctx.lineWidth=2;ctx.stroke();
    ctx.font="18px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(t.type.icon,t.x,t.y);
  }
  for(const e of enemies){
    ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,Math.PI*2);ctx.fillStyle=e.isBoss?"#7f1d1d":"#ef4444";ctx.fill();ctx.strokeStyle=e.isBoss?"#fbbf24":"#7f1d1d";ctx.lineWidth=e.isBoss?4:2;ctx.stroke();
    if(e.isBoss){ctx.font="bold 11px sans-serif";ctx.fillStyle="#fff";ctx.textAlign="center";ctx.fillText("BOSS",e.x,e.y+4);}
    const bw=e.isBoss?58:28;ctx.fillStyle="#450a0a";ctx.fillRect(e.x-bw/2,e.y-e.radius-10,bw,5);ctx.fillStyle="#4ade80";ctx.fillRect(e.x-bw/2,e.y-e.radius-10,bw*Math.max(0,e.hp/e.maxHp),5);
  }
  for(const p of projectiles){ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();}
}
function gameLoop(ts){
  if(!lastFrameTime)lastFrameTime=ts;
  const dt=Math.min((ts-lastFrameTime)/1000,.05);lastFrameTime=ts;
  update(dt*gameSpeed);draw();updateHUD();
  saveTimer+=dt;
  if(saveTimer>=2){saveTimer=0;saveGame();}
  requestAnimationFrame(gameLoop);
}

// ---------- Controls and startup ----------
$("speed-button").addEventListener("click",()=>{
  gameSpeed=gameSpeed===1?2:1;$("speed-button").textContent=`Speed: ${gameSpeed}×`;
});
$("start-button").addEventListener("click",startWave);
$("restart-button").addEventListener("click",restartLevel);
$("reset-save-button").addEventListener("click",eraseSave);
canvas.addEventListener("click",placeTower);

const loaded=loadGame();
renderLevelButtons();buildShop();updateHUD();
if(loaded){
  message(`Saved campaign loaded: Level ${currentLevel}, wave ${wave}. Your towers and resources have been restored.`);
}else{
  message("New campaign: build towers, clear five waves, and defeat each level boss.");
  saveGame();
}
requestAnimationFrame(gameLoop);
