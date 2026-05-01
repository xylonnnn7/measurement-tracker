// Data: [{ name, objects: [{ name, rows: [{ bg, lb, nb, signedDate, status }] }] }]
let raw = JSON.parse(localStorage.getItem('buildings') || '[]');

let buildings = raw.map(b => {
  if (typeof b === 'string') return { name: b, objects: [] };
  b.objects = (b.objects || []).map(o => {
    if (typeof o === 'string') return { name: o, rows: [] };
    return { name: o.name, rows: (o.rows || []) };
  });
  return b;
});

let currentBuilding = null;
let currentObject   = null;
let selectedStatus  = null;

function save() { localStorage.setItem('buildings', JSON.stringify(buildings)); }

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function today() { return new Date().toISOString().slice(0, 10); }

// ── Views ──────────────────────────────────────────────
const viewBuildings = document.getElementById('viewBuildings');
const viewObjects   = document.getElementById('viewObjects');
const viewTable     = document.getElementById('viewTable');

function showBuildingsView() {
  currentBuilding = currentObject = null;
  viewObjects.classList.add('hidden');
  viewTable.classList.add('hidden');
  viewBuildings.classList.remove('hidden');
  renderBuildings();
}

function showObjectsView(bIndex) {
  currentBuilding = bIndex;
  currentObject   = null;
  document.getElementById('buildingTitle').textContent = buildings[bIndex].name;
  viewBuildings.classList.add('hidden');
  viewTable.classList.add('hidden');
  viewObjects.classList.remove('hidden');
  renderObjects();
}

function showTableView(oIndex) {
  currentObject = oIndex;
  document.getElementById('objectTitle').textContent =
    buildings[currentBuilding].objects[oIndex].name;
  viewObjects.classList.add('hidden');
  viewTable.classList.remove('hidden');
  renderTable();
}

// ── Buildings ──────────────────────────────────────────
const buildingInput    = document.getElementById('buildingInput');
const buildingList     = document.getElementById('buildingList');
const buildingEmptyMsg = document.getElementById('buildingEmptyMsg');

function renderBuildings() {
  buildingList.innerHTML = '';
  buildingEmptyMsg.style.display = buildings.length === 0 ? 'block' : 'none';
  buildings.forEach((b, i) => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `
      <span class="item-name">${escapeHtml(b.name)}</span>
      <div class="item-actions">
        <button class="btn-open"   data-index="${i}">Open</button>
        <button class="btn-delete" data-index="${i}">Remove</button>
      </div>`;
    buildingList.appendChild(li);
  });
}

function addBuilding() {
  const name = buildingInput.value.trim();
  if (!name) return;
  buildings.push({ name, objects: [] });
  save(); renderBuildings();
  buildingInput.value = '';
  buildingInput.focus();
}

buildingList.addEventListener('click', (e) => {
  const i = parseInt(e.target.dataset.index);
  if (e.target.classList.contains('btn-open'))   showObjectsView(i);
  if (e.target.classList.contains('btn-delete')) { buildings.splice(i, 1); save(); renderBuildings(); }
});

document.getElementById('addBuildingBtn').addEventListener('click', addBuilding);
buildingInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBuilding(); });

// ── Objects ────────────────────────────────────────────
const objectInput    = document.getElementById('objectInput');
const objectList     = document.getElementById('objectList');
const objectEmptyMsg = document.getElementById('objectEmptyMsg');

function renderObjects() {
  objectList.innerHTML = '';
  const objects = buildings[currentBuilding].objects;
  objectEmptyMsg.style.display = objects.length === 0 ? 'block' : 'none';
  objects.forEach((o, i) => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `
      <span class="item-name">${escapeHtml(o.name)}</span>
      <div class="item-actions">
        <button class="btn-open"   data-index="${i}">Open</button>
        <button class="btn-delete" data-index="${i}">Remove</button>
      </div>`;
    objectList.appendChild(li);
  });
}

function addObject() {
  const name = objectInput.value.trim();
  if (!name) return;
  buildings[currentBuilding].objects.push({ name, rows: [] });
  save(); renderObjects();
  objectInput.value = '';
  objectInput.focus();
}

objectList.addEventListener('click', (e) => {
  const i = parseInt(e.target.dataset.index);
  if (e.target.classList.contains('btn-open'))   showTableView(i);
  if (e.target.classList.contains('btn-delete')) {
    buildings[currentBuilding].objects.splice(i, 1);
    save(); renderObjects();
  }
});

document.getElementById('addObjectBtn').addEventListener('click', addObject);
objectInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addObject(); });
document.getElementById('backToBuildingsBtn').addEventListener('click', showBuildingsView);

// ── Table ──────────────────────────────────────────────
const tableBody     = document.getElementById('tableBody');
const tableEmptyMsg = document.getElementById('tableEmptyMsg');
const latestDateEl  = document.getElementById('latestDate');
const qrImage       = document.getElementById('qrImage');
const inputBG       = document.getElementById('inputBG');
const inputLB       = document.getElementById('inputLB');
const inputNB       = document.getElementById('inputNB');

const markers = {
  excellent: document.getElementById('markerExcellent'),
  mid:       document.getElementById('markerMid'),
  dangerous: document.getElementById('markerDangerous'),
};

const statusLabels = { excellent: 'Excellent', mid: 'Mid', dangerous: 'Dangerous' };

function updateStatusBar(status) {
  Object.entries(markers).forEach(([key, el]) => el.classList.toggle('active', key === status));
}

function updateQR(latest) {
  const bName = buildings[currentBuilding].name;
  const oName = buildings[currentBuilding].objects[currentObject].name;
  let text;
  if (latest) {
    text = `Building: ${bName}\nObject: ${oName}\nStatus: ${statusLabels[latest.status] || '-'}\nSigned: ${latest.signedDate}`;
  } else {
    text = `Building: ${bName}\nObject: ${oName}\nNo measurements yet`;
  }
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(text)}`;
}

document.querySelectorAll('.pick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedStatus = btn.dataset.status;
    document.querySelectorAll('.pick-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

function badgeHtml(status) {
  if (!status) return '';
  return `<span class="status-badge badge-${status}">${statusLabels[status] ?? status}</span>`;
}

function renderTable() {
  tableBody.innerHTML = '';
  const rows = buildings[currentBuilding].objects[currentObject].rows;
  tableEmptyMsg.style.display = rows.length === 0 ? 'block' : 'none';

  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  updateStatusBar(latest ? latest.status : null);
  latestDateEl.textContent = latest ? 'Signed: ' + latest.signedDate : '';
  updateQR(latest);

  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.bg)}</td>
      <td>${escapeHtml(row.lb)}</td>
      <td>${escapeHtml(row.nb)}</td>
      <td>${escapeHtml(row.signedDate)}</td>
      <td>${badgeHtml(row.status)}</td>
      <td><button class="btn-delete" data-index="${i}">Remove</button></td>`;
    tableBody.appendChild(tr);
  });
}

function addRow() {
  const row = {
    bg:         inputBG.value.trim(),
    lb:         inputLB.value.trim(),
    nb:         inputNB.value.trim(),
    signedDate: today(),
    status:     selectedStatus,
  };
  buildings[currentBuilding].objects[currentObject].rows.push(row);
  save(); renderTable();
  inputBG.value = inputLB.value = inputNB.value = '';
  selectedStatus = null;
  document.querySelectorAll('.pick-btn').forEach(b => b.classList.remove('selected'));
  inputBG.focus();
}

tableBody.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-delete')) {
    const i = parseInt(e.target.dataset.index);
    buildings[currentBuilding].objects[currentObject].rows.splice(i, 1);
    save(); renderTable();
  }
});

document.getElementById('addRowBtn').addEventListener('click', addRow);
document.getElementById('backToObjectsBtn').addEventListener('click', () => showObjectsView(currentBuilding));

// ── Init ───────────────────────────────────────────────
showBuildingsView();
