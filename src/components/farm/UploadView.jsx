'use client';

/**
 * Upload: drop a batch, upload to the media server, AI analysis and
 * captions, then schedule. New batches are placed AFTER whatever is
 * already queued, on the brand's current cadence.
 *
 * Path: src/components/farm/UploadView.jsx
 */

import { useEffect, useRef, useState } from 'react';
import { Btn, Icon, toast } from '@/components/ui';
import { describeCadence } from '@/lib/content-farm/cadence';
import { uploadsAction } from './shared';

const DO_URL = 'https://urchin-app-bqb4i.ondigitalocean.app';

const FILE_STATUS = {
  pending: { c: 'var(--tx-dim)', l: '' },
  uploading: { c: 'var(--cyan)', l: 'Up' },
  uploaded: { c: 'var(--blue)', l: 'Ok' },
  analyzed: { c: 'var(--green)', l: 'Ok' },
  analyze_failed: { c: 'var(--red)', l: '!' },
  failed: { c: 'var(--red)', l: '!' },
};

const fmtSize = (bytes) => (bytes > 1073741824 ? `${(bytes / 1073741824).toFixed(1)} GB` : `${(bytes / 1048576).toFixed(0)} MB`);
const fmtSecs = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const prettyDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }) : '');

function makeThumb(file) {
  return new Promise((resolve) => {
    if (file.type.startsWith('image/')) { resolve(URL.createObjectURL(file)); return; }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata'; video.muted = true; video.playsInline = true;
    let done = false;
    const finish = (r) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(r); };
    video.onloadedmetadata = () => { try { video.currentTime = Math.min(1, (video.duration || 2) / 2); } catch { finish(null); } };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = 240 / Math.max(video.videoWidth, 1);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.7));
      } catch { finish(null); }
    };
    video.onerror = () => finish(null);
    video.src = url;
    setTimeout(() => finish(null), 6000);
  });
}

export default function UploadView({ b, onNavigate, refreshBiz }) {
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [batchId, setBatchId] = useState(null);
  const [proc, setProc] = useState({ done: 0, total: 0, current: '', currentIdx: -1 });
  const [procErrors, setProcErrors] = useState(0);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [phase, setPhase] = useState('select');
  const [dragOver, setDragOver] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef(null);
  const filesRef = useRef([]);
  filesRef.current = files;

  const handleFiles = async (fl) => {
    const arr = Array.from(fl).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!arr.length) { toast('Only images and videos can be uploaded', 'info'); return; }
    const startIdx = filesRef.current.length;
    setFiles(prev => [...prev, ...arr.map(f => ({ file: f, status: 'pending', url: null, result: null, thumb: null }))]);
    for (let i = 0; i < arr.length; i++) {
      const thumb = await makeThumb(arr[i]);
      setFiles(prev => { const n = [...prev]; if (n[startIdx + i]) n[startIdx + i] = { ...n[startIdx + i], thumb }; return n; });
    }
  };

  useEffect(() => () => { filesRef.current.forEach(f => { if (f.thumb?.startsWith('blob:')) URL.revokeObjectURL(f.thumb); }); }, []);
  useEffect(() => { setFiles([]); setPhase('select'); setBatchId(null); setScheduleResult(null); setProcErrors(0); setStartedAt(null); }, [b?.id]);
  useEffect(() => {
    if (!startedAt || (phase !== 'uploading' && phase !== 'processing')) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt, phase]);

  const busy = phase === 'uploading' || phase === 'processing';
  useEffect(() => {
    if (!busy) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [busy]);

  const removeFile = (idx) => setFiles(prev => { const f = prev[idx]; if (f?.thumb?.startsWith('blob:')) URL.revokeObjectURL(f.thumb); return prev.filter((_, i) => i !== idx); });
  const clearAll = () => { files.forEach(f => { if (f.thumb?.startsWith('blob:')) URL.revokeObjectURL(f.thumb); }); setFiles([]); setPhase('select'); setBatchId(null); setScheduleResult(null); };
  const totalSize = files.reduce((s, f) => s + f.file.size, 0);

  const uploadAll = async () => {
    if (!b || !files.length) return;
    setPhase('uploading'); setStartedAt(Date.now()); setElapsed(0);
    setUploadProgress({ done: 0, total: files.length });
    const updated = [...files]; const uploaded = [];
    for (let i = 0; i < updated.length; i++) {
      const f = updated[i];
      if (f.status === 'uploaded') { uploaded.push(f.result); continue; }
      updated[i] = { ...updated[i], status: 'uploading' }; setFiles([...updated]);
      try {
        const fd = new FormData(); fd.append('file', f.file); fd.append('slug', b.slug || 'default');
        const resp = await fetch(`${DO_URL}/api/media/upload`, { method: 'POST', body: fd });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        updated[i] = { ...updated[i], status: 'uploaded', url: data.url, result: data };
        uploaded.push(data);
      } catch (err) { updated[i] = { ...updated[i], status: 'failed', error: err.message }; }
      setFiles([...updated]); setUploadProgress({ done: i + 1, total: files.length });
    }
    if (!uploaded.length) { toast('No files uploaded. Check the media server.', 'error'); setPhase('select'); return; }
    const newBatch = `batch-${Date.now()}`;
    try {
      await uploadsAction({ business_id: b.id, batch_id: newBatch, files: uploaded });
      setBatchId(newBatch); setPhase('uploaded');
    } catch (e) { toast(e.message, 'error'); setPhase('select'); }
  };

  const processAll = async () => {
    if (!batchId) return;
    setPhase('processing'); setProcErrors(0); setStartedAt(Date.now()); setElapsed(0);
    const total = files.filter(f => f.status === 'uploaded').length;
    let done = 0; let errors = 0; let loops = 0;
    setProc({ done: 0, total, current: '', currentIdx: 0 });
    while (loops < total + 10) {
      loops++;
      try {
        const r = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', batch_id: batchId }) });
        const data = await r.json();
        if (data.processed === 0 || data.reason === 'all_processed') break;
        done++;
        if (data.error || data.skipped) {
          errors++;
          setProc({ done, total, current: `Skipped: ${data.error || 'unknown'}`, currentIdx: done });
          setFiles(prev => { const n = [...prev]; if (n[done - 1]) n[done - 1] = { ...n[done - 1], status: 'analyze_failed' }; return n; });
          continue;
        }
        const a = data.result?.analysis || {};
        setProc({ done, total, current: a.content_description || '', currentIdx: done });
        setFiles(prev => { const n = [...prev]; if (n[done - 1]) n[done - 1] = { ...n[done - 1], status: 'analyzed', pillar: a.content_pillar }; return n; });
      } catch { errors++; if (errors > 5) break; }
    }
    setProcErrors(errors); setPhase('processed');
  };

  const scheduleBatch = async () => {
    setPhase('scheduling');
    try { setScheduleResult(await uploadsAction({ action: 'schedule', batch_id: batchId })); setPhase('scheduled'); refreshBiz?.(); }
    catch (e) { toast(e.message, 'error'); setPhase('processed'); }
  };

  const approveBatch = async () => {
    try { const d = await uploadsAction({ action: 'approve', batch_id: batchId }); toast(`Approved ${d.approved} posts`, 'success'); refreshBiz?.(); onNavigate('queue'); }
    catch (e) { toast(e.message, 'error'); }
  };

  if (!b) return null;
  const cad = describeCadence(b);
  const queued = (b.stats?.approved || 0) + (b.stats?.needs_review || 0);
  const activeFile = proc.currentIdx > 0 ? files[proc.currentIdx - 1] : null;
  const pct = phase === 'uploading' ? (uploadProgress.total ? (uploadProgress.done / uploadProgress.total) * 100 : 0) : (proc.total ? (proc.done / proc.total) * 100 : 0);
  const rate = elapsed > 0 && proc.done > 0 ? proc.done / elapsed : 0;
  const eta = rate > 0 ? Math.round((proc.total - proc.done) / rate) : null;

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="cf-banner is-info">
        <span className="cf-biz-dot" style={{ background: b.primary_color || 'var(--cyan)', width: 10, height: 10 }} />
        <span className="cf-banner-text">
          Uploading to <strong>{b.name}</strong>. {cad.text}.{queued > 0 ? ` New posts go after the ${queued} already queued.` : ''}
        </span>
        {files.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--tx-muted)', fontVariantNumeric: 'tabular-nums' }}>{files.length} files · {fmtSize(totalSize)}</span>}
      </div>

      {phase === 'select' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? 'var(--cyan)' : 'var(--bd-strong)'}`, borderRadius: 14,
            padding: files.length ? '22px' : '64px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 16,
            background: dragOver ? 'var(--cyan-dim)' : 'rgba(13,17,24,.6)', transition: 'all .15s',
          }}
        >
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: files.length ? 6 : 12, color: dragOver ? 'var(--cyan)' : 'var(--tx-muted)' }}><Icon name="upload" size={files.length ? 18 : 28} /></div>
          <div style={{ fontSize: files.length ? 13 : 15, fontWeight: 600 }}>{files.length ? 'Drop more files or click to add' : 'Drop Reels and Images Here'}</div>
          {!files.length && <div style={{ fontSize: 12.5, color: 'var(--tx-dim)', marginTop: 6 }}>MP4, MOV, PNG or JPG. Batches of 30 to 100 work well.</div>}
        </div>
      )}

      {files.length > 0 && phase === 'select' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{files.length} files ready</span>
            <Btn variant="ghost" size="sm" onClick={clearAll}>Clear All</Btn>
          </div>
          <Btn variant="primary" onClick={uploadAll}><Icon name="upload" size={14} />Upload {files.length} Files</Btn>
        </div>
      )}

      {busy && (
        <div className="cf-card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
          <div className="cf-thumb" style={{ width: 76, height: 95 }}>
            {activeFile?.thumb ? <img src={activeFile.thumb} alt="" /> : <div className="cf-thumb-empty"><Icon name="play" size={18} /></div>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{phase === 'uploading' ? 'Uploading Files' : 'Analyzing and Writing Captions'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--tx-muted)', fontVariantNumeric: 'tabular-nums' }}>{phase === 'uploading' ? `${uploadProgress.done} / ${uploadProgress.total}` : `${proc.done} / ${proc.total}`}</div>
            </div>
            <div style={{ height: 6, background: 'var(--s2)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--cyan), var(--green))', borderRadius: 3, transition: 'width .4s' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx-dim)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>
              {activeFile?.file?.name && <span style={{ color: 'var(--tx-muted)', fontWeight: 600 }}>{activeFile.file.name} </span>}
              {proc.current || (phase === 'uploading' ? 'Transferring to storage' : 'Waiting on the model')}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: 'var(--tx-dim)', fontVariantNumeric: 'tabular-nums' }}>
              <span>Elapsed {fmtSecs(elapsed)}</span>
              {eta !== null && eta > 0 && <span>About {fmtSecs(eta)} left</span>}
              {procErrors > 0 && <span style={{ color: 'var(--red)' }}>{procErrors} skipped</span>}
              <span>Keep this tab open</span>
            </div>
          </div>
        </div>
      )}

      {files.length > 0 && phase !== 'scheduled' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, maxHeight: busy ? 280 : 480, overflowY: 'auto', padding: 2 }}>
          {files.map((f, i) => {
            const st = FILE_STATUS[f.status] || FILE_STATUS.pending;
            const isActive = busy && proc.currentIdx === i + 1;
            const isDone = f.status === 'analyzed' || f.status === 'uploaded';
            return (
              <div key={i} className="cf-card" style={{ overflow: 'hidden', position: 'relative', borderColor: isActive ? 'var(--cyan)' : undefined, opacity: busy && !isActive && !isDone ? 0.45 : 1, transition: 'opacity .2s' }}>
                <div style={{ aspectRatio: '4 / 5', background: 'var(--s2)', position: 'relative' }}>
                  {f.thumb ? <img src={f.thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="cf-thumb-empty"><Icon name="play" size={14} /></div>}
                  {f.status !== 'pending' && <div style={{ position: 'absolute', top: 5, right: 5, padding: '1px 6px', borderRadius: 5, background: 'rgba(0,0,0,.8)', color: st.c, fontSize: 10, fontWeight: 700 }}>{st.l}</div>}
                  {f.pillar && <div style={{ position: 'absolute', bottom: 5, left: 5, padding: '1px 6px', borderRadius: 5, background: 'rgba(0,0,0,.8)', color: 'var(--blue)', fontSize: 9.5, fontWeight: 700, textTransform: 'capitalize' }}>{f.pillar}</div>}
                  {phase === 'select' && (
                    <button onClick={e => { e.stopPropagation(); removeFile(i); }} title="Remove" style={{ position: 'absolute', top: 5, left: 5, width: 20, height: 20, background: 'rgba(0,0,0,.8)', border: 'none', color: 'var(--red)', cursor: 'pointer', borderRadius: 5, display: 'grid', placeItems: 'center' }}><Icon name="x" size={11} /></button>
                  )}
                </div>
                <div style={{ padding: '4px 7px', fontSize: 10, color: 'var(--tx-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.file.name}</div>
              </div>
            );
          })}
        </div>
      )}

      {phase === 'uploaded' && (
        <div className="cf-card cf-card-pad" style={{ textAlign: 'center', marginTop: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{files.filter(f => f.status === 'uploaded').length} Files Uploaded</div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 16 }}>Next the AI classifies each clip and writes captions. Roughly 5 to 8 seconds per file.</div>
          <Btn variant="primary" size="lg" onClick={processAll}><Icon name="sparkle" size={15} />Analyze and Caption</Btn>
        </div>
      )}

      {phase === 'processed' && (
        <div className="cf-card cf-card-pad" style={{ textAlign: 'center', marginTop: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{procErrors > 0 ? `Analyzed, ${procErrors} Skipped` : 'All Files Analyzed'}</div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 16 }}>Took {fmtSecs(elapsed)}. Scheduling follows {cad.text.toLowerCase()}.</div>
          <Btn variant="primary" size="lg" onClick={scheduleBatch}><Icon name="calendar" size={15} />Schedule Posts</Btn>
        </div>
      )}

      {phase === 'scheduling' && <div style={{ display: 'grid', placeItems: 'center', padding: 40, gap: 10 }}><div className="cf-spinner" /><div style={{ fontSize: 13, color: 'var(--tx-muted)' }}>Building the calendar</div></div>}

      {phase === 'scheduled' && scheduleResult && (
        <div className="cf-card cf-card-pad" style={{ textAlign: 'center', borderColor: 'rgba(52,211,153,.3)' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--green)' }}>{scheduleResult.scheduled}</div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 4 }}>posts scheduled</div>
          {scheduleResult.startDate && <div style={{ fontSize: 13, color: 'var(--tx-dim)', marginBottom: 18 }}>{prettyDate(scheduleResult.startDate)} through {prettyDate(scheduleResult.endDate)}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Btn variant="primary" size="lg" onClick={() => onNavigate('review')}>Review One by One</Btn>
            <Btn size="lg" onClick={approveBatch}>Approve All Without Reviewing</Btn>
            <Btn size="lg" variant="ghost" onClick={() => onNavigate('queue')}>See Queue</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
