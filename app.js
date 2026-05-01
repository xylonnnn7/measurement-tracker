// Collections: buildings/{id}, objects/{id}
// objects store: { name, buildingId, buildingName, rows: [] }

let buildingsCache    = [];
let objectsCache      = [];
let currentRows       = [];
let currentBuildingId = null;
let currentObjectId   = null;
let selectedStatus    = null;
let unsubscribeRows   = null;

const statusLabels = { excellent: 'Excellent', mid: 'Mid', dangerous: 'Dangerous' };

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function today() { return new Date().toISOString().slice(0, 10); }

// ── Auth ───────────────────────────────────────────────
const viewLogin  = document.getElementById('viewLogin');
const loginError = document.getElementById('loginError');

document.getElementById('loginBtn').addEventListener('click', async () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) { loginError.textContent = 'Enter username and password.'; return; }
  try {
    loginError.textContent = '';
    await firebase.auth().signInWithEmailAndPassword(username + '@tracker.app', password);
  } catch(e) {
    loginError.textContent = 'Invalid username or password.';
  }
});

document.getElementById('loginPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  firebase.auth().signOut();
});

firebase.auth().onAuthStateChanged(user => {
  if (user) {
    viewLogin.classList.add('hidden');
    showBuildingsView();
  } else {
    viewLogin.classList.remove('hidden');
    viewBuildings.classList.add('hidden');
    viewObjects.classList.add('hidden');
    viewTable.classList.add('hidden');
  }
});

// ── Views ──────────────────────────────────────────────
const viewBuildings = document.getElementById('viewBuildings');
const viewObjects   = document.getElementById('viewObjects');
const viewTable     = document.getElementById('viewTable');

function showBuildingsView() {
  if (unsubscribeRows) { unsubscribeRows(); unsubscribeRows = null; }
  currentBuildingId = currentObjectId = null;
  viewObjects.classList.add('hidden');
  viewTable.classList.add('hidden');
  viewBuildings.classList.remove('hidden');
  loadBuildings();
}

function showObjectsView(buildingId) {
  currentBuildingId = buildingId;
  currentObjectId   = null;
  const b = buildingsCache.find(x => x.id === buildingId);
  document.getElementById('buildingTitle').textContent = b ? b.name : '';
  viewBuildings.classList.add('hidden');
  viewTable.classList.add('hidden');
  viewObjects.classList.remove('hidden');
  loadObjects();
}

function showTableView(objectId) {
  currentObjectId = objectId;
  const o = objectsCache.find(x => x.id === objectId);
  document.getElementById('objectTitle').textContent = o ? o.name : '';
  viewObjects.classList.add('hidden');
  viewTable.classList.remove('hidden');

  // Generate permanent QR code for this object
  const statusUrl = 'https://xylonnnn7.github.io/measurement-tracker/status.html?id=' + objectId;
  document.getElementById('qrImg').src =
    'https://chart.googleapis.com/chart?cht=qr&chs=180x180&chl=' + encodeURIComponent(statusUrl);

  watchRows(objectId);
}

// ── Buildings ──────────────────────────────────────────
const buildingList     = document.getElementById('buildingList');
const buildingEmptyMsg = document.getElementById('buildingEmptyMsg');
const buildingInput    = document.getElementById('buildingInput');

async function loadBuildings() {
  buildingList.innerHTML = '<li class="loading-msg">Loading...</li>';
  const snap = await db.collection('buildings').get();
  buildingsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  buildingList.innerHTML = '';
  buildingEmptyMsg.style.display = buildingsCache.length === 0 ? 'block' : 'none';
  buildingsCache.forEach(b => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `
      <span class="item-name">${escapeHtml(b.name)}</span>
      <div class="item-actions">
        <button class="btn-open"   data-id="${b.id}">Open</button>
        <button class="btn-delete" data-id="${b.id}">Remove</button>
      </div>`;
    buildingList.appendChild(li);
  });
}

async function addBuilding(name) {
  await db.collection('buildings').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  loadBuildings();
}

async function deleteBuilding(id) {
  // delete all objects belonging to this building first
  const objSnap = await db.collection('objects').where('buildingId', '==', id).get();
  const batch = db.batch();
  objSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(db.collection('buildings').doc(id));
  await batch.commit();
  loadBuildings();
}

buildingList.addEventListener('click', e => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('btn-open'))   showObjectsView(id);
  if (e.target.classList.contains('btn-delete')) deleteBuilding(id);
});

document.getElementById('addBuildingBtn').addEventListener('click', () => {
  const name = buildingInput.value.trim();
  if (!name) return;
  addBuilding(name);
  buildingInput.value = '';
});
buildingInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('addBuildingBtn').click(); });

// ── Objects ────────────────────────────────────────────
const objectList     = document.getElementById('objectList');
const objectEmptyMsg = document.getElementById('objectEmptyMsg');
const objectInput    = document.getElementById('objectInput');

async function loadObjects() {
  objectList.innerHTML = '<li class="loading-msg">Loading...</li>';
  const snap = await db.collection('objects')
    .where('buildingId', '==', currentBuildingId)
    .get();
  objectsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  objectList.innerHTML = '';
  objectEmptyMsg.style.display = objectsCache.length === 0 ? 'block' : 'none';
  objectsCache.forEach(o => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `
      <span class="item-name">${escapeHtml(o.name)}</span>
      <div class="item-actions">
        <button class="btn-open"   data-id="${o.id}">Open</button>
        <button class="btn-delete" data-id="${o.id}">Remove</button>
      </div>`;
    objectList.appendChild(li);
  });
}

async function addObject(name) {
  const building = buildingsCache.find(b => b.id === currentBuildingId);
  await db.collection('objects').add({
    name,
    buildingId:   currentBuildingId,
    buildingName: building ? building.name : '',
    rows:         [],
    createdAt:    firebase.firestore.FieldValue.serverTimestamp()
  });
  loadObjects();
}

async function deleteObject(id) {
  await db.collection('objects').doc(id).delete();
  loadObjects();
}

objectList.addEventListener('click', e => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('btn-open'))   showTableView(id);
  if (e.target.classList.contains('btn-delete')) deleteObject(id);
});

document.getElementById('addObjectBtn').addEventListener('click', () => {
  const name = objectInput.value.trim();
  if (!name) return;
  addObject(name);
  objectInput.value = '';
});
objectInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('addObjectBtn').click(); });

document.getElementById('backToBuildingsBtn').addEventListener('click', showBuildingsView);
document.getElementById('backToObjectsBtn').addEventListener('click', () => showObjectsView(currentBuildingId));

// ── Table (real-time) ──────────────────────────────────
const tableBody     = document.getElementById('tableBody');
const tableEmptyMsg = document.getElementById('tableEmptyMsg');
const latestDateEl  = document.getElementById('latestDate');
const inputBG       = document.getElementById('inputBG');
const inputLB       = document.getElementById('inputLB');
const inputNB       = document.getElementById('inputNB');

const markers = {
  excellent: document.getElementById('markerExcellent'),
  mid:       document.getElementById('markerMid'),
  dangerous: document.getElementById('markerDangerous'),
};

function updateStatusBar(status) {
  Object.entries(markers).forEach(([key, el]) => el.classList.toggle('active', key === status));
}

function badgeHtml(status) {
  if (!status) return '';
  return `<span class="status-badge badge-${status}">${statusLabels[status] ?? status}</span>`;
}

function renderTable() {
  tableBody.innerHTML = '';
  tableEmptyMsg.style.display = currentRows.length === 0 ? 'block' : 'none';
  const latest = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
  updateStatusBar(latest ? latest.status : null);
  latestDateEl.textContent = latest ? 'Signed: ' + latest.signedDate : '';

  currentRows.forEach((row, i) => {
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

function watchRows(objectId) {
  if (unsubscribeRows) unsubscribeRows();
  unsubscribeRows = db.collection('objects').doc(objectId).onSnapshot(doc => {
    currentRows = doc.exists ? (doc.data().rows || []) : [];
    renderTable();
  });
}

document.querySelectorAll('.pick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedStatus = btn.dataset.status;
    document.querySelectorAll('.pick-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

document.getElementById('addRowBtn').addEventListener('click', async () => {
  const row = {
    bg:         inputBG.value.trim(),
    lb:         inputLB.value.trim(),
    nb:         inputNB.value.trim(),
    signedDate: today(),
    status:     selectedStatus,
  };
  await db.collection('objects').doc(currentObjectId)
    .update({ rows: firebase.firestore.FieldValue.arrayUnion(row) });
  inputBG.value = inputLB.value = inputNB.value = '';
  selectedStatus = null;
  document.querySelectorAll('.pick-btn').forEach(b => b.classList.remove('selected'));
  inputBG.focus();
});

tableBody.addEventListener('click', async e => {
  if (e.target.classList.contains('btn-delete')) {
    const i = parseInt(e.target.dataset.index);
    const rows = [...currentRows];
    rows.splice(i, 1);
    await db.collection('objects').doc(currentObjectId).update({ rows });
  }
});

// ── Init ───────────────────────────────────────────────
showBuildingsView();
