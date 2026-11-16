// Floor coordinates are percentages of the original artwork. Routes stay in the
// open aisle at the shop, and in separate patches of floor around each room pet.
function createSceneMotion(){
  const memory=new Map();
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const circuits={
    店长:[[50,44],[56,46],[53,55],[46,57],[44,49]],
    兔:[[0,0],[-11,1],[-4,-4],[10,-2],[7,2]],
    猫:[[0,0],[13,-2],[5,2],[-10,0],[-5,-3]],
    狗:[[0,0],[-13,-2],[-5,2],[12,0],[6,-4]]
  };
  const speeds={店长:6.8,兔:11,猫:6.3,狗:9.2};
  let actors=[], frame=0, previous=0;

  function paint(actor){
    const {node,state,cycle}=actor;
    node.style.left=state.x+'%';
    node.style.top=state.y+'%';
    node.style.setProperty('--heading',state.facing);
    node.dataset.gait=state.leg?'walk':'idle';
    if(actor.kind!=='店长')node.style.zIndex=String(Math.round(state.y*10));
    if(!state.leg||!cycle)return;
    const phase=state.elapsed*state.leg.cycles/state.leg.duration;
    const index=Math.min(3,Math.floor((phase%1)*4));
    cycle.style.backgroundPositionX=(index*100/3)+'%';
    const lift=actor.kind==='兔'?Math.sin(Math.PI*(phase%1))*8:0;
    cycle.style.setProperty('--hop',-lift+'%');
  }

  function step(actor,dt){
    const {state,path,kind}=actor;
    if(!state.leg){
      state.rest-=dt;
      if(state.rest>0)return;
      state.next=(state.next+1)%path.length;
      const [x,y]=path[state.next];
      const dx=x-state.x,dy=y-state.y;
      const aspect=kind==='店长'?4/7:16/9;
      const distance=Math.hypot(dx,dy/aspect);
      const duration=Math.max(.8,distance/speeds[kind]);
      state.leg={fromX:state.x,fromY:state.y,dx,dy,duration,cycles:Math.max(2,Math.round(duration*(kind==='兔'?2:2.3)))};
      state.facing=dx>0?-1:1;
      state.elapsed=0;
    }
    state.elapsed+=dt;
    const leg=state.leg;
    let progress=Math.min(1,state.elapsed/leg.duration);
    if(kind==='兔'&&progress<1){
      const hops=progress*leg.cycles, t=hops%1;
      // Push off, then cover most of the distance while the paws are airborne.
      progress=(Math.floor(hops)+t-Math.sin(2*Math.PI*t)/(2*Math.PI))/leg.cycles;
    }
    state.x=leg.fromX+leg.dx*progress;
    state.y=leg.fromY+leg.dy*progress;
    if(state.elapsed>=leg.duration){
      state.leg=null;
      state.rest=(kind==='猫'?1.2:.55)+Math.random()*1.4;
    }
    paint(actor);
  }

  function tick(time){
    frame=0;
    const dt=previous?Math.min((time-previous)/1000,.08):0;
    previous=time;
    for(const actor of actors)step(actor,dt);
    frame=requestAnimationFrame(tick);
  }
  function schedule(){
    cancelAnimationFrame(frame);
    frame=0; previous=0;
    if(!document.hidden&&!preference.matches&&actors.length)frame=requestAnimationFrame(tick);
    if(preference.matches)for(const {node} of actors)node.dataset.gait='idle';
  }
  document.addEventListener('visibilitychange',schedule);
  preference.addEventListener('change',schedule);

  function mount(root,kind,inventory){
    const live=new Set(inventory.map(p=>p.id));
    for(const key of memory.keys())if(key!=='keeper'&&!live.has(key))memory.delete(key);
    actors=Array.from(root.querySelectorAll('[data-walker]'),node=>{
      const id=node.dataset.walker;
      const index=Number(node.dataset.slot||0);
      const [originX,originY]=[Number(node.dataset.x),Number(node.dataset.y)];
      const zone=node.dataset.zone||'shop';
      let state=memory.get(id);
      if(!state||state.zone!==zone){
        state={zone,x:originX,y:originY,facing:1,leg:null,next:0,rest:.32+index*.4,elapsed:0};
        memory.set(id,state);
      }
      const path=kind==='店长'?circuits[kind]:circuits[kind].map(([x,y])=>[originX+(index%2?-x:x),originY+y]);
      const actor={node,cycle:node.querySelector('.walk-cycle'),path,kind,state};
      paint(actor);
      return actor;
    });
    schedule();
  }
  return {mount,reset:()=>memory.clear()};
}
