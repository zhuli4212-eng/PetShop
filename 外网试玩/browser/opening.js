export function playOpening(opening, login) {
  const stage = opening.querySelector('.intro-stage');
  const caption = opening.querySelector('.intro-cap');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timers = [];
  let finished = false;

  function placeAnimals() {
    const image = stage.querySelector('.intro-bg');
    if (!image.naturalWidth || !image.naturalHeight) return;
    const {width,height} = stage.getBoundingClientRect();
    const scale = Math.max(width/image.naturalWidth,height/image.naturalHeight);
    const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    const wide=image.currentSrc.includes('wide');
    const animals=stage.querySelector('.intro-animals');
    animals.style.left=((width-w)/2+w*(wide ? .55 : .62))+'px';
    animals.style.top=((height-h)*.2+h*(wide ? .84 : .635))+'px';
    const frame=stage.querySelector('.intro-pet img').naturalHeight;
    animals.style.setProperty('--pet-size',(frame*1.5*scale)+'px');
  }
  const resizeObserver=new ResizeObserver(placeAnimals);
  resizeObserver.observe(stage);
  stage.querySelector('.intro-bg').addEventListener('load',placeAnimals);

  function later(delay, action) {
    const timer = setTimeout(action, delay);
    timers.push(timer);
    return timer;
  }

  function subtitle(text) {
    caption.hidden = !text;
    caption.textContent = text;
    caption.classList.remove('intro-in');
    if (text) {
      void caption.offsetWidth;
      caption.classList.add('intro-in');
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    resizeObserver.disconnect();
    timers.forEach(clearTimeout);
    opening.classList.add('intro-out');
    setTimeout(() => {
      const restoreFocus = opening.contains(document.activeElement);
      opening.remove();
      login.inert = false;
      if (restoreFocus) login.querySelector('h1').focus({preventScroll:true});
    }, reducedMotion ? 0 : 800);
  }

  login.querySelector('h1').tabIndex = -1;
  login.inert = true;
  opening.querySelector('.intro-skip').addEventListener('click', finish);
  document.body.append(opening);

  const assetTimeout = later(2500, finish);
  Promise.all([...stage.querySelectorAll('img')].map(image => image.decode())).then(() => {
    if (finished) return;
    clearTimeout(assetTimeout);
    placeAnimals();
    if (reducedMotion) {
      stage.classList.add('intro-s-title');
      later(1600, finish);
      return;
    }
    stage.classList.add('intro-ready');
    later(200, () => stage.classList.add('intro-s-light'));
    later(2000, () => stage.classList.add('intro-s-rabbit'));
    later(3400, () => stage.classList.add('intro-s-letter'));
    later(4300, () => subtitle('街角的麦穗宠物店，'));
    later(5800, () => subtitle('今天换了新店主。'));
    later(7300, () => subtitle('店里的事，一件一件来就好。'));
    later(9200, () => {
      subtitle('');
      stage.classList.add('intro-s-title');
    });
    later(11800, finish);
  }).catch(finish);
}
