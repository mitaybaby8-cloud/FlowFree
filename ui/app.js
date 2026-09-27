const bridgeReady = Boolean(window.flowfree);
const flowfree = window.flowfree || { invoke: async () => { throw new Error('FlowFree IPC bridge unavailable'); }, onEvent: () => {} };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const PROJECT_KEY = 'flowfree:glabs-port:project-v1';

let accountId = '';
let pendingConnectionId = '';
let commonReferenceFiles = [];
let folderReferenceFiles = [];
let manualReferenceFilesByIndex = {};
let imageQueue = [];
let compatibility = { generationEnabled: false, reasons: ['Chưa kiểm tra engine.'] };

function log(value) {
  const element = $('#log');
  element.textContent += `[${new Date().toLocaleTimeString()}] ${typeof value === 'string' ? value : JSON.stringify(value)}\n`;
  element.scrollTop = element.scrollHeight;
}

function setProgress(text) { $('#progress').textContent = text; }
function basename(file) { return String(file || '').split(/[\\/]/).pop(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

function selectTab(id) {
  $$('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === id));
  $$('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === id));
}

function projectSnapshot() {
  return {
    version: 1,
    prompts: $('#imagePrompts').value,
    model: $('#imageModel').value,
    ratio: $('#imageRatio').value,
    resolution: $('#imageResolution').value,
    concurrency: Number($('#imageConcurrency').value) || 1,
    delay: Number($('#imageDelay').value) || 0,
    outputDirectory: $('#imageOut').value,
    referenceFolder: $('#referenceFolder').value,
    commonReferenceFiles,
    folderReferenceFiles,
    manualReferenceFilesByIndex,
    imageQueue,
    savedAt: new Date().toISOString()
  };
}

function saveProject() {
  localStorage.setItem(PROJECT_KEY, JSON.stringify(projectSnapshot()));
}

function restoreProject() {
  try {
    const state = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null');
    if (!state || state.version !== 1) return;
    $('#imagePrompts').value = state.prompts || '';
    $('#imageModel').value = state.model || 'nano-banana-2';
    $('#imageRatio').value = state.ratio || '1:1';
    $('#imageResolution').value = state.resolution || '1K';
    $('#imageConcurrency').value = state.concurrency || 1;
    $('#imageDelay').value = state.delay || 0;
    $('#imageOut').value = state.outputDirectory || '';
    $('#referenceFolder').value = state.referenceFolder || '';
    commonReferenceFiles = Array.isArray(state.commonReferenceFiles) ? state.commonReferenceFiles : [];
    folderReferenceFiles = Array.isArray(state.folderReferenceFiles) ? state.folderReferenceFiles : [];
    manualReferenceFilesByIndex = state.manualReferenceFilesByIndex || {};
    imageQueue = Array.isArray(state.imageQueue) ? state.imageQueue : [];
    $('#imageRefs').value = commonReferenceFiles.map(basename).join('; ');
  } catch (error) {
    localStorage.removeItem(PROJECT_KEY);
    log(`Project state hỏng, đã bỏ qua: ${error.message}`);
  }
}

function updateMetrics() {
  const count = (statuses) => imageQueue.filter((item) => statuses.includes(item.status)).length;
  $('#metricRunning').textContent = count(['GENERATING', 'DOWNLOADING']);
  $('#metricQueued').textContent = count(['WAITING', 'QUEUED', 'PAUSED']);
  $('#metricDone').textContent = count(['DONE']);
  $('#metricFailed').textContent = count(['FAILED', 'CANCELLED']);
  $('#queueSummary').textContent = `${imageQueue.length} job`;
}

function renderQueue() {
  const folderSelected = folderReferenceFiles.length > 0;
  $('#imageQueue').innerHTML = imageQueue.map((item) => {
    const perLine = item.perLineReferenceFiles || [];
    const refs = perLine.length
      ? perLine.map((file) => `<span class="ref-chip" title="${escapeHtml(file)}">${escapeHtml(basename(file))}</span>`).join('')
      : folderSelected ? '<span class="missing">Missing Reference</span>' : '<span class="muted">Không có</span>';
    const output = item.outputFile ? escapeHtml(basename(item.outputFile)) : '—';
    return `<tr data-id="${escapeHtml(item.id)}">
      <td><b>${escapeHtml(item.id)}</b></td><td><div class="ref-list">${refs}</div></td>
      <td class="prompt-cell">${escapeHtml(item.prompt)}</td><td>${escapeHtml($('#imageModel').selectedOptions[0]?.textContent || '')}<br><span class="muted">${escapeHtml($('#imageRatio').value)} • ${escapeHtml($('#imageResolution').value)}</span></td>
      <td>${output}</td><td><span class="status status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>${item.error ? `<br><span class="missing">${escapeHtml(item.error)}</span>` : ''}</td>
      <td><button class="row-reference" data-index="${item.index}">+ Ref</button></td></tr>`;
  }).join('');
  $$('.row-reference').forEach((button) => { button.onclick = () => chooseRowReference(Number(button.dataset.index)); });
  updateMetrics();
  saveProject();
}

async function rebuildQueue(status = 'WAITING') {
  const previous = new Map(imageQueue.map((item) => [item.id, item]));
  const built = await flowfree.invoke('prepare-image-queue', {
    prompts: $('#imagePrompts').value,
    commonReferenceFiles,
    folderReferenceFiles,
    manualReferenceFilesByIndex
  });
  imageQueue = built.map((item) => {
    const old = previous.get(item.id);
    return old ? { ...item, status: old.status, outputFile: old.outputFile || '', retryCount: old.retryCount || 0, error: old.error || '' } : { ...item, status };
  });
  renderQueue();
}

async function chooseRowReference(index) {
  const files = await flowfree.invoke('pick-files', { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (!files.length) return;
  manualReferenceFilesByIndex[index] = files;
  await rebuildQueue();
}

function applyCapabilityOptions(capabilities) {
  const liveModels = new Set((capabilities.models?.image || []).map((item) => item.id || item));
  [...$('#imageModel').options].forEach((option) => { option.disabled = !liveModels.has(option.value); });
  const liveRatios = new Set(capabilities.aspectRatiosByMedia?.image || []);
  [...$('#imageRatio').options].forEach((option) => { option.disabled = !liveRatios.has(option.value); });
  compatibility = capabilities.phase1Compatibility || compatibility;
  $('#runImages').disabled = !compatibility.generationEnabled;
  const banner = $('#compatibilityBanner');
  banner.className = `banner ${compatibility.generationEnabled ? 'ready' : 'warning'}`;
  banner.textContent = compatibility.generationEnabled ? 'Engine đã xác minh tương thích.' : `Generation đang khóa an toàn — ${compatibility.reasons.join(' ')}`;

  const videoModels = capabilities.models?.video || [];
  $('#videoModel').innerHTML = '<option value="ui-default">UI Default</option>' + videoModels.map((item) => `<option value="${escapeHtml(item.id || item)}">${escapeHtml(item.label || item)}</option>`).join('');
  const videoRatios = capabilities.aspectRatiosByMedia?.video || [];
  $('#videoRatio').innerHTML = '<option value="ui-default">UI Default</option>' + videoRatios.map((ratio) => `<option>${escapeHtml(ratio)}</option>`).join('');
  $('#videoDuration').innerHTML = '<option value="">UI Default</option>' + (capabilities.visibleDurations || []).map((duration) => `<option value="${duration}">${duration}s</option>`).join('');
}

async function refreshAccount() {
  try {
    setProgress('Đang kiểm tra session Flow…');
    const accounts = await flowfree.invoke('accounts');
    const connected = accounts.connectedAccountIds || [];
    $('#metricAccounts').textContent = connected.length;
    accountId = accounts.defaultAccountId || '';
    if (!accounts.readyForGeneration || !accountId) {
      document.body.classList.remove('connected');
      $('#accountText').textContent = 'Chưa có Flow account hoạt động';
      $('#accountDetail').textContent = accounts.agentInstruction || 'Hãy kết nối Google.';
      setProgress('Cần kết nối Google');
      return;
    }
    const capabilities = await flowfree.invoke('inspect', accountId);
    if (!capabilities.workspaceAvailable) throw new Error('Session có tồn tại nhưng Flow workspace chưa dùng được.');
    document.body.classList.add('connected');
    $('#accountText').textContent = `Active: ${accountId}`;
    $('#accountDetail').textContent = 'Session đã được engine khôi phục và Flow workspace đã xác minh.';
    applyCapabilityOptions(capabilities);
    setProgress('Flow account sẵn sàng');
    log(`Session restored: ${accountId}`);
  } catch (error) {
    document.body.classList.remove('connected');
    $('#accountText').textContent = 'Session hết hạn hoặc không hợp lệ';
    $('#accountDetail').textContent = error.message;
    $('#metricAccounts').textContent = '0';
    setProgress('Flow account cần kết nối lại');
    log(`Account: ${error.message}`);
  }
}

async function beginConnect() {
  try {
    const result = await flowfree.invoke('connect-begin', {});
    if (result.status === 'ALREADY_CONNECTED') return refreshAccount();
    pendingConnectionId = result.connectionId;
    await flowfree.invoke('open-extension');
    $('#connectBtn').textContent = 'Hoàn tất kết nối';
    $('#connectBtn').dataset.stage = 'complete';
    setProgress('Mở extension Flow Login Bridge và bấm Connect Flow');
    log(result.userMessage || 'Flow Login Bridge đang chờ session.');
  } catch (error) { log(error.message); setProgress('Kết nối lỗi'); }
}

async function completeConnect() {
  try {
    setProgress('Đang xác minh Google account và Flow workspace…');
    await flowfree.invoke('connect-complete', { connectionId: pendingConnectionId, userConfirmedSessionSent: true, chooseGoogleAccount: true, waitForAccountSelectionSeconds: 300 });
    $('#connectBtn').textContent = 'Kết nối Google';
    $('#connectBtn').dataset.stage = '';
    pendingConnectionId = '';
    await refreshAccount();
  } catch (error) { log(error.message); setProgress('Kết nối lỗi'); }
}

if (!bridgeReady) {
  setProgress('LỖI IPC: FlowFree Bridge chưa nạp');
  $$('button').forEach((button) => { if (!button.classList.contains('tab')) button.disabled = true; });
}

$$('.tab').forEach((button) => { button.onclick = () => selectTab(button.dataset.tab); });
$$('[data-tab-target]').forEach((button) => { button.onclick = () => selectTab(button.dataset.tabTarget); });
$$('[data-dir]').forEach((button) => { button.onclick = async () => { const directory = await flowfree.invoke('pick-directory'); if (directory) { $(`#${button.dataset.dir}`).value = directory; saveProject(); } }; });

$('#connectBtn').onclick = () => $('#connectBtn').dataset.stage === 'complete' ? completeConnect() : beginConnect();
$('#refreshAccount').onclick = refreshAccount;
$('#disconnectAccount').onclick = async () => { const result = await flowfree.invoke('disconnect-account'); log(result.reason); };
$('#pickImageRefs').onclick = async () => { commonReferenceFiles = await flowfree.invoke('pick-files', { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }); $('#imageRefs').value = commonReferenceFiles.map(basename).join('; '); await rebuildQueue(); };
$('#pickReferenceFolder').onclick = async () => { const result = await flowfree.invoke('pick-reference-folder'); if (!result) return; $('#referenceFolder').value = result.directory; folderReferenceFiles = result.files; await rebuildQueue(); };
$('#importPrompts').onclick = async () => { const result = await flowfree.invoke('pick-text-file'); if (!result) return; $('#imagePrompts').value = result.text; await rebuildQueue(); };
$('#clearPrompts').onclick = () => { $('#imagePrompts').value = ''; imageQueue = []; renderQueue(); };
$('#imagePrompts').addEventListener('change', () => rebuildQueue());
$('#addImageQueue').onclick = async () => { await rebuildQueue('QUEUED'); imageQueue = imageQueue.map((item) => item.status === 'WAITING' ? { ...item, status: 'QUEUED' } : item); renderQueue(); setProgress(`${imageQueue.length} job đã xếp hàng; generation đang khóa cho tới khi API tương thích.`); };
$('#pauseImages').onclick = () => { const hasPaused = imageQueue.some((item) => item.status === 'PAUSED'); imageQueue = imageQueue.map((item) => hasPaused && item.status === 'PAUSED' ? { ...item, status: 'QUEUED' } : (!hasPaused && ['WAITING', 'QUEUED'].includes(item.status) ? { ...item, status: 'PAUSED' } : item)); renderQueue(); };
$('#stopImages').onclick = () => { imageQueue = imageQueue.map((item) => ['WAITING', 'QUEUED', 'PAUSED'].includes(item.status) ? { ...item, status: 'CANCELLED' } : item); renderQueue(); };
$('#retryErrors').onclick = () => { imageQueue = imageQueue.map((item) => item.status === 'FAILED' ? { ...item, status: 'QUEUED', retryCount: (item.retryCount || 0) + 1, error: '' } : item); renderQueue(); };
$('#runImages').onclick = async () => { if (!compatibility.generationEnabled) { setProgress('Generation bị khóa: API resolution/upscale ảnh chưa được xác minh.'); return; } };
$('#runVideos').onclick = () => setProgress('Video generation chưa được bật trong port này.');

flowfree.onEvent((event) => { log(event); });
restoreProject();
renderQueue();
refreshAccount();
