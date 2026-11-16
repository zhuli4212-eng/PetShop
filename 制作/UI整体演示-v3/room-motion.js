const roomMotion=createSceneMotion();
const residentSpots=[[26,79],[67,84],[47,94]];
// The older portraits are cropped to their silhouettes. Catalog portraits use a 96px canvas.
const croppedPortraits={angora:[69,74],brown:[54,66],spot:[48,52],cat:[73,70]};

function roomWalkArt(key,pet,still) {
  const sheet=A[key+'-walk'];
  if(!sheet||pet.stage==='已故'||pet.breeding||pet.breedStatus==='繁育中')return still;
  const [w,h]=croppedPortraits[key]||[96,96];
  const footMargin=croppedPortraits[key]?2:6;
  const metrics='--portrait-aspect:'+(w/h)+';--cycle-width:'+(9600/w)+'%;--foot-margin:'+(footMargin*100/h)+'%';
  const stage=['幼年','成长','成年','老年'].indexOf(pet.stage);
  return '<span class="rb-floor-pose rb-age-'+stage+'" aria-hidden="true" style="'+metrics+'"><span class="rb-floor-body">'+
    '<img class="rest-sprite" src="'+A[key]+'" alt="" draggable="false">'+
    '<i class="walk-cycle" style="background-image:url('+sheet+')"></i></span></span>';
}

function mountRoomMotion(screen,kind) {
  const live=[];
  screen.querySelectorAll('.rb-resident').forEach((button,slot)=>{
    if(!button.querySelector('.walk-cycle'))return;
    const id=button.dataset.val||button.dataset.key;
    const [x,y]=residentSpots[slot];
    Object.assign(button.dataset,{walker:id,slot,x,y,zone:kind+slot});
    live.push({id});
  });
  roomMotion.mount(screen,kind,live);
}
