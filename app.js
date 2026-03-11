const API = '';  // same origin

// ── State ─────────────────────────────────────────────────
let personFile = null;
let garmentFile = null;
let pollingTimer = null;
let videoPollingTimer = null;
let currentResultFilename = null;  // filename of latest tryon result
const sessionResults = [];  // { url, filename }

// ── DOM refs ───────────────────────────────────────────────
const dropPerson   = document.getElementById('drop-person');
const dropGarment  = document.getElementById('drop-garment');
const inputPerson  = document.getElementById('input-person');
const inputGarment = document.getElementById('input-garment');
const previewPerson  = document.getElementById('preview-person');
const previewGarment = document.getElementById('preview-garment');
const hintPerson   = document.getElementById('hint-person');
const hintGarment  = document.getElementById('hint-garment');
const clearPerson  = document.getElementById('clear-person');
const clearGarment = document.getElementById('clear-garment');

const btnTryon   = document.getElementById('btn-tryon');
const category   = document.getElementById('category');
const statusBox  = document.getElementById('status-box');
const statusText = document.getElementById('status-text');
const errorBox   = document.getElementById('error-box');

const resultSection = document.getElementById('result-section');
const resultImg     = document.getElementById('result-img');
const downloadLink  = document.getElementById('download-link');

const gallerySection = document.getElementById('gallery-section');
const gallery        = document.getElementById('gallery');

const btnVideo        = document.getElementById('btn-video');
const videoDuration   = document.getElementById('video-duration');
const videoPrompt     = document.getElementById('video-prompt');
const videoStatusBox  = document.getElementById('video-status-box');
const videoStatusText = document.getElementById('video-status-text');
const videoErrorBox   = document.getElementById('video-error-box');

const videoSection      = document.getElementById('video-section');
const resultVideo       = document.getElementById('result-video');
const videoDownloadLink = document.getElementById('video-download-link');

// ── Upload zone wiring ─────────────────────────────────────
function wireDropZone(dropEl, inputEl, previewEl, hintEl, clearEl, side) {
  dropEl.addEventListener('click', () => inputEl.click());

  inputEl.addEventListener('change', () => {
    if (inputEl.files[0]) setImage(inputEl.files[0], side);
  });

  dropEl.addEventListener('dragover', e => {
    e.preventDefault();
    dropEl.classList.add('drag-over');
  });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('drag-over'));
  dropEl.addEventListener('drop', e => {
    e.preventDefault();
    dropEl.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) setImage(file, side);
  });

  clearEl.addEventListener('click', e => {
    e.stopPropagation();
    clearImage(side);
  });
}

function setImage(file, side) {
  const reader = new FileReader();
  reader.onload = ev => {
    if (side === 'person') {
      personFile = file;
      previewPerson.src = ev.target.result;
      previewPerson.hidden = false;
      hintPerson.hidden = true;
      clearPerson.hidden = false;
    } else {
      garmentFile = file;
      previewGarment.src = ev.target.result;
      previewGarment.hidden = false;
      hintGarment.hidden = true;
      clearGarment.hidden = false;
    }
    updateButton();
  };
  reader.readAsDataURL(file);
}

function clearImage(side) {
  if (side === 'person') {
    personFile = null;
    previewPerson.src = '';
    previewPerson.hidden = true;
    hintPerson.hidden = false;
    clearPerson.hidden = true;
    inputPerson.value = '';
  } else {
    garmentFile = null;
    previewGarment.src = '';
    previewGarment.hidden = true;
    hintGarment.hidden = false;
    clearGarment.hidden = true;
    inputGarment.value = '';
  }
  updateButton();
}

function updateButton() {
  btnTryon.disabled = !(personFile && garmentFile);
}

wireDropZone(dropPerson,  inputPerson,  previewPerson,  hintPerson,  clearPerson,  'person');
wireDropZone(dropGarment, inputGarment, previewGarment, hintGarment, clearGarment, 'garment');

// ── Try-on flow ────────────────────────────────────────────
btnTryon.addEventListener('click', startTryon);

async function startTryon() {
  clearTimeout(pollingTimer);  // cancel any previous poll loop
  clearError();
  setProcessing(true, 'Sending images...');

  const form = new FormData();
  form.append('person_image', personFile);
  form.append('garment_image', garmentFile);
  form.append('category', category.value);

  let jobId;
  try {
    const res = await fetch(`${API}/api/tryon`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Server error');
    jobId = data.job_id;
  } catch (err) {
    setProcessing(false);
    showError(err.message);
    return;
  }

  setProcessing(true, 'In queue...');
  pollStatus(jobId);
}

function pollStatus(jobId) {
  clearTimeout(pollingTimer);
  pollingTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${API}/api/status/${jobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Status error');

      const s = data.status;
      if (s === 'completed') {
        setProcessing(false);
        showResult(data.result_url, data.filename);
      } else if (s === 'failed') {
        setProcessing(false);
        showError(data.error || 'Processing failed');
      } else {
        const labels = {
          in_queue:   'Waiting in queue...',
          starting:   'Starting...',
          processing: 'Processing your outfit...',
        };
        setProcessing(true, labels[s] || 'Processing...');
        pollStatus(jobId);  // keep polling
      }
    } catch (err) {
      setProcessing(false);
      showError(err.message);
    }
  }, 3000);
}

// ── UI helpers ─────────────────────────────────────────────
function setProcessing(active, message = '') {
  if (active) {
    btnTryon.disabled = true;
  } else {
    updateButton();  // re-check both images are still present
  }
  statusBox.hidden = !active;
  if (active) statusText.textContent = message;
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function showResult(url, filename) {
  resultImg.src = url;
  downloadLink.href = url;
  downloadLink.download = filename || 'fitting-room-result.png';
  currentResultFilename = filename;
  btnVideo.disabled = false;
  // Reset any previous video state
  clearVideoError();
  setVideoProcessing(false);
  videoSection.hidden = true;
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Add to session gallery
  sessionResults.unshift({ url, filename });
  renderGallery();
}

// ── Video generation ────────────────────────────────────────
btnVideo.addEventListener('click', startVideoGen);

async function startVideoGen() {
  if (!currentResultFilename) return;
  clearTimeout(videoPollingTimer);
  clearVideoError();
  setVideoProcessing(true, 'Sending to video generator...');

  const form = new FormData();
  form.append('result_filename', currentResultFilename);
  form.append('duration', videoDuration.value);
  form.append('resolution', '720p');
  const prompt = videoPrompt.value.trim();
  if (prompt) form.append('prompt', prompt);

  let jobId;
  try {
    const res = await fetch(`${API}/api/video`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Server error');
    jobId = data.job_id;
  } catch (err) {
    setVideoProcessing(false);
    showVideoError(err.message);
    return;
  }

  setVideoProcessing(true, 'In queue...');
  pollVideoStatus(jobId);
}

function pollVideoStatus(jobId) {
  clearTimeout(videoPollingTimer);
  videoPollingTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${API}/api/status/${jobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Status error');

      const s = data.status;
      if (s === 'completed') {
        setVideoProcessing(false);
        showVideo(data.result_url, data.filename);
      } else if (s === 'failed') {
        setVideoProcessing(false);
        showVideoError(data.error || 'Video generation failed');
      } else {
        const labels = {
          in_queue:   'Waiting in queue...',
          starting:   'Starting video generation...',
          processing: 'Rendering video...',
        };
        setVideoProcessing(true, labels[s] || 'Processing...');
        pollVideoStatus(jobId);
      }
    } catch (err) {
      setVideoProcessing(false);
      showVideoError(err.message);
    }
  }, 3000);
}

function setVideoProcessing(active, message = '') {
  btnVideo.disabled = active;
  videoStatusBox.hidden = !active;
  if (active) videoStatusText.textContent = message;
}

function showVideoError(msg) {
  videoErrorBox.textContent = msg;
  videoErrorBox.hidden = false;
}

function clearVideoError() {
  videoErrorBox.hidden = true;
  videoErrorBox.textContent = '';
}

function showVideo(url, filename) {
  resultVideo.src = url;
  resultVideo.load();
  videoDownloadLink.href = url;
  videoDownloadLink.download = filename || 'fitting-room-video.mp4';
  videoSection.hidden = false;
  videoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Gallery ─────────────────────────────────────────────────
function renderGallery() {
  if (sessionResults.length === 0) {
    gallerySection.hidden = true;
    return;
  }
  gallerySection.hidden = false;
  gallery.innerHTML = sessionResults.map(({ url, filename }) => `
    <div class="gallery-item">
      <img src="${url}" alt="Result" title="${filename}" />
      <a class="item-download" href="${url}" download="${filename}">Save</a>
    </div>
  `).join('');

  // Click gallery item to set as main result
  gallery.querySelectorAll('.gallery-item img').forEach((img, i) => {
    img.addEventListener('click', () => {
      const { url, filename } = sessionResults[i];
      resultImg.src = url;
      downloadLink.href = url;
      downloadLink.download = filename;
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
