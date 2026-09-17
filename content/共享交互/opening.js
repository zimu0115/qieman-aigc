(() => {
  const body = document.body;
  const main = document.querySelector('main');
  const cover = main?.querySelector(':scope > #overview, :scope > .syllabus-hero');
  const under = cover?.nextElementSibling;
  if (!cover || !under) return;
  const header = document.querySelector('.top');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const proposal = body.classList.contains('editorial');
  const stage = document.createElement('div');
  const bed = document.createElement('div');
  const panel = document.createElement('div');
  const fit = document.createElement('div');
  const underlay = document.createElement('div');
  stage.className = 'curtain-stage';
  bed.className = 'curtain-bed';
  panel.className = 'curtain-cover-panel';
  fit.className = 'curtain-cover-fit';
  underlay.className = 'curtain-underlay';
  cover.before(stage);
  fit.append(cover); panel.append(fit); underlay.append(under);
  bed.append(panel, underlay); stage.append(bed);
  body.classList.add('opening-active');
  body.classList.toggle('opening-proposal', proposal);

  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => { const t = clamp(n); return 1 - Math.pow(1 - t, 4); };
  const GESTURE_GAP = 240;
  const DURATION = 940;
  let height = 1, start = 0, position = 0, state = 'closed';
  let frame = 0, layoutFrame = 0, animation = null, measured = false;
  let lastWheel = -Infinity, wheelBlocked = false, lastScroll = scrollY;
  let boundaryTime = -Infinity, touch = null;
  let printing = false, paused = preference.matches || body.classList.contains('present');
  body.classList.toggle('opening-paused', paused);

  const bodyTop = () => Math.max(0, start + height);
  const atBodyTop = () => scrollY <= bodyTop() + 2;
  const moving = () => state === 'opening' || state === 'closing';
  function jump(top) {
    lastScroll = Math.max(0, top);
    scrollTo({top:lastScroll, behavior:'instant'});
  }
  function announce() { dispatchEvent(new Event('aigc-opening-change')); }
  function draw() {
    panel.style.setProperty('--cover-lift', (-position * height) + 'px');
    underlay.style.setProperty('--opening-scale', (.94 + .06 * position).toFixed(5));
    underlay.style.setProperty('--opening-blur', ((1 - position) * 9).toFixed(3) + 'px');
    underlay.classList.toggle('is-opening-clear', position === 1 || paused);
    panel.inert = !paused && state !== 'closed';
    underlay.inert = !paused && state !== 'open';
    stage.dataset.openingState = state;
    body.classList.toggle('opening-transition', !paused && moving());
  }
  function measure() {
    layoutFrame = 0;
    if (body.classList.contains('present') || printing) return;
    const previousTop = bodyTop();
    const offset = Math.max(0, scrollY - previousTop);
    const headerHeight = header?.offsetHeight || 0;
    height = Math.max(1, innerHeight - headerHeight);
    stage.style.setProperty('--opening-header', headerHeight + 'px');
    stage.style.setProperty('--opening-height', height + 'px');
    start = stage.getBoundingClientRect().top + scrollY - headerHeight;
    const fitHeight = Math.max(1, fit.offsetHeight);
    const scale = Math.min(1, Math.max(1, height - 20) / fitHeight);
    stage.style.setProperty('--opening-fit', scale.toFixed(5));
    // The extra viewport is a hidden scroll spacer, not a gesture distance.
    stage.style.height = (Math.max(height, underlay.offsetHeight) + height) + 'px';
    if (!paused && measured) {
      if (moving()) jump(state === 'opening' ? start : bodyTop());
      else if (state === 'open' && Math.abs(previousTop - bodyTop()) > .5) jump(bodyTop() + offset);
      else if (state === 'closed') jump(start);
    }
    measured = true;
    draw();
  }
  function scheduleMeasure() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(measure);
  }
  function settle(open, guard = true) {
    cancelAnimationFrame(frame);
    frame = 0; animation = null;
    state = open ? 'open' : 'closed';
    position = open ? 1 : 0;
    draw();
    jump(open ? bodyTop() : start);
    if (guard) {
      // Consume the triggering wheel burst, including momentum after the curtain stops.
      wheelBlocked = true;
      lastWheel = performance.now();
      boundaryTime = lastWheel;
    }
    announce();
  }
  function transition(open, after) {
    if (paused || moving()) return;
    if ((state === 'open') === open) { after?.(); return; }
    state = open ? 'opening' : 'closing';
    wheelBlocked = true;
    if (touch) touch.consumed = true;
    // Pin the first section throughout. Change spacer position only at the endpoint.
    jump(open ? start : bodyTop());
    animation = {from:position, to:open ? 1 : 0, began:performance.now(), after};
    draw(); announce();
    frame = requestAnimationFrame(animate);
  }
  function animate(time) {
    frame = 0;
    if (!animation || paused) return;
    const progress = clamp((time - animation.began) / DURATION);
    position = animation.from + (animation.to - animation.from) * ease(progress);
    draw();
    if (progress < 1) frame = requestAnimationFrame(animate);
    else {
      const {to, after} = animation;
      settle(to === 1);
      after?.();
    }
  }
  function stopAtBodyTop() {
    boundaryTime = performance.now();
    wheelBlocked = true;
    if (touch) touch.consumed = true;
    jump(bodyTop());
  }
  function onScroll() {
    if (paused) { lastScroll = scrollY; return; }
    if (moving()) {
      const hold = state === 'opening' ? Math.max(0, start) : bodyTop();
      if (Math.abs(scrollY - hold) > .5) jump(hold);
      return;
    }
    if (state === 'open') {
      if (scrollY < bodyTop() - .5 || (lastScroll > bodyTop() + 2 && atBodyTop())) stopAtBodyTop();
    } else if (scrollY > start + 2) {
      // Explicit navigation/scrollbar movement can enter the body without a half-open cover.
      if (scrollY >= bodyTop() - 2) {
        state = 'open'; position = 1; draw(); announce();
      } else transition(true);
    }
    lastScroll = scrollY;
  }

  function nestedScroll(target, delta) {
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return true;
    for (let node = target instanceof Element ? target : target?.parentElement;
         node && node !== body && node !== document.documentElement; node = node.parentElement) {
      if (node.isContentEditable || node.matches('textarea,select')) return true;
      const style = getComputedStyle(node);
      if (!/(auto|scroll)/.test(style.overflowY) || node.scrollHeight <= node.clientHeight + 1) continue;
      if (delta < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
    }
    return false;
  }
  addEventListener('wheel', event => {
    if (paused || event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    if (!moving() && nestedScroll(event.target, delta)) return;
    const now = performance.now();
    const fresh = now - lastWheel > GESTURE_GAP;
    lastWheel = now;
    if (moving()) { event.preventDefault(); return; }
    if (fresh) wheelBlocked = false;
    if (wheelBlocked) { event.preventDefault(); return; }
    if (state === 'closed') {
      event.preventDefault();
      if (delta > 0) transition(true);
    } else if (delta < 0) {
      if (atBodyTop()) {
        event.preventDefault();
        // Arriving at the boundary and closing the cover must be separate gestures.
        if (fresh && now - boundaryTime > GESTURE_GAP) transition(false);
        else wheelBlocked = true;
      } else if (scrollY + delta <= bodyTop() + 2) {
        event.preventDefault(); stopAtBodyTop();
      }
    }
  }, {passive:false});

  addEventListener('touchstart', event => {
    if (paused || event.touches.length !== 1) { touch = null; return; }
    const point = event.touches[0];
    touch = {x:point.clientX, y:point.clientY, lastY:point.clientY,
      beganAtTop:state === 'open' && atBodyTop(), consumed:moving()};
  }, {passive:true});
  addEventListener('touchmove', event => {
    if (paused || !touch || event.touches.length !== 1) return;
    const point = event.touches[0];
    const delta = touch.lastY - point.clientY;
    const total = touch.y - point.clientY;
    touch.lastY = point.clientY;
    if (moving() || touch.consumed) { event.preventDefault(); return; }
    if (Math.abs(point.clientX - touch.x) > Math.abs(total) || nestedScroll(event.target, delta)) return;
    if (state === 'closed') {
      event.preventDefault();
      if (total > 12) transition(true);
    } else if (delta < 0) {
      if (atBodyTop()) {
        event.preventDefault();
        if (touch.beganAtTop && total < -12) transition(false);
        else if (!touch.beganAtTop) touch.consumed = true;
      } else if (scrollY + delta <= bodyTop() + 2) {
        event.preventDefault(); stopAtBodyTop();
      }
    }
  }, {passive:false});
  addEventListener('touchend', () => { touch = null; }, {passive:true});
  addEventListener('touchcancel', () => { touch = null; }, {passive:true});

  document.addEventListener('keydown', event => {
    if (paused || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"],dialog[open]')) return;
    if (event.key === ' ' && event.target.closest('button,a,summary')) return;
    const up = ['ArrowUp','PageUp','Home'].includes(event.key) || (event.key === ' ' && event.shiftKey);
    const down = ['ArrowDown','PageDown','End'].includes(event.key) || (event.key === ' ' && !event.shiftKey);
    if (!up && !down) return;
    if (nestedScroll(event.target, up ? -1 : 1)) return;
    if (moving()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (state === 'closed') {
      event.preventDefault();
      if (down && !event.repeat) transition(true);
    } else if (up) {
      if (atBodyTop()) {
        event.preventDefault();
        if (!event.repeat) transition(false);
      } else {
        const distance = event.key === 'ArrowUp' ? 40 : height * .9;
        if (event.key === 'Home' || scrollY - distance <= bodyTop() + 2) {
          event.preventDefault(); stopAtBodyTop();
        }
      }
    }
  }, true);

  window.AIGCOpening = {
    cover, under,
    ownsFloor(element) {
      return !paused && (element === cover || (element === under && state !== 'open'));
    },
    isCoverDominant() { return !paused && position < .65; }
  };

  function localOffset(element) {
    let y = 0;
    for (let node = element; node; node = node.offsetParent) y += node.offsetTop;
    return y;
  }
  function targetPosition(target) {
    const top = under === target || under.contains(target)
      ? bodyTop() + localOffset(target) - localOffset(under)
      : localOffset(target) - (header?.offsetHeight || 0);
    return Math.max(bodyTop(), top);
  }
  function openingAnchor(target, instant = false) {
    if (paused || !main.contains(target)) return false;
    if (moving()) return true;
    if (cover === target || cover.contains(target)) {
      if (instant) settle(false, false);
      else if (state === 'closed') jump(start);
      else transition(false);
      return true;
    }
    if (under === target || under.contains(target) || state === 'closed') {
      const go = () => scrollTo({top:targetPosition(target), behavior:instant ? 'instant' : 'smooth'});
      if (instant) { settle(true, false); go(); }
      else if (state === 'closed') transition(true, go);
      else go();
      return true;
    }
    return false;
  }
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(decodeURIComponent(anchor.hash.slice(1)));
    if (target && openingAnchor(target)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  function hashRoute() {
    if (!location.hash) return;
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) openingAnchor(target, true);
  }
  function modeChanged() {
    const next = printing || preference.matches || body.classList.contains('present');
    if (next === paused) return;
    paused = next;
    body.classList.toggle('opening-paused', paused);
    if (paused) {
      cancelAnimationFrame(frame); frame = 0; animation = null;
      state = position >= .5 ? 'open' : 'closed'; position = state === 'open' ? 1 : 0;
    }
    draw(); scheduleMeasure(); announce();
  }
  new MutationObserver(modeChanged).observe(body, {attributes:true, attributeFilter:['class']});
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleMeasure);
    if (header) observer.observe(header);
    observer.observe(fit); observer.observe(underlay);
  }
  addEventListener('scroll', onScroll, {passive:true});
  addEventListener('resize', scheduleMeasure, {passive:true});
  addEventListener('pageshow', () => {
    if (!paused && !moving()) {
      if (scrollY > start + 2) { state = 'open'; position = 1; }
      draw();
    }
    scheduleMeasure();
  });
  addEventListener('hashchange', hashRoute);
  preference.addEventListener('change', modeChanged);
  addEventListener('beforeprint', () => { printing = true; modeChanged(); });
  addEventListener('afterprint', () => { printing = false; modeChanged(); });
  document.fonts?.ready.then(scheduleMeasure);
  measure();
  if (!paused && scrollY > start + 2) { state = 'open'; position = 1; draw(); }
  hashRoute();
  if (!paused && state === 'open' && !moving() && scrollY < bodyTop()) jump(bodyTop());
})();
