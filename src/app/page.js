'use client';

import { useState, useEffect, useRef } from 'react';
import { Btn, Input, Select, Tag, Icon } from '@/components/ui';

const DO_URL = 'https://urchin-app-bqb4i.ondigitalocean.app';

export default function ContentFarm() {
  const [page, setPage] = useState('calendar');
  const [biz, setBiz] = useState([]);
  const [bizId, setBizId] = useState('');
  const [ready, setReady] = useState(false);

  const refreshBiz = () => {
    return fetch('/api/businesses')
      .then(r => r.json())
      .then(d => { if (d.businesses?.length) { setBiz(d.businesses); if (!bizId) setBizId(d.businesses[0]?.id || ''); } });
  };

  useEffect(() => { refreshBiz().finally(() => setReady(true)); }, []);

  const nav = [
    { id: 'upload', l: 'Upload', ic: 'plus' },
    { id: 'review', l: 'Review', ic: 'check' },
    { id: 'calendar', l: 'Calendar', ic: 'folder' },
    { id: 'queue', l: 'Today', ic: 'bolt' },
    { id: 'insights', l: 'Insights', ic: 'bolt' },
    { id: 'settings', l: 'Settings', ic: 'briefcase' },
  ];

  const b = biz.find(x => x.id === bizId);
  if (!ready) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: 180, borderRight: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--s1)' }}>
        <div style={{ padding: '20px 14px 14px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', color: 'var(--cyan)' }}>CONTENT FARM</div>
          <div style={{ fontSize: 9, color: 'var(--tx-dim)', marginTop: 3, fontWeight: 600, letterSpacing: '.08em' }}>AUTOMATED POSTING</div>
        </div>
        <nav style={{ padding: '8px 6px', flex: 1 }}>
          {nav.map(n => { const a = page === n.id; return (
            <button key={n.id} onClick={() => setPage(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 10px', border: a ? '1px solid var(--bd-glow)' : '1px solid transparent', background: a ? 'var(--cyan-dim)' : 'transparent', color: a ? 'var(--cyan)' : 'var(--tx-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: a ? 700 : 400, fontFamily: 'inherit', marginBottom: 2 }}>
              <Icon name={n.ic} size={14} />{n.l}
            </button>
          ); })}
        </nav>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--bd)', background: 'var(--s1)', flexShrink: 0 }}>
          {biz.map(b2 => {
            const active = b2.id === bizId;
            return (
              <button key={b2.id} onClick={() => setBizId(b2.id)} style={{
                padding: '12px 20px', border: 'none', borderBottom: active ? '2px solid var(--cyan)' : '2px solid transparent',
                background: active ? 'var(--cyan-dim)' : 'transparent', color: active ? 'var(--cyan)' : 'var(--tx-dim)',
                fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '.02em',
              }}>{b2.name}</button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {page === 'upload' && <UploadPage biz={biz} bizId={bizId} b={b} onNavigate={setPage} />}
          {page === 'review' && <ReviewPage bizId={bizId} b={b} onNavigate={setPage} />}
          {page === 'calendar' && <CalendarPage bizId={bizId} b={b} />}
          {page === 'queue' && <QueuePage bizId={bizId} />}
          {page === 'insights' && <InsightsPage bizId={bizId} />}
          {page === 'settings' && <SettingsPage bizId={bizId} b={b} refreshBiz={refreshBiz} />}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ label, done, total, color }) {
  const pct = total > 0 ? (done / total * 100) : 0;
  return (
    <div style={{ padding: 16, background: 'var(--s1)', borderRadius: 8, border: '1px solid var(--bd)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>{done}/{total}</span>
      </div>
      <div style={{ height: 4, background: 'var(--s2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.3s', boxShadow: `0 0 8px ${color}40` }} />
      </div>
    </div>
  );
}

const STATUS = { uploaded: 'var(--tx-dim)', analyzing: 'var(--blue)', captioned: 'var(--orange)', scheduled: 'var(--tx-muted)', approved: 'var(--green)', posting: 'var(--cyan)', posted: 'var(--green)', failed: 'var(--red)', publishing_video: 'var(--cyan)' };

const STATUS_PRIORITY = {
  posting: 0, publishing_video: 0,
  approved: 1, scheduled: 1, captioned: 1,
  posted: 9, failed: 10,
};

// ── Upload Page ──────────────────────────────────────────────────

function UploadPage({ biz, bizId, b, onNavigate }) {
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [batchId, setBatchId] = useState(null);
  const [processProgress, setProcessProgress] = useState({ done: 0, total: 0, current: '', currentIdx: -1 });
  const [processErrors, setProcessErrors] = useState(0);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [phase, setPhase] = useState('select');
  const [dragOver, setDragOver] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef(null);

  // ── Client-side thumbnail generation (free, no AI) ──────────────
  const makeThumb = (file) => new Promise((resolve) => {
    if (file.type.startsWith('image/')) {
      resolve(URL.createObjectURL(file));
      return;
    }
    // Video: seek to 1s, draw a frame to canvas
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let done = false;
    const finish = (result) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(result); };
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

  const handleFiles = async (fl) => {
    const arr = Array.from(fl).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!arr.length) return;
    const added = arr.map(f => ({ file: f, status: 'pending', url: null, result: null, thumb: null }));
    setFiles(prev => [...prev, ...added]);
    // Generate thumbs in the background, a few at a time
    const startIdx = files.length;
    for (let i = 0; i < added.length; i++) {
      const thumb = await makeThumb(added[i].file);
      setFiles(prev => {
        const next = [...prev];
        if (next[startIdx + i]) next[startIdx + i] = { ...next[startIdx + i], thumb };
        return next;
      });
    }
  };

  // Clean up blob URLs on unmount
  useEffect(() => () => {
    files.forEach(f => { if (f.thumb?.startsWith('blob:')) URL.revokeObjectURL(f.thumb); });
  }, []);

  useEffect(() => {
    setFiles([]); setPhase('select'); setBatchId(null);
    setScheduleResult(null); setProcessErrors(0); setStartedAt(null);
  }, [bizId]);

  // Elapsed timer during long phases
  useEffect(() => {
    if (!startedAt || (phase !== 'uploading' && phase !== 'processing')) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt, phase]);

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };

  const removeFile = (idx) => setFiles(prev => {
    const f = prev[idx];
    if (f?.thumb?.startsWith('blob:')) URL.revokeObjectURL(f.thumb);
    return prev.filter((_, i) => i !== idx);
  });

  const clearAll = () => {
    files.forEach(f => { if (f.thumb?.startsWith('blob:')) URL.revokeObjectURL(f.thumb); });
    setFiles([]); setPhase('select'); setBatchId(null); setScheduleResult(null);
  };

  const totalSize = files.reduce((s, f) => s + f.file.size, 0);
  const fmtSize = (bytes) => bytes > 1073741824 ? `${(bytes / 1073741824).toFixed(1)} GB` : `${(bytes / 1048576).toFixed(0)} MB`;
  const fmtTime = (s) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  const uploadAll = async () => {
    if (!b || !files.length) return;
    setPhase('uploading'); setStartedAt(Date.now()); setElapsed(0);
    setUploadProgress({ done: 0, total: files.length });
    const updated = [...files]; const uploadedFiles = [];
    for (let i = 0; i < updated.length; i++) {
      const f = updated[i];
      if (f.status === 'uploaded') { uploadedFiles.push(f.result); continue; }
      updated[i] = { ...updated[i], status: 'uploading' }; setFiles([...updated]);
      try {
        const fd = new FormData(); fd.append('file', f.file); fd.append('slug', b.slug || 'default');
        const resp = await fetch(`${DO_URL}/api/media/upload`, { method: 'POST', body: fd });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        updated[i] = { ...updated[i], status: 'uploaded', url: data.url, result: data };
        uploadedFiles.push(data);
      } catch (err) { updated[i] = { ...updated[i], status: 'failed', error: err.message }; }
      setFiles([...updated]); setUploadProgress({ done: i + 1, total: files.length });
    }
    const newBatchId = `batch-${Date.now()}`;
    try {
      await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bizId, batch_id: newBatchId, files: uploadedFiles }) });
      setBatchId(newBatchId); setPhase('uploaded');
    } catch (err) { console.error(err); }
  };

  const processAll = async () => {
    if (!batchId) return;
    setPhase('processing'); setProcessErrors(0); setStartedAt(Date.now()); setElapsed(0);
    const total = files.filter(f => f.status === 'uploaded').length;
    let done = 0; let errors = 0; let iterations = 0;
    setProcessProgress({ done: 0, total, current: '', currentIdx: 0 });
    while (iterations < total + 10) {
      iterations++;
      try {
        const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', batch_id: batchId }) });
        const data = await resp.json();
        if (data.processed === 0 || data.reason === 'all_processed') break;
        if (data.error || data.skipped) {
          errors++; done++;
          setProcessProgress({ done, total, current: `Skipped: ${data.error || 'unknown'}`, currentIdx: done });
          setFiles(prev => { const n = [...prev]; if (n[done - 1]) n[done - 1] = { ...n[done - 1], status: 'analyze_failed' }; return n; });
          continue;
        }
        done++;
        const desc = data.result?.analysis?.content_description || '';
        const pillar = data.result?.analysis?.content_pillar || '';
        setProcessProgress({ done, total, current: desc, currentIdx: done });
        setFiles(prev => { const n = [...prev]; if (n[done - 1]) n[done - 1] = { ...n[done - 1], status: 'analyzed', pillar }; return n; });
      } catch (err) { errors++; if (errors > 5) break; }
    }
    setProcessErrors(errors); setPhase('processed');
  };

  const scheduleBatch = async () => {
    if (!batchId) return;
    setPhase('scheduling');
    try {
      const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'schedule', batch_id: batchId }) });
      setScheduleResult(await resp.json()); setPhase('scheduled');
    } catch (err) { console.error(err); }
  };

  const approveBatch = async () => {
    if (!batchId) return;
    const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', batch_id: batchId }) });
    const data = await resp.json();
    alert(`Approved ${data.approved} posts.`);
    onNavigate('calendar');
  };

  const busy = phase === 'uploading' || phase === 'processing';
  const activeFile = processProgress.currentIdx > 0 ? files[processProgress.currentIdx - 1] : null;
  const pct = phase === 'uploading'
    ? (uploadProgress.total ? uploadProgress.done / uploadProgress.total * 100 : 0)
    : (processProgress.total ? processProgress.done / processProgress.total * 100 : 0);
  const rate = elapsed > 0 && processProgress.done > 0 ? processProgress.done / elapsed : 0;
  const eta = rate > 0 ? Math.round((processProgress.total - processProgress.done) / rate) : null;

  const FILE_STATUS = {
    pending: { c: 'var(--tx-dim)', l: '' },
    uploading: { c: 'var(--cyan)', l: 'UP' },
    uploaded: { c: 'var(--blue)', l: '✓' },
    analyzed: { c: 'var(--green)', l: '✓' },
    analyze_failed: { c: 'var(--red)', l: '!' },
    failed: { c: 'var(--red)', l: '!' },
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Business banner */}
      <div style={{ padding: '12px 16px', background: `linear-gradient(135deg, ${b?.primary_color || 'var(--cyan)'}20, transparent)`, border: `1px solid ${b?.primary_color || 'var(--cyan)'}40`, borderRadius: 10, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: b?.primary_color || 'var(--cyan)', boxShadow: `0 0 10px ${b?.primary_color || 'var(--cyan)'}` }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: b?.primary_color || 'var(--cyan)' }}>Uploading to {b?.name || 'no business selected'}</div>
          <div style={{ fontSize: 10, color: 'var(--tx-dim)' }}>{b?.posts_per_day || 1} posts/day at {(b?.posting_times || []).join(', ') || 'default times'}</div>
        </div>
        {files.length > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx)' }}>{files.length}</div>
            <div style={{ fontSize: 9, color: 'var(--tx-dim)' }}>{fmtSize(totalSize)}</div>
          </div>
        )}
      </div>

      {/* Drop zone */}
      {phase === 'select' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? 'var(--cyan)' : 'var(--bd)'}`,
            borderRadius: 12, padding: files.length ? '20px 24px' : '56px 24px',
            textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'var(--cyan-dim)' : 'var(--s1)',
            marginBottom: 14, transition: 'all .18s',
            boxShadow: dragOver ? '0 0 30px rgba(0,212,255,.12)' : 'none',
          }}
        >
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
          <div style={{ fontSize: files.length ? 13 : 15, fontWeight: 600, color: dragOver ? 'var(--cyan)' : 'var(--tx-muted)' }}>
            {files.length ? 'Drop more files or click to add' : 'Drop reels and images here'}
          </div>
          {!files.length && <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 6 }}>MP4, PNG, JPG. Batch of 30 to 100 works well.</div>}
        </div>
      )}

      {/* Action bar */}
      {files.length > 0 && phase === 'select' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{files.length} files ready</span>
            <span style={{ fontSize: 11, color: 'var(--tx-dim)' }}>{fmtSize(totalSize)}</span>
            <Btn variant="ghost" size="sm" onClick={clearAll}>Clear all</Btn>
          </div>
          <Btn variant="primary" size="md" onClick={uploadAll} disabled={!b}>Upload {files.length} Files</Btn>
        </div>
      )}

      {/* Live status panel during upload/processing */}
      {busy && (
        <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 16, marginBottom: 14, display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* Current thumbnail */}
          <div style={{ width: 84, height: 105, borderRadius: 8, overflow: 'hidden', background: 'var(--s2)', flexShrink: 0, position: 'relative', border: '1px solid var(--bd)' }}>
            {activeFile?.thumb
              ? <img src={activeFile.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, opacity: .2 }}>▶</div>}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,.8))' }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)' }}>
                {phase === 'uploading' ? 'Uploading files' : 'Analyzing and writing captions'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {phase === 'uploading'
                  ? `${uploadProgress.done} / ${uploadProgress.total}`
                  : `${processProgress.done} / ${processProgress.total}`}
              </div>
            </div>

            <div style={{ height: 5, background: 'var(--s2)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--cyan), var(--green))', borderRadius: 3, transition: 'width .4s', boxShadow: '0 0 12px rgba(0,212,255,.5)' }} />
            </div>

            <div style={{ fontSize: 11, color: 'var(--tx-dim)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: 28, lineHeight: 1.4 }}>
              {activeFile?.file?.name && <span style={{ color: 'var(--tx-muted)', fontWeight: 600 }}>{activeFile.file.name} </span>}
              {processProgress.current || (phase === 'uploading' ? 'Transferring to storage' : 'Waiting on the model')}
            </div>

            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 10, color: 'var(--tx-dim)', fontVariantNumeric: 'tabular-nums' }}>
              <span>Elapsed {fmtTime(elapsed)}</span>
              {eta !== null && eta > 0 && <span>About {fmtTime(eta)} left</span>}
              {processErrors > 0 && <span style={{ color: 'var(--red)' }}>{processErrors} skipped</span>}
            </div>
          </div>
        </div>
      )}

      {/* File grid */}
      {files.length > 0 && phase !== 'scheduled' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))',
          gap: 8,
          maxHeight: busy ? 260 : 460,
          overflowY: 'auto',
          padding: 2,
        }}>
          {files.map((f, i) => {
            const st = FILE_STATUS[f.status] || FILE_STATUS.pending;
            const isActive = busy && processProgress.currentIdx === i + 1;
            const isDone = f.status === 'analyzed' || f.status === 'uploaded';
            return (
              <div key={i} style={{
                background: 'var(--s1)',
                border: `1px solid ${isActive ? 'var(--cyan)' : 'var(--bd)'}`,
                borderRadius: 8, overflow: 'hidden', position: 'relative',
                opacity: busy && !isActive && !isDone ? .45 : 1,
                boxShadow: isActive ? '0 0 16px rgba(0,212,255,.25)' : 'none',
                transition: 'opacity .2s, box-shadow .2s, border-color .2s',
              }}>
                <div style={{ width: '100%', aspectRatio: '4/5', background: 'var(--s2)', position: 'relative' }}>
                  {f.thumb
                    ? <img src={f.thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, opacity: .18 }}>▶</div>}

                  {/* status dot */}
                  {f.status !== 'pending' && (
                    <div style={{
                      position: 'absolute', top: 4, right: 4, minWidth: 15, height: 15, borderRadius: 8,
                      background: 'rgba(0,0,0,.85)', color: st.c, fontSize: 9, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                    }}>{st.l}</div>
                  )}

                  {/* pillar tag once analyzed */}
                  {f.pillar && (
                    <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,.85)', borderRadius: 3, padding: '1px 5px', fontSize: 7, fontWeight: 800, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase' }}>{f.pillar}</div>
                  )}

                  {/* delete, only before upload starts */}
                  {phase === 'select' && (
                    <button
                      onClick={e => { e.stopPropagation(); removeFile(i); }}
                      title="Remove"
                      style={{
                        position: 'absolute', top: 4, left: 4, width: 18, height: 18,
                        background: 'rgba(0,0,0,.8)', border: 'none', color: 'var(--red)',
                        cursor: 'pointer', borderRadius: 5, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                    ><Icon name="x" size={10} /></button>
                  )}
                </div>
                <div style={{ padding: '4px 6px', fontSize: 8, color: 'var(--tx-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.file.name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phase cards */}
      {phase === 'uploaded' && (
        <div style={{ padding: 20, background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--bd)', textAlign: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{files.filter(f => f.status === 'uploaded').length} files uploaded</div>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 14 }}>Next the AI classifies each clip and writes a caption. Roughly 5 to 8 seconds per file.</div>
          <Btn variant="primary" size="lg" onClick={processAll}>Analyze and Caption</Btn>
        </div>
      )}

      {phase === 'processed' && (
        <div style={{ padding: 20, background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--bd)', textAlign: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            {processErrors > 0 ? `Analyzed with ${processErrors} skipped` : 'All files analyzed'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 14 }}>Took {fmtTime(elapsed)}. Ready to spread across the calendar.</div>
          <Btn variant="primary" size="lg" onClick={scheduleBatch}>Schedule Posts</Btn>
        </div>
      )}

      {phase === 'scheduling' && (
        <div style={{ textAlign: 'center', padding: 34 }}>
          <div style={{ width: 22, height: 22, border: '2px solid var(--bd)', borderTop: '2px solid var(--cyan)', borderRadius: '50%', animation: 'spin .6s linear infinite', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 12, color: 'var(--tx-dim)' }}>Building the calendar</div>
        </div>
      )}

      {phase === 'scheduled' && scheduleResult && (
        <div style={{ padding: 24, background: 'var(--s1)', borderRadius: 12, border: '1px solid rgba(0,240,160,.25)', textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green)', textShadow: '0 0 18px rgba(0,240,160,.3)' }}>{scheduleResult.scheduled}</div>
          <div style={{ fontSize: 12, color: 'var(--tx-muted)', marginBottom: 4 }}>posts scheduled</div>
          {scheduleResult.startDate && <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 16 }}>{scheduleResult.startDate} through {scheduleResult.endDate}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Btn variant="primary" size="lg" onClick={() => onNavigate('review')}>Review One by One</Btn>
            <Btn onClick={approveBatch}>Approve All Without Reviewing</Btn>
            <Btn variant="ghost" onClick={() => onNavigate('calendar')}>See Calendar</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
function CalendarPage({ bizId, b }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  const fetch_ = async () => { setLoading(true); try { const r = await fetch(`/api/uploads?business_id=${bizId}`); const d = await r.json(); setUploads(d.uploads || []); } catch(e){} setLoading(false); };
  useEffect(() => { fetch_(); }, [bizId]);

  const approveOne = async (id) => { await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', upload_id: id }) }); fetch_(); };
  const deleteOne = async (id) => { if (!confirm('Delete this post?')) return; const r = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', upload_id: id }) }); const d = await r.json(); if (d.error) { alert(d.error); return; } setExpanded(null); fetch_(); };
  const saveCaption = async (id) => { await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_caption', upload_id: id, instagram_caption: editText }) }); setEditId(null); fetch_(); };
  const approveAll = async () => { const s = uploads.filter(u => u.status === 'scheduled'); for (const u of s) await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', upload_id: u.id }) }); alert(`Approved ${s.length}`); fetch_(); };

  // Hide posted records >24h old (still in DB for metrics)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const visible = uploads.filter(u => {
    if (u.status !== 'posted') return true;
    const postedDate = u.posted_at ? new Date(u.posted_at) : null;
    return !postedDate || postedDate > cutoff;
  });

  // Sort by status priority then scheduled time
  const sortedActive = visible.filter(u => u.day_number).sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 5;
    const pb = STATUS_PRIORITY[b.status] ?? 5;
    if (pa !== pb) return pa - pb;
    return new Date(a.scheduled_for) - new Date(b.scheduled_for);
  });

  const unscheduled = uploads.filter(u => !u.day_number && u.status !== 'failed');
  const failed = uploads.filter(u => u.status === 'failed');

  const scheduledCount = uploads.filter(u => u.status === 'scheduled').length;
  const approvedCount = uploads.filter(u => u.status === 'approved').length;
  const postedCount = uploads.filter(u => u.status === 'posted').length;
  const hiddenCount = postedCount - sortedActive.filter(u => u.status === 'posted').length;

  const preview = (p) => p.media_type?.includes('video') ? (p.thumbnail_url || null) : (p.media_url || p.backup_url || null);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)' }}>Calendar</h1>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 2 }}>
            {uploads.length} total, {scheduledCount} sched, {approvedCount} approved, {postedCount} posted
            {hiddenCount > 0 && <span style={{ color: 'var(--tx-dim)' }}>, {hiddenCount} hidden (posted &gt;24h ago)</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {scheduledCount > 0 && <Btn variant="primary" size="sm" onClick={approveAll}>Approve All ({scheduledCount})</Btn>}
          <Btn variant="ghost" size="sm" onClick={fetch_}><Icon name="refresh" size={12} /></Btn>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-dim)', fontSize: 12 }}>Loading...</div> : !sortedActive.length && !unscheduled.length && !failed.length ? (
        <div style={{ textAlign: 'center', padding: 50, background: 'var(--s1)', borderRadius: 8, border: '1px dashed var(--bd)' }}>
          <div style={{ fontSize: 14, color: 'var(--tx-dim)' }}>No content. Upload to get started.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 280px))', gap: 8, justifyContent: 'start' }}>
            {sortedActive.map(post => <PostCard key={post.id} post={post} preview={preview(post)} expanded={expanded} setExpanded={setExpanded} editId={editId} setEditId={setEditId} editText={editText} setEditText={setEditText} approveOne={approveOne} deleteOne={deleteOne} saveCaption={saveCaption} />)}
          </div>

          {unscheduled.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', letterSpacing: '.06em' }}>UNSCHEDULED ({unscheduled.length})</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {unscheduled.some(p => p.status === 'captioned') && (
                    <Btn variant="primary" size="sm" onClick={async () => {
                      const captioned = unscheduled.filter(p => p.status === 'captioned');
                      const batchIds = [...new Set(captioned.map(p => p.batch_id))];
                      for (const bid of batchIds) await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'schedule', batch_id: bid }) });
                      fetch_();
                    }}>Schedule {unscheduled.filter(p => p.status === 'captioned').length} Posts</Btn>
                  )}
                  <Btn variant="danger" size="sm" onClick={async () => {
                    if (!confirm(`Delete all ${unscheduled.length} unscheduled posts? This cannot be undone.`)) return;
                    await Promise.all(unscheduled.map(p => fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', upload_id: p.id }) })));
                    fetch_();
                  }}><Icon name="trash" size={11} /> Delete All</Btn>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 280px))', gap: 8, justifyContent: 'start' }}>
                {unscheduled.map(p => {
                  const prev = p.media_type?.includes('video') ? (p.thumbnail_url || null) : (p.media_url || p.backup_url || null);
                  return (
                    <div key={p.id} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: '100%', aspectRatio: '4/5', position: 'relative', background: 'var(--s2)' }}>
                        {prev ? <img src={prev} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: 9 }}>▶</div>}
                        <div style={{ position: 'absolute', top: 3, left: 3 }}><Tag color={STATUS[p.status]}>{p.status}</Tag></div>
                        <button onClick={() => deleteOne(p.id)} style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,.8)', border: 'none', color: 'var(--red)', cursor: 'pointer', borderRadius: 3, padding: '2px 3px', display: 'flex', opacity: 0.6 }}><Icon name="trash" size={9} /></button>
                      </div>
                      <div style={{ padding: '3px 6px 5px', fontSize: 8, color: 'var(--tx-dim)' }}>{p.filename?.slice(0, 20) || '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', letterSpacing: '.06em' }}>FAILED ({failed.length})</div>
                <Btn variant="danger" size="sm" onClick={async () => {
                  if (!confirm(`Delete all ${failed.length} failed posts? This cannot be undone.`)) return;
                  await Promise.all(failed.map(p => fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', upload_id: p.id }) })));
                  fetch_();
                }}><Icon name="trash" size={11} /> Delete All ({failed.length})</Btn>
              </div>
              {failed.map(p => (
                <div key={p.id} style={{ background: 'var(--s1)', border: '1px solid rgba(255,59,92,0.15)', borderRadius: 6, padding: '8px 12px', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{p.filename || '—'}</div>
                    <div style={{ fontSize: 9, color: 'var(--red)', marginTop: 2 }}>{p.error_log?.slice(0, 80) || 'Error'}</div>
                  </div>
                  <button onClick={() => deleteOne(p.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', opacity: 0.5, padding: 2 }}><Icon name="trash" size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PostCard({ post, preview, expanded, setExpanded, editId, setEditId, editText, setEditText, approveOne, deleteOne, saveCaption }) {
  const isExp = expanded === post.id;
  const isEdit = editId === post.id;
  const time = post.scheduled_for ? new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const dayLabel = post.scheduled_for ? new Date(post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const isVid = post.media_type?.includes('video');

  return (
    <div style={{ background: 'var(--s1)', border: `1px solid ${isExp ? 'var(--cyan)' : 'var(--bd)'}`, borderRadius: 8, overflow: 'hidden' }}>
      <div onClick={() => setExpanded(isExp ? null : post.id)} style={{ width: '100%', aspectRatio: '4/5', position: 'relative', cursor: 'pointer', background: 'var(--s2)' }}>
        {preview ? <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" /> : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontSize: 28, opacity: 0.15 }}>{isVid ? '▶' : '—'}</span>
            <span style={{ fontSize: 10, color: 'var(--tx-dim)' }}>{isVid ? 'Video' : 'No preview'}</span>
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, left: 6 }}><Tag color={STATUS[post.status]}>{post.status}</Tag></div>
        {isVid && preview && <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.85)', borderRadius: 4, padding: '2px 7px', fontSize: 9, color: 'var(--cyan)', fontWeight: 700 }}>REEL</div>}
        <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,.85)', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: '#fff', fontWeight: 700 }}>{dayLabel} {time}</div>
        <button onClick={e => { e.stopPropagation(); deleteOne(post.id); }} style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,.85)', border: 'none', color: 'var(--red)', cursor: 'pointer', borderRadius: 4, padding: '3px 5px', display: 'flex', opacity: 0.6 }}><Icon name="trash" size={11} /></button>
      </div>

      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
          {post.content_pillar && <Tag color="var(--blue)">{post.content_pillar}</Tag>}
          {post.content_type && <Tag color="var(--tx-dim)">{post.content_type}</Tag>}
        </div>
        {!isExp && (
          <div style={{ fontSize: 12, color: 'var(--tx-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
            {post.instagram_caption || post.content_description || '—'}
          </div>
        )}
      </div>

      {isExp && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--bd)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px' }}>
              {isEdit ? (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginBottom: 6, fontWeight: 600 }}>EDIT CAPTION</div>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ width: '100%', minHeight: 160, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 6, padding: 10, color: 'var(--tx)', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <Btn size="sm" variant="primary" onClick={() => saveCaption(post.id)}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--tx)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 10 }}>{post.instagram_caption || 'No caption generated'}</div>
                  {post.hashtags?.length > 0 && <div style={{ fontSize: 12, color: 'var(--blue)', lineHeight: 1.6, marginBottom: 10 }}>{post.hashtags.map(h => `#${h}`).join(' ')}</div>}
                  {post.facebook_caption && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--s2)', borderRadius: 6 }}>
                      <div style={{ fontSize: 9, color: 'var(--tx-dim)', fontWeight: 700, marginBottom: 4, letterSpacing: '.06em' }}>FACEBOOK VERSION</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--tx-muted)', whiteSpace: 'pre-wrap' }}>{post.facebook_caption}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {!isEdit && (
              <div style={{ padding: '8px 14px', borderTop: '1px solid var(--bd)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="ghost" onClick={() => { setEditId(post.id); setEditText(post.instagram_caption || ''); }}><Icon name="edit" size={10} /> Edit</Btn>
                {post.status === 'scheduled' && <Btn size="sm" variant="primary" onClick={() => approveOne(post.id)}>Approve</Btn>}
                {post.media_url && <Btn size="sm" variant="ghost" onClick={() => window.open(post.media_url, '_blank')}>View Full</Btn>}
                <Btn size="sm" variant="danger" onClick={() => deleteOne(post.id)}><Icon name="trash" size={10} /> Delete</Btn>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QueuePage({ bizId }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const bizResp = await fetch('/api/businesses');
      const bizData = await bizResp.json();
      const allBiz = bizData.businesses || [];
      const today = new Date().toISOString().split('T')[0];
      const allUploads = [];
      for (const b of allBiz) {
        const r = await fetch(`/api/uploads?business_id=${b.id}`);
        const d = await r.json();
        const todayPosts = (d.uploads || []).filter(u => u.scheduled_for && u.scheduled_for.split('T')[0] === today)
          .map(u => ({ ...u, _bizName: b.name, _bizColor: b.primary_color }));
        allUploads.push(...todayPosts);
      }
      allUploads.sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
      setUploads(allUploads);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const preview = (p) => p.media_type?.includes('video') ? (p.thumbnail_url || null) : (p.media_url || p.backup_url || null);

  const posted = uploads.filter(u => u.status === 'posted').length;
  const pending = uploads.filter(u => ['approved', 'scheduled'].includes(u.status)).length;
  const publishing = uploads.filter(u => ['posting', 'publishing_video'].includes(u.status)).length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)' }}>Today</h1>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, {uploads.length} posts across all businesses
            {posted > 0 && <span style={{ color: 'var(--green)' }}>, {posted} posted</span>}
            {pending > 0 && <span style={{ color: 'var(--orange)' }}>, {pending} pending</span>}
            {publishing > 0 && <span style={{ color: 'var(--cyan)' }}>, {publishing} publishing</span>}
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={fetch_}><Icon name="refresh" size={12} /></Btn>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-dim)', fontSize: 12 }}>Loading...</div> : !uploads.length ? (
        <div style={{ textAlign: 'center', padding: 50, background: 'var(--s1)', borderRadius: 8, border: '1px dashed var(--bd)', color: 'var(--tx-dim)', fontSize: 13 }}>No posts scheduled for today</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 280px))', gap: 8, justifyContent: 'start' }}>
          {uploads.map(p => {
            const time = new Date(p.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const prev = preview(p);
            const isVid = p.media_type?.includes('video');
            return (
              <div key={p.id} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ width: '100%', aspectRatio: '4/5', position: 'relative', background: 'var(--s2)' }}>
                  {prev ? <img src={prev} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" /> : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <span style={{ fontSize: 28, opacity: 0.15 }}>{isVid ? '▶' : '—'}</span>
                      <span style={{ fontSize: 10, color: 'var(--tx-dim)' }}>{isVid ? 'Video' : 'No preview'}</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 6, left: 6 }}><Tag color={STATUS[p.status]}>{p.status}</Tag></div>
                  {isVid && prev && <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.85)', borderRadius: 4, padding: '2px 7px', fontSize: 9, color: 'var(--cyan)', fontWeight: 700 }}>REEL</div>}
                  <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,.85)', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: '#fff', fontWeight: 700 }}>{time}</div>
                  <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,.85)', borderRadius: 4, padding: '3px 8px', fontSize: 9, color: p._bizColor || 'var(--cyan)', fontWeight: 700 }}>{p._bizName}</div>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                    {p.content_pillar && <Tag color="var(--blue)">{p.content_pillar}</Tag>}
                    {p.content_type && <Tag color="var(--tx-dim)">{p.content_type}</Tag>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {p.instagram_caption || '—'}
                  </div>
                  {p.platform_post_id && <div style={{ marginTop: 6, fontSize: 9, color: 'var(--green)' }}>✓ Published</div>}
                  {p.status === 'failed' && <div style={{ marginTop: 6, fontSize: 9, color: 'var(--red)' }}>{p.error_log?.slice(0, 50) || 'Failed'}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsPage({ bizId, b, refreshBiz }) {
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [postingTimes, setPostingTimes] = useState('12:00');
  const [autoPost, setAutoPost] = useState(true);
  const [activeDays, setActiveDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!b) return;
    setPostsPerDay(b.posts_per_day || 1);
    setPostingTimes((b.posting_times || ['12:00']).join(', '));
    setAutoPost(b.auto_post !== false);
    setActiveDays(b.active_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    setSaved(false);
  }, [bizId, b]);

  const toggleDay = (day) => setActiveDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const times = postingTimes.split(',').map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t));
      if (!times.length) { alert('Posting times must be in HH:MM format, comma separated. Example: 08:00, 12:00, 17:00'); setSaving(false); return; }
      const resp = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: bizId, posts_per_day: parseInt(postsPerDay), posting_times: times, auto_post: autoPost, active_days: activeDays }),
      });
      const data = await resp.json();
      if (data.error) { alert(data.error); setSaving(false); return; }
      await refreshBiz();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { alert('Save failed: ' + e.message); }
    setSaving(false);
  };

  const DAYS = [{ id: 'mon', l: 'Mon' }, { id: 'tue', l: 'Tue' }, { id: 'wed', l: 'Wed' }, { id: 'thu', l: 'Thu' }, { id: 'fri', l: 'Fri' }, { id: 'sat', l: 'Sat' }, { id: 'sun', l: 'Sun' }];

  if (!b) return <div style={{ padding: 24, color: 'var(--tx-dim)' }}>Select a business</div>;

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)', marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 20 }}>Posting cadence for {b.name}. Changes apply to future uploads immediately.</p>

      <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 20, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Posts Per Day</div>
        <input type="number" min="1" max="10" value={postsPerDay} onChange={e => setPostsPerDay(e.target.value)} style={{ width: 100, background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px 12px', color: 'var(--tx)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginTop: 6 }}>Recommended: 1-3 for service businesses, 3-5 for agencies/SaaS</div>
      </div>

      <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 20, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Posting Times (EST)</div>
        <input type="text" value={postingTimes} onChange={e => setPostingTimes(e.target.value)} placeholder="08:00, 12:00, 17:00" style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px 12px', color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginTop: 6 }}>HH:MM format, comma separated. Must match posts per day count.</div>
      </div>

      <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 20, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Active Days</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DAYS.map(d => {
            const active = activeDays.includes(d.id);
            return (
              <button key={d.id} onClick={() => toggleDay(d.id)} style={{
                padding: '8px 14px', border: active ? '1px solid var(--cyan)' : '1px solid var(--bd)',
                background: active ? 'var(--cyan-dim)' : 'var(--s2)', color: active ? 'var(--cyan)' : 'var(--tx-muted)',
                fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
              }}>{d.l}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginTop: 8 }}>Scheduling skips inactive days.</div>
      </div>

      <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Auto-Post</div>
            <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginTop: 3 }}>Scheduled posts publish automatically at their scheduled time</div>
          </div>
          <button onClick={() => setAutoPost(!autoPost)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: autoPost ? 'var(--green)' : 'var(--bd)', position: 'relative', transition: 'background .15s' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: autoPost ? 23 : 3, transition: 'left .15s' }} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Btn variant="primary" size="lg" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Btn>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
      </div>
    </div>
  );
}

function InsightsPage({ bizId }) {
  const [uploads, setUploads] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/uploads?business_id=${bizId}`).then(r => r.json()),
      fetch(`/api/insights?business_id=${bizId}`).then(r => r.json()),
    ]).then(([uploadData, insightData]) => {
      setUploads(uploadData.uploads || []);
      setInsights(insightData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [bizId]);

  const posted = uploads.filter(u => u.status === 'posted').length;
  const approved = uploads.filter(u => u.status === 'approved').length;
  const scheduled = uploads.filter(u => u.status === 'scheduled').length;
  const failed = uploads.filter(u => u.status === 'failed').length;

  const analysis = insights?.analysis;
  const topPosts = insights?.topPosts || [];

  const S = (props) => <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 12, ...props.style }}>{props.children}</div>;
  const Label = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{children}</div>;

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-dim)', fontSize: 12 }}>Loading...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)', marginBottom: 4 }}>Insights & Learning</h1>
      <p style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 16 }}>AI-powered performance analysis. Data drives every future caption.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {[{ l: 'Posted', v: posted, c: 'var(--green)' }, { l: 'Approved', v: approved, c: 'var(--cyan)' }, { l: 'Scheduled', v: scheduled, c: 'var(--orange)' }, { l: 'Failed', v: failed, c: 'var(--red)' }].map(s => (
          <div key={s.l} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.c, textShadow: `0 0 10px ${s.c}30` }}>{s.v}</div>
            <div style={{ fontSize: 9, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {!analysis ? (
        <S><div style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 14, color: 'var(--tx-dim)', marginBottom: 4 }}>No analysis data yet</div>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)' }}>The learning system needs 5+ published posts with 7 days of metrics data. Keep posting, the first analysis runs automatically on Sunday.</div>
        </div></S>
      ) : (
        <>
          <S>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <Label>AI Analysis Summary</Label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {analysis.engagement_trend && <Tag color={analysis.engagement_trend === 'improving' ? 'var(--green)' : analysis.engagement_trend === 'declining' ? 'var(--red)' : 'var(--orange)'}>{analysis.engagement_trend}</Tag>}
                <span style={{ fontSize: 9, color: 'var(--tx-dim)' }}>{new Date(analysis.analyzed_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--tx)', marginBottom: 12 }}>{analysis.summary}</div>
          </S>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <S style={{ marginBottom: 0 }}>
              <Label>Double Down</Label>
              {(analysis.double_down || []).map((item, i) => <div key={i} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--green)', marginBottom: 6, paddingLeft: 10, borderLeft: '2px solid var(--green)' }}>{item}</div>)}
            </S>
            <S style={{ marginBottom: 0 }}>
              <Label>Stop Doing</Label>
              {(analysis.avoid || []).map((item, i) => <div key={i} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--red)', marginBottom: 6, paddingLeft: 10, borderLeft: '2px solid var(--red)' }}>{item}</div>)}
            </S>
          </div>

          <S>
            <Label>AI Recommendations</Label>
            {(analysis.recommendations || []).map((rec, i) => <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--tx)', marginBottom: 8, padding: '8px 10px', background: 'var(--s2)', borderRadius: 6, borderLeft: '3px solid var(--cyan)' }}>{rec}</div>)}
          </S>

          {topPosts.length > 0 && (
            <S>
              <Label>Top Performing Posts</Label>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--bd)' }}>{['Hook', 'Pillar', 'Type', 'Score', 'Shares', 'Saves', 'Reach'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 9, color: 'var(--tx-dim)', fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>{topPosts.slice(0, 8).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--tx-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.hook_text || '—'}</td>
                      <td style={{ padding: '6px 8px' }}><Tag color="var(--blue)">{p.content_pillar}</Tag></td>
                      <td style={{ padding: '6px 8px' }}><Tag color="var(--tx-dim)">{p.content_type}</Tag></td>
                      <td style={{ padding: '6px 8px', color: 'var(--cyan)', fontWeight: 700 }}>{p.composite_score?.toFixed(0)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--purple)' }}>{p.shares || 0}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--green)' }}>{p.saves || 0}</td>
                      <td style={{ padding: '6px 8px' }}>{p.reach || 0}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </S>
          )}
        </>
      )}
    </div>
  );
}
// ── Review Page ──────────────────────────────────────────────────

function ReviewPage({ bizId, b, onNavigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [decisions, setDecisions] = useState({});   // id -> 'approve' | 'reject' | 'skip'
  const [order, setOrder] = useState([]);           // decision history for undo
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(null);
  const videoRef = useRef(null);

  const SEEK_TO = 2.5; // seconds, matches thumb_offset used on Instagram

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/uploads?business_id=${bizId}`);
      const d = await r.json();
      const queue = (d.uploads || [])
        .filter(u => u.status === 'scheduled')
        .sort((a, b2) => new Date(a.scheduled_for) - new Date(b2.scheduled_for));
      setItems(queue);
      setIdx(0);
      setDecisions({});
      setOrder([]);
      setCommitted(null);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [bizId]);

  const post = items[idx];
  const decided = Object.keys(decisions).length;
  const approveCount = Object.values(decisions).filter(v => v === 'approve').length;
  const rejectCount = Object.values(decisions).filter(v => v === 'reject').length;
  const skipCount = Object.values(decisions).filter(v => v === 'skip').length;
  const atEnd = idx >= items.length;

  // Reset per-post video state
  useEffect(() => { setVideoFailed(false); setPlaying(false); setEditing(false); }, [idx]);

  // Warn before leaving with uncommitted decisions
  useEffect(() => {
    const handler = (e) => {
      if (decided > 0 && !committed) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [decided, committed]);

  const decide = (verdict) => {
    if (!post) return;
    setDecisions(prev => ({ ...prev, [post.id]: verdict }));
    setOrder(prev => [...prev, post.id]);
    setIdx(i => i + 1);
  };

  const undo = () => {
    if (!order.length) return;
    const lastId = order[order.length - 1];
    setOrder(prev => prev.slice(0, -1));
    setDecisions(prev => { const n = { ...prev }; delete n[lastId]; return n; });
    const backTo = items.findIndex(i => i.id === lastId);
    if (backTo >= 0) setIdx(backTo);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); setPlaying(false); }
  };

  const restart = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().then(() => setPlaying(true)).catch(() => {});
  };

  const saveCaption = async () => {
    if (!post) return;
    await fetch('/api/uploads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_caption', upload_id: post.id, instagram_caption: editText }),
    });
    setItems(prev => prev.map(p => p.id === post.id ? { ...p, instagram_caption: editText } : p));
    setEditing(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (editing) { if (e.key === 'Escape') setEditing(false); return; }
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'arrowright' || k === 'a' || k === 'p') { e.preventDefault(); decide('approve'); }
      else if (k === 'arrowleft' || k === 'x' || k === 'd') { e.preventDefault(); decide('reject'); }
      else if (k === 's' || k === 'arrowdown') { e.preventDefault(); decide('skip'); }
      else if (k === 'z') { e.preventDefault(); undo(); }
      else if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 'r') { e.preventDefault(); restart(); }
      else if (k === 'e' && post) {
        e.preventDefault();
        setEditText(post.instagram_caption || '');
        setEditing(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [post, editing, order, items, idx]);

  const commit = async () => {
    setCommitting(true);
    let approved = 0, deleted = 0, errors = 0;
    for (const [id, verdict] of Object.entries(decisions)) {
      try {
        if (verdict === 'approve') {
          const r = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', upload_id: id }) });
          const j = await r.json();
          if (j.error) errors++; else approved++;
        } else if (verdict === 'reject') {
          const r = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', upload_id: id }) });
          const j = await r.json();
          if (j.error) errors++; else deleted++;
        }
      } catch (e) { errors++; }
    }
    setCommitting(false);
    setCommitted({ approved, deleted, skipped: skipCount, errors });
  };

  const mediaSrc = post?.media_url || post?.backup_url || null;
  const posterSrc = post?.thumbnail_url || null;
  const nextSrc = items[idx + 1]?.media_url || null;

  const Key = ({ children }) => (
    <kbd style={{ display: 'inline-block', padding: '1px 5px', border: '1px solid var(--bd-light)', borderBottomWidth: 2, borderRadius: 4, background: 'var(--s2)', fontSize: 9, fontFamily: 'inherit', color: 'var(--tx-muted)', minWidth: 14, textAlign: 'center' }}>{children}</kbd>
  );

  // ── Loading / empty ───────────────────────────────────────────
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-dim)', fontSize: 12 }}>Loading queue...</div>;

  if (!items.length) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)', marginBottom: 4 }}>Review</h1>
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--s1)', borderRadius: 12, border: '1px dashed var(--bd)', marginTop: 16 }}>
          <div style={{ fontSize: 14, color: 'var(--tx-muted)', marginBottom: 4 }}>Nothing waiting for review</div>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)' }}>Posts appear here after scheduling, before they go live.</div>
        </div>
      </div>
    );
  }

  // ── Committed summary ─────────────────────────────────────────
  if (committed) {
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)', marginBottom: 16 }}>Review complete</h1>
        <div style={{ background: 'var(--s1)', border: '1px solid rgba(0,240,160,.25)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { l: 'Approved', v: committed.approved, c: 'var(--green)' },
              { l: 'Deleted', v: committed.deleted, c: 'var(--red)' },
              { l: 'Skipped', v: committed.skipped, c: 'var(--tx-muted)' },
            ].map(s => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 9, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.l}</div>
              </div>
            ))}
          </div>
          {committed.errors > 0 && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 12 }}>{committed.errors} actions failed. Check the calendar.</div>}
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 16 }}>Approved posts will publish automatically at their scheduled times.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="primary" onClick={() => onNavigate('calendar')}>Go to Calendar</Btn>
            <Btn variant="ghost" onClick={load}>Review More</Btn>
          </div>
        </div>
      </div>
    );
  }

  // ── End of queue ──────────────────────────────────────────────
  if (atEnd) {
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)', marginBottom: 4 }}>Ready to apply</h1>
        <p style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 16 }}>Nothing has been changed yet. Review the summary and confirm.</p>
        <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { l: 'Approve', v: approveCount, c: 'var(--green)' },
              { l: 'Delete', v: rejectCount, c: 'var(--red)' },
              { l: 'Leave alone', v: skipCount, c: 'var(--tx-muted)' },
            ].map(s => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 9, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.l}</div>
              </div>
            ))}
          </div>
          {rejectCount > 0 && (
            <div style={{ fontSize: 11, color: 'var(--orange)', marginBottom: 14, padding: '8px 10px', background: 'rgba(255,140,0,.07)', borderRadius: 6 }}>
              {rejectCount} {rejectCount === 1 ? 'post' : 'posts'} will be permanently deleted.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="primary" size="lg" onClick={commit} disabled={committing || decided === 0}>
              {committing ? 'Applying...' : `Apply ${decided} decisions`}
            </Btn>
            <Btn variant="ghost" onClick={() => setIdx(Math.max(0, items.length - 1))}>Back to last post</Btn>
            <Btn variant="ghost" onClick={undo} disabled={!order.length}>Undo last</Btn>
          </div>
        </div>
      </div>
    );
  }

  // ── Main review view ──────────────────────────────────────────
  const schedTime = post.scheduled_for
    ? new Date(post.scheduled_for).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'unscheduled';

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* Header + progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)' }}>Review</h1>
            <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 2 }}>
              {b?.name} · post {idx + 1} of {items.length}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--green)' }}>{approveCount} approve</span>
            <span style={{ color: 'var(--red)' }}>{rejectCount} delete</span>
            <span style={{ color: 'var(--tx-dim)' }}>{skipCount} skip</span>
            <Btn variant="ghost" size="sm" onClick={undo} disabled={!order.length}>Undo</Btn>
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--s2)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(idx / items.length) * 100}%`, background: 'linear-gradient(90deg, var(--cyan), var(--green))', borderRadius: 2, transition: 'width .25s' }} />
        </div>
      </div>

      {/* Body: video + caption */}
      <div style={{ display: 'flex', gap: 18, flex: 1, minHeight: 0, alignItems: 'flex-start' }}>
        {/* Video */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div
            onClick={togglePlay}
            style={{
              width: '100%', aspectRatio: '9/16', background: '#000', borderRadius: 12,
              overflow: 'hidden', position: 'relative', cursor: 'pointer',
              border: '1px solid var(--bd)', boxShadow: '0 8px 32px rgba(0,0,0,.5)',
            }}
          >
            {mediaSrc && !videoFailed ? (
              <video
                ref={videoRef}
                key={post.id}
                src={mediaSrc}
                poster={posterSrc || undefined}
                preload="auto"
                playsInline
                onLoadedMetadata={e => { try { e.currentTarget.currentTime = Math.min(SEEK_TO, (e.currentTarget.duration || 5) - 0.1); } catch {} }}
                onError={() => setVideoFailed(true)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : posterSrc ? (
              <img src={posterSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: 11 }}>Preview unavailable</div>
            )}

            {/* Play overlay */}
            {!playing && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', paddingLeft: 4 }}>▶</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
            <Btn variant="ghost" size="sm" onClick={togglePlay}>{playing ? 'Pause' : 'Play'} <Key>space</Key></Btn>
            <Btn variant="ghost" size="sm" onClick={restart}>Restart <Key>R</Key></Btn>
          </div>
        </div>

        {/* Caption panel */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {post.content_pillar && <Tag color="var(--blue)">{post.content_pillar}</Tag>}
            {post.content_type && <Tag color="var(--tx-dim)">{post.content_type}</Tag>}
            {post.visual_mode && <Tag color={post.visual_mode === 'dark' ? 'var(--purple)' : 'var(--orange)'}>{post.visual_mode}</Tag>}
            {post.hook_strength && <Tag color="var(--cyan)">hook {post.hook_strength}/10</Tag>}
            <span style={{ fontSize: 10, color: 'var(--tx-dim)', marginLeft: 'auto' }}>{schedTime}</span>
          </div>

          <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 16, flex: 1, minHeight: 0 }}>
            {editing ? (
              <div>
                <div style={{ fontSize: 9, color: 'var(--tx-dim)', fontWeight: 700, letterSpacing: '.06em', marginBottom: 6 }}>EDITING CAPTION</div>
                <textarea
                  autoFocus
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  style={{ width: '100%', minHeight: 220, background: 'var(--s2)', border: '1px solid var(--cyan)', borderRadius: 8, padding: 12, color: 'var(--tx)', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="primary" onClick={saveCaption}>Save</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel <Key>esc</Key></Btn>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', color: 'var(--tx)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {post.instagram_caption || 'No caption generated'}
                </div>
                {post.hashtags?.length > 0 && (
                  <div style={{ fontSize: 13, color: 'var(--blue)', lineHeight: 1.6, marginTop: 12 }}>
                    {post.hashtags.map(h => `#${h}`).join(' ')}
                  </div>
                )}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bd)' }}>
                  <Btn size="sm" variant="ghost" onClick={() => { setEditText(post.instagram_caption || ''); setEditing(true); }}>
                    <Icon name="edit" size={10} /> Edit caption <Key>E</Key>
                  </Btn>
                </div>
              </div>
            )}
          </div>

          {post.facebook_caption && !editing && (
            <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 9, color: 'var(--tx-dim)', fontWeight: 700, letterSpacing: '.06em', marginBottom: 5 }}>FACEBOOK VERSION</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--tx-muted)', whiteSpace: 'pre-wrap' }}>{post.facebook_caption}</div>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', paddingTop: 16, marginTop: 14, borderTop: '1px solid var(--bd)' }}>
        <button onClick={() => decide('reject')} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '10px 26px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          background: 'rgba(255,59,92,.08)', border: '1px solid rgba(255,59,92,.3)', color: 'var(--red)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Delete</span>
          <span style={{ fontSize: 9, opacity: .7 }}>← or X</span>
        </button>

        <button onClick={() => decide('skip')} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '10px 22px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--tx-muted)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Skip</span>
          <span style={{ fontSize: 9, opacity: .7 }}>S</span>
        </button>

        <button onClick={() => decide('approve')} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '10px 34px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          background: 'rgba(0,240,160,.1)', border: '1px solid rgba(0,240,160,.4)', color: 'var(--green)',
          boxShadow: '0 0 20px rgba(0,240,160,.12)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Approve</span>
          <span style={{ fontSize: 9, opacity: .7 }}>→ or A</span>
        </button>
      </div>

      {/* Preload next video */}
      {nextSrc && <video src={nextSrc} preload="metadata" style={{ display: 'none' }} />}
    </div>
  );
}