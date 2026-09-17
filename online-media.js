(() => {
  let manifest;
  const jobs = new Map();
  const handled = new WeakMap();
  const keyFor = value => {
    if (!value) return null;
    try { const url = new URL(value, location.href); return url.origin === location.origin && url.pathname.startsWith('/qieman-aigc/large/') ? url.pathname : null; }
    catch { return null; }
  };
  async function load(key) {
    if (jobs.has(key)) return jobs.get(key);
    const job = (async () => {
      manifest ||= fetch('/qieman-aigc/large-media.json').then(r => { if (!r.ok) throw Error('素材清单暂时无法读取'); return r.json(); });
      const spec = (await manifest)[key];
      if (!spec) throw Error('找不到素材');
      const parts = await Promise.all(spec.chunks.map(async path => {
        const response = await fetch(path);
        if (!response.ok) throw Error('素材加载未完成，请重试');
        return response.blob();
      }));
      return URL.createObjectURL(new Blob(parts, {type:spec.type}));
    })();
    jobs.set(key, job);
    job.catch(() => jobs.delete(key));
    return job;
  }
  async function replace(element) {
    const key = keyFor(element.getAttribute('data-online-src') || element.getAttribute('src'));
    if (!key || handled.get(element) === key) return;
    handled.set(element, key);
    const video = element.matches('video') ? element : element.closest('video');
    const wantedPlay = video && !video.paused;
    try {
      const blob = await load(key);
      if (keyFor(element.getAttribute('data-online-src') || element.getAttribute('src')) !== key) return;
      element.removeAttribute('data-online-src');
      element.src = blob;
      if (video) { video.load(); if (wantedPlay) video.play().catch(() => {}); }
    } catch {
      handled.delete(element);
      if (video) video.title = '素材加载未完成，请刷新后重试';
    }
  }
  function scan(root) {
    if (root instanceof Element && root.matches('img[src],video[src],source[src],[data-online-src]')) replace(root);
    root.querySelectorAll?.('img[src],video[src],source[src],[data-online-src]').forEach(replace);
  }
  scan(document);
  new MutationObserver(records => records.forEach(record => {
    if (record.type === 'attributes') replace(record.target);
    else record.addedNodes.forEach(scan);
  })).observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['src']});
  document.addEventListener('click', async event => {
    const link = event.target.closest('a[href]');
    const key = keyFor(link?.getAttribute('href'));
    if (!key || event.button !== 0) return;
    event.preventDefault();
    if (link.dataset.loading) return;
    link.dataset.loading = 'true'; link.setAttribute('aria-busy','true');
    const label = link.textContent;
    link.textContent = '正在准备素材…';
    try {
      const blob = await load(key);
      const anchor = document.createElement('a');
      anchor.href = blob; anchor.download = link.getAttribute('download') || key.split('/').pop();
      anchor.click();
    } finally {
      link.textContent = label; delete link.dataset.loading; link.removeAttribute('aria-busy');
    }
  }, true);
})();
