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
  aliasOpen: {},
  aliasQuery: '',
  candidateOpen: {},
  activeTab: 'pricing'
};

const modalOpenClasses = ['pricing-editor-open', 'alias-editor-open'];

function lockBodyForModal(openClass) {
  if (!document.body.classList.contains('modal-open')) {
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.style.setProperty('--modal-scrollbar-compensation', `${scrollbarWidth}px`);
    document.body.classList.add('modal-open');
  }
  document.body.classList.add(openClass);
}

function unlockBodyForModal(openClass) {
  document.body.classList.remove(openClass);
  const stillOpen = modalOpenClasses.some(cls => document.body.classList.contains(cls));
  if (!stillOpen) {
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('--modal-scrollbar-compensation');
  }
}

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

function tf(key, vars = {}) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), t(key));
}

function renderPricingStatus() {
  const s = pricingState.status || {};
  const ops = [
    [t('status'), s.last_error ? s.last_error : t('ok'), s.last_error ? 'warning' : ''],
    [t('lastSync'), formatPricingTime(s.last_sync_at), ''],
    [t('syncedModels'), s.last_model_count || '0', ''],
    [t('lastDownload'), s.last_download_at ? formatPricingTime(s.last_download_at) : t('never'), ''],
    [t('missing'), String(s.missing_count || 0), s.missing_count ? 'warning' : ''],
    [t('overrides'), String(s.override_count || 0), '']
  ];
  const config = [
    [t('cachePath'), s.cache_path || '-'],
    [t('sourceURL'), s.source_url || '-']
  ];
  setStatusGrid('pricing-status-grid', ops);
  setStatusGrid('pricing-config-grid', config);
}

function setStatusGrid(id, cells) {
  const box = $(id);
  if (!box) return;
  box.innerHTML = cells.map(([label, value, cls]) => {
    const isURL = typeof value === 'string' && /^https?:\/\//.test(value);
    const inner = isURL
      ? `<a href="${esc(value)}" target="_blank" rel="noopener">${esc(value)}</a>`
      : esc(value);
    return `<div class="pricing-status-item">
    <div class="pricing-status-label">${esc(label)}</div>
    <div class="pricing-status-value ${cls || ''}" title="${esc(value)}">${inner}</div>
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
  refreshCanonicalDatalist();
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
  const editor = $('pricing-editor');
  editor.hidden = false;
  lockBodyForModal('pricing-editor-open');
  setTimeout(() => $('price-input').focus(), 0);
}

function closePricingEditor() {
  pricingState.editingModel = '';
  const editor = $('pricing-editor');
  if (editor) editor.hidden = true;
  unlockBodyForModal('pricing-editor-open');
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
    toastError(`${t('deleteFailed')}: ${err.message}`);
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
    toastOk(t('saved'));
  } catch (err) {
    toastError(`${t('syncFailed')}: ${err.message}`);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function compareModelNames(a, b) {
  return String(a || '').trim().localeCompare(String(b || '').trim(), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function aliasGroupKey(canonical) {
  return String(canonical || '').trim() || '__uncategorized__';
}

function buildAliasGroups(items) {
  const groupsByCanonical = new Map();
  (items || []).forEach(item => {
    const canonical = String((item && item.canonical_model) || '').trim() || t('uncategorizedModel');
    const key = aliasGroupKey(canonical);
    if (!groupsByCanonical.has(key)) {
      groupsByCanonical.set(key, { key, canonical, rows: [] });
    }
    groupsByCanonical.get(key).rows.push(item);
  });
  const groups = Array.from(groupsByCanonical.values());
  groups.forEach(group => {
    group.rows.sort((a, b) => compareModelNames(a.alias, b.alias));
  });
  groups.sort((a, b) => compareModelNames(a.canonical, b.canonical));
  return groups;
}

function aliasSearchText(item) {
  return [
    item && item.alias,
    item && item.canonical_model,
    item && item.source,
    item && item.note,
    aliasSourceLabel(item && item.source)
  ].filter(Boolean).join(' ').toLowerCase();
}

function filterAliasGroups(groups) {
  const query = String(modelState.aliasQuery || '').trim().toLowerCase();
  if (!query) return groups.map(group => ({ ...group, rows: group.rows, queryMatch: false }));
  return groups.map(group => {
    const canonicalMatch = String(group.canonical || '').toLowerCase().includes(query);
    const rows = canonicalMatch ? group.rows : group.rows.filter(row => aliasSearchText(row).includes(query));
    return { ...group, rows, queryMatch: canonicalMatch || rows.length > 0 };
  }).filter(group => group.rows.length > 0);
}

function aliasGroupExpanded(group, idx, totalGroups) {
  if (String(modelState.aliasQuery || '').trim()) return true;
  if (Object.prototype.hasOwnProperty.call(modelState.aliasOpen, group.key)) {
    return !!modelState.aliasOpen[group.key];
  }
  return totalGroups <= 1 && idx === 0;
}

function toggleAliasGroup(btn) {
  const key = btn.dataset.aliasGroupKey;
  if (!key) return;
  modelState.aliasOpen[key] = btn.getAttribute('aria-expanded') !== 'true';
  renderAliases();
}

function aliasGroupSourceSummary(rows) {
  const counts = new Map();
  (rows || []).forEach(row => {
    const label = aliasSourceLabel(row && row.source);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => `${label} ${fmt(count)}`)
    .join(' / ');
}

function aliasUsageText(item) {
  return `${fmt(Number(item && item.total_tokens) || 0)} ${t('tokens')} | ${fmt(Number(item && item.usage_count) || 0)} ${t('calls')}`;
}

function renderAliasPreview(rows) {
  const visible = (rows || []).slice(0, 3);
  const extra = Math.max(0, (rows || []).length - visible.length);
  return `<span class="alias-group-preview">
    ${visible.map(row => `<span class="alias-group-chip" title="${esc(row.alias)}"><span>${esc(row.alias)}</span></span>`).join('')}
    ${extra ? `<span class="alias-group-chip muted"><span>${esc(tf('moreAliases', { count: fmt(extra) }))}</span></span>` : ''}
  </span>`;
}

function syncAliasSearchInput() {
  const input = $('alias-search-input');
  if (!input) return;
  input.placeholder = t('aliasSearchPlaceholder');
  if (input.value !== modelState.aliasQuery) input.value = modelState.aliasQuery;
}

function renderAliases() {
  const box = $('alias-list');
  const count = $('alias-count');
  if (!box) return;
  const items = modelState.aliases || [];
  syncAliasSearchInput();
  if (count) count.textContent = items.length;
  if (items.length === 0) {
    box.innerHTML = `<div class="pricing-empty">${esc(t('noAliases'))}</div>`;
    return;
  }
  const groups = filterAliasGroups(buildAliasGroups(items));
  if (groups.length === 0) {
    box.innerHTML = `<div class="pricing-empty">${esc(t('noAliasSearchResults'))}</div>`;
    return;
  }
  box.innerHTML = `<div class="alias-group-stack">${groups.map((group, idx) => {
    const expanded = aliasGroupExpanded(group, idx, groups.length);
    const panelID = `alias-group-panel-${idx}`;
    const sourceSummary = aliasGroupSourceSummary(group.rows);
    return `<div class="alias-group-card ${expanded ? 'open' : 'collapsed'}">
      <div class="alias-group-head">
        <button type="button" class="alias-group-toggle" data-alias-action="toggle-alias-group" data-alias-group-key="${esc(group.key)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${esc(panelID)}" aria-label="${esc(tf('toggleAliasGroup', { model: group.canonical || '-' }))}">
          <span class="alias-group-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
          </span>
          <span class="alias-group-title">
            <span class="alias-group-name" title="${esc(group.canonical)}">${esc(group.canonical)}</span>
            <span class="alias-group-meta">${esc(tf('aliasGroupMeta', { count: fmt(group.rows.length) }))}${sourceSummary ? ` | ${esc(sourceSummary)}` : ''}</span>
          </span>
        </button>
        ${renderAliasPreview(group.rows)}
      </div>
      <div class="alias-group-rows" id="${esc(panelID)}" ${expanded ? '' : 'hidden'}><div class="alias-group-rows-inner">
        ${group.rows.map(item => `<div class="alias-group-row">
          <div class="alias-group-col alias-group-raw" data-label="${esc(t('rawAlias'))}">
            <div class="pricing-model-name alias-model-name" title="${esc(item.alias)}">${esc(item.alias)}</div>
          </div>
          <div class="alias-group-col alias-group-usage" data-label="${esc(t('usageStats'))}">
            <span class="alias-usage-value" title="${esc(aliasUsageText(item))}">${esc(aliasUsageText(item))}</span>
          </div>
          <div class="alias-group-col" data-label="${esc(t('source'))}">
            <span class="alias-source-pill ${esc(item.source || '')}">${esc(aliasSourceLabel(item.source))}</span>
          </div>
          <div class="alias-group-col alias-group-note" data-label="${esc(t('note'))}">
            <span class="alias-note-value" title="${esc(item.note || '-')}">${esc(item.note || '-')}</span>
          </div>
          <div class="alias-group-col alias-group-actions" data-label="">
            <button type="button" class="pricing-mini-btn" data-alias-action="edit" data-alias="${esc(item.alias)}">${esc(t('edit'))}</button>
            <button type="button" class="pricing-mini-btn danger" data-alias-action="delete" data-alias="${esc(item.alias)}">${esc(t('delete'))}</button>
          </div>
        </div>`).join('')}
      </div></div>
    </div>`;
  }).join('')}</div>`;
}

function aliasCandidatePendingVariants(item) {
  const canonical = String((item && item.canonical_model) || '').trim();
  if (!canonical) return [];
  return (item.variants || []).filter(variant => String(variant.model || '').trim() !== canonical);
}

function aliasCandidateUsedVariants(item) {
  const canonical = String((item && item.canonical_model) || '').trim();
  if (!canonical) return [];
  return (item.variants || []).filter(variant => {
    const raw = String(variant.raw_model || '').trim();
    const model = String(variant.model || '').trim();
    return raw && raw !== canonical && model === canonical;
  });
}

function aliasCandidateGroupKey(item, idx) {
  const canonical = String((item && item.canonical_model) || '').trim();
  const raws = ((item && item.variants) || [])
    .map(variant => String(variant.raw_model || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
  return `${canonical || 'candidate'}::${raws || idx}`;
}

function aliasCandidateExpanded(item, idx, pending) {
  const key = aliasCandidateGroupKey(item, idx);
  if (Object.prototype.hasOwnProperty.call(modelState.candidateOpen, key)) {
    return !!modelState.candidateOpen[key];
  }
  return pending.length > 0;
}

function toggleAliasCandidate(btn) {
  const key = btn.dataset.candidateKey;
  if (!key) return;
  modelState.candidateOpen[key] = btn.getAttribute('aria-expanded') !== 'true';
  renderAliasCandidates();
}

function aliasCandidatePreviewNames(pending, rows) {
  const seen = new Set();
  const source = pending.length > 0 ? pending : rows;
  return source.map(variant => String(variant.raw_model || '').trim()).filter(raw => {
    if (!raw || seen.has(raw)) return false;
    seen.add(raw);
    return true;
  });
}

function renderAliasCandidateMap(rawNames, canonicalModel) {
  const visible = rawNames.slice(0, 2);
  const extra = Math.max(0, rawNames.length - visible.length);
  const hasMore = extra > 0 ? ' data-has-more' : '';
  const sources = visible.length > 0
    ? visible.map(raw => `<span class="alias-candidate-chip" title="${esc(raw)}">${esc(raw)}</span>`).join('')
    : `<span class="alias-candidate-chip">-</span>`;
  return `<span class="alias-candidate-map">
    <span class="alias-candidate-source-list"${hasMore}>${sources}${extra ? `<span class="alias-candidate-chip alias-candidate-more">${esc(tf('moreAliases', { count: fmt(extra) }))}</span>` : ''}</span>
    <span class="alias-candidate-arrow">${esc(t('mapsTo'))}</span>
    <span class="alias-candidate-chip alias-candidate-chip-target" title="${esc(canonicalModel || '-')}">${esc(canonicalModel || '-')}</span>
  </span>`;
}

function renderAliasCandidates() {
  const box = $('alias-candidate-list');
  const count = $('alias-candidate-count');
  if (!box) return;
  const items = (modelState.candidates || []).map((item, idx) => {
    const pending = aliasCandidatePendingVariants(item);
    const used = aliasCandidateUsedVariants(item);
    return { item, idx, pending, used, rows: pending.concat(used) };
  }).filter(entry => entry.rows.length > 0);
  const pendingTotal = items.reduce((sum, entry) => sum + entry.pending.length, 0);
  if (count) {
    const pendingLabel = tf('pendingAliasCount', { count: fmt(pendingTotal) });
    count.textContent = fmt(pendingTotal);
    count.title = pendingLabel;
    count.setAttribute('aria-label', pendingLabel);
  }
  if (items.length === 0) {
    box.innerHTML = `<div class="pricing-empty">${esc(t('noAliasCandidates'))}</div>`;
    return;
  }
  box.innerHTML = `<div class="alias-candidate-stack">${items.map(({ item, idx, pending, rows }) => {
    const hasPending = pending.length > 0;
    const key = aliasCandidateGroupKey(item, idx);
    const expanded = aliasCandidateExpanded(item, idx, pending);
    const panelID = `alias-candidate-panel-${idx}`;
    const previewNames = aliasCandidatePreviewNames(pending, rows);
    const previewMap = renderAliasCandidateMap(previewNames, item.canonical_model);
    return `<div class="alias-candidate-card ${expanded ? 'open' : 'collapsed'}">
    <div class="alias-candidate-head">
      <button type="button" class="alias-candidate-toggle" data-alias-action="toggle-candidate" data-candidate-key="${esc(key)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${esc(panelID)}" aria-label="${esc(tf('toggleCandidate', { model: item.canonical_model || '-' }))}">
        <span class="alias-candidate-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
        </span>
        <span class="alias-candidate-title">
          ${previewMap}
          <span class="pricing-model-meta">${fmt(item.total_tokens || 0)} ${esc(t('tokens'))} | ${fmt(item.usage_count || 0)} ${esc(t('calls'))}</span>
        </span>
      </button>
      <div class="alias-candidate-head-actions">
        ${hasPending ? `<span class="alias-candidate-pending">${esc(tf('pendingAliases', { count: fmt(pending.length) }))}</span>` : ''}
        ${hasPending ? `<button type="button" class="pricing-mini-btn" data-alias-action="apply-candidate" data-candidate-index="${idx}">${esc(tf('applyGroup', { count: fmt(pending.length) }))}</button>` : ''}
      </div>
    </div>
    <div class="alias-candidate-rows" id="${esc(panelID)}" ${expanded ? '' : 'hidden'}><div class="alias-candidate-rows-inner">${rows.map(variant => {
      const usedRow = String(variant.model || '').trim() === String(item.canonical_model || '').trim();
      return `<div class="alias-candidate-row">
      <div class="alias-candidate-col" data-label="${esc(t('rawAlias'))}">
        <div class="pricing-model-name alias-model-name" title="${esc(variant.raw_model)}">${esc(variant.raw_model)}</div>
      </div>
      <div class="alias-candidate-col alias-candidate-col-suggest" data-label="${esc(t('canonicalTarget'))}">
        <div class="alias-candidate-suggest-wrap">
          <span class="alias-candidate-arrow">${esc(t('canonicalTarget'))}</span>
          <span class="alias-candidate-chip" title="${esc(item.canonical_model)}">${esc(item.canonical_model)}</span>
        </div>
      </div>
      <div class="alias-candidate-col" data-label="${esc(t('source'))}">
        <span class="alias-candidate-col-text">${esc(pricingSourcesLabel(variant.sources))}</span>
      </div>
      <div class="alias-candidate-col" data-label="${esc(t('tokens'))}">
        <span class="alias-candidate-col-text">${fmt(variant.total_tokens || 0)} ${esc(t('tokens'))} | ${fmt(variant.usage_count || 0)} ${esc(t('calls'))}</span>
      </div>
      <div class="alias-candidate-col alias-candidate-col-suggest" data-label="${esc(t('currentModel'))}">
        <div class="alias-candidate-suggest-wrap">
          <span class="alias-candidate-arrow">${esc(t('currentModel'))}</span>
          <span class="alias-candidate-chip" title="${esc(variant.model)}">${esc(variant.model)}</span>
        </div>
      </div>
      <div class="alias-candidate-col alias-candidate-col-center" data-label="${esc(t('status'))}">
        <span class="alias-candidate-status ${usedRow ? 'used' : 'pending'}">${usedRow ? '✓' : '×'}</span>
      </div>
      <div class="alias-candidate-col" data-label="">
        <button type="button" class="pricing-mini-btn" data-alias-action="${usedRow ? 'edit-candidate-alias' : 'use-candidate'}" data-raw-model="${esc(variant.raw_model)}" data-canonical-model="${esc(item.canonical_model)}">${esc(usedRow ? t('edit') : t('use'))}</button>
      </div>
    </div>`;
    }).join('')}</div></div>
  </div>`;
  }).join('')}</div>`;
}

function renderAliasPageFromState() {
  renderAliases();
  renderAliasCandidates();
  refreshCanonicalDatalist();
}

// Populate the canonical-model datalist from all known model names so the alias
// editor can offer autocomplete suggestions and reduce typos.
function refreshCanonicalDatalist() {
  const names = canonicalModelNames();
  canonicalComboboxSync(names);
}

function canonicalModelNames() {
  const names = new Set();
  (pricingState.overrides || []).forEach(o => { if (o && o.model) names.add(o.model); });
  (pricingState.missing || []).forEach(m => { if (m && m.model) names.add(m.model); });
  (modelState.aliases || []).forEach(a => { if (a && a.canonical_model) names.add(a.canonical_model); });
  (modelState.candidates || []).forEach(c => { if (c && c.canonical_model) names.add(c.canonical_model); });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

let canonicalComboboxState = {
  names: [],
  filtered: [],
  activeIndex: -1,
  open: false
};

function canonicalComboboxFilter(query) {
  const q = String(query || '').trim().toLowerCase();
  const names = canonicalComboboxState.names || [];
  if (!q) return names.slice();
  return names.filter(n => String(n).toLowerCase().includes(q));
}

function canonicalComboboxRender() {
  const menu = $('alias-canonical-menu');
  if (!menu) return;
  const list = canonicalComboboxState.filtered;
  if (list.length === 0) {
    menu.innerHTML = `<div class="canonical-combobox-empty">${esc(t('noAliasSearchResults'))}</div>`;
    return;
  }
  menu.innerHTML = list.map((name, i) => `<button type="button" class="canonical-combobox-option${i === canonicalComboboxState.activeIndex ? ' active' : ''}" role="option" aria-selected="${i === canonicalComboboxState.activeIndex ? 'true' : 'false'}" data-value="${esc(name)}">${esc(name)}</button>`).join('');
}

function canonicalComboboxSync(names) {
  canonicalComboboxState.names = names || [];
  if (canonicalComboboxState.open) {
    canonicalComboboxState.filtered = canonicalComboboxFilter($('alias-canonical-input').value);
    canonicalComboboxState.activeIndex = -1;
    canonicalComboboxRender();
    canonicalComboboxPositionMenu();
  }
}

function canonicalComboboxPositionMenu() {
  const input = $('alias-canonical-input');
  const menu = $('alias-canonical-menu');
  if (!canonicalComboboxState.open || !input || !menu || menu.hidden) return;

  const rect = input.getBoundingClientRect();
  const gap = 8;
  const edge = 16;
  const maxViewportWidth = Math.max(180, window.innerWidth - edge * 2);
  const width = Math.min(420, maxViewportWidth, Math.max(180, rect.width));
  const left = Math.min(Math.max(edge, rect.left), Math.max(edge, window.innerWidth - edge - width));
  const below = window.innerHeight - rect.bottom - gap;
  const above = rect.top - gap;
  const dropUp = below < 180 && above > below;
  const availableHeight = Math.max(80, Math.floor(dropUp ? above : below));

  menu.style.setProperty('--canonical-menu-left', `${Math.round(left)}px`);
  menu.style.setProperty('--canonical-menu-width', `${Math.round(width)}px`);
  menu.style.setProperty('--canonical-menu-max-height', `${Math.min(240, availableHeight)}px`);
  if (dropUp) {
    menu.classList.add('drop-up');
    menu.style.removeProperty('--canonical-menu-top');
    menu.style.setProperty('--canonical-menu-bottom', `${Math.round(window.innerHeight - rect.top + gap)}px`);
  } else {
    menu.classList.remove('drop-up');
    menu.style.removeProperty('--canonical-menu-bottom');
    menu.style.setProperty('--canonical-menu-top', `${Math.round(rect.bottom + gap)}px`);
  }
}

function canonicalComboboxOpen() {
  const box = $('alias-canonical-combobox');
  const menu = $('alias-canonical-menu');
  if (!box || !menu) return;
  if (menu.parentElement !== document.body) document.body.appendChild(menu);
  canonicalComboboxState.open = true;
  canonicalComboboxState.filtered = canonicalComboboxFilter($('alias-canonical-input').value);
  canonicalComboboxState.activeIndex = -1;
  box.classList.add('open');
  menu.hidden = false;
  canonicalComboboxRender();
  canonicalComboboxPositionMenu();
  requestAnimationFrame(() => {
    if (!canonicalComboboxState.open || menu.hidden) return;
    menu.classList.add('open');
    canonicalComboboxPositionMenu();
  });
}

function canonicalComboboxClose() {
  const box = $('alias-canonical-combobox');
  const menu = $('alias-canonical-menu');
  if (box) box.classList.remove('open');
  if (menu) {
    menu.classList.remove('open', 'drop-up');
    menu.hidden = true;
    menu.style.removeProperty('--canonical-menu-top');
    menu.style.removeProperty('--canonical-menu-bottom');
  }
  canonicalComboboxState.open = false;
}

function canonicalComboboxToggle() {
  if (canonicalComboboxState.open) canonicalComboboxClose();
  else canonicalComboboxOpen();
}

function canonicalComboboxCommit(value) {
  const input = $('alias-canonical-input');
  if (!input) return;
  input.value = value || '';
  canonicalComboboxClose();
  input.focus();
}

function canonicalComboboxMove(delta) {
  const list = canonicalComboboxState.filtered;
  if (list.length === 0) return;
  let idx = canonicalComboboxState.activeIndex + delta;
  if (idx < 0) idx = list.length - 1;
  if (idx >= list.length) idx = 0;
  canonicalComboboxState.activeIndex = idx;
  canonicalComboboxRender();
  const menu = $('alias-canonical-menu');
  const active = menu && menu.querySelector('.canonical-combobox-option.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function initCanonicalCombobox() {
  const box = $('alias-canonical-combobox');
  const input = $('alias-canonical-input');
  const caret = $('alias-canonical-caret');
  const menu = $('alias-canonical-menu');
  if (!box || !input || !menu) return;
  input.addEventListener('input', () => {
    if (canonicalComboboxState.open) {
      canonicalComboboxState.filtered = canonicalComboboxFilter(input.value);
      canonicalComboboxState.activeIndex = -1;
      canonicalComboboxRender();
      canonicalComboboxPositionMenu();
    }
  });
  input.addEventListener('focus', () => {
    if (!canonicalComboboxState.open) canonicalComboboxOpen();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!canonicalComboboxState.open) canonicalComboboxOpen();
      else canonicalComboboxMove(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (canonicalComboboxState.open) canonicalComboboxMove(-1);
    } else if (e.key === 'Enter') {
      if (canonicalComboboxState.open && canonicalComboboxState.activeIndex >= 0) {
        e.preventDefault();
        const value = canonicalComboboxState.filtered[canonicalComboboxState.activeIndex];
        canonicalComboboxCommit(value);
      }
    } else if (e.key === 'Escape') {
      if (canonicalComboboxState.open) {
        e.stopPropagation();
        canonicalComboboxClose();
      }
    }
  });
  if (caret) {
    caret.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      canonicalComboboxToggle();
      if (canonicalComboboxState.open) input.focus();
    });
  }
  menu.addEventListener('click', e => {
    const opt = e.target.closest('.canonical-combobox-option');
    if (!opt) return;
    canonicalComboboxCommit(opt.dataset.value);
  });
  menu.addEventListener('mousemove', e => {
    const opt = e.target.closest('.canonical-combobox-option');
    if (!opt) return;
    const opts = Array.from(menu.querySelectorAll('.canonical-combobox-option'));
    const idx = opts.indexOf(opt);
    if (idx >= 0 && idx !== canonicalComboboxState.activeIndex) {
      canonicalComboboxState.activeIndex = idx;
      canonicalComboboxRender();
    }
  });
  document.addEventListener('click', e => {
    if (!canonicalComboboxState.open) return;
    if (box.contains(e.target)) return;
    if (menu.contains(e.target)) return;
    canonicalComboboxClose();
  });
  window.addEventListener('resize', canonicalComboboxPositionMenu);
  window.addEventListener('scroll', canonicalComboboxPositionMenu, true);
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

function openAliasEditor(alias = '', data = {}, opts = {}) {
  const editingExisting = !!alias && opts.mode !== 'new';
  modelState.editingAlias = editingExisting ? alias : '';
  const editor = $('alias-editor');
  if (editor) editor.hidden = false;
  lockBodyForModal('alias-editor-open');
  const title = $('alias-editor-title');
  if (title) title.textContent = editingExisting ? t('editAlias') : t('newAlias');
  const input = $('alias-input');
  input.value = alias;
  input.disabled = editingExisting;
  $('alias-canonical-input').value = data.canonical_model || '';
  $('alias-note-input').value = data.note || '';
  $('alias-message').textContent = '';
  $('alias-message').className = 'pricing-message';
  setTimeout(() => (editingExisting ? $('alias-canonical-input') : input).focus(), 0);
}

function clearAliasEditor() {
  modelState.editingAlias = '';
  canonicalComboboxClose();
  const editor = $('alias-editor');
  if (editor) editor.hidden = true;
  unlockBodyForModal('alias-editor-open');
  const input = $('alias-input');
  input.value = '';
  input.disabled = false;
  $('alias-canonical-input').value = '';
  $('alias-note-input').value = '';
  $('alias-message').textContent = '';
  $('alias-message').className = 'pricing-message';
}

function editCandidateAlias(rawModel, canonicalModel) {
  const item = (modelState.aliases || []).find(a => a.alias === rawModel);
  if (item) {
    openAliasEditor(item.alias, item);
    return;
  }
  openAliasEditor(rawModel || '', {
    canonical_model: canonicalModel || '',
    note: 'candidate'
  }, { mode: 'new' });
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
    modelState.aliasOpen[aliasGroupKey(canonical)] = true;
    msg.textContent = t('saved');
    msg.className = 'pricing-message ok';
    await loadAliasPage();
    clearAliasEditor();
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
    await loadAliasPage();
    clearAliasEditor();
    await updateModelManagementBadge();
  } catch (err) {
    toastError(`${t('deleteFailed')}: ${err.message}`);
  }
}

async function useAliasCandidate(btn) {
  const alias = (btn.dataset.rawModel || '').trim();
  const canonical = (btn.dataset.canonicalModel || '').trim();
  if (!alias || !canonical) {
    toastError(t('aliasRequired'));
    return;
  }
  btn.disabled = true;
  try {
    await modelsRequest(`aliases/${encodeURIComponent(alias)}`, {
      method: 'PUT',
      body: { canonical_model: canonical, note: 'candidate' }
    });
    clearAliasEditor();
    await loadAliasPage();
    await updateModelManagementBadge();
  } catch (err) {
    toastError(`${t('saveFailed')}: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function applyAliasCandidate(index) {
  const item = (modelState.candidates || [])[index];
  if (!item) return;
  const variants = aliasCandidatePendingVariants(item);
  if (variants.length === 0) return;
  if (!confirm(tf('applyGroupConfirm', { count: fmt(variants.length), model: item.canonical_model || '-' }))) return;
  const btns = document.querySelectorAll(`[data-alias-action="apply-candidate"][data-candidate-index="${index}"]`);
  btns.forEach(btn => btn.disabled = true);
  try {
    await Promise.all(variants.map(v => modelsRequest(`aliases/${encodeURIComponent(v.raw_model)}`, {
      method: 'PUT',
      body: { canonical_model: item.canonical_model, note: 'candidate' }
    })));
    modelState.candidateOpen[aliasCandidateGroupKey(item, index)] = false;
    await loadAliasPage();
    await updateModelManagementBadge();
  } catch (err) {
    toastError(`${t('saveFailed')}: ${err.message}`);
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
  const tabsEl = document.querySelector('.models-tabs');
  if (tabsEl) tabsEl.setAttribute('data-active', modelState.activeTab);
  const pricingPanel = $('models-pricing-panel');
  const aliasesPanel = $('models-aliases-panel');
  if (pricingPanel) pricingPanel.hidden = modelState.activeTab !== 'pricing';
  if (aliasesPanel) aliasesPanel.hidden = modelState.activeTab !== 'aliases';
  if (modelState.activeTab !== 'pricing') closePricingEditor();
  if (modelState.activeTab !== 'aliases') clearAliasEditor();
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
    clearAliasEditor();
    Object.values(charts).forEach(c => c && c.resize());
  }
}

function initPricingPage() {
  const entry = $('model-management-btn');
  if (entry) entry.onclick = () => { location.hash = 'models/pricing'; };
  const backToDashboard = () => {
    history.pushState('', document.title, location.pathname + location.search);
    setModelRouteVisible();
    refresh();
  };
  const backIcon = $('models-back-icon');
  if (backIcon) backIcon.onclick = backToDashboard;
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
  $('alias-new-btn').onclick = () => openAliasEditor();
  initCanonicalCombobox();
  const aliasSearch = $('alias-search-input');
  if (aliasSearch) {
    aliasSearch.oninput = e => {
      modelState.aliasQuery = e.target.value;
      renderAliases();
    };
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('alias-editor-open')) {
      clearAliasEditor();
    }
    if (e.key === 'Escape' && document.body.classList.contains('pricing-editor-open')) {
      closePricingEditor();
    }
  });
  $('alias-list').onclick = e => {
    const btn = e.target.closest('[data-alias-action]');
    if (!btn) return;
    if (btn.dataset.aliasAction === 'toggle-alias-group') {
      toggleAliasGroup(btn);
      return;
    }
    const alias = btn.dataset.alias;
    const item = (modelState.aliases || []).find(a => a.alias === alias);
    if (btn.dataset.aliasAction === 'edit' && item) openAliasEditor(item.alias, item);
    if (btn.dataset.aliasAction === 'delete') deleteModelAlias(alias);
  };
  $('alias-candidate-list').onclick = e => {
    const btn = e.target.closest('[data-alias-action]');
    if (!btn) return;
    if (btn.dataset.aliasAction === 'use-candidate') {
      useAliasCandidate(btn);
    }
    if (btn.dataset.aliasAction === 'edit-candidate-alias') {
      editCandidateAlias(btn.dataset.rawModel || '', btn.dataset.canonicalModel || '');
    }
    if (btn.dataset.aliasAction === 'toggle-candidate') {
      toggleAliasCandidate(btn);
    }
    if (btn.dataset.aliasAction === 'apply-candidate') {
      applyAliasCandidate(Number(btn.dataset.candidateIndex));
    }
  };
  window.addEventListener('hashchange', setModelRouteVisible);
  setModelRouteVisible();
}
