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

function buildDocsFromFiles(files) {
  const groupsMap = new Map();
  let rootName = '';

  files.forEach((file) => {
    if (!isMarkdown(file.name)) return;

    const relativePath = file.webkitRelativePath || file.name;
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
      name: formatDocName(file.name),
      path: base.join('/') || file.name,
      file,
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

function buildDocsList() {
  docsList.innerHTML = '';
  docButtons.clear();

  DOCS.forEach((group) => {
    const groupTitle = document.createElement('li');
    groupTitle.className = 'unit-title';
    groupTitle.textContent = group.unit;
    groupTitle.title = group.key;
    docsList.appendChild(groupTitle);

    group.files.forEach((file) => {
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
      docsList.appendChild(item);
      docButtons.set(file.path, btn);
    });
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

function splitNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

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

function renderPages(html) {
  const pages = paginate(html);

  pdfPreview.innerHTML = '';
  pages.forEach((page, index) => {
    const sheet = document.createElement('div');
    sheet.className = 'pdf-sheet';
    sheet.dataset.page = String(index + 1);
    sheet.appendChild(page);
    pdfPreview.appendChild(sheet);
  });

  scheduleImageReflow();
}

/* ---------- Render ---------- */
function render() {
  const source = editor.value;

  if (typeof marked === 'undefined') {
    renderPages(`<p>${escapeHtml(source).replace(/\n/g, '<br>')}</p>`);
    return;
  }

  renderPages(marked.parse(source));
}

function showError(file, err) {
  renderPages(`<p class="hint">No se pudo leer <strong>${escapeHtml(file.path)}</strong>.<br>Detalle: ${escapeHtml(err.message)}</p>`);
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
  renderPages('<p class="hint">La carpeta seleccionada no contiene documentos <code>.md</code>.</p>');
}

function handleFolderSelection(event) {
  if (!confirmDiscardChanges()) {
    event.target.value = '';
    return;
  }

  const files = Array.from(event.target.files || []);
  event.target.value = '';
  pickFolderBtn.classList.toggle('is-active', files.length > 0);

  const { groups, rootName } = buildDocsFromFiles(files);
  DOCS = groups;
  fileHandles.clear();
  activeBtn = null;
  buildDocsList();

  const total = DOCS.reduce((sum, group) => sum + group.files.length, 0);

  if (!total) {
    showEmptyState(rootName);
    return;
  }

  folderInfo.textContent = `${rootName} · ${total} documento${total === 1 ? '' : 's'}`;
  docsPopoverTitle.textContent = rootName || 'Documentos';

  const lastFile = findDocByPath(getLastDocPath());
  const startFile = lastFile || DOCS[0].files[0];
  const startBtn = docButtons.get(startFile.path) || null;
  loadDoc(startFile, startBtn);
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
  renderPages('<p class="hint">Hacé click en el ícono de carpeta y elegí la carpeta <code>content</code> (o <code>assets/content</code>) para cargar los documentos.</p>');
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

  pickFolderBtn.addEventListener('click', () => folderInput.click());
  folderInput.addEventListener('change', handleFolderSelection);

  showInitialState();
}

document.addEventListener('DOMContentLoaded', init);
