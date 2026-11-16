// The scene coordinates belong to the art. Thresholds and XP calculations come from the server rules.
const shopEntrances = [
  {key:'rooms',label:'动物房间',page:'rooms',area:[13.7,15.7,18,21]},
  {key:'login',label:'账号',page:'login',area:[30,11.3,14.6,8.2]},
  {key:'orders',label:'普通订单',page:'orders',area:[50.2,18.2,17,10]},
  {key:'show',label:'比赛',page:'show',area:[82,7.8,26,11]},
  {key:'lab',label:'研究所',page:'lab',area:[17.8,41.4,29,14]},
  {key:'market',label:'自由市场',page:'market',area:[83,39.8,25,15]},
  {key:'profile',label:'签到簿',page:'rabbitcheckin',area:[17,77.4,23,10]},
  {key:'breed',label:'繁育台',page:'breed',area:[87.5,58.8,20,10.5]},
  {key:'decor',label:'装饰',page:'decor',area:[15.2,61,25,10]},
  {key:'guest',label:'特殊来客',page:'guest',area:[81,74,30,14]},
  {key:'collection',label:'奖杯收藏册',page:'collection'}
];
const featureDoors = (() => {
  document.documentElement.style.setProperty('--shop-lock-art','url('+A['ui-node-lock-24-v2']+')');
  const byKey = new Map(shopEntrances.map(entry=>[entry.key,entry]));
  const routes = {
    rooms:'rooms',rabbitroom:'rooms',unlock:'rooms',profile:'rooms',rabbitpet:'rooms',rabbitstages:'rooms',
    login:'login',payment:'login',rabbitcheckin:'profile',
    breed:'breed',roombreed:'breed',rabbitbreed:'breed',birth:'breed',rabbitbirth:'breed',
    market:'market',lab:'lab',research:'lab',laboffer:'lab',items:'lab',
    orders:'orders',cancelshop:'orders',orderfulfill:'orders',rabbitorders:'orders',
    guest:'guest',guestfulfill:'guest',rabbitguest:'guest',show:'show',result:'show',collection:'collection',decor:'decor'
  };
  const channelKey=channel=>channel==='recycle'?'lab':channel==='market'?'market':channel==='guest'?'guest':'orders';
  function routeKey(page,channel){
    if(page==='roomsell')return RoomBook.group==='已故'?'lab':'market';
    if(page==='rabbittrade')return channelKey(channel||RabbitUI.channel);
    return routes[page];
  }
  function progress(trial=previewNav.trialShop){
    return shopProgress(shopRules,trial?RabbitDemo.read().shopXp:saleState.shopXp);
  }
  function locked(key,trial){
    return key&&progress(trial).level<shopRules.featureLevels[key];
  }
  function enter(key,trial){
    if(!locked(key,trial))return true;
    RabbitUI.notice(byKey.get(key).label+'将在店铺 '+shopRules.featureLevels[key]+' 级开放。');
    return false;
  }
  function controlKey(button){
    const {shopDoor,go,rabbit,dot,sale,key,val}=button.dataset;
    if(shopDoor)return shopDoor;
    if(go)return routeKey(go);
    if(rabbit==='channel'||rabbit==='fulfill')return channelKey(val);
    if(rabbit==='litter-sale')return 'orders';
    if(rabbit==='market-pet')return 'market';
    if(rabbit==='recycle-pet')return 'lab';
    if(rabbit==='pet'||rabbit==='room'||rabbit==='stages')return 'rooms';
    if(rabbit==='breed'||rabbit==='birth')return 'breed';
    if(sale==='profile'||dot==='enter-room')return 'rooms';
    if(sale==='open')return key==='guest'?'guest':saleChannels[key]?.order?'orders':'lab';
    if(sale==='offer')return 'lab';
    if(dot==='goto')return routeKey(key);
    if(dot==='service')return 'lab';
    if(dot==='profile-sale')return saleState.stock.get(key)?.stage==='已故'?'lab':'market';
    return null;
  }
  function decorate(root){
    const level=progress().level;
    for(const button of root.querySelectorAll('button')){
      const key=controlKey(button),required=shopRules.featureLevels[key];
      if(!required)continue;
      const locked=level<required;
      button.classList.toggle('feature-locked',locked);
      const existing=button.querySelector('.feature-level');
      if(locked&&!existing){
        const badge=document.createElement('small');
        badge.className='feature-level';
        badge.textContent=required+'级';
        (button.classList.contains('scene-target')?button.querySelector(':scope > span'):button).append(badge);
        button.setAttribute('aria-description','店铺 '+required+' 级开放');
      }else if(!locked&&existing){
        existing.remove();button.removeAttribute('aria-description');
      }
    }
  }
  // Check before click handlers change selection, close a sheet or switch rooms.
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const action=button.dataset.sale||button.dataset.dot||button.dataset.rabbit||button.dataset.research||button.dataset.pair;
    const key=controlKey(button)||(!['close','edit'].includes(action)&&action?routeKey(displayedPage):null);
    if(!enter(key)){event.stopImmediatePropagation();event.preventDefault();}
  },true);
  return {routeKey,enter,decorate,progress};
})();
