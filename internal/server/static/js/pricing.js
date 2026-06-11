let pricingState = {
  status: null,
  missing: [],
  overrides: [],
  editingModel: ''
};

async function pricingRequest(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: opts.headers || {} };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  const res = await fetch(`/api/pricing/${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const data = JSON.parse(text);
      message = data.error || message;
    } catch (e) {}
    throw new Error(message);
  }
  return res.json();
}

function formatPricingTime(value) {
  if (!value) return t('never');
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleString();
}

function fmtPrice(perToken) {
  const n = (Number(perToken) || 0) * 1e6;
  if (n === 0) return '$0';
  if (n >= 1) return '$' + n.toFixed(2).replace(/\.?0+$/, '');
  if (n >= 0.01) return '$' + n.toFixed(3).replace(/\.?0+$/, '');
  return '$' + n.toExponential(2);
}

function pricingSourcesLabel(raw) {
  return String(raw || '').split(',').filter(Boolean).map(s => SOURCE_LABEL_KEYS[s] ? t(SOURCE_LABEL_KEYS[s]) : s).join(', ') || '-';
}

function renderPricingStatus() {
  const box = $('pricing-status-grid');
  if (!box) return;
  const s = pricingState.status || {};
  const cells = [
    [t('status'), s.last_error ? s.last_error : t('ok'), s.last_error ? 'warning' : ''],
    [t('lastSync'), formatPricingTime(s.last_sync_at), ''],
    [t('syncedModels'), s.last_model_count || '0', ''],
    [t('cachePath'), s.cache_path || '-', ''],
    [t('sourceURL'), s.source_url || '-', ''],
    [t('missing'), String(s.missing_count || 0), ''],
    [t('overrides'), String(s.override_count || 0), ''],
    [t('lastDownload'), s.last_download_at ? formatPricingTime(s.last_download_at) : t('never'), '']
  ];
  box.innerHTML = cells.map(([label, value, cls]) => {
    const isURL = typeof value === 'string' && /^https?:\/\//.test(value);
    const inner = isURL
      ? `<a href="${esc(value)}" target="_blank" rel="noopener">${esc(value)}</a>`
      : esc(value);
    return `<div class="pricing-status-item">
    <div class="pricing-status-label">${esc(label)}</div>
    <div class="pricing-status-value ${cls}" title="${esc(value)}">${inner}</div>
  </div>`;
  }).join('');
}

function renderMissingPrices() {
  const box = $('pricing-missing-list');
  const count = $('pricing-missing-count');
  if (!box) return;
  const items = pricingState.missing || [];
  if (count) count.textContent = items.length;
  if (items.length === 0) {
    box.innerHTML = `<div class="pricing-empty">${esc(t('noMissingPrices'))}</div>`;
    return;
  }
  box.innerHTML = `<table class="pricing-table"><thead><tr>
    <th>${esc(t('model'))}</th><th>${esc(t('source'))}</th><th>${esc(t('calls'))}</th><th>${esc(t('tokens'))}</th><th>${esc(t('time'))}</th><th></th>
  </tr></thead><tbody>${items.map(item => `<tr>
    <td><div class="pricing-model-name" title="${esc(item.model)}">${esc(item.model)}</div></td>
    <td>${esc(pricingSourcesLabel(item.sources))}</td>
    <td>${fmt(item.usage_count || 0)}</td>
    <td>${fmt(item.total_tokens || 0)}</td>
    <td>${esc(formatPricingTime(item.last_seen))}</td>
    <td class="pricing-actions-cell"><button type="button" class="pricing-mini-btn" data-pricing-action="set" data-model="${esc(item.model)}">${esc(t('setPrice'))}</button></td>
  </tr>`).join('')}</tbody></table>`;
}

function renderPricingOverrides() {
  const box = $('pricing-overrides-list');
  const count = $('pricing-override-count');
  if (!box) return;
  const items = pricingState.overrides || [];
  if (count) count.textContent = items.length;
  if (items.length === 0) {
    box.innerHTML = `<div class="pricing-empty">${esc(t('noOverrides'))}</div>`;
    return;
  }
  box.innerHTML = `<table class="pricing-table compact"><thead><tr>
    <th>${esc(t('model'))}</th><th>${esc(t('input'))}</th><th>${esc(t('output'))}</th><th>${esc(t('cacheRead'))}</th><th>${esc(t('cacheCreate'))}</th><th></th>
  </tr></thead><tbody>${items.map(item => `<tr>
    <td><div class="pricing-model-name" title="${esc(item.model)}">${esc(item.model)}</div>${item.note ? `<div class="pricing-model-meta">${esc(item.note)}</div>` : ''}</td>
    <td class="pricing-price-value">${fmtPrice(item.input_cost_per_token)}</td>
    <td class="pricing-price-value">${fmtPrice(item.output_cost_per_token)}</td>
    <td class="pricing-price-value">${fmtPrice(item.cache_read_input_token_cost)}</td>
    <td class="pricing-price-value">${fmtPrice(item.cache_creation_input_token_cost)}</td>
    <td class="pricing-actions-cell">
      <button type="button" class="pricing-mini-btn" data-pricing-action="edit" data-model="${esc(item.model)}">${esc(t('edit'))}</button>
      <button type="button" class="pricing-mini-btn danger" data-pricing-action="delete" data-model="${esc(item.model)}">${esc(t('delete'))}</button>
    </td>
  </tr>`).join('')}</tbody></table>`;
}

function renderPricingPageFromState() {
  renderPricingStatus();
  renderMissingPrices();
  renderPricingOverrides();
  const fab = $('pricing-fab');
  if (fab) {
    fab.title = t('pricingTitle');
    fab.setAttribute('aria-label', t('pricingTitle'));
  }
}

async function loadPricingPage() {
  const [status, missing, overrides] = await Promise.all([
    pricingRequest('status'),
    pricingRequest('missing'),
    pricingRequest('overrides')
  ]);
  pricingState.status = status || {};
  pricingState.missing = missing || [];
  pricingState.overrides = overrides || [];
  renderPricingPageFromState();
}

async function updatePricingFab() {
  const badge = $('pricing-fab-badge');
  if (!badge) return;
  try {
    const missing = await pricingRequest('missing');
    const count = (missing || []).length;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
  } catch (e) {
    badge.hidden = true;
  }
}

function perTokenTo1M(v) {
  const n = Number(v);
  return isNaN(n) || n === 0 ? '' : +(n * 1e6).toPrecision(10);
}

function openPricingEditor(model, data = {}) {
  pricingState.editingModel = model;
  $('pricing-editor-model').textContent = model;
  $('price-input').value = perTokenTo1M(data.input_cost_per_token);
  $('price-output').value = perTokenTo1M(data.output_cost_per_token);
  $('price-cache-read').value = perTokenTo1M(data.cache_read_input_token_cost);
  $('price-cache-create').value = perTokenTo1M(data.cache_creation_input_token_cost);
  $('price-note').value = data.note || '';
  $('pricing-message').textContent = '';
  $('pricing-message').className = 'pricing-message';
  $('pricing-editor').hidden = false;
  $('pricing-editor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function closePricingEditor() {
  pricingState.editingModel = '';
  const editor = $('pricing-editor');
  if (editor) editor.hidden = true;
}

function pricingNumber(id) {
  const value = $(id).value.trim();
  return value === '' ? 0 : Number(value) / 1e6;
}

async function savePricingOverride(e) {
  e.preventDefault();
  const model = pricingState.editingModel;
  if (!model) return;
  const msg = $('pricing-message');
  const btn = $('pricing-save-btn');
  const payload = {
    input_cost_per_token: pricingNumber('price-input'),
    output_cost_per_token: pricingNumber('price-output'),
    cache_read_input_token_cost: pricingNumber('price-cache-read'),
    cache_creation_input_token_cost: pricingNumber('price-cache-create'),
    note: $('price-note').value.trim()
  };
  btn.disabled = true;
  msg.textContent = '';
  msg.className = 'pricing-message';
  try {
    await pricingRequest(`overrides/${encodeURIComponent(model)}`, { method: 'PUT', body: payload });
    msg.textContent = t('saved');
    msg.className = 'pricing-message ok';
    closePricingEditor();
    await loadPricingPage();
    await updatePricingFab();
  } catch (err) {
    msg.textContent = `${t('saveFailed')}: ${err.message}`;
    msg.className = 'pricing-message error';
  } finally {
    btn.disabled = false;
  }
}

async function deletePricingOverride(model) {
  if (!confirm(`${t('delete')} ${model}?`)) return;
  try {
    await pricingRequest(`overrides/${encodeURIComponent(model)}`, { method: 'DELETE' });
    closePricingEditor();
    await loadPricingPage();
    await updatePricingFab();
  } catch (err) {
    alert(`${t('deleteFailed')}: ${err.message}`);
  }
}

async function syncPricingNow() {
  const btn = $('pricing-sync-btn');
  btn.classList.add('loading');
  btn.disabled = true;
  try {
    await pricingRequest('sync', { method: 'POST' });
    await loadPricingPage();
    await updatePricingFab();
  } catch (err) {
    alert(`${t('syncFailed')}: ${err.message}`);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function setPricingRouteVisible() {
  const visible = location.hash === '#pricing';
  document.body.classList.toggle('pricing-mode', visible);
  const dashboard = $('dashboard-view');
  const pricingView = $('pricing-view');
  if (dashboard) dashboard.hidden = visible;
  if (pricingView) pricingView.hidden = !visible;
  if (visible) {
    loadPricingPage().catch(() => {});
  } else {
    closePricingEditor();
    Object.values(charts).forEach(c => c && c.resize());
  }
}

function initPricingPage() {
  const fab = $('pricing-fab');
  if (!fab) return;
  fab.onclick = () => { location.hash = 'pricing'; };
  $('pricing-back-btn').onclick = () => {
    history.pushState('', document.title, location.pathname + location.search);
    setPricingRouteVisible();
    refresh();
  };
  $('pricing-sync-btn').onclick = syncPricingNow;
  $('pricing-editor').onsubmit = savePricingOverride;
  $('pricing-cancel-btn').onclick = closePricingEditor;
  $('pricing-editor-close').onclick = closePricingEditor;
  $('pricing-missing-list').onclick = e => {
    const btn = e.target.closest('[data-pricing-action="set"]');
    if (!btn) return;
    openPricingEditor(btn.dataset.model);
  };
  $('pricing-overrides-list').onclick = e => {
    const btn = e.target.closest('[data-pricing-action]');
    if (!btn) return;
    const item = (pricingState.overrides || []).find(p => p.model === btn.dataset.model);
    if (btn.dataset.pricingAction === 'edit' && item) openPricingEditor(item.model, item);
    if (btn.dataset.pricingAction === 'delete') deletePricingOverride(btn.dataset.model);
  };
  window.addEventListener('hashchange', setPricingRouteVisible);
  setPricingRouteVisible();
}
