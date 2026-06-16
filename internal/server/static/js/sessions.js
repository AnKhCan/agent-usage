// ── Time Formatting ──
function parseSessionTime(ts) {
  if (!ts) return null;
  const raw = String(ts).trim();
  const goTime = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+([+-]\d{2})(\d{2})(?:\s+\S+)?$/);
  if (goTime) {
    const d = new Date(`${goTime[1]}T${goTime[2]}${goTime[3]}:${goTime[4]}`);
    return isNaN(d) ? null : d;
  }
  const d = new Date(raw.replace(' ', 'T'));
  return isNaN(d) ? null : d;
}

function relTime(ts) {
  if (!ts) return '-';
  const d = parseSessionTime(ts);
  if (!d) return String(ts).replace('T', ' ').slice(0, 16);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return t('justNow');
  if (diff < 3600) return Math.floor(diff / 60) + t('mAgo');
  if (diff < 86400) return Math.floor(diff / 3600) + t('hAgo');
  if (diff < 604800) return Math.floor(diff / 86400) + t('dAgo');
  return d.toLocaleDateString();
}

function fmtLocalTime(ts) {
  if (!ts) return '';
  const d = parseSessionTime(ts);
  if (!d) return ts;
  return d.toLocaleString();
}

// ── Session Table Logic ──
function renderSessionTable() {
  const page = allSessions;
  const totalPages = Math.max(1, sessionTotalPages || 1);
  const total = sessionTotal || 0;
  if (sessionPage > totalPages) sessionPage = totalPages;
  const start = (sessionPage - 1) * PAGE_SIZE;
  const visibleStart = total > 0 ? start + 1 : 0;
  const visibleEnd = Math.min(start + page.length, total);
  const k = sessionSort.key;

  // Update headers
  document.querySelectorAll('.sortable').forEach(th => {
    th.classList.remove('asc', 'desc');
    let arrow = th.querySelector('.sort-arrow');
    if (!arrow) { arrow = document.createElement('span'); arrow.className = 'sort-arrow'; th.appendChild(arrow); }
    if (th.dataset.sort === k) { th.classList.add(sessionSort.dir); arrow.textContent = sessionSort.dir === 'asc' ? '\u25B2' : '\u25BC'; }
    else { arrow.textContent = '\u25B4'; }
  });

  const tb = $('session-table');
  if (page.length === 0) {
    tb.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px;">${t('noSessions')}</td></tr>`;
  } else {
    // Render only main rows to prevent flicker
    tb.innerHTML = page.map(s => {
      const isExpanded = expandedSessions.has(s.session_id);
      return `<tr class="session-row${isExpanded ? ' expanded' : ''}" data-sid="${esc(s.session_id)}">
        <td><span class="badge ${esc(s.source)}">${esc(s.source)}</span></td>
        <td title="${esc(s.cwd)}">${esc(s.project || s.cwd || '-')}</td>
        <td>${esc(s.git_branch || '-')}</td>
        <td title="${esc(fmtLocalTime(s.start_time))}">${esc(fmtLocalTime(s.start_time) || '-')}</td>
        <td>${s.prompts}</td><td>${fmt(s.tokens || 0)}</td><td style="font-weight:500;color:var(--green)">${fmtCost(s.total_cost || 0)}</td>
        <td>
          <button class="expand-btn ${isExpanded ? 'open' : ''}" data-sid="${esc(s.session_id)}">
            <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');

    // Re-attach already expanded details
    page.forEach(s => { if (expandedSessions.has(s.session_id)) fetchAndInjectDetail(s.session_id, true); });
  }

  // Pagination UI
  const pag = $('pagination');
  if (totalPages <= 1) {
    pag.innerHTML = total > 0 ? `<span class="page-info">${total} total</span>` : '';
  } else {
    let html = `<span class="page-info">${visibleStart}-${visibleEnd} of ${total}</span>`;
    html += `<button class="page-btn" data-page="${sessionPage - 1}" ${sessionPage === 1 ? 'disabled' : ''}>&larr;</button>`;
    const pStart = Math.max(1, Math.min(sessionPage - 2, totalPages - 4)), pEnd = Math.min(totalPages, pStart + 4);
    for (let i = pStart; i <= pEnd; i++) html += `<button class="page-btn ${i === sessionPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    html += `<button class="page-btn" data-page="${sessionPage + 1}" ${sessionPage === totalPages ? 'disabled' : ''}>&rarr;</button>`;
    pag.innerHTML = html;
  }
}

// ── DOM-based Row Expansion (No full render) ──
document.addEventListener('click', e => {
  const rangeWrap = $('range-control-wrap');
  if (datePicker.open && rangeWrap && !eventIncludesElement(e, rangeWrap)) {
    closeDatePicker();
  }
  if (!e.target.closest('.custom-select-wrap')) {
    closeCustomSelects();
  }

  const expandBtn = e.target.closest('.expand-btn');
  if (expandBtn) {
    const sid = expandBtn.dataset.sid;
    const sessionRow = expandBtn.closest('.session-row');
    if (expandedSessions.has(sid)) {
      expandedSessions.delete(sid);
      expandBtn.classList.remove('open');
      if (sessionRow) sessionRow.classList.remove('expanded');
      const detailRow = document.getElementById(`detail-row-${sid}`);
      if (detailRow) {
        detailRow.classList.remove('show');
        setTimeout(() => detailRow.remove(), 300); // Wait for transition
      }
    } else {
      expandedSessions.add(sid);
      expandBtn.classList.add('open');
      if (sessionRow) sessionRow.classList.add('expanded');
      fetchAndInjectDetail(sid);
    }
  }

  const pageBtn = e.target.closest('.page-btn:not(:disabled)');
  if (pageBtn && !pageBtn.classList.contains('active')) {
    sessionPage = parseInt(pageBtn.dataset.page);
    refreshSessionsOnly();
  }
});

async function fetchAndInjectDetail(sid, isRestore = false) {
  const tr = document.querySelector(`.session-row[data-sid="${sid}"]`);
  if (!tr) return;

  if (!isRestore) {
    tr.insertAdjacentHTML('afterend', `
      <tr class="detail-row" id="detail-row-${sid}">
        <td colspan="8">
          <div class="detail-content" id="detail-content-${sid}">
             <div style="color:var(--muted);font-size:12px;">Loading details...</div>
          </div>
        </td>
      </tr>
    `);
    setTimeout(() => document.getElementById(`detail-row-${sid}`).classList.add('show'), 10);
  }

  try {
    const res = await fetch(`/api/session-detail?session_id=${encodeURIComponent(sid)}`);
    const data = await res.json();
    const contentBox = document.getElementById(`detail-content-${sid}`);
    if (!contentBox) return;

    if (!data || data.length === 0) {
      contentBox.innerHTML = `<div style="color:var(--muted);font-size:13px;">No detailed model breakdown.</div>`;
      return;
    }

    contentBox.innerHTML = `
      <table class="detail-table">
        <colgroup><col style="width:28%"><col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:14%"><col style="width:10%"></colgroup>
        <thead>
          <tr><th>${t('model')}</th><th>${t('calls')}</th><th>${t('input')}</th><th>${t('output')}</th>
          <th>${t('cacheRead')}</th><th>${t('cacheCreate')}</th><th>${t('cost')}</th></tr>
        </thead>
        <tbody>
          ${data.map(d => `<tr>
            <td>${esc(d.model)}</td><td>${d.calls}</td><td>${fmt(d.input_tokens)}</td><td>${fmt(d.output_tokens)}</td>
            <td>${fmt(d.cache_read)}</td><td>${fmt(d.cache_create)}</td><td>${fmtCost(d.cost_usd)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    const el = document.getElementById(`detail-content-${sid}`);
    if (el) el.innerHTML = `<div style="color:#ef4444;">Failed to load details.</div>`;
  }
}

