const A4_WIDTH_PX = (210 / 25.4) * 96;

const PREFS_KEY = 'content-pdf:prefs';
const LAST_DOC_KEY = 'content-pdf:last-doc';
const DEFAULT_PREFS = { fontSize: '12px', margin: '20mm', grid: false };

const DOC_ICON = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8M8 17h8" />
  </svg>`;

const editor = document.getElementById('editor');
const pdfPreview = document.getElementById('pdf-preview');
const previewWrap = document.querySelector('.preview-wrap');
const docsList = document.getElementById('docs-list');
const docsPopover = document.getElementById('docs-popover');
const optionsPopover = document.getElementById('options-popover');
const fontSelect = document.getElementById('font-size');
const marginSelect = document.getElementById('margin-size');
const gridToggle = document.getElementById('toggle-grid');
const exportBtn = document.getElementById('export-pdf');
const pickFolderBtn = document.getElementById('pick-folder');
const folderInput = document.getElementById('folder-input');
const folderInfo = document.getElementById('folder-info');
const docsPopoverTitle = document.getElementById('docs-popover-title');
const saveBtn = document.getElementById('save-doc');
const previewTitle = document.getElementById('preview-title');

const measureHost = document.createElement('div');
measureHost.className = 'pdf-preview pdf-measure';
measureHost.setAttribute('aria-hidden', 'true');
document.body.appendChild(measureHost);

let activeBtn = null;
let prefs = { ...DEFAULT_PREFS };
let DOCS = [];
const docButtons = new Map();

let currentDoc = null;
let savedText = '';
let dirty = false;
let reconnectPending = false;
const fileHandles = new Map();

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Preferencias (localStorage) ---------- */
function getOptionValues(select) {
  return Array.from(select.options).map((option) => option.value);
}

function loadPrefs() {
  const storedPrefs = { ...DEFAULT_PREFS };

  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return storedPrefs;

    const stored = JSON.parse(raw);
    if (getOptionValues(fontSelect).includes(stored.fontSize)) {
      storedPrefs.fontSize = stored.fontSize;
    }
    if (getOptionValues(marginSelect).includes(stored.margin)) {
      storedPrefs.margin = stored.margin;
    }
    if (typeof stored.grid === 'boolean') {
      storedPrefs.grid = stored.grid;
    }
  } catch (err) {
    return { ...DEFAULT_PREFS };
  }

  return storedPrefs;
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    /* localStorage no disponible: se usan los valores en memoria */
  }
}

function applyPrefs() {
  fontSelect.value = prefs.fontSize;
  marginSelect.value = prefs.margin;
  gridToggle.checked = prefs.grid;

  pdfPreview.style.setProperty('--doc-font-size', prefs.fontSize);
  pdfPreview.style.setProperty('--page-margin', prefs.margin);
  pdfPreview.classList.toggle('grid', prefs.grid);
}

function getLastDocPath() {
  try {
    return localStorage.getItem(LAST_DOC_KEY);
  } catch (err) {
    return null;
  }
}

function saveLastDoc(path) {
  try {
    localStorage.setItem(LAST_DOC_KEY, path);
  } catch (err) {
    /* localStorage no disponible */
  }
}

/* ---------- Sesión de carpeta (IndexedDB) ---------- */
function openHandlesDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }

    const request = indexedDB.open('content-pdf-session', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('handles')) {
        request.result.createObjectStore('handles');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
  });
}

function requestFromStore(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', mode);
    const request = action(tx.objectStore('handles'));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function saveFolderHandle(handle) {
  let db = null;

  try {
    db = await openHandlesDb();
    await requestFromStore(db, 'readwrite', (store) => store.put(handle, 'folder'));
  } catch (err) {
    /* IndexedDB no disponible: la sesión no persiste */
  } finally {
    if (db) db.close();
  }
}

async function loadFolderHandle() {
  let db = null;

  try {
    db = await openHandlesDb();
    const handle = await requestFromStore(db, 'readonly', (store) => store.get('folder'));
    return handle || null;
  } catch (err) {
    return null;
  } finally {
    if (db) db.close();
  }
}

/* ---------- Documentos ---------- */
function findDocByPath(path) {
  if (!path) return null;

  for (const group of DOCS) {
    const file = group.files.find((item) => item.path === path);
    if (file) return file;
  }

  return null;
}

function isMarkdown(name) {
  return /\.md$/i.test(name);
}

function formatDocName(name) {
  return name
    .replace(/\.md$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (match, prefix, char) => prefix + char.toUpperCase());
}

function buildDocsFromEntries(entries) {
  const groupsMap = new Map();
  let rootName = '';

  entries.forEach((entry) => {
    const relativePath = entry.relativePath || entry.file.name;
    const segments = relativePath.split('/');
    rootName = rootName || segments[0];

    let base = segments.slice(1);
    const contentIndex = base.findIndex((segment) => segment.toLowerCase() === 'content');
    if (contentIndex !== -1) {
      base = base.slice(contentIndex + 1);
    }

    const unitName = base.length >= 2 ? base[base.length - 2] : 'General';
    const parentPath = base.slice(0, -1).join('/') || 'General';

    if (!groupsMap.has(parentPath)) {
      groupsMap.set(parentPath, { key: parentPath, unit: unitName, files: [] });
    }

    groupsMap.get(parentPath).files.push({
      name: formatDocName(entry.file.name),
      path: base.join('/') || entry.file.name,
      file: entry.file,
      handle: entry.handle || null,
    });
  });

  const groups = Array.from(groupsMap.values());

  groups.forEach((group) => {
    group.files.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  });

  groups.sort((a, b) => {
    if (a.key === 'General') return -1;
    if (b.key === 'General') return 1;
    return a.key.localeCompare(b.key, 'es', { numeric: true });
  });

  return { groups, rootName };
}

function setActive(btn) {
  if (activeBtn) activeBtn.classList.remove('active');
  activeBtn = btn;
  if (activeBtn) activeBtn.classList.add('active');
}

function buildDocsTree() {
  const root = { dirs: new Map(), files: [] };

  DOCS.forEach((group) => {
    const segments = group.key === 'General' ? [] : group.key.split('/');
    let node = root;

    segments.forEach((segment) => {
      if (!node.dirs.has(segment)) {
        node.dirs.set(segment, { dirs: new Map(), files: [] });
      }
      node = node.dirs.get(segment);
    });

    node.files.push(...group.files);
  });

  return root;
}

function countTreeFiles(node) {
  let total = node.files.length;
  node.dirs.forEach((child) => {
    total += countTreeFiles(child);
  });
  return total;
}

const DIR_ICON = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>`;

const CHEVRON_ICON = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>`;

function buildTreeListNode(parentPath, name, node) {
  const item = document.createElement('li');
  item.className = 'tree-dir';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tree-dir-toggle';
  toggle.setAttribute('aria-expanded', 'true');

  const chevron = document.createElement('span');
  chevron.className = 'tree-chevron';
  chevron.innerHTML = CHEVRON_ICON;

  const label = document.createElement('span');
  label.className = 'tree-dir-name';
  label.textContent = name;

  const count = document.createElement('span');
  count.className = 'tree-count';
  count.textContent = String(countTreeFiles(node));

  toggle.appendChild(chevron);
  toggle.appendChild(label);
  toggle.appendChild(count);

  const childPath = parentPath ? `${parentPath}/${name}` : name;
  toggle.title = childPath;

  toggle.addEventListener('click', () => {
    const collapsed = item.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  item.appendChild(toggle);
  item.appendChild(buildTreeChildren(childPath, node));

  return item;
}

function buildTreeChildren(parentPath, node) {
  const children = document.createElement('ul');
  children.className = 'tree-children';

  Array.from(node.dirs.keys())
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    .forEach((name) => {
      children.appendChild(buildTreeListNode(parentPath, name, node.dirs.get(name)));
    });

  node.files
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
    .forEach((file) => {
      children.appendChild(buildDocListNode(file));
    });

  return children;
}

function buildDocListNode(file) {
  const item = document.createElement('li');
  const btn = document.createElement('button');
  const label = document.createElement('span');

  btn.type = 'button';
  btn.className = 'doc-btn';
  btn.innerHTML = DOC_ICON;
  label.textContent = file.name;
  btn.appendChild(label);

  btn.addEventListener('click', () => {
    if (!confirmDiscardChanges()) return;

    loadDoc(file, btn);
    if (docsPopover && typeof docsPopover.hidePopover === 'function') {
      docsPopover.hidePopover();
    }
  });

  item.appendChild(btn);
  docButtons.set(file.path, btn);
  return item;
}

function buildDocsList() {
  docsList.innerHTML = '';
  docButtons.clear();

  const root = buildDocsTree();

  Array.from(root.dirs.keys())
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    .forEach((name) => {
      docsList.appendChild(buildTreeListNode('', name, root.dirs.get(name)));
    });

  root.files
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
    .forEach((file) => {
      docsList.appendChild(buildDocListNode(file));
    });
}

/* ---------- Paginación A4 ---------- */
function syncMeasureStyles() {
  measureHost.style.setProperty('--doc-font-size', prefs.fontSize);
  measureHost.style.setProperty('--page-margin', prefs.margin);
}

function createPage() {
  const page = document.createElement('div');
  page.className = 'pdf-page';

  const content = document.createElement('div');
  content.className = 'pdf-content';
  page.appendChild(content);

  return { page, content };
}

function isOverflowing(content) {
  if (content.scrollHeight > content.clientHeight + 1) return true;

  const last = content.lastElementChild;
  if (!last) return false;

  const contentStyle = getComputedStyle(content);
  const lastStyle = getComputedStyle(last);
  const limit = content.getBoundingClientRect().bottom - parseFloat(contentStyle.paddingBottom);
  const bottom = last.getBoundingClientRect().bottom + (parseFloat(lastStyle.marginBottom) || 0);

  return bottom > limit + 1;
}

function toTopLevelNodes(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  return Array.from(template.content.childNodes).filter(
    (node) => node.nodeType !== Node.TEXT_NODE || node.textContent.trim() !== ''
  );
}

function isGapNode(node) {
  return node.nodeType === Node.ELEMENT_NODE && node.classList.contains('gap');
}

function buildListFragment(list, item, index) {
  const fragment = list.cloneNode(false);

  if (fragment.tagName === 'OL') {
    const baseStart = Number.parseInt(list.getAttribute('start') || '1', 10) || 1;
    fragment.setAttribute('start', String(baseStart + index));
  }

  fragment.appendChild(item.cloneNode(true));
  return fragment;
}

function splitList(list) {
  const items = Array.from(list.children).filter((child) => child.tagName === 'LI');
  if (items.length < 2) return null;

  return items.map((item, index) => buildListFragment(list, item, index));
}

function splitTable(table) {
  const head = table.querySelector('thead');
  const body = table.querySelector('tbody');
  const rows = Array.from((body || table).children).filter((child) => child.tagName === 'TR');

  if (rows.length < 2) return null;

  return rows.map((row) => {
    const fragment = table.cloneNode(false);
    if (head) fragment.appendChild(head.cloneNode(true));

    const newBody = document.createElement('tbody');
    newBody.appendChild(row.cloneNode(true));
    fragment.appendChild(newBody);

    return fragment;
  });
}

function buildPreFragment(pre, lines) {
  const fragment = pre.cloneNode(false);
  const code = pre.querySelector('code');

  if (code) {
    const newCode = code.cloneNode(false);
    newCode.textContent = lines.join('\n');
    fragment.appendChild(newCode);
  } else {
    fragment.textContent = lines.join('\n');
  }

  return fragment;
}

function splitPre(pre) {
  const code = pre.querySelector('code');
  const source = code ? code.textContent : pre.textContent;
  const lines = source.split('\n');

  if (lines.length < 2) return null;

  const middle = Math.ceil(lines.length / 2);
  return [
    buildPreFragment(pre, lines.slice(0, middle)),
    buildPreFragment(pre, lines.slice(middle)),
  ];
}

function splitCodeLines(source) {
  const lines = source.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function getCodeLanguage(code) {
  if (!code) return '';
  const match = Array.from(code.classList).find((name) => name.startsWith('language-'));
  return match ? match.slice('language-'.length).toLowerCase() : '';
}

function codeLanguageLabel(lang) {
  if (!lang) return 'Código';
  return CODE_LANG_LABELS[lang] || lang.toUpperCase();
}

function buildCodeGutter(startLine, count) {
  const gutter = document.createElement('div');
  gutter.className = 'code-block__gutter';
  gutter.setAttribute('aria-hidden', 'true');

  for (let index = 0; index < count; index += 1) {
    const line = document.createElement('span');
    line.textContent = String(startLine + index);
    gutter.appendChild(line);
  }

  return gutter;
}

function buildCodeBar(lang) {
  const bar = document.createElement('div');
  bar.className = 'code-block__bar';

  const dots = document.createElement('span');
  dots.className = 'code-block__dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.innerHTML = '<i></i><i></i><i></i>';

  const label = document.createElement('span');
  label.className = 'code-block__lang';
  label.textContent = codeLanguageLabel(lang);

  bar.appendChild(dots);
  bar.appendChild(label);

  return bar;
}

function buildCodeBlockFragment(block, lines, startLine, withHeader) {
  const fragment = block.cloneNode(false);
  fragment.dataset.startLine = String(startLine);

  const bar = withHeader ? block.querySelector('.code-block__bar') : null;
  if (bar) {
    fragment.appendChild(bar.cloneNode(true));
  } else {
    fragment.classList.add('code-block--continued');
  }

  const body = document.createElement('div');
  body.className = 'code-block__body';
  body.appendChild(buildCodeGutter(startLine, lines.length));

  const pre = block.querySelector('pre');
  const preFragment = pre ? pre.cloneNode(false) : document.createElement('pre');
  const code = pre ? pre.querySelector('code') : null;

  if (code) {
    const codeFragment = code.cloneNode(false);
    codeFragment.textContent = lines.join('\n');
    preFragment.appendChild(codeFragment);
  } else {
    preFragment.textContent = lines.join('\n');
  }

  body.appendChild(preFragment);
  fragment.appendChild(body);

  return fragment;
}

function splitCodeBlock(block) {
  const pre = block.querySelector('pre');
  const code = pre ? pre.querySelector('code') : null;
  const source = code ? code.textContent : pre ? pre.textContent : '';
  const lines = splitCodeLines(source);

  if (lines.length < 2) return null;

  const start = Number.parseInt(block.dataset.startLine || '1', 10) || 1;
  const middle = Math.ceil(lines.length / 2);

  return [
    buildCodeBlockFragment(block, lines.slice(0, middle), start, true),
    buildCodeBlockFragment(block, lines.slice(middle), start + middle, false),
  ];
}

function splitNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  if (node.classList.contains('code-block')) {
    return splitCodeBlock(node);
  }

  if ((node.tagName === 'UL' || node.tagName === 'OL') && node.children.length > 1) {
    return splitList(node);
  }

  if (node.tagName === 'TABLE') {
    return splitTable(node);
  }

  if (node.tagName === 'PRE') {
    return splitPre(node);
  }

  return null;
}

function scaleToFit(node, content) {
  const style = getComputedStyle(content);
  const availableWidth = content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availableHeight = content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const rect = node.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  const scale = Math.min(1, availableWidth / rect.width, availableHeight / rect.height);
  if (scale >= 1) return;

  const wrapper = document.createElement('div');
  wrapper.style.width = `${rect.width * scale}px`;
  wrapper.style.height = `${rect.height * scale}px`;
  wrapper.style.overflow = 'hidden';

  node.style.transformOrigin = 'top left';
  node.style.transform = `scale(${scale})`;
  node.style.margin = '0';

  content.appendChild(wrapper);
  wrapper.appendChild(node);
}

function paginate(html) {
  syncMeasureStyles();
  measureHost.innerHTML = '';

  const queue = toTopLevelNodes(html);
  const pages = [];

  const newPage = () => {
    const created = createPage();
    measureHost.appendChild(created.page);
    pages.push(created);
    return created;
  };

  let current = newPage();

  while (queue.length) {
    const node = queue.shift();

    if (isGapNode(node) && current.content.childNodes.length === 0) continue;

    current.content.appendChild(node);

    if (!isOverflowing(current.content)) continue;

    current.content.removeChild(node);

    const parts = splitNode(node);

    if (parts && parts.length > 1) {
      queue.unshift(...parts);

      if (current.content.childNodes.length > 0) {
        current = newPage();
      }

      continue;
    }

    if (current.content.childNodes.length === 0) {
      current.content.appendChild(node);
      scaleToFit(node, current.content);
      current = newPage();
    } else {
      queue.unshift(node);
      current = newPage();
    }
  }

  const lastPage = pages[pages.length - 1];
  if (pages.length > 1 && lastPage.content.childNodes.length === 0) {
    lastPage.page.remove();
    pages.pop();
  }

  return pages.map((entry) => entry.page);
}

function scheduleImageReflow() {
  const images = Array.from(pdfPreview.querySelectorAll('img')).filter((image) => !image.complete);

  if (!images.length) return;

  let pending = images.length;
  let needsReflow = false;

  const finish = () => {
    pending -= 1;
    if (pending === 0 && needsReflow) render();
  };

  images.forEach((image) => {
    image.addEventListener('load', () => {
      needsReflow = true;
      finish();
    }, { once: true });
    image.addEventListener('error', finish, { once: true });
  });
}

function createPageFooter(title, current, total) {
  const footer = document.createElement('div');
  footer.className = 'pdf-sheet-footer';

  const label = `Página ${current} de ${total}`;
  footer.textContent = title ? `${title} — ${label}` : label;

  return footer;
}

function renderPages(html, title = '') {
  const pages = paginate(decorateCodeBlocks(html));
  const total = pages.length;

  pdfPreview.innerHTML = '';
  pages.forEach((page, index) => {
    const sheet = document.createElement('div');
    sheet.className = 'pdf-sheet';
    sheet.dataset.page = String(index + 1);
    page.appendChild(createPageFooter(title, index + 1, total));
    sheet.appendChild(page);
    pdfPreview.appendChild(sheet);
  });

  highlightCodeBlocks(pdfPreview);
  scheduleImageReflow();
}

/* ---------- Render ---------- */
const GAP_LINE_EM = 1.65;

const CODE_LANG_LABELS = {
  html: 'HTML',
  xml: 'HTML',
  svg: 'SVG',
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  css: 'CSS',
  scss: 'SCSS',
  less: 'LESS',
  json: 'JSON',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  zsh: 'Shell',
  md: 'Markdown',
  markdown: 'Markdown',
  py: 'Python',
  python: 'Python',
  java: 'Java',
  php: 'PHP',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
  diff: 'Diff',
  plaintext: 'Texto',
  text: 'Texto',
};

function countNewlines(value) {
  return (value.match(/\n/g) || []).length;
}

function buildGapHtml(blankLines) {
  const extraLines = Math.max(0, blankLines - 1);
  if (extraLines < 1) return '';

  const heightEm = (extraLines * GAP_LINE_EM).toFixed(2);
  return `<div class="gap" style="height:${heightEm}em" aria-hidden="true"></div>`;
}

function trailingBlankLines(raw) {
  const tail = raw.match(/\s*$/)[0];
  return Math.max(0, countNewlines(tail) - 1);
}

function spaceBlankLines(raw, previous) {
  const lineBreakAbsorbed = Boolean(previous) && previous.raw.endsWith('\n');
  return Math.max(0, countNewlines(raw) - (lineBreakAbsorbed ? 0 : 1));
}

function tokensToHtml(tokens) {
  let html = '';
  let previous = null;

  tokens.forEach((token) => {
    if (token.type === 'space') {
      html += buildGapHtml(spaceBlankLines(token.raw, previous));
      return;
    }

    const single = [token];
    single.links = tokens.links;
    html += marked.parser(single);
    html += buildGapHtml(trailingBlankLines(token.raw));
    previous = token;
  });

  return html;
}

function inlineToPlainText(raw) {
  const template = document.createElement('template');
  template.innerHTML = marked.parseInline(raw);
  return template.content.textContent.trim();
}

function decorateCodeBlocks(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('pre').forEach((pre) => {
    if (pre.closest('.code-block__body')) return;

    const code = pre.querySelector('code');
    const source = code ? code.textContent : pre.textContent;
    const lang = getCodeLanguage(code);
    const lines = splitCodeLines(source);

    if (code) {
      code.textContent = lines.join('\n');
    } else {
      pre.textContent = lines.join('\n');
    }

    const block = document.createElement('div');
    block.className = 'code-block';
    block.dataset.startLine = '1';
    if (lang) block.dataset.lang = lang;

    const body = document.createElement('div');
    body.className = 'code-block__body';
    body.appendChild(buildCodeGutter(1, lines.length));

    pre.classList.add('code-block__pre');
    block.appendChild(buildCodeBar(lang));
    block.appendChild(body);

    pre.parentNode.insertBefore(block, pre);
    body.appendChild(pre);
  });

  return template.innerHTML;
}

function highlightCodeBlocks(root) {
  if (typeof hljs === 'undefined') return;

  root.querySelectorAll('.code-block pre code').forEach((code) => {
    const lang = getCodeLanguage(code);
    if (!lang || !hljs.getLanguage(lang)) return;

    code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
    code.classList.add('hljs');
  });
}

function resolveHeadingTitle(source, tokens) {
  if (tokens) {
    const heading = tokens.find((token) => token.type === 'heading' && token.depth === 1);
    return heading ? inlineToPlainText(heading.text) : null;
  }

  const match = source.match(/^[ \t]*#[ \t]+(.+?)[ \t]*$/m);
  return match ? match[1].trim() : null;
}

function updatePreviewTitle(source, tokens) {
  const headingTitle = resolveHeadingTitle(source, tokens);

  let title = headingTitle;
  if (!title && currentDoc) title = currentDoc.name;

  previewTitle.textContent = title ? ` ${title}` : '';
  previewTitle.title = title || '';

  return title;
}

function sanitizeFileName(name) {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .trim();
}

function getExportFileName() {
  if (!currentDoc) return 'Contenido PDF';

  const source = editor.value;
  const headingTitle = typeof marked !== 'undefined'
    ? resolveHeadingTitle(source, marked.lexer(source))
    : resolveHeadingTitle(source, null);

  const fallback = currentDoc.file.name.replace(/\.md$/i, '');
  return sanitizeFileName(headingTitle || fallback) || 'Contenido PDF';
}

function render() {
  const source = editor.value;

  if (typeof marked === 'undefined') {
    const title = updatePreviewTitle(source, null);
    renderPages(`<p>${escapeHtml(source).replace(/\n/g, '<br>')}</p>`, title);
    return;
  }

  const tokens = marked.lexer(source);
  const title = updatePreviewTitle(source, tokens);
  renderPages(tokensToHtml(tokens), title);
}

function showError(file, err) {
  renderPages(`<p class="hint">No se pudo leer <strong>${escapeHtml(file.path)}</strong>.<br>Detalle: ${escapeHtml(err.message)}</p>`, file.name);
}

async function loadDoc(file, btn) {
  try {
    const text = await file.file.text();

    editor.value = text;
    currentDoc = file;
    savedText = text;
    setDirty(false);
    render();
    setActive(btn);
    saveLastDoc(file.path);
    editor.scrollTop = 0;
    previewWrap.scrollTop = 0;
  } catch (err) {
    editor.value = '';
    currentDoc = null;
    savedText = '';
    setDirty(false);
    setActive(null);
    showError(file, err);
  }
}

/* ---------- Guardado ---------- */
function setDirty(value) {
  dirty = value;
  saveBtn.disabled = !currentDoc || !dirty;
  saveBtn.classList.toggle('is-dirty', dirty);
}

function confirmDiscardChanges() {
  if (!dirty) return true;

  const label = currentDoc ? currentDoc.name : 'el documento actual';
  return window.confirm(`Hay cambios sin guardar en "${label}".\n¿Querés descartarlos y continuar?`);
}

function supportsFsAccess() {
  return typeof window.showSaveFilePicker === 'function';
}

async function writeToHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function pickSaveHandle(doc) {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: doc.file.name,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
    });
    fileHandles.set(doc.path, handle);
    return handle;
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    throw err;
  }
}

async function saveWithHandle(handle, text) {
  try {
    await writeToHandle(handle, text);
  } catch (err) {
    if (!err || err.name !== 'NotAllowedError') throw err;
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw err;
    await writeToHandle(handle, text);
  }
}

function downloadDoc(doc, text) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = doc.file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveCurrentDoc() {
  if (!currentDoc) return;

  const text = editor.value;

  try {
    if (supportsFsAccess()) {
      let handle = fileHandles.get(currentDoc.path);

      if (!handle) {
        handle = await pickSaveHandle(currentDoc);
        if (!handle) return;
      }

      await saveWithHandle(handle, text);
    } else {
      downloadDoc(currentDoc, text);
    }

    savedText = text;
    setDirty(false);
  } catch (err) {
    window.alert(`No se pudo guardar "${currentDoc.name}".\nDetalle: ${err.message}`);
  }
}

function initSaveControls() {
  saveBtn.addEventListener('click', () => {
    saveCurrentDoc();
  });

  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() !== 's') return;

    event.preventDefault();
    saveCurrentDoc();
  });
}

/* ---------- Selección de carpeta ---------- */
function showEmptyState(rootName) {
  editor.value = '';
  currentDoc = null;
  savedText = '';
  setDirty(false);
  editor.placeholder = 'No hay documentos .md en la carpeta seleccionada.';
  folderInfo.textContent = rootName ? `${rootName} · sin .md` : 'Sin documentos';
  docsPopoverTitle.textContent = rootName || 'Sin documentos';
  previewTitle.textContent = '';
  previewTitle.title = '';
  renderPages('<p class="hint">La carpeta seleccionada no contiene documentos <code>.md</code>.</p>');
}

function applyDocs(result) {
  DOCS = result.groups;
  reconnectPending = false;
  fileHandles.clear();
  DOCS.forEach((group) => {
    group.files.forEach((doc) => {
      if (doc.handle) fileHandles.set(doc.path, doc.handle);
    });
  });
  activeBtn = null;
  buildDocsList();

  const total = DOCS.reduce((sum, group) => sum + group.files.length, 0);
  pickFolderBtn.classList.toggle('is-active', total > 0);

  if (!total) {
    showEmptyState(result.rootName);
    return;
  }

  folderInfo.textContent = `${result.rootName} · ${total} documento${total === 1 ? '' : 's'}`;
  docsPopoverTitle.textContent = result.rootName || 'Documentos';

  const lastFile = findDocByPath(getLastDocPath());
  const startFile = lastFile || DOCS[0].files[0];
  const startBtn = docButtons.get(startFile.path) || null;
  loadDoc(startFile, startBtn);
}

function handleFolderSelection(event) {
  if (!confirmDiscardChanges()) {
    event.target.value = '';
    return;
  }

  const files = Array.from(event.target.files || []);
  event.target.value = '';

  applyDocs(buildDocsFromEntries(files.map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
    handle: null,
  }))));
}

function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === 'function';
}

async function resolveContentRoot(dirHandle) {
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory' && entry.name.toLowerCase() === 'content') {
        return entry;
      }
    }
  } catch (err) {
    /* sin acceso a la estructura: se usa la carpeta elegida */
  }
  return dirHandle;
}

async function collectDocsFromDirectory(dirHandle, prefix, entries) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      await collectDocsFromDirectory(entry, `${prefix}${entry.name}/`, entries);
      continue;
    }
    if (!isMarkdown(entry.name)) continue;

    try {
      entries.push({
        file: await entry.getFile(),
        relativePath: `${prefix}${entry.name}`,
        handle: entry,
      });
    } catch (err) {
      /* archivo ilegible: se omite */
    }
  }
  return entries;
}

async function loadDocsFromHandle(dirHandle) {
  const rootHandle = await resolveContentRoot(dirHandle);
  const entries = await collectDocsFromDirectory(rootHandle, `${dirHandle.name}/`, []);
  applyDocs(buildDocsFromEntries(entries));
  await saveFolderHandle(dirHandle);
}

async function pickDirectory(storedHandle) {
  try {
    return await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: storedHandle || undefined,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    throw err;
  }
}

async function loadFolderViaPicker() {
  if (!confirmDiscardChanges()) return;

  const storedHandle = await loadFolderHandle();

  if (reconnectPending && storedHandle && typeof storedHandle.queryPermission === 'function') {
    let permission = 'prompt';

    try {
      permission = await storedHandle.queryPermission({ mode: 'readwrite' });
    } catch (err) {
      permission = 'prompt';
    }

    if (permission !== 'granted') {
      try {
        permission = await storedHandle.requestPermission({ mode: 'readwrite' });
      } catch (err) {
        permission = 'denied';
      }
    }

    if (permission === 'granted') {
      try {
        await loadDocsFromHandle(storedHandle);
        return;
      } catch (err) {
        /* la carpeta guardada ya no es accesible: se elige otra */
      }
    }
  }

  let dirHandle;

  try {
    dirHandle = await pickDirectory(storedHandle);
  } catch (err) {
    folderInput.click();
    return;
  }

  if (dirHandle) await loadDocsFromHandle(dirHandle);
}

async function restoreSession() {
  if (!supportsDirectoryPicker()) {
    showInitialState();
    return;
  }

  const storedHandle = await loadFolderHandle();

  if (!storedHandle || typeof storedHandle.queryPermission !== 'function') {
    showInitialState();
    return;
  }

  let permission = 'prompt';
  try {
    permission = await storedHandle.queryPermission({ mode: 'readwrite' });
  } catch (err) {
    showInitialState();
    return;
  }

  if (permission === 'granted') {
    try {
      await loadDocsFromHandle(storedHandle);
      return;
    } catch (err) {
      showInitialState();
      return;
    }
  }

  showReconnectState();
}

function showReconnectState() {
  editor.value = '';
  currentDoc = null;
  savedText = '';
  setDirty(false);
  reconnectPending = true;
  editor.placeholder = 'Hacé click en el ícono de carpeta para reconectar tu sesión...';
  folderInfo.textContent = 'Sesión guardada';
  docsPopoverTitle.textContent = 'Sesión guardada';
  previewTitle.textContent = '';
  previewTitle.title = '';
  pickFolderBtn.classList.add('is-active');
  renderPages('<p class="hint">Hay una sesión guardada. Hacé click en el ícono de carpeta para reconectar la carpeta <code>content</code> y continuar donde lo dejaste. Si preferís cambiar de carpeta, cancelá el permiso y elegí otra en el selector.</p>');
}

/* ---------- Previsualización / opciones ---------- */
function fitPreview() {
  const available = previewWrap.clientWidth - 48;
  if (available <= 0) return;

  const scale = Math.min(1, available / A4_WIDTH_PX);
  pdfPreview.style.zoom = scale;
}

function initFormatControls() {
  fontSelect.addEventListener('change', () => {
    prefs.fontSize = fontSelect.value;
    pdfPreview.style.setProperty('--doc-font-size', prefs.fontSize);
    savePrefs();
    if (DOCS.length || editor.value) render();
  });

  marginSelect.addEventListener('change', () => {
    prefs.margin = marginSelect.value;
    pdfPreview.style.setProperty('--page-margin', prefs.margin);
    savePrefs();
    if (DOCS.length || editor.value) render();
  });

  gridToggle.addEventListener('change', () => {
    prefs.grid = gridToggle.checked;
    pdfPreview.classList.toggle('grid', prefs.grid);
    savePrefs();
  });

  exportBtn.addEventListener('click', () => {
    if (optionsPopover && typeof optionsPopover.hidePopover === 'function') {
      optionsPopover.hidePopover();
    }

    const previousTitle = document.title;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };

    window.addEventListener('afterprint', restoreTitle);
    document.title = getExportFileName();
    window.print();
  });
}

function showInitialState() {
  pickFolderBtn.classList.remove('is-active');
  editor.value = '';
  currentDoc = null;
  savedText = '';
  setDirty(false);
  editor.placeholder = 'Seleccioná la carpeta de contenido (.md) para comenzar...';
  folderInfo.textContent = 'Sin carpeta';
  docsPopoverTitle.textContent = 'Sin carpeta';
  previewTitle.textContent = '';
  previewTitle.title = '';
  renderPages('<p class="hint">Hacé click en el ícono de carpeta y elegí la carpeta que contiene tu directorio <code>content</code> para cargar los documentos.</p>');
}

function init() {
  if (typeof marked !== 'undefined') {
    marked.setOptions({ gfm: true, breaks: true });
  }

  initFormatControls();
  initSaveControls();

  const renderDebounced = debounce(render, 150);
  editor.addEventListener('input', () => {
    setDirty(editor.value !== savedText);
    renderDebounced();
  });

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  prefs = loadPrefs();
  applyPrefs();

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(fitPreview).observe(previewWrap);
  } else {
    window.addEventListener('resize', fitPreview);
  }
  fitPreview();

  pickFolderBtn.addEventListener('click', () => {
    if (supportsDirectoryPicker()) {
      loadFolderViaPicker();
      return;
    }
    folderInput.click();
  });
  folderInput.addEventListener('change', handleFolderSelection);

  restoreSession();
}

document.addEventListener('DOMContentLoaded', init);
