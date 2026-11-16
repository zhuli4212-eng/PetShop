// Browser-test fixture for exercising later modules. It is not bundled into either preview.
window.addEventListener('DOMContentLoaded',()=>{
  const lastUnlock=Math.max(...Object.values(shopRules.featureLevels));
  let fixtureXp=0;
  for(let p=shopProgress(shopRules,fixtureXp);p.level<lastUnlock&&p.toNext>0;p=shopProgress(shopRules,fixtureXp))fixtureXp+=p.toNext;
  saleState.shopXp=Math.max(saleState.shopXp,fixtureXp);
  const previous=RabbitDemo.read().mode;
  for(const mode of ['shop','sample']){
    RabbitDemo.useSample(mode==='sample');
    RabbitDemo.read();
    const key='petshop.rabbitroom.v1.'+mode;
    const state=JSON.parse(localStorage.getItem(key));
    state.shopXp=Math.max(state.shopXp||0,fixtureXp);
    localStorage.setItem(key,JSON.stringify(state));
  }
  RabbitDemo.useSample(previous==='sample');
  renderPreview(displayedPage,listScroller().scrollTop);
});
