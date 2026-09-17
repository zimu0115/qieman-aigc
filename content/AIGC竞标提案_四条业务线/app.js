(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const pages = $$('[data-slide]');
  const header = $('.top');
  const nav = $$('.chapter-nav a');
  let pageIndex = 0, presenting = false, savedScroll = 0;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $$('[data-theme-button]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeButton === theme)));
    try { localStorage.setItem('aigc-proposal-theme', theme); } catch {}
  }
  try { const t = localStorage.getItem('aigc-proposal-theme'); if (['paper','dark','eye'].includes(t)) setTheme(t); } catch {}
  $$('[data-theme-button]').forEach(b => b.onclick = () => setTheme(b.dataset.themeButton));
  function sizeStage() {
    document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');
    if (!presenting) return;
    const active = pages[pageIndex];
    const h = $('main').clientHeight - 16;
    const scale = Math.min((innerWidth - 24) / 1280, h / Math.max(active.offsetHeight, 1), 1.5);
    active.style.setProperty('--stage-scale', scale);
  }
  function updatePage() {
    pages.forEach((p,i) => p.classList.toggle('is-current', i === pageIndex));
    $('#slide-counter').textContent = `${String(pageIndex + 1).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`;
    $('#slide-title').textContent = pages[pageIndex].dataset.title;
    $('#previous-slide').disabled = pageIndex === 0;
    $('#next-slide').disabled = pageIndex === pages.length - 1;
    const chapter = pages[pageIndex].dataset.chapter;
    nav.forEach(a => a.toggleAttribute('aria-current', a.dataset.chapterLink === chapter));
    $('.progress i').style.width = (pageIndex + 1) / pages.length * 100 + '%';
    requestAnimationFrame(sizeStage);
  }
  function movePage(n) { pageIndex = Math.max(0, Math.min(pages.length - 1, n)); updatePage(); }
  function togglePresent(force) {
    const next = typeof force === 'boolean' ? force : !presenting;
    if(next === presenting) return;
    if(next) {
      savedScroll = scrollY;
      let closest = Infinity;
      pages.forEach((p,i) => { const d=Math.abs(p.getBoundingClientRect().top-header.offsetHeight-24);if(d<closest){closest=d;pageIndex=i;} });
    }
    presenting = next;
    document.body.classList.toggle('present', presenting);
    $('#present-toggle').textContent = presenting ? '退出演讲' : '演讲模式';
    $('#present-toggle').setAttribute('aria-pressed', String(presenting));
    if(presenting) updatePage();
    else { scrollTo({top:savedScroll,behavior:'instant'}); updateScroll(); }
    sizeStage();
  }
  $('#present-toggle').onclick = () => togglePresent();
  $$('[data-start]').forEach(b => b.onclick = () => { togglePresent(true); movePage(0); });
  $('#previous-slide').onclick = () => movePage(pageIndex - 1);
  $('#next-slide').onclick = () => movePage(pageIndex + 1);
  $('#exit-present').onclick = () => togglePresent(false);
  $('#fullscreen').onclick = async () => {
    try { if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { $('#fullscreen').textContent='请用浏览器全屏'; }
  };
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if(!target) return;
    e.preventDefault();
    const page = target.matches('[data-slide]') ? target : target.closest('[data-slide]');
    if(presenting && page) movePage(pages.indexOf(page));
    else target.scrollIntoView({behavior:reduce()?'instant':'smooth',block:'start'});
  }));
  const dialog = $('#lightbox'), viewport = $('.lightbox-viewport'), fullImage = $('#full-image');
  let zoom = 0;
  function showEvidence(button) {
    const img = button.querySelector('img');
    $('#image-title').textContent = button.dataset.title || img.alt;
    $('#image-caption').textContent = button.dataset.caption || '';
    fullImage.src = img.src; fullImage.alt = img.alt;
    $('#original-image').href = img.src;
    fitImage();
    dialog.showModal();
  }
  function fitImage(){zoom=0;viewport.classList.remove('zoomed');fullImage.style.width='';fullImage.style.height='';viewport.scrollTop=0;viewport.scrollLeft=0;}
  $$('[data-evidence]').forEach(b => b.onclick = () => showEvidence(b));
  $('#close-lightbox').onclick = () => dialog.close();
  $('#fit-image').onclick = fitImage;
  $('#zoom-image').onclick = () => {
    zoom = Math.min(zoom + 1, 3);
    viewport.classList.add('zoomed');
    fullImage.style.width = Math.round((viewport.clientWidth - 36) * (zoom === 1 ? 1 : zoom === 2 ? 1.5 : 2)) + 'px';
    fullImage.style.height = 'auto';
  };
  dialog.addEventListener('click', e => { if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();} });
  $$('.image-tabs button').forEach(b => b.onclick = () => {
    const group = b.closest('[data-gallery]'), main = group.querySelector('.showcase [data-evidence]');
    const img = main.querySelector('img');
    img.src = b.dataset.src; img.alt = b.dataset.title;
    main.dataset.title = b.dataset.title; main.dataset.caption = b.dataset.caption;
    group.querySelector('.showcase figcaption strong').textContent = b.dataset.title;
    group.querySelector('.showcase figcaption span').textContent = b.dataset.caption;
    group.querySelectorAll('.image-tabs button').forEach(x => x.setAttribute('aria-pressed',String(x===b)));
  });
  document.addEventListener('keydown', e => {
    if(dialog.open) return;
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if(presenting) {
      if(['ArrowRight','PageDown'].includes(e.key)||(e.key===' '&&e.target===document.body)){e.preventDefault();movePage(pageIndex+1);}
      if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();movePage(pageIndex-1);}
      if(e.key==='Escape')togglePresent(false);
      if(e.key==='Home'){e.preventDefault();movePage(0);}
      if(e.key==='End'){e.preventDefault();movePage(pages.length-1);}
    }
  });
  function updateScroll(){
    if(presenting)return;
    let active=pages[0];
    if(!window.AIGCOpening?.isCoverDominant())for(const p of pages){if(p.getBoundingClientRect().top<header.offsetHeight+150)active=p;}
    nav.forEach(a=>a.toggleAttribute('aria-current',a.dataset.chapterLink===active.dataset.chapter));
    const max=document.documentElement.scrollHeight-innerHeight;
    $('.progress i').style.width=(max>0?scrollY/max*100:0)+'%';
  }
  let scheduled=false;
  addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{updateScroll();scheduled=false;});}},{passive:true});
  addEventListener('resize',sizeStage,{passive:true});
  document.addEventListener('fullscreenchange',sizeStage);
  if('ResizeObserver' in window){const ro=new ResizeObserver(sizeStage);ro.observe(header);pages.forEach(p=>ro.observe(p));}
  $$('img').forEach(img=>img.addEventListener('load',sizeStage));
  if(document.fonts)document.fonts.ready.then(sizeStage);
  sizeStage();updateScroll();
})();
