// Each selector ends a fixed region, from the illustration alone to the full set of controls.
const fixedListEnds = {
  rooms:['.rb-room-scene','.room-filters'],
  rabbitpet:['.rb-book'], profile:['.pethead'], rabbitbirth:['.rb-room-scene','.rb-note'],
  roombreed:['.rb-breed-pair','.sectionhead'],rabbitbreed:['.rb-room-scene','.rb-breed-pair','.rb-heading'], rabbittrade:['.rb-channels','.rb-filters','.rb-subtools'],
  breed:['.slots'], birth:['.banner','.sectionhead'], orders:['.banner','.sectionhead'], cancelshop:['.banner'],
  market:['.banner'], lab:['.banner','.tabs','.sectionhead,.row'], research:['.dr-scene','.dr-tabs'],
  guest:['.pethead'], decor:['.shop-miniature'], show:['.stage','.df-tabs'],
  result:['.df-headpiece','.df-tiers'], collection:['.df-book','.df-tabs','.df-tiers'], login:['.opening']
};
let fitPreviewList=null;
function listScroller(){return document.querySelector('.preview-list')||document.querySelector('.phone>.scroll');}
function splitPreviewList(key){
  const paper=document.querySelector('.phone>.scroll'),screen=document.querySelector('#screen');
  paper.classList.remove('with-fixed-view');
  screen.classList.remove('split-view','dr-lab','trade-view','profile-view');
  fitPreviewList=null;
  if(previewNav.isHome(key))return;
  const animals=screen.querySelector(':scope > .sale-panel > .sale-animals')||(key==='rabbittrade'&&screen.querySelector(':scope > .rb-list'));
  if(animals){
    paper.classList.add('with-fixed-view');screen.classList.add('trade-view');
    animals.classList.add('preview-list');
    return;
  }
  const footer=document.createElement('div');footer.className='preview-actions';
  const actionSelectors={
    profile:'.profile-actions',rabbitpet:'.profile-actions',show:'[data-dot=race-list],[data-dot=race-record],[data-dot=entry],[data-go=result],[data-go=collection]',
    collection:'[data-dot=history]',result:'[data-go=collection]',guest:'[data-sale=open],[data-dot=guest-dismiss]',
    rabbitbirth:'.rb-dock',rabbitbreed:'.rb-dock,[data-rabbit=birth]',roombreed:'[data-pair=review],[data-pair=again],[data-go=rooms]',
    cancelshop:'[data-dot=buy-review]',orders:'[data-go=cancelshop],[data-dot=ledger]',
    rabbitstages:'.rb-age-tabs,[data-rabbit=room]',rabbitcheckin:'[data-rabbit=claim],[data-rabbit=room]'
  };
  const defaults=':scope > button.btn,:scope > .grid2 > button.btn,:scope > .rb-actions';
  const buttons=key==='rooms'||key==='research'?[]:[...screen.querySelectorAll(actionSelectors[key]||defaults)];
  if(buttons.length)footer.append(...buttons);
  if(key==='profile'||key==='rabbitpet')screen.classList.add('profile-view');
  const ends=fixedListEnds[key]||['.banner','.tabs','.sectionhead,.rb-heading'];
  // Keep the research controller's lab ancestor around its tabs, branch rows and dialog.
  const lab=screen.firstElementChild?.classList.contains('dr-lab')?screen.firstElementChild:null;
  const nodes=Array.from((lab||screen).children);
  const limits=ends.map(selector=>nodes.findIndex(n=>n.matches(selector))+1)
    .filter((index,i,all)=>index>0 && (index<nodes.length||buttons.length) && all.indexOf(index)===i).sort((a,b)=>b-a);
  const fixed=document.createElement('div'),list=document.createElement('div'),items=document.createElement('div');
  fixed.className='content preview-fixed';list.className='preview-list';items.className='content';
  list.append(items);screen.replaceChildren(fixed,list);
  const paged=['login','payment','breed','birth','laboffer','rabbitstages','cancelshop'].includes(key);
  const pager=document.createElement('nav');pager.className='detail-pager';pager.hidden=true;
  if(paged)screen.append(pager);
  if(buttons.length)screen.append(footer);
  if(lab)screen.classList.add('dr-lab');
  screen.classList.add('split-view');paper.classList.add('with-fixed-view');
  let count=0;
  let page=0,pages=[];
  function turnPage(index){
    page=Math.max(0,Math.min(index,pages.length-1));
    const many=pages.length>1;pager.hidden=!many;
    if(many){
      pager.replaceChildren();
      for(const [caption,direction] of [['上一页',-1],[(page+1)+' / '+pages.length,0],['下一页',1]]){
        const el=document.createElement(direction?'button':'span');el.textContent=caption;
        if(direction){el.type='button';el.disabled=page+direction<0||page+direction>=pages.length;el.onclick=()=>turnPage(page+direction);}
        pager.append(el);
      }
    }
    for(const [i,chunk] of pages.entries())for(const n of chunk)n.hidden=many&&i!==page;
    list.scrollTop=0;
  }
  items.append(...nodes);
  function move(limit){
    if(limit>count)fixed.append(...nodes.slice(count,limit));
    else if(limit<count)items.prepend(...nodes.slice(limit,count));
    count=limit;
  }
  fitPreviewList=()=>{
    if(paged){for(const n of nodes)n.hidden=false;pager.hidden=true;}
    const available=paper.clientHeight-footer.offsetHeight;
    const offset=list.scrollTop, budget=available-Math.min(95,Math.round(available*.25));
    for(const limit of limits){move(limit);if(fixed.offsetHeight<=budget)break;}
    list.scrollTop=offset;
    if(paged&&items.scrollHeight>list.clientHeight+2){
      pages=[];let height=0;
      const budget=Math.max(48,list.clientHeight-42);
      for(const item of items.children){
        const h=item.offsetHeight+8;
        if(!pages.length||height+h>budget){pages.push([]);height=0;}
        pages[pages.length-1].push(item);height+=h;
      }
      turnPage(page);
    }
  };
  fitPreviewList();
}
const previewSizeObserver=new ResizeObserver(()=>fitPreviewList?.());
previewSizeObserver.observe(document.querySelector('.phone>.scroll'));
document.querySelector('#screen').addEventListener('load',event=>{
  if(event.target.closest('.preview-fixed'))fitPreviewList?.();
},true);
