import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlowEngineClient } from './engine-client.mjs';
import { BatchRunner } from './batch-runner.mjs';
import { assessImageEngineCompatibility } from './flow-image-config.mjs';
import { buildImageQueue, isReferenceImage } from './image-queue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win, engine, runner;

function send(data){ win?.webContents.send('flowfree:event', data); }
async function makeWindow(){
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1180, minHeight: 760, title: 'FlowFree', backgroundColor:'#0b0e13', webPreferences:{ preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false } });
  await win.loadFile(path.resolve(__dirname,'../ui/index.html'));
}

app.whenReady().then(async()=>{
  const engineEntry = app.isPackaged ? path.join(process.resourcesPath, 'engine', 'dist', 'index.js') : undefined;
  engine = new FlowEngineClient({ engineEntry });
  await makeWindow();
});
app.on('window-all-closed', async()=>{ await engine?.close().catch(()=>{}); if(process.platform!=='darwin') app.quit(); });
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
  const extensionPath = app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.resolve(__dirname, '../extension');
  return shell.openPath(extensionPath);
});
ipcMain.handle('accounts', ()=>engine.listAccounts());
ipcMain.handle('connect-begin', (_,args)=>engine.beginAccountConnection(args||{}));
ipcMain.handle('connect-complete', (_,args)=>engine.completeAccountConnection(args));
ipcMain.handle('inspect', async(_,accountId)=>{
  const capabilities = await engine.inspect(accountId);
  return { ...capabilities, phase1Compatibility: assessImageEngineCompatibility(capabilities) };
});
ipcMain.handle('prepare-image-queue', (_,cfg)=>buildImageQueue(cfg));
ipcMain.handle('disconnect-account', ()=>({
  ok:false,
  supported:false,
  reason:'google-flow-mcp 0.2.3 không cung cấp tool disconnect/remove account.'
}));
ipcMain.handle('run-images', async()=>{
  throw new Error('Generation ảnh đang khóa: google-flow-mcp 0.2.3 chưa có API resolution/upscale ảnh tương thích G-Labs.');
});
ipcMain.handle('run-videos', async(_,cfg)=>{ runner=new BatchRunner(engine,send); return runner.runVideoBatch(cfg); });
ipcMain.handle('cancel', ()=>{ runner?.cancel(); return true; });
