// =========================================================================
// App State & Data Management
// =========================================================================

function getProgress(id) {
  return AppState.progress[id] ||= { solved: false, revision: false, notes: '' };
}

const AppState = {
  patterns: [],
  progress: (() => { try { return JSON.parse(localStorage.getItem('dsaProgress')) || {}; } catch { return {}; } })(),
  activePatternIndex: null,
  activeProblemId: null,
  filter: 'all',
};

function saveProgress() {
  localStorage.setItem('dsaProgress', JSON.stringify(AppState.progress));
  updateGlobalProgress();
  renderSidebar();
}

function toggleSolved(id, isSolved) {
  getProgress(id).solved = isSolved;
  saveProgress();
  renderProblems();
  if (AppState.activeProblemId === id) document.getElementById('solvedCheckboxDetails').checked = isSolved;
}

function generateId(str) {
  return Math.abs([...str].reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0) | 0, 0)).toString(36);
}

// =========================================================================
// Markdown Parser
// =========================================================================

function parseMarkdown(mdText, filename) {
  const blocks = mdText.split(/\n## /);
  const header = blocks[0];
  return {
    title: (header.match(/^#\s+(.*)/)?.[1] || filename.split('/').pop().replace('.md', '')).trim(),
    description: header.replace(/^#\s+.*\n/, '').trim(),
    filename,
    problems: blocks.slice(1).map(block => {
      const nl = block.indexOf('\n');
      const title = nl !== -1 ? block.substring(0, nl).trim() : block;
      const cleanTitle = title.replace(/[🌟🔎]/g, '').trim();
      return {
        id: generateId(filename.split('/').pop() + cleanTitle),
        title: cleanTitle,
        content: `## ${title}\n\n${nl !== -1 ? block.substring(nl).trim() : ''}`
      };
    })
  };
}

// =========================================================================
// Initialization & Data Fetching
// =========================================================================

function initApp() {
  marked.setOptions({
    highlight: (code, lang) => lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value,
    breaks: false
  });

  AppState.patterns = PATTERN_FILES.map(f => PATTERN_CONTENT[f] ? parseMarkdown(PATTERN_CONTENT[f], f) : null).filter(p => p?.problems.length);

  if (!AppState.patterns.length) {
    document.getElementById('patternList').innerHTML = `<li style="color:red;padding:15px">Failed to load patterns. Check web server.</li>`;
    return;
  }

  renderSidebar();
  updateGlobalProgress();
  if (AppState.patterns.length) selectPattern(0);
  setupEventListeners();
}

// =========================================================================
// Rendering
// =========================================================================

function updateGlobalProgress() {
  let tot = 0, sol = 0;
  AppState.patterns.forEach(p => p.problems.forEach(prob => { tot++; if (getProgress(prob.id).solved) sol++; }));
  document.getElementById('globalProgressText').textContent = `${sol}/${tot}`;
  document.getElementById('globalProgressBar').style.width = tot ? `${(sol / tot) * 100}%` : '0%';
}

function renderSidebar() {
  const list = document.getElementById('patternList');
  list.innerHTML = '';
  AppState.patterns.forEach((p, i) => {
    const sol = p.problems.filter(prob => getProgress(prob.id).solved).length;
    const li = document.createElement('li');
    li.className = `pattern-item ${i === AppState.activePatternIndex ? 'active' : ''}`;
    li.innerHTML = `<span class="pattern-item-title">${p.title}</span><span class="pattern-item-progress">${sol}/${p.problems.length}</span>`;
    li.onclick = () => selectPattern(i);
    list.appendChild(li);
  });
}

function selectPattern(index) {
  AppState.activePatternIndex = index;
  renderSidebar();
  const p = AppState.patterns[index];
  document.getElementById('patternHeader').innerHTML = `<h2>${p.title}</h2>`;
  document.getElementById('filtersContainer').classList.remove('hidden');
  const d = document.getElementById('patternDescription');
  d.innerHTML = p.description ? DOMPurify.sanitize(marked.parse(p.description)) : '';
  d.classList.toggle('hidden', !p.description);
  document.getElementById('problemList').classList.remove('hidden');
  document.getElementById('mainScrollArea').scrollTop = 0;
  renderProblems();
}

function renderProblems() {
  if (AppState.activePatternIndex === null) return;
  const list = document.getElementById('problemList');
  list.innerHTML = '';
  AppState.patterns[AppState.activePatternIndex].problems.forEach(prob => {
    const prog = getProgress(prob.id), f = AppState.filter;
    if ((f === 'solved' && !prog.solved) || (f === 'unsolved' && prog.solved) || (f === 'revision' && !prog.revision)) return;

    const el = document.createElement('div');
    el.className = `problem-card ${prog.solved ? 'status-solved' : (prog.revision ? 'status-revision' : 'status-unsolved')} ${prob.id === AppState.activeProblemId ? 'active' : ''}`;
    el.innerHTML = `<input type="checkbox" class="problem-checkbox" ${prog.solved ? 'checked' : ''}><div class="problem-title">${prob.title}</div>${prog.revision ? '<div class="meta-badges"><span class="badge badge-revision">Revision</span></div>' : ''}`;
    el.onclick = e => e.target.type === 'checkbox' ? toggleSolved(prob.id, e.target.checked) : selectProblem(prob.id);
    list.appendChild(el);
  });
}

function selectProblem(id) {
  AppState.activeProblemId = id;
  renderProblems();
  const prob = AppState.patterns.flatMap(p => p.problems).find(p => p.id === id);
  if (!prob) return;

  document.getElementById('detailsPlaceholder').classList.add('hidden');
  document.getElementById('detailsContent').classList.remove('hidden');
  document.getElementById('detailsPanel').classList.add('open');
  document.getElementById('problemBody').innerHTML = DOMPurify.sanitize(marked.parse(prob.content));

  const prog = getProgress(id);
  document.getElementById('revisionCheckbox').checked = prog.revision;
  document.getElementById('solvedCheckboxDetails').checked = prog.solved;
  document.getElementById('problemNotes').value = prog.notes || '';
}

// =========================================================================
// Event Listeners
// =========================================================================

function setupEventListeners() {
  document.getElementById('problemFilter').addEventListener('change', e => { AppState.filter = e.target.value; renderProblems(); });
  document.getElementById('closeDetailsBtn').addEventListener('click', () => document.getElementById('detailsPanel').classList.remove('open'));

  const dp = document.getElementById('detailsPanel'), root = document.documentElement;
  let resR = false, resL = false;

  document.getElementById('resizer').addEventListener('mousedown', e => { e.preventDefault(); resR = true; dp.classList.add('resizing'); document.body.style.cursor = 'ew-resize'; });
  document.getElementById('leftResizer')?.addEventListener('mousedown', e => { e.preventDefault(); resL = true; document.body.classList.add('resizing-left'); document.body.style.cursor = 'ew-resize'; });

  document.addEventListener('mousemove', e => {
    const cw = window.innerWidth;
    if (resR) dp.style.width = `${Math.max(cw * 0.5, Math.min(cw - e.clientX, cw - (document.getElementById('sidebar')?.offsetWidth || cw * 0.2)))}px`;
    if (resL) root.style.setProperty('--sidebar-width', `${Math.max(18, Math.min((e.clientX / cw) * 100, 25))}%`);
  });

  document.addEventListener('mouseup', () => {
    if (resR || resL) { resR = resL = false; dp.classList.remove('resizing'); document.body.classList.remove('resizing-left'); document.body.style.cursor = ''; }
  });

  document.getElementById('revisionCheckbox').addEventListener('change', e => {
    if (!AppState.activeProblemId) return; getProgress(AppState.activeProblemId).revision = e.target.checked; saveProgress(); renderProblems();
  });
  document.getElementById('solvedCheckboxDetails').addEventListener('change', e => AppState.activeProblemId && toggleSolved(AppState.activeProblemId, e.target.checked));

  let t;
  document.getElementById('problemNotes').addEventListener('input', e => {
    if (!AppState.activeProblemId) return;
    clearTimeout(t);
    t = setTimeout(() => { getProgress(AppState.activeProblemId).notes = e.target.value; saveProgress(); }, 500);
  });

  document.addEventListener('keydown', e => {
    if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName) || !['j', 'k'].includes(e.key) || AppState.activePatternIndex === null) return;
    const vis = AppState.patterns[AppState.activePatternIndex].problems.filter(p => {
      const sol = getProgress(p.id).solved, rev = getProgress(p.id).revision, f = AppState.filter;
      return !(f === 'solved' && !sol) && !(f === 'unsolved' && sol) && !(f === 'revision' && !rev);
    });
    if (!vis.length) return;
    let i = vis.findIndex(p => p.id === AppState.activeProblemId);
    selectProblem(vis[i = e.key === 'j' ? (i + 1) % vis.length : (i - 1 + vis.length) % vis.length].id);
    document.querySelector('.problem-card.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

document.addEventListener('DOMContentLoaded', initApp);
