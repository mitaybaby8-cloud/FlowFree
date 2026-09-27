import { app, BrowserWindow, clipboard, ipcMain, dialog, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { FlowEngineClient } from './engine-client.mjs';
import { BatchRunner } from './batch-runner.mjs';
import { waitForQueuedSession } from './bridge-login.mjs';
import { assessImageEngineCompatibility } from './flow-image-config.mjs';
import { buildImageQueue, isReferenceImage } from './image-queue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
let win, engine, runner, managedLoginWorker;

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.on('second-instance', ()=>{
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

function send(data){ win?.webContents.send('flowfree:event', data); }
async function makeWindow(){
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1180, minHeight: 760, title: 'FlowFree', backgroundColor:'#0b0e13', webPreferences:{ preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false } });
  await win.loadFile(path.resolve(__dirname,'../ui/index.html'));
}

app.whenReady().then(async()=>{
  if (!singleInstance) return;
  const engineEntry = app.isPackaged ? path.join(process.resourcesPath, 'engine', 'dist', 'index.js') : undefined;
  engine = new FlowEngineClient({ engineEntry });
  await makeWindow();
});
app.on('window-all-closed', async()=>{ managedLoginWorker?.kill(); await engine?.close().catch(()=>{}); if(process.platform!=='darwin') app.quit(); });
app.on('activate', ()=>{ if(BrowserWindow.getAllWindows().length===0) makeWindow(); });

ipcMain.handle('pick-directory', async()=> (await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']})).filePaths[0] || '');
ipcMain.handle('pick-files', async(_,opts={})=> (await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:opts.filters||[]})).filePaths);
ipcMain.handle('pick-text-file', async()=> {
  const [file] = (await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Text',extensions:['txt']}]})).filePaths;
  return file ? { file, text: await fs.readFile(file, 'utf8') } : null;
});
ipcMain.handle('pick-reference-folder', async()=> {
  const [directory] = (await dialog.showOpenDialog(win,{properties:['openDirectory']})).filePaths;
  if (!directory) return null;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry)=>entry.isFile()).map((entry)=>path.join(directory,entry.name)).filter(isReferenceImage)
    .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  return { directory, files };
});
ipcMain.handle('open-extension', async()=> {
  const bundledExtensionPath = app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.resolve(__dirname, '../extension');
  const extensionPath = path.join(app.getPath('userData'), 'Flow Login Helper');
  await fs.access(path.join(bundledExtensionPath, 'manifest.json'));
  await fs.mkdir(extensionPath, { recursive: true });
  await fs.cp(bundledExtensionPath, extensionPath, { recursive: true, force: true });
  clipboard.writeText(extensionPath);
  let chromeError = '';
  try {
    if (process.platform === 'darwin') await execFileAsync('/usr/bin/open', ['-a', 'Google Chrome', 'chrome://extensions']);
    else await shell.openExternal('chrome://extensions');
  } catch (error) {
    chromeError = error.message;
  }
  shell.showItemInFolder(path.join(extensionPath, 'manifest.json'));
  return { extensionPath, copiedToClipboard: true, chromeError };
});
ipcMain.handle('accounts', ()=>engine.listAccounts());
ipcMain.handle('connect-begin', (_,args)=>engine.beginAccountConnection(args||{}));
ipcMain.handle('wait-login-bridge', ()=>waitForQueuedSession(()=>engine.loginBridgeStatus()));
ipcMain.handle('connect-complete', (_,args)=>engine.completeAccountConnection(args));
async function runManagedAccountWorker({ mode = 'connect', timeoutMs = 600_000 } = {}) {
  if (managedLoginWorker) throw new Error('Một cửa sổ kết nối Google đang chạy.');
  const engineDist = app.isPackaged ? path.join(process.resourcesPath, 'engine', 'dist') : path.resolve(__dirname, '../vendor/google-flow-mcp/dist');
  const workerPath = path.join(__dirname, 'managed-login-worker.mjs');
  return new Promise((resolve,reject)=>{
    const child = spawn(process.execPath, [workerPath, engineDist, 'flowfree', String(timeoutMs), mode], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FLOW_MCP_HEADLESS: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    managedLoginWorker = child;
    let stdoutBuffer = '';
    let stderr = '';
    let completed;
    const handleLine = (line)=>{
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        send({ channel:'managed-login', ...event });
        if (event.type === 'complete') completed = event;
        if (event.type === 'error') stderr = event.message;
      } catch {
        stderr += `${line}\n`;
      }
    };
    child.stdout.on('data',(chunk)=>{
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      lines.forEach(handleLine);
    });
    child.stderr.on('data',(chunk)=>{ stderr += chunk.toString(); });
    child.once('error',(error)=>reject(error));
    child.once('exit',(code)=>{
      if (stdoutBuffer) handleLine(stdoutBuffer);
      managedLoginWorker = null;
      if (code === 0 && completed) resolve(completed);
      else reject(new Error(stderr.trim() || `Managed login worker stopped with code ${code}.`));
    });
  }).finally(()=>{ managedLoginWorker = null; });
}
ipcMain.handle('connect-managed', ()=>runManagedAccountWorker());
ipcMain.handle('inspect', async(_,accountId)=>{
  if (accountId !== 'flowfree') throw new Error(`Managed account không hợp lệ: ${accountId}`);
  const { capabilities } = await runManagedAccountWorker({ mode: 'verify', timeoutMs: 30_000 });
  return { ...capabilities, phase1Compatibility: assessImageEngineCompatibility(capabilities) };
});
ipcMain.handle('prepare-image-queue', (_,cfg)=>buildImageQueue(cfg));
ipcMain.handle('disconnect-account', ()=>({
  ok:false,
  supported:false,
  reason:'google-flow-mcp 0.2.3 không cung cấp tool disconnect/remove account.'
}));
ipcMain.handle('run-images', async(_,cfg)=>{
  if (cfg?.resolution !== 'flow-default') throw new Error('Engine chỉ hỗ trợ độ phân giải mặc định của Flow; 1K/2K/4K chưa có API xác minh.');
  if (!cfg?.accountId || !cfg?.outputDirectory || !String(cfg?.prompts || '').trim()) throw new Error('Thiếu account, output folder hoặc prompt.');
  runner = new BatchRunner(engine, (event)=>send({ channel:'image-batch', ...event }));
  return runner.runImageBatch(cfg);
});
ipcMain.handle('run-videos', async(_,cfg)=>{ runner=new BatchRunner(engine,send); return runner.runVideoBatch(cfg); });
ipcMain.handle('cancel', ()=>{ runner?.cancel(); return true; });
