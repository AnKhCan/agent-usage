let pricingState = {
  status: null,
  missing: [],
  overrides: [],
  editingModel: ''
};

let modelState = {
  status: null,
  aliases: [],
  candidates: [],
  editingAlias: '',
  activeTab: 'pricing'
};

async function jsonRequest(prefix, path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: opts.headers || {} };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  const res = await fetch(`/api/${prefix}/${path}`, init);
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

function pricingRequest(path, opts = {}) {
  return jsonRequest('pricing', path, opts);
}

function modelsRequest(path, opts = {}) {
  return jsonRequest('models', path, opts);
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

function aliasSourceLabel(source) {
  if (source === 'manual') return t('manualAliasSource');
  if (source === 'config') return t('configAliasSource');
  return source || '-';
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

async function updateModelManagementBadge() {
  const badge = $('model-management-badge');
  const btn = $('model-management-btn');
  if (!badge && !btn) return;
  try {
    const status = await modelsRequest('status');
    modelState.status = status || {};
    const count = Number(modelState.status.badge_count || 0);
    if (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
    }
    if (btn) {
      btn.title = `${t('missing')}: ${modelState.status.missing_price_count || 0} | ${t('aliasCandidates')}: ${modelState.status.candidate_count || 0}`;
      btn.setAttribute('aria-label', t('modelManagement'));
    }
  } catch (e) {
    if (badge) badge.hidden = true;
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
    await updateModelManagementBadge();
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
    await updateModelManagementBadge();
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
    await updateModelManagementBadge();
  } catch (err) {
    alert(`${t('syncFailed')}: ${err.message}`);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function renderAliases() {
  const box = $('alias-list');
  const count = $('alias-count');
  if (!box) return;
  const items = modelState.aliases || [];
  if (count) count.textContent = items.length;
  if (items.length === 0) {
    box.innerHTML = `<div class="pricing-empty">${esc(t('noAliases'))}</div>`;
    return;
  }
  box.innerHTML = `<table class="pricing-table alias-table"><thead><tr>
    <th>${esc(t('rawAlias'))}</th><th>${esc(t('canonicalModel'))}</th><th>${esc(t('source'))}</th><th>${esc(t('note'))}</th><th></th>
  </tr></thead><tbody>${items.map(item => `<tr>
    <td><div class="pricing-model-name" title="${esc(item.alias)}">${esc(item.alias)}</div></td>
    <td><div class="pricing-model-name" title="${esc(item.canonical_model)}">${esc(item.canonical_model)}</div></td>
    <td><span class="alias-source-pill ${esc(item.source || '')}">${esc(aliasSourceLabel(item.source))}</span></td>
    <td>${esc(item.note || '-')}</td>
    <td class="pricing-actions-cell">
      <button type="button" class="pricing-mini-btn" data-alias-action="edit" data-alias="${esc(item.alias)}">${esc(t('edit'))}</button>
      <button type="button" class="pricing-mini-btn danger" data-alias-action="delete" data-alias="${esc(item.alias)}">${esc(t('delete'))}</button>
    </td>
  </tr>`).join('')}</tbody></table>`;
}

function renderAliasCandidates() {
  const box = $('alias-candidate-list');
  const count = $('alias-candidate-count');
  if (!box) return;
  const items = modelState.candidates || [];
  if (count) count.textContent = items.length;
  if (items.length === 0) {
    box.innerHTML = `<div class="pricing-empty">${esc(t('noAliasCandidates'))}</div>`;
    return;
  }
  box.innerHTML = `<div class="alias-candidate-stack">${items.map((item, idx) => `<div class="alias-candidate-card">
    <div class="alias-candidate-head">
      <div>
        <div class="pricing-model-name" title="${esc(item.canonical_model)}">${esc(item.canonical_model)}</div>
        <div class="pricing-model-meta">${fmt(item.usage_count || 0)} ${esc(t('calls'))} | ${fmt(item.total_tokens || 0)} ${esc(t('tokens'))}</div>
      </div>
      <button type="button" class="pricing-mini-btn" data-alias-action="apply-candidate" data-candidate-index="${idx}">${esc(t('applyGroup'))}</button>
    </div>
    <table class="pricing-table compact alias-candidate-table"><thead><tr>
      <th>${esc(t('rawAlias'))}</th><th>${esc(t('source'))}</th><th>${esc(t('calls'))}</th><th>${esc(t('currentModel'))}</th><th></th>
    </tr></thead><tbody>${(item.variants || []).map(variant => `<tr>
      <td><div class="pricing-model-name" title="${esc(variant.raw_model)}">${esc(variant.raw_model)}</div></td>
      <td>${esc(pricingSourcesLabel(variant.sources))}</td>
      <td>${fmt(variant.usage_count || 0)}</td>
      <td><div class="pricing-model-name" title="${esc(variant.model)}">${esc(variant.model)}</div></td>
      <td class="pricing-actions-cell"><button type="button" class="pricing-mini-btn" data-alias-action="use-candidate" data-raw-model="${esc(variant.raw_model)}" data-canonical-model="${esc(item.canonical_model)}">${esc(t('use'))}</button></td>
    </tr>`).join('')}</tbody></table>
  </div>`).join('')}</div>`;
}

function renderAliasPageFromState() {
  renderAliases();
  renderAliasCandidates();
}

async function loadAliasPage() {
  const [aliases, candidates] = await Promise.all([
    modelsRequest('aliases'),
    modelsRequest('alias-candidates')
  ]);
  modelState.aliases = aliases || [];
  modelState.candidates = candidates || [];
  renderAliasPageFromState();
}

function openAliasEditor(alias = '', data = {}) {
  modelState.editingAlias = alias;
  const input = $('alias-input');
  input.value = alias;
  input.disabled = !!alias;
  $('alias-canonical-input').value = data.canonical_model || '';
  $('alias-note-input').value = data.note || '';
  $('alias-editor-title').textContent = alias ? alias : t('newAlias');
  $('alias-message').textContent = '';
  $('alias-message').className = 'pricing-message';
  $('alias-editor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function clearAliasEditor() {
  modelState.editingAlias = '';
  const input = $('alias-input');
  input.value = '';
  input.disabled = false;
  $('alias-canonical-input').value = '';
  $('alias-note-input').value = '';
  $('alias-editor-title').textContent = t('newAlias');
  $('alias-message').textContent = '';
  $('alias-message').className = 'pricing-message';
}

async function saveModelAlias(e) {
  e.preventDefault();
  const alias = (modelState.editingAlias || $('alias-input').value).trim();
  const canonical = $('alias-canonical-input').value.trim();
  const msg = $('alias-message');
  const btn = $('alias-save-btn');
  if (!alias || !canonical) {
    msg.textContent = t('aliasRequired');
    msg.className = 'pricing-message error';
    return;
  }
  btn.disabled = true;
  msg.textContent = '';
  msg.className = 'pricing-message';
  try {
    await modelsRequest(`aliases/${encodeURIComponent(alias)}`, {
      method: 'PUT',
      body: { canonical_model: canonical, note: $('alias-note-input').value.trim() }
    });
    msg.textContent = t('saved');
    msg.className = 'pricing-message ok';
    clearAliasEditor();
    await loadAliasPage();
    await updateModelManagementBadge();
  } catch (err) {
    msg.textContent = `${t('saveFailed')}: ${err.message}`;
    msg.className = 'pricing-message error';
  } finally {
    btn.disabled = false;
  }
}

async function deleteModelAlias(alias) {
  if (!confirm(`${t('delete')} ${alias}?`)) return;
  try {
    await modelsRequest(`aliases/${encodeURIComponent(alias)}`, { method: 'DELETE' });
    clearAliasEditor();
    await loadAliasPage();
    await updateModelManagementBadge();
  } catch (err) {
    alert(`${t('deleteFailed')}: ${err.message}`);
  }
}

async function applyAliasCandidate(index) {
  const item = (modelState.candidates || [])[index];
  if (!item) return;
  const variants = item.variants || [];
  if (variants.length === 0) return;
  const btns = document.querySelectorAll(`[data-alias-action="apply-candidate"][data-candidate-index="${index}"]`);
  btns.forEach(btn => btn.disabled = true);
  try {
    await Promise.all(variants.map(v => modelsRequest(`aliases/${encodeURIComponent(v.raw_model)}`, {
      method: 'PUT',
      body: { canonical_model: item.canonical_model, note: 'candidate' }
    })));
    await loadAliasPage();
    await updateModelManagementBadge();
  } catch (err) {
    alert(`${t('saveFailed')}: ${err.message}`);
  } finally {
    btns.forEach(btn => btn.disabled = false);
  }
}

function routeModelTab() {
  const hash = location.hash;
  if (hash === '#pricing') {
    history.replaceState('', document.title, location.pathname + location.search + '#models/pricing');
    return 'pricing';
  }
  if (hash === '#models/aliases') return 'aliases';
  if (hash === '#models/pricing' || hash === '#models') return 'pricing';
  return '';
}

function activateModelsTab(tab) {
  modelState.activeTab = tab || 'pricing';
  document.querySelectorAll('[data-models-tab]').forEach(btn => {
    const active = btn.dataset.modelsTab === modelState.activeTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const pricingPanel = $('models-pricing-panel');
  const aliasesPanel = $('models-aliases-panel');
  if (pricingPanel) pricingPanel.hidden = modelState.activeTab !== 'pricing';
  if (aliasesPanel) aliasesPanel.hidden = modelState.activeTab !== 'aliases';
  document.querySelectorAll('.models-pricing-action').forEach(el => {
    el.hidden = modelState.activeTab !== 'pricing';
  });
}

async function loadModelsTab(tab) {
  if (tab === 'aliases') {
    await loadAliasPage();
  } else {
    await loadPricingPage();
  }
  await updateModelManagementBadge();
}

function setModelRouteVisible() {
  const tab = routeModelTab();
  const visible = !!tab;
  document.body.classList.toggle('models-mode', visible);
  const dashboard = $('dashboard-view');
  const modelsView = $('models-view');
  if (dashboard) dashboard.hidden = visible;
  if (modelsView) modelsView.hidden = !visible;
  if (visible) {
    activateModelsTab(tab);
    loadModelsTab(tab).catch(() => {});
  } else {
    closePricingEditor();
    Object.values(charts).forEach(c => c && c.resize());
  }
}

function initPricingPage() {
  const entry = $('model-management-btn');
  if (entry) entry.onclick = () => { location.hash = 'models/pricing'; };
  $('pricing-back-btn').onclick = () => {
    history.pushState('', document.title, location.pathname + location.search);
    setModelRouteVisible();
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
  document.querySelectorAll('[data-models-tab]').forEach(btn => {
    btn.onclick = () => {
      location.hash = `models/${btn.dataset.modelsTab}`;
    };
  });
  $('alias-editor').onsubmit = saveModelAlias;
  $('alias-cancel-btn').onclick = clearAliasEditor;
  $('alias-editor-clear').onclick = clearAliasEditor;
  $('alias-list').onclick = e => {
    const btn = e.target.closest('[data-alias-action]');
    if (!btn) return;
    const alias = btn.dataset.alias;
    const item = (modelState.aliases || []).find(a => a.alias === alias);
    if (btn.dataset.aliasAction === 'edit' && item) openAliasEditor(item.alias, item);
    if (btn.dataset.aliasAction === 'delete') deleteModelAlias(alias);
  };
  $('alias-candidate-list').onclick = e => {
    const btn = e.target.closest('[data-alias-action]');
    if (!btn) return;
    if (btn.dataset.aliasAction === 'use-candidate') {
      clearAliasEditor();
      $('alias-input').value = btn.dataset.rawModel || '';
      $('alias-canonical-input').value = btn.dataset.canonicalModel || '';
      $('alias-note-input').value = 'candidate';
      $('alias-editor-title').textContent = btn.dataset.rawModel || t('newAlias');
      $('alias-editor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (btn.dataset.aliasAction === 'apply-candidate') {
      applyAliasCandidate(Number(btn.dataset.candidateIndex));
    }
  };
  window.addEventListener('hashchange', setModelRouteVisible);
  setModelRouteVisible();
}
