const bridgeReady = !!window.flowfree;
if (!bridgeReady) {
  window.addEventListener('DOMContentLoaded', () => {
    const progress = document.querySelector('#progress');
    const log = document.querySelector('#log');
    if (progress) progress.textContent = 'LỖI IPC: FlowFree Bridge chưa nạp';
    if (log) log.textContent += 'LỖI: preload/IPC bridge không nạp. Hãy cài bản FlowFree đã sửa.\n';
    document.querySelectorAll('button').forEach(b => {
      if (!b.classList.contains('tab')) b.disabled = true;
    });
  });
}
const flowfree = window.flowfree || { invoke: async()=>{ throw new Error('FlowFree IPC bridge unavailable'); }, onEvent:()=>{} };
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let accountId='', pendingConnectionId='', imageRefs=[];
function log(x){const el=$('#log'); el.textContent += `[${new Date().toLocaleTimeString()}] ${typeof x==='string'?x:JSON.stringify(x)}\n`; el.scrollTop=el.scrollHeight;}
function setProgress(t){$('#progress').textContent=t;}
function setOptions(sel,arr,selected){sel.innerHTML='<option value="ui-default">UI Default</option>'+arr.map(x=>`<option value="${x.id||x}">${x.label||x}</option>`).join(''); if(selected) sel.value=selected;}
$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active')); $$('.panel').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $('#'+b.dataset.tab).classList.add('active');});
$$('[data-dir]').forEach(b=>b.onclick=async()=>{const p=await flowfree.invoke('pick-directory'); if(p) $('#'+b.dataset.dir).value=p;});
$('#pickImageRefs').onclick=async()=>{imageRefs=await flowfree.invoke('pick-files',{filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']} ]}); $('#imageRefs').value=imageRefs.join('; ')};
async function refresh(){try{const a=await flowfree.invoke('accounts'); accountId=a.defaultAccountId||''; if(accountId){document.body.classList.add('connected'); $('#accountText').textContent=accountId; const c=await flowfree.invoke('inspect',accountId); setOptions($('#imageModel'),c.models?.image||[]); setOptions($('#videoModel'),c.models?.video||[]); setOptions($('#imageRatio'),(c.aspectRatiosByMedia?.image||[]).map(x=>({id:x,label:x}))); setOptions($('#videoRatio'),(c.aspectRatiosByMedia?.video||[]).map(x=>({id:x,label:x}))); $('#videoDuration').innerHTML='<option value="">UI Default</option>'+ (c.visibleDurations||[]).map(x=>`<option value="${x}">${x}s</option>`).join(''); log('Account ready: '+accountId);} }catch(e){log('Account: '+e.message)}}
$('#connectBtn').onclick=async()=>{try{const r=await flowfree.invoke('connect-begin',{}); if(r.status==='ALREADY_CONNECTED'){await refresh();return;} pendingConnectionId=r.connectionId; log('Flow Login Bridge armed. Mở extension và bấm Connect Flow.'); await flowfree.invoke('open-extension'); $('#connectBtn').textContent='Hoàn tất kết nối'; $('#connectBtn').onclick=completeConnect;}catch(e){log(e.message)}};
async function completeConnect(){try{setProgress('Đang mở Google account chooser…'); const r=await flowfree.invoke('connect-complete',{connectionId:pendingConnectionId,userConfirmedSessionSent:true,chooseGoogleAccount:true,waitForAccountSelectionSeconds:300}); log(r); $('#connectBtn').textContent='Connect Google'; await refresh(); setProgress('Đã kết nối');}catch(e){log(e.message);setProgress('Kết nối lỗi')}}
flowfree.onEvent(e=>{log(e); if(e.item) setProgress(`${e.type.toUpperCase()} ${e.item.stem}`)});
$('#runImages').onclick=async()=>{try{setProgress('Đang chạy ảnh…'); const r=await flowfree.invoke('run-images',{accountId,prompts:$('#imagePrompts').value,model:$('#imageModel').value,aspectRatio:$('#imageRatio').value,referenceFiles:imageRefs,outputDirectory:$('#imageOut').value,resume:$('#imageResume').checked,retries:2}); log(r);setProgress('Ảnh hoàn tất')}catch(e){log(e.message);setProgress('Ảnh lỗi')}};
$('#runVideos').onclick=async()=>{try{const mode=$('#videoMode').value,imgDir=$('#videoImages').value,endDir=$('#endDir').value; const lines=$('#videoPrompts').value.split(/\r?\n/).filter(x=>x.trim()); const endFilesByIndex={}; if(mode==='start-end') lines.forEach((_,i)=>endFilesByIndex[i+1]=`${endDir}/${String(i+1).padStart(3,'0')}.png`); setProgress('Đang chạy video…'); const r=await flowfree.invoke('run-videos',{accountId,prompts:$('#videoPrompts').value,mode,model:$('#videoModel').value,aspectRatio:$('#videoRatio').value,durationSeconds:Number($('#videoDuration').value)||undefined,imageDirectory:imgDir,outputDirectory:$('#videoOut').value,endFilesByIndex,resume:$('#videoResume').checked,retries:2,upscale:'none'});log(r);setProgress('Video hoàn tất')}catch(e){log(e.message);setProgress('Video lỗi')}};
$('#cancel').onclick=()=>flowfree.invoke('cancel');
refresh();
