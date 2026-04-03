// =========================================================================
// App State & Data Management
// =========================================================================

const AppState = {
  patterns: [],
  progress: JSON.parse(localStorage.getItem('dsaProgress')) || {},
  activePatternIndex: null,
  activeProblemId: null,
  filter: 'all', // 'all', 'unsolved', 'solved', 'revision'
};

function saveProgress() {
  localStorage.setItem('dsaProgress', JSON.stringify(AppState.progress));
  updateGlobalProgress();
  renderSidebar();
}

function getProgress(id) {
  if (!AppState.progress[id]) {
    AppState.progress[id] = { solved: false, revision: false, notes: '' };
  }
  return AppState.progress[id];
}

function generateId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// =========================================================================
// Markdown Parser
// =========================================================================

function parseMarkdown(mdText, filename) {
  const baseFilename = filename.split('/').pop();
  
  // Split by markdown heading level 2 (## ), which seems to separate problems
  const blocks = mdText.split(/\n## /);
  
  const headerBlock = blocks[0];
  const titleMatch = headerBlock.match(/^#\s+(.*)/);
  const patternTitle = titleMatch ? titleMatch[1].trim() : baseFilename.replace('.md', '');
  
  // Everything after the first '#' heading up to the next heading is description
  const description = headerBlock.replace(/^#\s+.*\n/, '').trim();
  
  const problems = [];
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const newlineIdx = block.indexOf('\n');
    let title = block;
    let contentStr = '';
    
    if (newlineIdx !== -1) {
      title = block.substring(0, newlineIdx).trim();
      contentStr = block.substring(newlineIdx).trim();
    }
    
    const cleanTitle = title.replace(/[🌟🔎]/g, '').trim();
    const id = generateId(baseFilename + cleanTitle);
    
    problems.push({
      id,
      title: cleanTitle,
      content: '## ' + title + '\n\n' + contentStr, // Restore ## for rendering
      filename
    });
  }
  
  return { title: patternTitle, description, problems, filename };
}

// =========================================================================
// Initialization & Data Fetching
// =========================================================================

async function initApp() {
  try {
    // Ensure marked is ready
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        } else {
          return hljs.highlightAuto(code).value;
        }
      },
      breaks: false
    });

    // Fetch all predefined files from data.js
    const fetchPromises = PATTERN_FILES.map(file => 
      fetch(file)
        .then(res => {
          if(!res.ok) throw new Error(`${file} not found`);
          return res.text();
        })
        .then(text => parseMarkdown(text, file))
        .catch(err => {
          console.warn('Failed to load:', file, err);
          return null;
        })
    );
    
    const results = await Promise.all(fetchPromises);
    AppState.patterns = results.filter(p => p !== null && p.problems.length > 0);
    
    if (AppState.patterns.length === 0) {
      document.getElementById('patternList').innerHTML = `<li style="padding:15px;color:red">Failed to load patterns. Ensure you are running via a local web server (e.g. npx serve).</li>`;
      return;
    }
    
    renderSidebar();
    updateGlobalProgress();
    
    if (AppState.patterns.length > 0) {
      selectPattern(0);
    }
    
    setupEventListeners();
    
  } catch (err) {
    console.error("Initialization error:", err);
  }
}

// =========================================================================
// Rendering
// =========================================================================

function updateGlobalProgress() {
  let totalProblems = 0;
  let solvedProblems = 0;
  
  AppState.patterns.forEach(pattern => {
    totalProblems += pattern.problems.length;
    pattern.problems.forEach(prob => {
      const p = getProgress(prob.id);
      if (p.solved) solvedProblems++;
    });
  });
  
  document.getElementById('globalProgressText').textContent = `${solvedProblems}/${totalProblems}`;
  
  const percentage = totalProblems === 0 ? 0 : (solvedProblems / totalProblems) * 100;
  document.getElementById('globalProgressBar').style.width = `${percentage}%`;
}

function renderSidebar() {
  const listEl = document.getElementById('patternList');
  listEl.innerHTML = '';
  
  AppState.patterns.forEach((pattern, index) => {
    const total = pattern.problems.length;
    const solved = pattern.problems.filter(p => getProgress(p.id).solved).length;
    
    const li = document.createElement('li');
    li.className = `pattern-item ${index === AppState.activePatternIndex ? 'active' : ''}`;
    li.innerHTML = `
      <span class="pattern-item-title">${pattern.title}</span>
      <span class="pattern-item-progress">${solved}/${total}</span>
    `;
    li.onclick = () => selectPattern(index);
    listEl.appendChild(li);
  });
}

function selectPattern(index) {
  AppState.activePatternIndex = index;
  renderSidebar(); // Update active class
  
  const pattern = AppState.patterns[index];
  
  document.getElementById('patternHeader').innerHTML = `<h2>${pattern.title}</h2>`;
  document.getElementById('filtersContainer').classList.remove('hidden');
  
  const descEl = document.getElementById('patternDescription');
  if (pattern.description) {
    descEl.innerHTML = DOMPurify.sanitize(marked.parse(pattern.description));
    descEl.classList.remove('hidden');
  } else {
    descEl.classList.add('hidden');
  }
  
  document.getElementById('problemList').classList.remove('hidden');
  document.getElementById('mainScrollArea').scrollTop = 0;
  
  renderProblems();
}

function renderProblems() {
  if (AppState.activePatternIndex === null) return;
  
  const pattern = AppState.patterns[AppState.activePatternIndex];
  const listEl = document.getElementById('problemList');
  listEl.innerHTML = '';
  
  const filter = AppState.filter;
  
  let firstUnsolvedId = null;

  pattern.problems.forEach(prob => {
    const prog = getProgress(prob.id);
    
    // Apply filter
    if (filter === 'solved' && !prog.solved) return;
    if (filter === 'unsolved' && prog.solved) return;
    if (filter === 'revision' && !prog.revision) return;
    
    if (!prog.solved && !firstUnsolvedId) {
      firstUnsolvedId = prob.id;
    }
    
    // Determine card status class
    let statusClass = 'status-unsolved';
    if (prog.solved) statusClass = 'status-solved';
    else if (prog.revision) statusClass = 'status-revision';
    
    const card = document.createElement('div');
    card.className = `problem-card ${statusClass} ${prob.id === AppState.activeProblemId ? 'active' : ''}`;
    
    // Build badges
    let badgesHtml = '';
    if (prog.revision) badgesHtml += '<span class="badge badge-revision">Revision</span>';
    
    card.innerHTML = `
      <input type="checkbox" class="problem-checkbox" ${prog.solved ? 'checked' : ''}>
      <div class="problem-title">${prob.title}</div>
      ${badgesHtml ? `<div class="meta-badges">${badgesHtml}</div>` : ''}
    `;
    
    // Events
    card.onclick = (e) => {
      // Don't select problem if checkbox was clicked
      if (e.target.classList.contains('problem-checkbox')) {
        toggleSolved(prob.id, e.target.checked);
        return;
      }
      selectProblem(prob.id);
    };
    
    listEl.appendChild(card);
  });
  
  // Optionally auto-scroll to the first unsolved problem here, but only on first load of pattern
  // For simplicity, letting the user manually browse is often better UX than forced jumping.
}

function toggleSolved(id, isSolved) {
  const prog = getProgress(id);
  prog.solved = isSolved;
  saveProgress();
  renderProblems();
  
  // If the details view is showing this problem, update its checkbox
  if (AppState.activeProblemId === id) {
    document.getElementById('solvedCheckboxDetails').checked = isSolved;
  }
}

function selectProblem(id) {
  AppState.activeProblemId = id;
  renderProblems(); // Update active class
  
  // Find the problem data
  let problemData = null;
  for (let pattern of AppState.patterns) {
    const found = pattern.problems.find(p => p.id === id);
    if (found) { problemData = found; break; }
  }
  
  if (!problemData) return;
  
  // Show details panel
  document.getElementById('detailsPlaceholder').classList.add('hidden');
  document.getElementById('detailsContent').classList.remove('hidden');
  
  // Open the sliding panel
  document.getElementById('detailsPanel').classList.add('open');
  
  // Render markdown
  document.getElementById('problemBody').innerHTML = DOMPurify.sanitize(marked.parse(problemData.content));
  
  // Init state
  const prog = getProgress(id);
  document.getElementById('revisionCheckbox').checked = prog.revision;
  document.getElementById('solvedCheckboxDetails').checked = prog.solved;
  document.getElementById('problemNotes').value = prog.notes || '';
}

// =========================================================================
// Event Listeners
// =========================================================================

function setupEventListeners() {
  document.getElementById('problemFilter').addEventListener('change', (e) => {
    AppState.filter = e.target.value;
    renderProblems();
  });
  
  document.getElementById('closeDetailsBtn').addEventListener('click', () => {
    document.getElementById('detailsPanel').classList.remove('open');
  });
  
  // Resizer logic
  const resizer = document.getElementById('resizer');
  const detailsPanel = document.getElementById('detailsPanel');
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    detailsPanel.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    // Calculate new width: window width - mouse X
    let newWidth = window.innerWidth - e.clientX;
    // Constrain width
    if (newWidth < 400) newWidth = 400;
    if (newWidth > window.innerWidth * 0.9) newWidth = window.innerWidth * 0.9;
    
    detailsPanel.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      detailsPanel.classList.remove('resizing');
      document.body.style.cursor = '';
    }
  });
  
  document.getElementById('revisionCheckbox').addEventListener('change', (e) => {
    if (!AppState.activeProblemId) return;
    const prog = getProgress(AppState.activeProblemId);
    prog.revision = e.target.checked;
    saveProgress();
    renderProblems();
  });
  
  document.getElementById('solvedCheckboxDetails').addEventListener('change', (e) => {
    if (!AppState.activeProblemId) return;
    toggleSolved(AppState.activeProblemId, e.target.checked);
  });
  
  let notesTimeout;
  document.getElementById('problemNotes').addEventListener('input', (e) => {
    if (!AppState.activeProblemId) return;
    
    // Debounce save
    clearTimeout(notesTimeout);
    notesTimeout = setTimeout(() => {
      const prog = getProgress(AppState.activeProblemId);
      prog.notes = e.target.value;
      saveProgress();
    }, 500);
  });
  
  // Close details panel on mobile if clicking outside (optional enhancement)
  // For now, simplicity rules.
  
  // Keyboard navigation for 'j', 'k'
  document.addEventListener('keydown', (e) => {
    // Escape early if focused within textarea/input to allow normal typing
    if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
    
    if (e.key === 'j' || e.key === 'k') {
      if (AppState.activePatternIndex === null) return;
      const pattern = AppState.patterns[AppState.activePatternIndex];
      if (!pattern) return;
      
      const pList = pattern.problems; // Ignoring filters for absolute nav, or apply filters
      // Apply strict filtering so J/K only jumps between visible items
      const filter = AppState.filter;
      const visibleProblems = pList.filter(p => {
        const prog = getProgress(p.id);
        if (filter === 'solved' && !prog.solved) return false;
        if (filter === 'unsolved' && prog.solved) return false;
        if (filter === 'revision' && !prog.revision) return false;
        return true;
      });
      
      if(visibleProblems.length === 0) return;
      
      let currentIndex = AppState.activeProblemId 
        ? visibleProblems.findIndex(p => p.id === AppState.activeProblemId) 
        : -1;
        
      if (e.key === 'j') {
        currentIndex = (currentIndex + 1) % visibleProblems.length;
      } else if (e.key === 'k') {
        currentIndex = (currentIndex - 1 + visibleProblems.length) % visibleProblems.length;
      }
      
      selectProblem(visibleProblems[currentIndex].id);
      
      // Auto scroll the problem list vertically
      const activeCard = document.querySelector('.problem-card.active');
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}

// Bootstrap
document.addEventListener('DOMContentLoaded', initApp);
