(() => {
  const body = document.body;
  const header = document.querySelector('.top');
  const proposal = body.classList.contains('editorial');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.querySelector('main') || document.querySelector('.main');
  let elements = proposal ? [...document.querySelectorAll('[data-slide]')] : [];
  if (!proposal && root) {
    [...root.children].forEach(element => {
      if (element.matches('script,style,template,footer,nav')) return;
      const blocks = [...element.querySelectorAll('.block')].filter(block => !block.parentElement.closest('.block'));
      if (blocks.length) {
        elements.push(...[...element.children].filter(child => child.matches('h2,.lead,.flag,.callout')), ...blocks);
      } else elements.push(element);
    });
  }
  elements = [...new Set(elements)].filter(element => !element.matches('.curtain-stage'));
  const opening = window.AIGCOpening;
  if (!proposal && opening) elements.unshift(opening.cover, opening.under);
  const floors = [...new Set(elements)].map(element => {
    if (!proposal) element.classList.add('motion-floor');
    return {element, self:!proposal, opacity:1, shift:0, targetOpacity:1, targetShift:0};
  });
  if (!floors.length) return;

  const clamp = value => Math.max(0, Math.min(1, value));
  // Zero slope at both ends makes entry and departure settle gently.
  const ease = value => {
    const t = clamp(value);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  let frame = 0, dirty = true, lastTime = 0, snapNext = true;
  let suspended = preference.matches || body.classList.contains('present');
  let printing = false;

  function requestMotion(snap = false) {
    dirty = true;
    snapNext ||= snap;
    if (!frame) frame = requestAnimationFrame(animateFloors);
  }

  function measureFloors() {
    const side = document.querySelector('.side-nav');
    const sideHeight = !proposal && innerWidth <= 960 && side && getComputedStyle(side).display !== 'none' ? side.offsetHeight : 0;
    const top = (header?.offsetHeight || 0) + sideHeight;
    const height = Math.max(1, innerHeight - top);
    const entryStart = innerHeight - height * .10;
    const entryEnd = innerHeight - height * .47;
    const exitStart = top + height * .28;
    const exitEnd = top - 20;
    const travel = innerWidth < 621 ? 72 : 120;
    const focused = document.activeElement;

    // Measure the stationary section, never its moving content.
    floors.forEach(floor => {
      if (suspended || opening?.ownsFloor(floor.element) || (floor.element.contains(focused) && focused.matches(':focus-visible'))) {
        floor.targetOpacity = 1;
        floor.targetShift = 0;
        return;
      }
      const measured = floor.element.getBoundingClientRect();
      const rect = {top:measured.top - (floor.self ? floor.shift : 0), bottom:measured.bottom - (floor.self ? floor.shift : 0)};
      const entering = ease((entryStart - rect.top) / (entryStart - entryEnd));
      const leaving = ease((exitStart - rect.bottom) / (exitStart - exitEnd));
      floor.targetOpacity = entering * (1 - leaving);
      floor.targetShift = (1 - entering) * travel - leaving * travel * .72;
    });
  }

  function animateFloors(time) {
    frame = 0;
    const dt = lastTime ? Math.min(time - lastTime, 64) : 16.67;
    lastTime = time;
    if (dirty) { measureFloors(); dirty = false; }
    // A three-times-longer response gives the larger movement a soft trailing feel.
    const blend = snapNext || suspended ? 1 : 1 - Math.exp(-dt / 240);
    let moving = false;
    floors.forEach(floor => {
      floor.opacity += (floor.targetOpacity - floor.opacity) * blend;
      floor.shift += (floor.targetShift - floor.shift) * blend;
      if (Math.abs(floor.targetOpacity - floor.opacity) < .001) floor.opacity = floor.targetOpacity;
      if (Math.abs(floor.targetShift - floor.shift) < .06) floor.shift = floor.targetShift;
      const unsettled = floor.opacity !== floor.targetOpacity || floor.shift !== floor.targetShift;
      moving ||= unsettled;
      floor.element.style.setProperty('--floor-opacity', floor.opacity.toFixed(4));
      floor.element.style.setProperty('--floor-shift', floor.shift.toFixed(2) + 'px');
      floor.element.toggleAttribute('data-motion-hidden', !suspended && floor.opacity < .01);
      floor.element.classList.toggle('is-motion-active', !suspended && floor.opacity > .001 && (unsettled || floor.opacity < .999));
    });
    snapNext = false;
    body.classList.add('motion-ready');
    if (moving) frame = requestAnimationFrame(animateFloors);
    else lastTime = 0;
  }

  addEventListener('scroll', () => requestMotion(), {passive:true});
  addEventListener('resize', () => requestMotion(), {passive:true});
  addEventListener('aigc-opening-change', () => requestMotion());
  addEventListener('pageshow', () => requestMotion(true));
  document.addEventListener('focusin', () => requestMotion(true));
  document.addEventListener('focusout', () => requestMotion());
  // Chapter links use the resting layout, not the temporary reveal displacement.
  if (!proposal) document.addEventListener('click', event => {
    const anchor = event.target.closest('.side-nav a[href^="#"],a[data-scroll][href^="#"]');
    if (!anchor || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(decodeURIComponent(anchor.hash.slice(1)));
    if (!target) return;
    const offset = floors.filter(floor => floor.self && (floor.element === target || floor.element.contains(target)))
      .reduce((total, floor) => total + floor.shift, 0);
    const side = document.querySelector('.side-nav');
    const sideHeight = innerWidth <= 960 && side && getComputedStyle(side).display !== 'none' ? side.offsetHeight : 0;
    event.preventDefault(); event.stopImmediatePropagation();
    scrollTo({top:Math.max(0, target.getBoundingClientRect().top + scrollY - offset - (header?.offsetHeight || 0) - sideHeight - 24),
      behavior:preference.matches ? 'instant' : 'smooth'});
  }, true);
  if ('ResizeObserver' in window) {
    const layoutObserver = new ResizeObserver(() => requestMotion());
    if (header) layoutObserver.observe(header);
    floors.forEach(floor => layoutObserver.observe(floor.element));
  }
  document.fonts?.ready.then(() => requestMotion());

  // Native details retain keyboard behavior and a no-JavaScript fallback.
  const drawers = [...document.querySelectorAll('details')].map(details => {
    const summary = details.querySelector(':scope > summary');
    if (!summary || !details.animate) return null;
    let content = details.querySelector(':scope > .details-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'motion-drawer-content';
      [...details.childNodes].filter(node => node !== summary).forEach(node => content.append(node));
      details.append(content);
    }
    let targetOpen = details.open, animation = null, contentAnimation = null, endpoint = 0;
    const originalHeight = details.style.height;
    details.classList.add('drawer-enhanced');

    function announce() {
      summary.setAttribute('aria-expanded', String(targetOpen));
      details.toggleAttribute('data-drawer-open', targetOpen);
    }
    function settle() {
      const oldAnimation = animation, oldContentAnimation = contentAnimation;
      animation = contentAnimation = null;
      details.open = targetOpen;
      details.style.height = originalHeight;
      details.classList.remove('drawer-animating');
      oldAnimation?.cancel();
      oldContentAnimation?.cancel();
      announce();
      requestMotion();
    }
    function closedHeight() {
      const style = getComputedStyle(details);
      return summary.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    }
    function move(open) {
      targetOpen = open;
      announce();
      if (preference.matches || printing || body.classList.contains('present')) { settle(); return; }

      const start = details.getBoundingClientRect().height;
      const wasOpen = details.open;
      const contentStyle = getComputedStyle(content);
      const startOpacity = wasOpen ? contentStyle.opacity : '0';
      const startTransform = wasOpen ? contentStyle.transform : 'translateY(-12px)';
      animation?.cancel();
      contentAnimation?.cancel();
      details.open = true;
      details.classList.add('drawer-animating');
      details.style.height = 'auto';
      endpoint = open ? details.getBoundingClientRect().height : closedHeight();
      details.style.height = start + 'px';
      const distance = Math.abs(endpoint - start);
      if (distance < 1) { settle(); return; }

      const duration = Math.min(open ? 490 : 410, (open ? 315 : 260) + Math.sqrt(distance) * 4.5);
      const current = details.animate([
        {height:start + 'px'}, {height:endpoint + 'px'}
      ], {duration, easing:'cubic-bezier(.22,1,.36,1)', fill:'both'});
      animation = current;
      contentAnimation = content.animate([
        {opacity:startOpacity, transform:startTransform},
        {opacity:open ? 1 : 0, transform:open ? 'translateY(0px)' : 'translateY(-12px)'}
      ], {duration:open ? duration * .9 : duration * .72, easing:'cubic-bezier(.22,.61,.36,1)', fill:'both'});
      current.onfinish = () => { if (animation === current) settle(); };
      requestMotion();
    }

    summary.addEventListener('click', event => {
      if (event.defaultPrevented || event.button > 0 || event.target.closest('a,button,input')) return;
      event.preventDefault();
      move(!targetOpen);
    });
    details.addEventListener('toggle', () => {
      if (animation) return;
      targetOpen = details.open;
      announce();
      requestMotion();
    });
    // Lazy images can change a drawer's natural height while it is opening.
    if ('ResizeObserver' in window) {
      const contentObserver = new ResizeObserver(() => {
        if (animation && targetOpen && Math.abs(closedHeight() + content.offsetHeight - endpoint) > 2) move(true);
      });
      contentObserver.observe(content);
    }
    announce();
    return {settle};
  }).filter(Boolean);

  function modeChanged() {
    const next = printing || preference.matches || body.classList.contains('present');
    if (next === suspended) return;
    suspended = next;
    if (next) drawers.forEach(drawer => drawer.settle());
    requestMotion(true);
  }
  new MutationObserver(modeChanged).observe(body, {attributes:true, attributeFilter:['class']});
  preference.addEventListener('change', modeChanged);
  addEventListener('beforeprint', () => { printing = true; modeChanged(); });
  addEventListener('afterprint', () => { printing = false; modeChanged(); });
  requestMotion(true);
})();
