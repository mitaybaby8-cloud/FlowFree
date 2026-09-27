import fs from 'node:fs/promises';
import path from 'node:path';

export function padIndex(index, width = 3) { return String(index).padStart(width, '0'); }

export function parsePromptBatch(text) {
  return String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).map((line, i) => {
    const m = line.match(/^\s*(?:\(?([0-9]{1,6})\)?[.)\-:]?\s+)?(.+?)\s*$/);
    const index = m?.[1] ? Number(m[1]) : i + 1;
    return { index, prompt: m?.[2] ?? line };
  });
}

export function buildMapping(items, imageDir, videoDir) {
  return items.map(item => {
    const stem = padIndex(item.index);
    return {
      ...item,
      stem,
      imageFile: path.join(imageDir, `${stem}.png`),
      videoFile: path.join(videoDir, `${stem}.mp4`)
    };
  });
}

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function saveState(file, state) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(state, null, 2)); }
async function loadState(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return { version: 1, jobs: {} }; } }

async function settle(engine, job, { maxPolls = 90, waitSeconds = 10 } = {}) {
  let current = job;
  for (let i = 0; i < maxPolls && ['created','configuring','submitted','processing','ready','downloading','upscaling'].includes(current?.status); i++) {
    current = await engine.jobStatus(current.id, waitSeconds);
  }
  return current;
}

export class BatchRunner {
  constructor(engine, emit = () => {}) { this.engine = engine; this.emit = emit; this.cancelled = false; }
  cancel() { this.cancelled = true; }

  async runImageBatch(cfg) {
    const items = buildMapping(parsePromptBatch(cfg.prompts), cfg.outputDirectory, cfg.videoDirectory || cfg.outputDirectory);
    const stateFile = path.join(cfg.outputDirectory, '.flowfree-image-state.json');
    const state = await loadState(stateFile);
    await fs.mkdir(cfg.outputDirectory, { recursive: true });
    for (const item of items) {
      if (this.cancelled) break;
      const key = item.stem;
      if (cfg.resume && (await exists(item.imageFile) || state.jobs[key]?.status === 'completed')) { this.emit({type:'skip',item}); continue; }
      let attempt = 0, lastError;
      while (attempt <= (cfg.retries ?? 2)) {
        attempt++;
        try {
          this.emit({type:'start',item,attempt});
          const refs = cfg.referenceFilesByIndex?.[item.index] || cfg.referenceFiles || [];
          let job = await this.engine.generateImage({
            accountId: cfg.accountId, prompt: item.prompt, model: cfg.model || 'ui-default', aspectRatio: cfg.aspectRatio || 'ui-default', outputs: 1,
            referenceFiles: refs, outputDirectory: cfg.outputDirectory, fileName: item.stem, download: true, timeoutSeconds: cfg.timeoutSeconds || 600
          });
          if (job?.id && job.status !== 'completed') job = await settle(this.engine, job, cfg.polling);
          state.jobs[key] = { id: job?.id, status: job?.status, downloadedFiles: job?.downloadedFiles || [], prompt: item.prompt, updatedAt: new Date().toISOString() };
          await saveState(stateFile, state);
          if (job?.status !== 'completed') throw new Error(job?.error || `Image job ${key} ended with ${job?.status}`);
          const src = job.downloadedFiles?.[0];
          if (src && src !== item.imageFile) await fs.copyFile(src, item.imageFile);
          this.emit({type:'done',item,job});
          lastError = null; break;
        } catch (e) { lastError = e; this.emit({type:'retry',item,attempt,error:String(e?.message||e)}); }
      }
      if (lastError) throw lastError;
    }
    return { ok: !this.cancelled, total: items.length, stateFile };
  }

  async runVideoBatch(cfg) {
    const items = buildMapping(parsePromptBatch(cfg.prompts), cfg.imageDirectory, cfg.outputDirectory);
    const stateFile = path.join(cfg.outputDirectory, '.flowfree-video-state.json');
    const state = await loadState(stateFile);
    await fs.mkdir(cfg.outputDirectory, { recursive: true });
    for (const item of items) {
      if (this.cancelled) break;
      const key = item.stem;
      if (cfg.resume && (await exists(item.videoFile) || state.jobs[key]?.status === 'completed')) { this.emit({type:'skip',item}); continue; }
      const refs = [];
      if (cfg.mode === 'image-to-video') refs.push(item.imageFile);
      if (cfg.mode === 'start-end') {
        const start = cfg.startFilesByIndex?.[item.index] || item.imageFile;
        const end = cfg.endFilesByIndex?.[item.index];
        if (!end) throw new Error(`Missing end frame for ${item.stem}`);
        refs.push(start, end);
      }
      let prompt = item.prompt;
      if (cfg.mode === 'start-end') prompt = `Use the first attached image as the starting frame and the second attached image as the ending frame. ${prompt}`;
      let attempt = 0, lastError;
      while (attempt <= (cfg.retries ?? 2)) {
        attempt++;
        try {
          this.emit({type:'start',item,attempt});
          let job = await this.engine.generateVideo({
            accountId: cfg.accountId, prompt, model: cfg.model || 'ui-default', aspectRatio: cfg.aspectRatio || 'ui-default',
            ...(cfg.durationSeconds ? {durationSeconds: cfg.durationSeconds} : {}), outputs: 1, referenceFiles: refs,
            upscale: cfg.upscale || 'none', outputDirectory: cfg.outputDirectory, fileName: item.stem, download: true, timeoutSeconds: cfg.timeoutSeconds || 600
          });
          if (job?.id && job.status !== 'completed') job = await settle(this.engine, job, cfg.polling);
          state.jobs[key] = { id: job?.id, status: job?.status, downloadedFiles: job?.downloadedFiles || [], prompt, mode: cfg.mode, updatedAt: new Date().toISOString() };
          await saveState(stateFile, state);
          if (job?.status !== 'completed') throw new Error(job?.error || `Video job ${key} ended with ${job?.status}`);
          const src = job.downloadedFiles?.[0];
          if (src && src !== item.videoFile) await fs.copyFile(src, item.videoFile);
          this.emit({type:'done',item,job});
          lastError = null; break;
        } catch (e) { lastError = e; this.emit({type:'retry',item,attempt,error:String(e?.message||e)}); }
      }
      if (lastError) throw lastError;
    }
    return { ok: !this.cancelled, total: items.length, stateFile };
  }
}
