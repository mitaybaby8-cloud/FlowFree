const bridgeReady = Boolean(window.flowfree);
const flowfree = window.flowfree || { invoke: async () => { throw new Error('FlowFree IPC bridge unavailable'); }, onEvent: () => {} };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const PROJECT_KEY = 'flowfree:glabs-port:project-v1';
const LOG_KEY = 'flowfree:connection-log-v1';

let accountId = '';
let commonReferenceFiles = [];
let folderReferenceFiles = [];
let manualReferenceFilesByIndex = {};
let imageQueue = [];
let compatibility = { generationEnabled: false, reasons: ['Chưa kiểm tra engine.'] };

function log(value) {
  const element = $('#log');
  const line = `[${new Date().toLocaleString()}] ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  element.textContent += `${line}\n`;
  element.scrollTop = element.scrollHeight;
  try {
    const stored = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    const previous = Array.isArray(stored) ? stored : [];
    localStorage.setItem(LOG_KEY, JSON.stringify([...previous, line].slice(-200)));
  } catch {
    localStorage.setItem(LOG_KEY, JSON.stringify([line]));
  }
}

function restoreLog() {
  try {
    const lines = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    if (Array.isArray(lines)) $('#log').textContent = `${lines.slice(-200).join('\n')}${lines.length ? '\n' : ''}`;
  } catch {
    localStorage.removeItem(LOG_KEY);
  }
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
    $('#imageResolution').value = state.resolution === 'flow-default' ? state.resolution : 'flow-default';
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
  const modelOptions = capabilities.models?.image;
  const hasLiveModels = Array.isArray(modelOptions) && modelOptions.length > 0;
  const liveModels = new Set((modelOptions || []).map((item) => item.id || item));
  [...$('#imageModel').options].forEach((option) => {
    option.disabled = hasLiveModels && !liveModels.has(option.value);
  });
  const ratioOptions = capabilities.aspectRatiosByMedia?.image;
  const hasLiveRatios = Array.isArray(ratioOptions) && ratioOptions.length > 0;
  const liveRatios = new Set(ratioOptions || []);
  [...$('#imageRatio').options].forEach((option) => {
    option.disabled = hasLiveRatios && !liveRatios.has(option.value);
  });
  compatibility = capabilities.phase1Compatibility || compatibility;
  $('#runImages').disabled = !compatibility.generationEnabled;
  const banner = $('#compatibilityBanner');
  banner.className = `banner ${compatibility.generationEnabled ? 'ready' : 'warning'}`;
  banner.textContent = compatibility.generationEnabled
    ? 'Có thể chạy với độ phân giải mặc định của Flow. Engine sẽ kiểm tra model/tỷ lệ trước khi submit.'
    : `Generation đang khóa an toàn — ${compatibility.reasons.join(' ')}`;

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
    const savedManagedAccount = (accounts.accounts || []).find((item) => item.id === 'flowfree' && item.browserMode === 'managed');
    accountId = accounts.defaultAccountId || savedManagedAccount?.id || '';
    if (!accountId) {
      document.body.classList.remove('connected');
      $('#accountText').textContent = 'Chưa có Flow account hoạt động';
      $('#accountDetail').textContent = accounts.agentInstruction || 'Hãy kết nối Google.';
      setProgress('Cần kết nối Google');
      return;
    }
    if (!accounts.readyForGeneration) {
      $('#accountText').textContent = 'Đang khôi phục Google Flow';
      $('#accountDetail').textContent = 'FlowFree đang kiểm tra session trong Chrome profile riêng…';
      setProgress('Đang khôi phục session Flow…');
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
    $('#connectBtn').disabled = true;
    const accounts = await flowfree.invoke('accounts');
    if (accounts.readyForGeneration && accounts.defaultAccountId) return refreshAccount();
    $('#accountText').textContent = 'Đang mở Google Flow';
    $('#accountDetail').textContent = 'Hãy đăng nhập trực tiếp trong cửa sổ Chrome riêng của FlowFree. Không cần extension.';
    setProgress('Đang mở Chrome riêng của FlowFree…');
    const completion = await flowfree.invoke('connect-managed');
    log(`Managed login complete: ${completion.accountId}`);
    await refreshAccount();
  } catch (error) {
    $('#accountText').textContent = 'Kết nối Google thất bại';
    $('#accountDetail').textContent = error.message;
    log(`Kết nối Google thất bại: ${error.message}`);
    setProgress('Kết nối lỗi');
  } finally {
    $('#connectBtn').disabled = false;
  }
}

if (!bridgeReady) {
  setProgress('LỖI IPC: FlowFree Bridge chưa nạp');
  $$('button').forEach((button) => { if (!button.classList.contains('tab')) button.disabled = true; });
}

$$('.tab').forEach((button) => { button.onclick = () => selectTab(button.dataset.tab); });
$$('[data-tab-target]').forEach((button) => { button.onclick = () => selectTab(button.dataset.tabTarget); });
$$('[data-dir]').forEach((button) => { button.onclick = async () => { const directory = await flowfree.invoke('pick-directory'); if (directory) { $(`#${button.dataset.dir}`).value = directory; saveProject(); } }; });

$('#connectBtn').onclick = beginConnect;
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
$('#runImages').onclick = async () => {
  if (!compatibility.generationEnabled) { setProgress('Generation bị khóa: Flow workspace chưa được xác minh.'); return; }
  if (!accountId) { setProgress('Hãy kết nối Google trước.'); return; }
  if (!$('#imageOut').value) { setProgress('Hãy chọn output folder.'); return; }
  try {
    $('#runImages').disabled = true;
    await rebuildQueue('QUEUED');
    imageQueue = imageQueue.map((item) => ['WAITING', 'PAUSED'].includes(item.status) ? { ...item, status: 'QUEUED' } : item);
    renderQueue();
    const referenceFilesByIndex = Object.fromEntries(imageQueue.map((item) => [item.index, item.referenceFiles || []]));
    const result = await flowfree.invoke('run-images', {
      accountId,
      prompts: $('#imagePrompts').value,
      model: $('#imageModel').value,
      aspectRatio: $('#imageRatio').value,
      resolution: $('#imageResolution').value,
      outputDirectory: $('#imageOut').value,
      referenceFilesByIndex,
      resume: $('#imageResume').checked,
      retries: 2,
      delaySeconds: Number($('#imageDelay').value) || 0
    });
    setProgress(result.ok ? `Đã xử lý ${result.total} job ảnh.` : 'Queue đã dừng.');
  } catch (error) {
    setProgress(`Generation lỗi: ${error.message}`);
    log(`Generation lỗi: ${error.message}`);
  } finally {
    $('#runImages').disabled = !compatibility.generationEnabled;
  }
};
$('#runVideos').onclick = () => setProgress('Video generation chưa được bật trong port này.');

flowfree.onEvent((event) => {
  log(event);
  if (event?.channel === 'image-batch') {
    const id = event.item?.stem;
    imageQueue = imageQueue.map((item) => item.id !== id ? item : {
      ...item,
      status: event.type === 'done' || event.type === 'skip' ? 'DONE' : ['retry', 'failed'].includes(event.type) ? 'FAILED' : 'GENERATING',
      retryCount: event.type === 'retry' ? Math.max(item.retryCount || 0, event.attempt || 0) : item.retryCount || 0,
      error: ['retry', 'failed'].includes(event.type) ? event.error || '' : '',
      outputFile: event.type === 'done' || event.type === 'skip' ? `${$('#imageOut').value}/${id}.png` : item.outputFile || ''
    });
    renderQueue();
    setProgress(event.type === 'done' ? `Hoàn tất ${id}` : event.type === 'retry' ? `${id} lỗi, đang thử lại…` : event.type === 'failed' ? `${id} thất bại.` : `${id}: ${event.type}`);
    return;
  }
  if (event?.channel !== 'managed-login') return;
  if (event.message) {
    $('#accountDetail').textContent = event.message;
    setProgress(event.message);
  }
  if (event.type === 'browser-opened') $('#accountText').textContent = 'Đăng nhập Google trong Chrome FlowFree';
  if (event.type === 'verifying') $('#accountText').textContent = 'Đang xác minh Flow workspace';
});
restoreLog();
restoreProject();
renderQueue();
refreshAccount();
