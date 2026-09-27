import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlowEngineClient } from './engine-client.mjs';
import { BatchRunner } from './batch-runner.mjs';

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
ipcMain.handle('open-extension', async()=> {
  const extensionPath = app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.resolve(__dirname, '../extension');
  return shell.openPath(extensionPath);
});
ipcMain.handle('accounts', ()=>engine.listAccounts());
ipcMain.handle('connect-begin', (_,args)=>engine.beginAccountConnection(args||{}));
ipcMain.handle('connect-complete', (_,args)=>engine.completeAccountConnection(args));
ipcMain.handle('inspect', (_,accountId)=>engine.inspect(accountId));
ipcMain.handle('run-images', async(_,cfg)=>{ runner=new BatchRunner(engine,send); return runner.runImageBatch(cfg); });
ipcMain.handle('run-videos', async(_,cfg)=>{ runner=new BatchRunner(engine,send); return runner.runVideoBatch(cfg); });
ipcMain.handle('cancel', ()=>{ runner?.cancel(); return true; });
