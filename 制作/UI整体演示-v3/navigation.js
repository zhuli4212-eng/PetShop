// The visible function and its single work window determine the destination of Back.
const previewNav = (() => {
  const defaults={profile:'rooms',roomsell:'rooms',orderfulfill:'orders',guestfulfill:'guest',cancelshop:'orders',
    payment:'login',result:'show',laboffer:'lab',rabbitpet:'rooms',rabbitstages:'rooms'};
  let home='home', owner=null, section=null, picker=null, returningHome=false;
  const isHome=k=>k==='home'||k==='firstday';
  function snapshot(){
    const list=listScroller(),items=[...list.querySelectorAll('.rb-list .rb-row')];
    const index=items.findIndex(el=>el.getBoundingClientRect().bottom>list.getBoundingClientRect().top);
    const row=items[index];
    return {page:displayedPage,scroll:list.scrollTop,room:RoomBook.remember(),rabbit:rabbitView,
      sale:{channel:saleState.channel,species:saleState.species,selected:[...saleState.selected],profileId:saleState.profileId,offerSex:saleState.offerSex},
      anchor:row&&{id:row.dataset.val||row.dataset.key,index,offset:row.getBoundingClientRect().top-list.getBoundingClientRect().top}};
  }
  function restorePosition(saved){
    const list=listScroller();list.scrollTop=saved.scroll||0;
    if(!saved.anchor)return;
    const items=[...list.querySelectorAll('.rb-list .rb-row')],a=saved.anchor;
    const row=items.find(el=>(el.dataset.val||el.dataset.key)===a.id)||items[Math.min(a.index,items.length-1)];
    if(row)list.scrollTop+=row.getBoundingClientRect().top-list.getBoundingClientRect().top-a.offset;
  }
  function restore(saved){
    RoomBook.restore(saved.room);RabbitUI.restore(saved.rabbit);
    startSelection(saved.sale?.channel||'');
    saleState.species=saved.sale?.species||'全部';
    if(saved.sale?.profileId)saleState.profileId=saved.sale.profileId;
    if(saved.sale?.offerSex)saleState.offerSex=saved.sale.offerSex;
    saleState.selected=new Set((saved.sale?.selected||[]).filter(id=>saleEligible(saleState.stock.get(id),saleState.channel)));
    section=saved.page;owner=null;
    renderPreview(saved.page,0);restorePosition(saved);
  }
  function dismiss(){
    const dialogs=document.querySelectorAll('dialog[open]'),overlay=document.querySelector('#modal');
    for(const d of dialogs)d.close();
    const had=dialogs.length>0||!overlay.hidden;
    overlay.hidden=true;saleState.pending=null;RabbitUI.discardQuote();
    return had;
  }
  function saveURL(browser=false){
    const hash='#'+displayedPage;
    if(isHome(displayedPage)){
      if(!browser&&history.state?.petNav==='game'&&!returningHome){
        returningHome=true;history.back();
      }else if(!returningHome)history.replaceState({petNav:'shop',home},'',hash);
    }else{
      const current={petNav:'game',home,owner,room:RoomBook.remember(),rabbit:RabbitUI.remember(),section:snapshot()};
      if(history.state?.petNav==='game')history.replaceState(current,'',hash);
      else history.pushState(current,'',hash);
    }
  }
  function open(k,keep=false,mode='forward',args={}){
    const previous=displayedPage, independent=mode==='jump'||mode==='initial';
    if(!independent&&!featureDoors.enter(featureDoors.routeKey(k,args.channel)))return;
    const old=previous&&snapshot();
    if(!Object.hasOwn(pages,k)&&k!=='rabbitroom'&&k!=='unlock')k='home';
    if(k==='rabbitroom'){RoomBook.switchTo('兔','trial');k='rooms';}
    else if(k==='unlock'){RoomBook.switchTo(['猫','狗'].find(s=>!DotFlows.roomOpen(s))||species,'demo');k='rooms';}
    else if(k==='rooms'&&(independent||isHome(previous)))RoomBook.switchTo('兔',RabbitUI.pagesHere(previous)?'trial':'demo');
    if(k==='breed'&&previous==='home'){RoomBook.switchTo('兔','demo');k='roombreed';}
    if(independent){owner=null;section=null;home=k.startsWith('rabbit')||RoomBook.isTrial()&&k==='rooms'?'firstday':'home';}
    let parent=defaults[k];
    if(k==='rabbittrade'&&(args.local||owner&&k===previous))parent=owner?.page||section||'rooms';
    if(k==='rabbitbirth'&&(section==='rooms'||owner?.page==='rooms'))parent='rooms';
    if(!independent&&previous===k&&!args.switchFunction){
      renderPreview(k,keep?old.scroll:0);saveURL();return;
    }
    dismiss();
    if(parent){
      if(!owner)owner=!independent&&old&&!isHome(previous)?old:{page:parent,scroll:0,room:RoomBook.remember(),rabbit:null};
      section=owner.page;
    }else{
      owner=null;section=isHome(k)?null:k;
      if(isHome(k))home=k;
    }
    if(previous!==k||independent)startSelection('');
    if(args.channel)startSelection(args.channel);
    if(k==='laboffer'&&args.sex)saleState.offerSex=args.sex;
    if(args.selected&&saleEligible(saleState.stock.get(args.selected),saleState.channel))saleState.selected.add(args.selected);
    if((k==='roombreed'||k==='breed')&&k!==previous)RoomBook.resetPair();
    renderPreview(k,0);saveURL();
  }
  function back(browser=false){
    if(picker){picker.blur();picker=null;if(browser)saveURL(true);return;}
    const transient=dismiss();
    if(owner){const saved=owner;restore(saved);}
    else if(!transient&&!isHome(displayedPage)){
      startSelection('');section=null;renderPreview(home,0);
    }
    saveURL(browser);
  }
  function completed(){
    dismiss();
    if(owner){const saved=owner;restore(saved);}
    else renderPreview(displayedPage,listScroller().scrollTop);
    saveURL();
  }
  function initial(k){
    const saved=history.state;
    if(saved?.petNav==='game'&&saved.section?.page===k){
      home=saved.home;RoomBook.restore(saved.room);RabbitUI.restore(saved.rabbit);
      restore(saved.section);owner=saved.owner;section=owner?.page||k;return;
    }
    history.replaceState({petNav:'shop'},'','#home');
    open(k||'home',false,'initial');
  }
  window.addEventListener('popstate',e=>{
    if(returningHome){returningHome=false;saveURL(true);return;}
    if(e.state?.petNav==='shop'){back(true);return;}
    const route=location.hash.slice(1)||'home';
    if(e.state?.petNav==='game'&&e.state.section?.page===route){
      home=e.state.home;restore(e.state.section);owner=e.state.owner;section=owner?.page||route;return;
    }
    initial(route);
  });
  document.addEventListener('pointerdown',e=>{picker=e.target.matches('.room-filters select')?e.target:null;},true);
  document.addEventListener('change',()=>{picker=null;},true);
  document.addEventListener('focusout',e=>{if(e.target===picker)picker=null;},true);
  document.addEventListener('cancel',e=>{if(e.target.matches('dialog')){e.preventDefault();back();}},true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!isHome(displayedPage)){e.preventDefault();back();}
  });
  return {open,back,completed,initial,isHome,get local(){return !!owner;},get trialShop(){return home==='firstday'||RabbitUI.pagesHere(displayedPage)||displayedPage==='rooms'&&RoomBook.isTrial();}};
})();
