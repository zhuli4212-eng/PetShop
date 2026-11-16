from pathlib import Path
import re,json,base64,subprocess
here=Path(__file__).resolve().parent
root=here.parents[1]; out=root/'美术确认稿'/'UI整体演示-v3';out.mkdir(exist_ok=True)
rabbit_dir=here.parent/'兔房交互预览'
css=re.search(r'<style>(.*?)</style>',(root/'制作'/'preview.html').read_text('utf-8'),re.S)[1].replace('__COMMERCE_CSS__','')
assets={p.stem:'data:image/'+p.suffix[1:]+';base64,'+base64.b64encode(p.read_bytes()).decode() for p in (root/'美术确认稿'/'素材').iterdir() if p.suffix in ['.png','.webp']}
walk_dir=root/'PetShop'/'assets'/'resources'/'pet-walk'
walk_sheets={}
for key,b,v in [('british','british','coat01_female'),('british-male','british','coat01_male'),
                ('shiba','shiba','coat01_male'),('shiba-female','shiba','coat01_female')]:
 p=root/'动物资源'/'扩充图鉴'/'图片'/b/(v+'.png');assets[key]='data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()
 walk_sheets[key]=walk_dir/f'{b}-{v}.png'
for key in ('brown-dead','cat-dead','spot-dead','angora-dead'):
 path=root/'美术确认稿'/'已故'/(key+'.png')
 assets[key]='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
care=json.loads(subprocess.check_output(['node','--input-type=module','-e',
 """import {SPECIES,BREEDS,mixedOffspring} from './care.mjs';
 import {salePrice} from './business.mjs';
 for(const [breedKey,b] of Object.entries(BREEDS)){
   const c=SPECIES[b.species],traits=Array.from({length:6},()=>({grade:'B',rarity:'普通'}));
   b.base=salePrice({}, {species:b.species,breedKey,traits,bornAt:0},(c.young+c.growth)*60000,'market');
 }
 console.log(JSON.stringify({species:SPECIES,breeds:BREEDS,mixedRule:mixedOffspring.toString()}));"""],
 cwd=root/'PetShop'/'server',encoding='utf-8'))
for breed in care['breeds']:
 for path in sorted((root/'动物资源'/'扩充图鉴'/'图片'/breed).glob('coat*.png')):
  coat,sex=path.stem.split('_')
  key=f'rb-{breed}-{coat[4:]}-{sex}'
  assets[key]='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
  walk_sheets[key]=walk_dir/f'{breed}-{path.name}'
for key in ('angora','brown','spot','cat'):
 walk_sheets[key]=root/'美术确认稿'/'动作'/f'{key}-walk.png'
for key,path in walk_sheets.items():
 assets[key+'-walk']='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
css+='''
.workspace{display:block;padding:0;width:100%;min-height:0}.phone{width:100%;max-width:430px;margin:auto;height:100svh;max-height:none;min-height:0;border:0;box-shadow:none}.top{padding-top:12px;min-height:64px}.phone:not(.in-shop) .top{padding-top:12px}.btn,.back,.item,.room-sign{min-height:48px}.demo-bar{display:flex;align-items:center;justify-content:space-between;padding:4px 10px;background:#193d34;color:#efdab0;font-size:11px;min-height:30px}.demo-bar select{background:#284c40;color:#fff0ce;border:1px solid #75916a;width:130px}.phone{padding-top:var(--safe-top,env(safe-area-inset-top,0px));padding-bottom:var(--safe-bottom,env(safe-area-inset-bottom,0px))}.scroll{padding-bottom:0}.home-status{display:flex;justify-content:space-between;padding:7px 12px;background:#ebd6a9;font-size:12px}.home-nav{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px;background:#e8d3a7}.in-shop .scroll{display:flex;flex-direction:column}.in-shop .content{flex:1;min-height:0;height:auto}.in-shop .shop-scene{height:100%}.bubble{position:absolute;z-index:8;left:26%;top:44%;width:48%;padding:6px;background:#fff0ce;border:2px solid #695332;font-size:11px;text-align:center}.scene-target{min-width:48px;min-height:48px}.scene-target span{font-size:12px}.scene-target[data-go=rooms] span,.scene-target[data-go=orders] span{background:#ffdc91;color:#3d432b;font-weight:800}.smallnote{font-size:11px;color:#79684a}.divider{border-top:1px solid #c6a571;margin:2px 0}.progress{height:6px;background:#dac69b;margin-top:6px}.progress i{display:block;height:100%;background:#5a7a55;width:65%}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.badge{padding:2px 6px;background:#dce6c3;font-size:11px;color:#3b5b3c}.trophies{display:grid;grid-template-columns:repeat(5,1fr);text-align:center;gap:4px}.trophies img{width:48px;height:48px;object-fit:contain;margin:auto}.trophies span{font-size:11px}.node{border-left:3px solid #517453}.node img{width:40px;height:40px}.heroicon{width:64px;height:64px;object-fit:contain}.shelf{padding:12px;background:#e8d5ac;border-bottom:5px solid #856443}.stat{font-size:26px;font-family:Georgia;color:#385c43}.modal{position:absolute;inset:0;background:#162c25bb;z-index:100;display:flex;align-items:center;padding:20px}.modal .card{width:100%;padding:18px;display:grid;gap:12px}.modal[hidden]{display:none}.footer-note{padding:12px;font-size:11px;color:#766347}.screen-note{border-left:3px solid #ac8b55;padding:6px 8px;background:#eadab9;font-size:12px}.stage{max-height:220px;overflow:hidden}.stage>img:first-child{max-height:220px;object-fit:cover}.species-room{margin:-12px -12px 0;position:relative}.species-room>img:not(.animal){width:100%;aspect-ratio:16/9}.species-room .animal{height:auto;aspect-ratio:auto;position:absolute;width:64px;bottom:12%;left:23%}.species-room .animal.second{left:65%;bottom:8%}.tabs .btn{padding:6px}.review-flag{position:absolute;bottom:10px;right:8px;background:#203f35dd;color:#eddfbd;padding:3px 6px;font-size:10px}.muted{line-height:1.6}button{touch-action:manipulation}@media(min-width:641px){body{padding:24px}.phone{height:844px;border:3px solid #172e27;max-width:390px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
'''
css+=Path(__file__).with_name('sales.css').read_text('utf-8')
for sheet in (rabbit_dir/'view.css',here/'dot-research.css',here/'dot-flows.css',here/'fixed-list.css'):
 css+=sheet.read_text('utf-8')
js=r'''
__SHOP_PROGRESSION__
const previewResearchBenefit=(()=>{__RESEARCH_EFFECTS__
return researchBenefit;})();
const shopRules=__SHOP_RULES__;
const careCatalog=__CARE_CATALOG__;
const mixedOffspring=__MIXED_RULE__;
__FEATURE_DOORS__
const serviceNotes={review:'选一项特征重新抽标签，比如「好奇」可能变成「温顺」。评分不变，每只动物最多用 3 张。',guide:'配对前选一项父母评分不同的特征。这一窝每只幼体有 80% 的机会按较高分起算，最后的评分还可能升降。'};
const names={home:'店铺',rooms:'动物房间',breed:'繁育台',profile:'动物档案',orders:'普通订单',market:'自由市场',lab:'研究所',guest:'特殊来客',decor:'店内装饰',show:'比赛',collection:'奖杯收集册',research:'研究技能树',items:'养成道具',result:'比赛结果',birth:'繁育完成',login:'账号',payment:'模拟支付',cancelshop:'额外取消次数'};
const img=(k,c='thumb')=>`<img src="${A[k]||A['ui-decor']}" class="${c}" alt="${k}">`;
const b=(t,g='',primary=false)=>`<button class="btn ${primary?'primary':''}" ${g?`data-go="${g}"`:`data-demo="${t}"`}>${t}</button>`;
const card=(t,s='',tail='')=>`<div class="card stack"><div class="spread"><b>${t}</b>${tail}</div>${s}</div>`;
const pet=(k,n,sub,g='profile')=>`<button class="item" data-go="${g}">${img(k)}<span class="itemtxt"><strong>${n}</strong><small>${sub}</small></span><span class="chev">›</span></button>`;
const title=(t,s='')=>`<div class="sectionhead">${t}<small>${s}</small></div>`;
const banner=(k,t)=>`<div class="banner">${img(k,'')}<span>${t}</span></div>`;
const note=t=>`<div class="screen-note">${t}</div>`;
const trophies=()=>`<div class="trophies">${['memorial','bronze','silver','gold','laurel'].map((k,i)=>`<div>${img('trophy-'+k+'-192-v2','')}<span>${['纪念','铜','银','金','桂冠'][i]}</span></div>`).join('')}</div>`;
let species='兔';
function scene(mini=false){return `<div class="shop-scene"><div class="scene-plane">${img('shop-interior','scene-backdrop')}<div class="keeper">${img('shopkeeper','')}<span>店长</span></div>${mini?'':'<div class="bubble">先看看进门的人需要什么。</div>'}${(mini?[]:shopEntrances.filter(e=>e.area)).map(({key,page,label,area:[x,y,w,h]})=>`<button class="scene-target" data-shop-door="${key}" data-go="${page}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%"><span>${label}</span></button>`).join('')}</div></div>`}
__SALES__
const pages={cancelshop:()=>`${title('补充额外取消次数','金币购买 · 确认示例')}${card('额外取消次数 ×1','<p>基准 300 金币 · 示例实付 300 金币</p><small>每日最多购买 3 次，当前还可购买 3 次。<br>当前持有 0 / 99；购买后的未用次数保留。</small>')}${note('优先使用每日免费 3 次。免费次数耗尽后，使用额外次数仍需确认，不自动购买。')}${b('确认示例 · 300 金币','',true)}${b('返回普通订单','orders')}${note('只是静态确认 UI，不扣金币、不增加次数。')}`,birth:()=>`${banner('rabbit-room','培育完成')}${title('新的一窝出生了','结果示例')}${pet('spot','小芽','幼年 · 未繁育')}${pet('spot','团团','幼年 · 未繁育')}${title('亲本仍在房间')}${pet('angora','梨花','成年 · 已繁育 1/1')}${pet('brown','阿栗','成年 · 已繁育 1/1')}${note('亲本不会因繁育死亡；每只一生只能繁育一次。')}${b('返回动物房间','rooms',true)}`,
home:scene,
rooms:()=>RoomBook.render(),roomsell:()=>RoomBook.sell(),roombreed:()=>RoomBook.breed(),
orderfulfill:()=>title(saleChannels[saleState.channel]?.title||'普通委托')+salePanel(saleState.channel),guestfulfill:()=>title('林女士的委托')+salePanel('guest'),
breed:()=>`${title('兔房 · 选择亲本','已选 2 / 2')}<div class="slots"><div class="slot">${img('angora')}<b>梨花 · 雌</b><small>成年 · 未繁育</small></div><b class="plus">×</b><div class="slot">${img('brown')}<b>阿栗 · 雄</b><small>成年 · 未繁育</small></div></div>${note('每只动物一生可繁育一次。完成后亲本仍然存活，普通售价按未繁育价值的 20% 计算。')}${card('选育指导',`<div class="row">${img('item-breeding-guidance-192-v2')}<div><b>选育指导单</b><p class="muted">${serviceNotes.guide}</p></div></div>`,'<button class="btn" data-dot="service" data-key="guide">选择指导单</button>')}${card('确认培育',`<p class="muted">预计 2 分钟完成 · 本房同时培育 1 窝</p>${b('查看完成效果','birth',true)}`)}${note('此处只展示确认流程，不扣道具、不生成动物。')}`,
profile:saleProfile,
orders:saleOrders,
market:saleMarket,
lab:saleLab,
laboffer:()=>title('本批幼体 · 安哥拉兔')+card('安哥拉兔 · '+saleState.offerSex+' · 幼年','<div class="row">'+img('angora','heroicon')+'<span>研究所种源货位</span></div>')+b('查看购买确认'),
guest:saleGuest,
show:()=>`<div class="stage">${img('stage','')}${img('angora','onstage')}</div><div class="tabs">${b('私人赛')}${b('公开赛')}${b('奖杯册','collection',true)}</div>${card('私人赛 · 今日主题','<p>每天三场可选，本轮只能报名一次。</p><small>20:00 开放 · 次日 18:00 截止 · 20:00 出结果</small>', '<span class="pill">28 场循环</span>')}${card('公开赛 · 本周主题','<p>免费报名 · 按物种分榜</p><small>周一 20:00—周五 18:00 报名<br>周六 20:00 比赛奖励，周日 20:00 排名奖励</small>','<span class="pill">12 场循环</span>')}${note('报名保存动物当时状态，不锁定动物。之后出售、死亡或繁育均不影响奖励与奖杯。')}<div class="grid2">${b('选择报名动物','profile',true)}${b('查看结果示例','result')}</div>`,
collection:()=>`<div class="row">${img('collection-book-192-v2','heroicon')}<div><h3>小店的荣誉</h3><p class="muted">永久收集 · 首获动物留念</p></div></div><div class="tabs">${b('私人赛 · 28')}${b('公开赛 · 12')}</div>${card('公开赛奖杯档位',trophies())}${card('本场已收藏',`<div class="row">${img('trophy-gold-192-v2','heroicon')}<div><h3>金奖</h3><p class="muted">首次获奖：小花 · 安哥拉兔<br>同档累计：2 次</p></div></div><p class="smallnote">首获动物离店后，本记录仍永久保存。</p>`)}${card('店铺收益',`<b class="stat">+4%</b><p class="muted">该公开赛最高奖杯档位生效；金银铜不叠加。</p>`)}${note('高档解锁低档奖励，但不会补发低档奖杯。空位需实际获得对应档位。')}`,
items:()=>title('研究所用品')+[['review','item-trait-review-192-v2','特征复评单'],['guide','item-breeding-guidance-192-v2','选育指导单']].map(([key,art,name])=>card(name,'<div class="row">'+img(art,'heroicon')+'<p>'+serviceNotes[key]+'</p></div><button class="btn" data-dot="service" data-key="'+key+'">查看使用确认</button>')).join(''),
decor:()=>`${title('装饰小铺','固定位置 · 可摆放或收起')}<div class="shop-miniature" style="height:250px">${scene(true)}</div>${[['fence','蕨叶矮篱','80'],['lamp','琥珀台灯','60'],['decor-plant-192-v2','窗边绿植','100'],['decor-rug-192-v2','织纹地毯','120']].map(([k,n,p])=>card(n,`<div class="spread">${img(k)}<span>${p} 金币 · 展示价格</span>${b('预览摆放')}</div>`)).join('')}`,
result:()=>`${title('公开赛 · 结果示例','本地机器人比赛')}${card('小花获得金奖',`<div class="row">${img('trophy-gold-192-v2','heroicon')}<div><h3>87.26 分</h3><p class="muted">按报名时快照评分</p></div></div>`)}${trophies()}${card('奖励档位名单',`<div class="table">${['桂冠|松风店|机器人','金奖|你的小店|小花','银奖|林间店|机器人','铜奖|青石店|机器人','纪念|南街店|机器人'].map(x=>`<div class="spread divider">${x.split('|').map(t=>'<span>'+t+'</span>').join('')}</div>`).join('')}</div>`)}${note('名单、分数与名次均为界面示例，不代表真实对局或已验证平衡。')}<div class="grid2">${b('查看奖杯册','collection',true)}${b('返回比赛','show')}</div>`,
login:()=>`${img('opening','opening')}${title('小店账号')}${card('本地展示模式','<p>当前没有连接账号或服务器。</p><small>仅供查看美术与界面，不保存真实玩家数据。</small>')}${b('奖杯收藏册','collection')}${b('模拟支付界面','payment')}`,
payment:()=>`${title('模拟支付','客户端流程展示')}${note('没有真实收费，不调用支付服务，不发放游戏资产。商品与价格暂不定稿。')}${card('商业化商品占位','<p>商品内容与人民币价格尚未定稿。</p><small>这里只演示支付确认与结果状态，不影响金币购买取消次数的规则。</small>')}${b('预览支付确认','',true)}<div class="grid2">${b('展示成功状态')}${b('展示失败状态')}</div><div class="grid2">${b('展示处理中')}${b('展示取消状态')}</div>`
};
let displayedPage='';
__LATEST_UI_MODULES__
RabbitUI.install(pages,names);
DotFlows.install(pages,names);
pages.research=DotResearch.render;
const renderServices=pages.items;
pages.items=()=>labTabs('items')+renderServices();
let rabbitView=null;
__NAVIGATION__
function show(k,keepScroll=false,mode='forward',args={}){previewNav.open(k,keepScroll,mode,args);}
function goBack(){previewNav.back();}
function renderPreview(k,scrollTop){
 displayedPage=k;
 RoomBook.settleExamples(Date.now());
 const isShop=k==='home'||k==='firstday';
 document.querySelector('.phone').classList.toggle('in-shop',isShop);
 document.querySelector('#pagetitle').textContent=({rooms:species+'房',roomsell:'出售动物',roombreed:species+'繁育台',orderfulfill:'订单交付',guestfulfill:'来客交付',laboffer:'种源详情'})[k]||names[k];
 document.querySelector('#screen').innerHTML=pages[k]();
 const trial=RabbitUI.pagesHere(k)||(k==='rooms'&&RoomBook.isTrial()), trialState=(trial||previewNav.trialShop&&['show','result','collection','lab'].includes(k))?RabbitDemo.read():null;
 document.querySelector('.wallet').textContent='金币 '+(trialState?trialState.coins:saleState.coins);
 document.querySelector('.demo-bar span').textContent=trial?(trialState.mode==='shop'?'首日试养 · 本机暂存':'20只名册 · 独立样例'):'宠物店 · 界面预览';
 const status=document.querySelector('#home-extras .home-status');
 if(isShop){
   const p=featureDoors.progress();
   const xp=p.level===p.maxLevel?'累计经验 '+p.total:'经验 '+p.intoLevel+' / '+p.toNext;
   const openOrders=Object.keys(saleChannels).filter(id=>saleChannels[id].order&&!saleState.closed.has(id)).length;
   const activity=k==='firstday'?(trialState.canClaim?'今日签到待领取':'今日已签到'):p.level>=shopRules.featureLevels.orders?openOrders+' 笔委托':'营业中';
   status.innerHTML='<span class="store-progress"><strong>店铺 '+p.level+' 级</strong><small>'+xp+'</small><small>'+activity+'</small></span>'+
     '<button class="rb-entry" data-go="'+(k==='firstday'?'rabbitroom':'rooms')+'">进入兔房</button>'+
     (k==='firstday'?'':'<button class="rb-entry" data-go="firstday">首日试养</button>');
 }
 if(isShop)status.insertAdjacentHTML('beforeend','<button class="rb-entry" data-go="collection">奖杯收藏册</button>');
 document.querySelector('#home-extras').hidden=!isShop;
 document.querySelector('#back').hidden=isShop;
 document.querySelector('#back').textContent='返回';
 document.querySelector('#jump').value=k;
 featureDoors.decorate(document.querySelector('#screen'));
 if(isShop)featureDoors.decorate(status);
 splitPreviewList(k);
 mountRoomMotion(document.querySelector('#screen'),k==='rooms'?species:'兔');
 listScroller().scrollTop=scrollTop;
 refreshSaleCount();
 rabbitView=trial?RabbitUI.remember():null;
 refreshBreedingClocks();
 saveExample();
}
window.addEventListener('pagehide',saveExample);
document.querySelector('#sale-review').addEventListener('close',event=>{if(!event.target.open)saleState.pending=null;});
document.querySelector('#jump').innerHTML=Object.entries(names).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');document.querySelector('#jump').onchange=e=>{show(e.target.value,false,'jump');};
document.addEventListener('click',e=>{let el=e.target.closest('button');if(!el)return;if(el.id==='back'||el.matches('[data-nav-close]')){goBack();return;}if(el.dataset.pair){RoomBook.handlePair(el);return;}if(el.hasAttribute('data-rabbit'))return RabbitUI.handle(el);if(el.hasAttribute('data-research'))return DotResearch.handle(el);if(el.hasAttribute('data-dot'))return DotFlows.handle(el);if(el.dataset.sale)handleSaleButton(el);else if(el.dataset.go)show(el.dataset.go);else if(el.dataset.species){RoomBook.switchTo(el.dataset.species);show('rooms')}else if(el.dataset.demo){document.querySelector('#modal-title').textContent=el.dataset.demo;document.querySelector('#modal-copy').textContent=el.dataset.demo==='展示处理中'?'模拟支付处理中：只展示等待状态，不发起任何网络请求；可以关闭返回。':el.dataset.demo==='展示成功状态'?'模拟支付成功：仅显示客户端结果，没有扣款，也没有金币或道具到账。':el.dataset.demo==='展示失败状态'?'模拟支付失败：未扣款。可返回商品界面后重试。':el.dataset.demo==='展示取消状态'?'已取消模拟支付：未扣款，未发放资产。':'这是界面确认状态示例，不扣金币、道具或次数，也不改变动物与存档。';document.querySelector('#modal').hidden=false;document.querySelector('#close').focus();}else if(el.id==='close')goBack();});function refreshBreedingClocks(){RabbitUI.tick();RoomBook.tick();}
setInterval(refreshBreedingClocks,500);
window.addEventListener('pageshow',refreshBreedingClocks);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshBreedingClocks();});
previewNav.initial(location.hash.slice(1)||'home');
'''
progress_dir=root/'PetShop'/'server'
js=js.replace('__SHOP_PROGRESSION__',re.sub(r'^export ', '', (progress_dir/'shop-progression.mjs').read_text('utf-8'),flags=re.M))
js=js.replace('__RESEARCH_EFFECTS__',re.sub(r'^export ', '', (progress_dir/'research-effects.mjs').read_text('utf-8'),flags=re.M))
js=js.replace('__SHOP_RULES__',json.dumps(json.loads((progress_dir/'shop-feature-levels.json').read_text('utf-8')),separators=(',',':')))
js=js.replace('__MIXED_RULE__',care.pop('mixedRule')).replace('__CARE_CATALOG__',json.dumps(care,separators=(',',':')))
js=js.replace('__FEATURE_DOORS__',(here/'feature-doors.js').read_text('utf-8'))
js=js.replace('__NAVIGATION__',(here/'navigation.js').read_text('utf-8'))
js=js.replace('__SALES__',Path(__file__).with_name('sales.js').read_text('utf-8'))
js=js.replace('__LATEST_UI_MODULES__','\n'.join(p.read_text('utf-8') for p in (
 here.parent/'pet-motion.js',here/'room-motion.js',rabbit_dir/'state.js',rabbit_dir/'view.js',here/'dot-research.js',here/'race-registration.js',here/'dot-flows.js',here/'room-book.js',here/'fixed-list.js')))
html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>宠物店 · 美术与UI整体演示</title><style>'+css+'</style><body><div class="workspace"><main class="phone"><div class="demo-bar"><span>美术与 UI · 独立场景样例</span><select id="jump" aria-label="页面导航"></select></div><header class="top"><button class="back" id="back" data-go="home">店铺</button><div class="brand"><h2 id="pagetitle"></h2></div><div class="wallet">金币 680</div></header><div class="notice-anchor"><div id="rb-notice" role="status" aria-live="polite"></div></div><div class="scroll"><div class="content" id="screen"></div></div><div id="home-extras"><div class="home-status"><span>午后 · 营业中</span><span>今日待办：2 笔订单</span></div></div><dialog id="sale-review" aria-labelledby="review-title"><div class="spread"><h3 id="review-title"></h3><button type="button" class="rb-text" data-nav-close>关闭</button></div><div class="sale-lines"></div><strong class="sale-total"></strong><p class="sale-warning" hidden></p><div class="grid2"><button type="button" class="btn" data-sale="edit" autofocus>修改选择</button><button type="button" class="btn primary" data-sale="commit"></button></div></dialog><div id="modal" class="modal" hidden><div class="card"><h3 id="modal-title"></h3><p id="modal-copy">这是界面确认状态示例，不扣金币、道具或次数，也不改变动物与存档。</p><p class="muted">后续制作时按已确定设计接入；本轮只检查美术和 UI。</p><button class="btn primary" id="close">知道了，返回</button></div></div></main></div><script>const A='+json.dumps(assets,ensure_ascii=True)+';'+js+'</script></body></html>'
for target in (out,root/'手机预览'/'dist'/'ui-v3'):
 target.mkdir(parents=True,exist_ok=True)
 (target/'index.html').write_text(html,'utf-8')
print(out,len(html),len(assets))
