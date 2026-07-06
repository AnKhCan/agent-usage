// ── Auto Refresh ──
function applyAutoRefresh() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  const btn = $('btn-auto-refresh');
  $('auto-status').textContent = state.autoRefresh ? t('autoOn') : t('autoOff');
  btn.className = 'ctrl-btn ' + (state.autoRefresh ? 'active' : '');
  if (state.autoRefresh) {
    autoTimer = setInterval(refresh, state.refreshInterval * 1000);
  }
}

function renderCompareModeControl(opts = {}) {
  setTrendCompareVisible(isCompareEnabled(), opts);
  const modeSelect = $('sel-compare-mode');
  if (!modeSelect) return;
  modeSelect.value = state.compareMode;
  syncCustomSelect(modeSelect);
}

function measureSelectText(select, text) {
  const canvas = measureSelectText.canvas || (measureSelectText.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  const wrap = select && select.closest('.custom-select-wrap');
  const trigger = wrap && wrap.querySelector('.custom-select-trigger');
  const cs = getComputedStyle(trigger || document.body);
  ctx.font = `${cs.fontWeight || 500} ${cs.fontSize || '13px'} ${cs.fontFamily || 'sans-serif'}`;
  return ctx.measureText(text || '').width;
}

function updateModelSelectWidth() {
  const wrap = $('filter-model-wrap');
  if (!wrap) return;
  const trigger = $('filter-model-trigger');
  const canvas = updateModelSelectWidth.canvas || (updateModelSelectWidth.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  const cs = getComputedStyle(trigger || document.body);
  ctx.font = `${cs.fontWeight || 500} ${cs.fontSize || '13px'} ${cs.fontFamily || 'sans-serif'}`;
  const labels = [t('allModels'), tf('selectedModels', { count: fmt(Math.max(2, (state.models || []).length || 2)) }), ...(modelOptionsCache || [])];
  const maxTextWidth = labels.reduce((max, label) => Math.max(max, ctx.measureText(label || '').width), 0);
  const width = Math.min(260, Math.max(124, Math.ceil(maxTextWidth + 48)));
  wrap.style.setProperty('--model-select-width', `${width}px`);
}

function updateProjectSelectWidth() {
  const select = $('filter-project');
  if (!select) return;
  const wrap = select.closest('.custom-select-wrap');
  if (!wrap) return;
  const maxTextWidth = Array.from(select.options).reduce((max, option) => {
    return Math.max(max, measureSelectText(select, option.textContent || ''));
  }, 0);
  const width = Math.min(360, Math.max(160, Math.ceil(maxTextWidth + 48)));
  wrap.style.setProperty('--project-select-width', `${width}px`);
}

function projectOptionText(option) {
  const label = option && option.label ? option.label : '-';
  const count = Number(option && option.sessions) || 0;
  return count > 0 ? `${label} (${fmt(count)})` : label;
}

function renderProjectFilterOptions(options = projectOptionsCache) {
  const sel = $('filter-project');
  if (!sel) return false;
  projectOptionsCache = Array.isArray(options) ? options : [];
  const prev = state.project;
  const valid = !prev || projectOptionsCache.some(option => option.key === prev);
  if (!valid) persist('project', '');

  sel.innerHTML = `<option value="" ${state.project === '' ? 'selected' : ''}>${t('allProjects')}</option>` + projectOptionsCache.map(option =>
    `<option value="${esc(option.key)}" ${state.project === option.key ? 'selected' : ''}>${esc(projectOptionText(option))}</option>`
  ).join('');
  syncCustomSelect(sel);
  updateProjectSelectWidth();
  return prev !== state.project;
}

// ── Model Multi-select ──
function modelFilterLabel() {
  const models = state.models || [];
  if (models.length === 0) return t('allModels');
  if (models.length === 1) return models[0];
  return tf('selectedModels', { count: fmt(models.length) });
}

function setModelFilterOpen(open) {
  const wrap = $('filter-model-wrap');
  const trigger = $('filter-model-trigger');
  const menu = $('filter-model-menu');
  if (!wrap || !trigger || !menu) return;
  modelFilterOpen = !!open;
  wrap.classList.toggle('open', modelFilterOpen);
  trigger.setAttribute('aria-expanded', modelFilterOpen ? 'true' : 'false');
  menu.hidden = !modelFilterOpen;
  if (modelFilterOpen) {
    closeCustomSelects();
    renderModelFilterOptions();
    const input = $('filter-model-search');
    if (input) {
      input.value = modelFilterQuery;
      requestAnimationFrame(() => input.focus());
    }
  }
}

function closeModelFilter() {
  setModelFilterOpen(false);
}

function syncModelFilterLabel() {
  const label = $('filter-model-label');
  const trigger = $('filter-model-trigger');
  const text = modelFilterLabel();
  if (label) label.textContent = text;
  if (trigger) {
    trigger.title = text;
    trigger.setAttribute('aria-label', text);
  }
  updateModelSelectWidth();
}

function renderModelFilterOptions() {
  const box = $('filter-model-options');
  const input = $('filter-model-search');
  if (!box) return;
  if (input && input.value !== modelFilterQuery) input.value = modelFilterQuery;

  const selected = new Set(state.models || []);
  const query = String(modelFilterQuery || '').trim().toLowerCase();
  const options = (modelOptionsCache || []).filter(model => !query || model.toLowerCase().includes(query));
  if (options.length === 0) {
    box.innerHTML = `<div class="model-multiselect-empty">${esc(t('noModelSearchResults'))}</div>`;
    syncModelFilterLabel();
    return;
  }

  box.innerHTML = options.map(model => {
    const isSelected = selected.has(model);
    return `<button type="button" class="model-multiselect-option${isSelected ? ' selected' : ''}" role="option" aria-selected="${isSelected ? 'true' : 'false'}" data-model="${esc(model)}">
      <span class="model-multiselect-option-label">${esc(model)}</span>
      <svg class="model-multiselect-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"></path></svg>
    </button>`;
  }).join('');
  syncModelFilterLabel();
}

function toggleModelFilterValue(model) {
  const selected = new Set(state.models || []);
  if (selected.has(model)) selected.delete(model);
  else selected.add(model);
  persistModels(Array.from(selected));
  sessionPage = 1;
  renderModelFilterOptions();
  refresh();
}

function selectAllModels() {
  persistModels(modelOptionsCache || []);
  sessionPage = 1;
  renderModelFilterOptions();
  refresh();
}

function clearModelFilter() {
  persistModels([]);
  sessionPage = 1;
  renderModelFilterOptions();
  refresh();
}

// ── Custom Selects ──
function customSelectLabel(select) {
  const selected = select.options[select.selectedIndex];
  return selected ? selected.textContent : '';
}

function selectedOptionIndex(select) {
  return Math.max(0, Array.from(select.options).findIndex(o => o.value === select.value));
}

function setCustomSelectOpen(item, open) {
  item.wrap.classList.toggle('open', open);
  item.button.setAttribute('aria-expanded', open ? 'true' : 'false');
  item.menu.hidden = !open;
  if (open) {
    item.activeIndex = selectedOptionIndex(item.select);
    syncCustomSelect(item.select);
    const active = item.menu.querySelector('.custom-select-option.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
}

function closeCustomSelects(exceptId = '') {
  customSelects.forEach((item, id) => {
    if (id !== exceptId) setCustomSelectOpen(item, false);
  });
}

function commitCustomSelectValue(select, value) {
  if (select.value === value) {
    closeCustomSelects();
    return;
  }
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  closeCustomSelects();
}

function syncCustomSelect(select) {
  const item = customSelects.get(select.id);
  if (!item) return;

  const options = Array.from(select.options);
  const selectedIndex = selectedOptionIndex(select);
  item.value.textContent = customSelectLabel(select);
  item.button.title = customSelectLabel(select);
  item.button.setAttribute('aria-label', select.title || customSelectLabel(select));
  if (!item.wrap.classList.contains('open')) item.activeIndex = selectedIndex;
  item.activeIndex = Math.min(Math.max(item.activeIndex, 0), Math.max(options.length - 1, 0));

  item.menu.innerHTML = options.map((option, index) => {
    const selected = option.value === select.value;
    const active = index === item.activeIndex;
    return `<button type="button" class="custom-select-option${selected ? ' selected' : ''}${active ? ' active' : ''}" role="option" aria-selected="${selected ? 'true' : 'false'}" data-value="${esc(option.value)}">
      <span class="custom-select-option-label">${esc(option.textContent)}</span>
      <svg class="custom-select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"></path></svg>
    </button>`;
  }).join('');
}

function moveCustomSelectActive(item, delta) {
  const count = item.select.options.length;
  if (!count) return;
  item.activeIndex = (item.activeIndex + delta + count) % count;
  syncCustomSelect(item.select);
  const active = item.menu.querySelector('.custom-select-option.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function enhanceSelect(select) {
  if (!select || customSelects.has(select.id)) return;

  select.classList.add('enhanced-native-select');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const wrap = document.createElement('div');
  wrap.className = 'custom-select-wrap';
  wrap.dataset.selectId = select.id;
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'custom-select-trigger';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `<span class="custom-select-value"></span><svg class="custom-select-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>`;

  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  wrap.appendChild(button);
  wrap.appendChild(menu);

  const item = { select, wrap, button, menu, value: button.querySelector('.custom-select-value'), activeIndex: selectedOptionIndex(select) };
  customSelects.set(select.id, item);

  button.addEventListener('click', e => {
    e.stopPropagation();
    const nextOpen = !wrap.classList.contains('open');
    if (nextOpen) closeModelFilter();
    closeCustomSelects(select.id);
    setCustomSelectOpen(item, nextOpen);
  });

  button.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) e.preventDefault();
    if (!wrap.classList.contains('open') && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      closeCustomSelects(select.id);
      setCustomSelectOpen(item, true);
      return;
    }
    if (e.key === 'ArrowDown') moveCustomSelectActive(item, 1);
    if (e.key === 'ArrowUp') moveCustomSelectActive(item, -1);
    if (e.key === 'Home') { item.activeIndex = 0; syncCustomSelect(select); }
    if (e.key === 'End') { item.activeIndex = select.options.length - 1; syncCustomSelect(select); }
    if ((e.key === 'Enter' || e.key === ' ') && wrap.classList.contains('open')) {
      const option = select.options[item.activeIndex];
      if (option) commitCustomSelectValue(select, option.value);
    }
    if (e.key === 'Escape') setCustomSelectOpen(item, false);
  });

  menu.addEventListener('click', e => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;
    commitCustomSelectValue(select, option.dataset.value);
    button.focus();
  });

  menu.addEventListener('mousemove', e => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;
    const buttons = Array.from(menu.querySelectorAll('.custom-select-option'));
    const index = buttons.indexOf(option);
    if (index >= 0 && index !== item.activeIndex) {
      item.activeIndex = index;
      syncCustomSelect(select);
    }
  });

  select.addEventListener('change', () => syncCustomSelect(select));
  syncCustomSelect(select);
}

function enhanceSelects() {
  ENHANCED_SELECT_IDS.forEach(id => enhanceSelect($(id)));
}

function syncCustomSelects() {
  customSelects.forEach(item => syncCustomSelect(item.select));
}

function normalizeDateState() {
  if (!PRESETS.includes(state.preset)) persist('preset', 'today');
  if (!COMPARE_MODES.includes(state.compareMode)) persist('compareMode', 'elapsed');

  let range = getTimeRange();
  if (state.preset === 'custom') {
    persist('preset', matchingPresetForRange(range));
    range = getTimeRange();
  }

  if (state.preset !== 'custom' || !isDateValue(state.customFrom) || !isDateValue(state.customTo)) {
    storeRange(range);
  }
  if (!datePicker.open) {
    setPickerDraft(range);
  }
}

// ── Init Setup ──
function buildControls() {
  normalizeDateState();
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.dataset.i18nPlaceholder));
  const modelBtn = $('model-management-btn');
  if (modelBtn) {
    modelBtn.title = t('modelManagement');
    modelBtn.setAttribute('aria-label', t('modelManagement'));
  }

  const buildOpts = (arr, val, labelFn) => arr.map(v => `<option value="${v}" ${val === v ? 'selected' : ''}>${labelFn(v)}</option>`).join('');

  $('sel-theme').innerHTML = buildOpts(['system', 'light', 'dark'], state.theme, t);
  $('sel-lang').innerHTML = `<option value="en" ${state.lang === 'en' ? 'selected' : ''}>EN</option><option value="zh" ${state.lang === 'zh' ? 'selected' : ''}>ZH</option>`;
  // Mirror theme/lang into the model-management page's own top bar (which has
  // separate select elements so the two pages stay structurally decoupled).
  const mTheme = $('models-sel-theme');
  const mLang = $('models-sel-lang');
  if (mTheme) { mTheme.innerHTML = $('sel-theme').innerHTML; mTheme.value = state.theme; }
  if (mLang) { mLang.innerHTML = $('sel-lang').innerHTML; mLang.value = state.lang; }
  $('sel-granularity').innerHTML = buildOpts(GRANULARITIES, state.granularity, v => t('gran_' + v));
  $('sel-compare-mode').innerHTML = buildOpts(COMPARE_MODES, state.compareMode, v => t('compare_' + v));
  $('sel-refresh-interval').innerHTML = buildOpts(REFRESH_INTERVALS, state.refreshInterval, v => v >= 60 ? (v / 60) + ' ' + t('unitMin') : v + ' ' + t('unitSec'));

  const SOURCES = [['', 'allSources'], ['claude', 'claudeCode'], ['codex', 'codex'], ['openclaw', 'openClaw'], ['opencode', 'openCode'], ['mimocode', 'mimoCode'], ['kiro', 'kiro'], ['pi', 'pi']];
  $('filter-source').innerHTML = SOURCES.map(([v, k]) => `<option value="${v}" ${state.source === v ? 'selected' : ''}>${t(k)}</option>`).join('');
  renderProjectFilterOptions(projectOptionsCache);
  renderModelFilterOptions();

  renderDatePicker();
  renderCompareModeControl({ animate: false });
  syncCustomSelects();
  updateModelSelectWidth();
}

// ── Events Binding ──
$('sel-theme').onchange = e => { persist('theme', e.target.value); applyTheme(); buildControls(); };
$('sel-lang').onchange = e => {
  persist('lang', e.target.value);
  buildControls();
  if (typeof renderPricingPageFromState === 'function') renderPricingPageFromState();
  if (typeof renderAliasPageFromState === 'function') renderAliasPageFromState();
  if (typeof updateModelManagementBadge === 'function') updateModelManagementBadge();
  refresh();
  applyAutoRefresh();
};
// The model-management page has its own theme/lang selects (independent DOM).
// Forward their changes to the dashboard selects so all side effects live in
// one place; buildControls() keeps the two in sync on re-render.
$('models-sel-theme').onchange = e => { $('sel-theme').value = e.target.value; $('sel-theme').dispatchEvent(new Event('change')); };
$('models-sel-lang').onchange = e => { $('sel-lang').value = e.target.value; $('sel-lang').dispatchEvent(new Event('change')); };
$('sel-granularity').onchange = e => { persist('granularity', e.target.value); refresh(); };
$('sel-compare-mode').onchange = e => {
  const wasEnabled = isCompareEnabled();
  persist('compareMode', e.target.value);
  const enabled = isCompareEnabled();
  localStorage.setItem('au-compareEnabled', enabled ? 'true' : 'false');
  syncCustomSelect($('sel-compare-mode'));
  if (!enabled) {
    renderCompareModeControl({ animate: true });
    renderStatDeltas(null);
  } else if (wasEnabled) {
    renderCompareModeControl({ animate: false });
  }
  refresh();
};
$('sel-refresh-interval').onchange = e => { persist('refreshInterval', parseInt(e.target.value)); applyAutoRefresh(); };

$('date-range-trigger').onclick = e => {
  e.stopPropagation();
  datePicker.open ? closeDatePicker() : openDatePicker();
};
$('date-shortcuts').onclick = e => {
  const btn = e.target.closest('.date-shortcut-btn');
  if (!btn) return;
  setPreset(btn.dataset.preset, { closePicker: false });
};
$('calendar-prev').onclick = () => {
  datePicker.viewMonth = addMonths(datePicker.viewMonth || firstOfMonth(parseLocalDate(committedCustomRange().from)), -1);
  renderDatePicker();
};
$('calendar-next').onclick = () => {
  datePicker.viewMonth = addMonths(datePicker.viewMonth || firstOfMonth(parseLocalDate(committedCustomRange().from)), 1);
  renderDatePicker();
};
$('calendar-apply').onclick = () => {
  const fallback = localDateStr(new Date());
  const from = datePicker.draftFrom || committedCustomRange().from || fallback;
  const to = datePicker.draftTo || from;
  commitCustomRange(from, to, { close: true });
};
$('calendar-grid').onclick = e => {
  const btn = e.target.closest('.day-btn');
  if (!btn) return;
  selectCalendarDate(btn.dataset.date, e.detail >= 2);
};
$('calendar-grid').onmouseover = e => {
  const btn = e.target.closest('.day-btn');
  if (!btn || !datePicker.selectingEnd || !datePicker.draftFrom) return;
  if (datePicker.hoverDate === btn.dataset.date) return;
  datePicker.hoverDate = btn.dataset.date;
  renderDatePicker();
};
$('calendar-grid').onmouseleave = () => {
  if (!datePicker.hoverDate) return;
  datePicker.hoverDate = '';
  renderDatePicker();
};

$('btn-refresh').onclick = () => { refresh(); applyAutoRefresh(); };
$('btn-auto-refresh').onclick = () => { persist('autoRefresh', !state.autoRefresh); applyAutoRefresh(); };
$('filter-source').onchange = e => { persist('source', e.target.value); persistModels([]); sessionPage = 1; refresh(); };
$('filter-project').onchange = e => { persist('project', e.target.value); sessionPage = 1; refreshSessionsOnly(); };

$('filter-model-trigger').onclick = e => {
  e.stopPropagation();
  setModelFilterOpen(!modelFilterOpen);
};
$('filter-model-search').oninput = e => {
  modelFilterQuery = e.target.value;
  renderModelFilterOptions();
};
$('filter-model-options').onclick = e => {
  const option = e.target.closest('.model-multiselect-option');
  if (!option) return;
  toggleModelFilterValue(option.dataset.model);
};
$('filter-model-all').onclick = e => {
  e.stopPropagation();
  selectAllModels();
};
$('filter-model-clear').onclick = e => {
  e.stopPropagation();
  clearModelFilter();
};
$('filter-model-trigger').onkeydown = e => {
  if (['ArrowDown', 'Enter', ' '].includes(e.key)) {
    e.preventDefault();
    setModelFilterOpen(true);
  }
};
$('filter-model-search').onkeydown = e => {
  if (e.key === 'Escape') {
    closeModelFilter();
    $('filter-model-trigger').focus();
  }
};

function updateModelFilter(costModel) {
  const models = costModel.map(d => d.model).filter(Boolean);
  const prev = state.models || [];
  modelOptionsCache = models;
  const validModels = prev.filter(model => models.includes(model));
  if (validModels.length !== prev.length) {
    persistModels(validModels);
  }
  renderModelFilterOptions();
  updateModelSelectWidth();
}

document.querySelectorAll('.sortable').forEach(th => {
  th.onclick = () => {
    const k = th.dataset.sort;
    if (sessionSort.key === k) sessionSort.dir = sessionSort.dir === 'asc' ? 'desc' : 'asc';
    else { sessionSort.key = k; sessionSort.dir = ['start_time', 'total_cost', 'tokens', 'prompts'].includes(k) ? 'desc' : 'asc'; }
    sessionPage = 1;
    refreshSessionsOnly();
  };
});

window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && datePicker.open) {
    closeDatePicker();
  }
  if (e.key === 'Escape') {
    closeCustomSelects();
    closeModelFilter();
  }
});

document.addEventListener('click', e => {
  const wrap = $('filter-model-wrap');
  if (modelFilterOpen && wrap && !eventIncludesElement(e, wrap)) {
    closeModelFilter();
  }
});

