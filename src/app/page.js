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

function UploadPage({ biz, bizId, b, onNavigate }) {
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [batchId, setBatchId] = useState(null);
  const [processProgress, setProcessProgress] = useState({ done: 0, total: 0, current: '' });
  const [processErrors, setProcessErrors] = useState(0);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [phase, setPhase] = useState('select');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleFiles = (fl) => { const arr = Array.from(fl).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')); setFiles(prev => [...prev, ...arr.map(f => ({ file: f, status: 'pending', url: null, result: null }))]); };

  useEffect(() => { setFiles([]); setPhase('select'); setBatchId(null); setScheduleResult(null); setProcessErrors(0); }, [bizId]);

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));
  const clearAll = () => { setFiles([]); setPhase('select'); setBatchId(null); setScheduleResult(null); };

  const uploadAll = async () => {
    if (!b || !files.length) return;
    setPhase('uploading'); setUploadProgress({ done: 0, total: files.length });
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
    setPhase('processing'); setProcessErrors(0);
    const total = files.filter(f => f.status === 'uploaded').length; let done = 0; let errors = 0;
    let iterations = 0;
    while (iterations < total + 10) {
      iterations++;
      try {
        const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', batch_id: batchId }) });
        const data = await resp.json();
        if (data.processed === 0 || data.reason === 'all_processed') break;
        if (data.error || data.skipped) { errors++; done++; setProcessProgress({ done, total, current: `Skipped: ${data.error || 'unknown'}` }); continue; }
        done++; setProcessProgress({ done, total, current: data.result?.analysis?.content_description || '' });
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ padding: '12px 16px', background: `linear-gradient(135deg, ${b?.primary_color || 'var(--cyan)'}20, transparent)`, border: `1px solid ${b?.primary_color || 'var(--cyan)'}40`, borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: b?.primary_color || 'var(--cyan)', boxShadow: `0 0 8px ${b?.primary_color || 'var(--cyan)'}` }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: b?.primary_color || 'var(--cyan)' }}>Uploading to: {b?.name || 'Select a business'}</div>
          <div style={{ fontSize: 10, color: 'var(--tx-dim)' }}>All files will be assigned to this business. Switch tabs above to change.</div>
        </div>
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--cyan)' }}>Upload Content</h1>
      <p style={{ color: 'var(--tx-dim)', fontSize: 12, marginBottom: 20 }}>Drop files. AI analyzes, captions, schedules, auto-posts.</p>

      {phase === 'select' && (
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} onClick={() => fileRef.current?.click()} style={{ border: `1px solid ${dragOver ? 'var(--cyan)' : 'var(--bd)'}`, borderRadius: 8, padding: files.length ? 24 : '60px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--cyan-dim)' : 'var(--s1)', marginBottom: 16 }}>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: dragOver ? 'var(--cyan)' : 'var(--tx-muted)' }}>{files.length ? `${files.length} files. Drop more.` : 'Drop images and videos here'}</div>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 4 }}>PNG, JPG, MP4</div>
        </div>
      )}

      {files.length > 0 && phase === 'select' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{files.length} files</span><Btn variant="ghost" size="sm" onClick={clearAll}>Clear</Btn></div>
          <Btn variant="primary" size="md" onClick={uploadAll}>Upload {files.length} Files</Btn>
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 6, maxHeight: phase === 'select' ? 300 : 100, overflow: 'auto', marginBottom: 16 }}>
          {files.map((f, i) => (
            <div key={i} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
              {f.file.type.startsWith('image/') ? <div style={{ width: '100%', aspectRatio: '1', backgroundImage: `url(${URL.createObjectURL(f.file)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} /> : <div style={{ width: '100%', aspectRatio: '1', background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'var(--tx-dim)' }}>VID</div>}
              <div style={{ padding: '2px 4px', fontSize: 7, color: f.status === 'uploaded' ? 'var(--green)' : f.status === 'failed' ? 'var(--red)' : 'var(--tx-dim)', fontWeight: 700 }}>{f.status === 'pending' ? `${(f.file.size/1024/1024).toFixed(1)}M` : f.status.toUpperCase()}</div>
              {phase === 'select' && <button onClick={e => { e.stopPropagation(); removeFile(i); }} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.8)', border: 'none', color: 'var(--red)', cursor: 'pointer', borderRadius: 3, padding: '1px 2px', display: 'flex', lineHeight: 1 }}><Icon name="x" size={8} /></button>}
            </div>
          ))}
        </div>
      )}

      {phase === 'uploading' && <ProgressBar label="Uploading" done={uploadProgress.done} total={uploadProgress.total} color="var(--cyan)" />}
      {phase === 'uploaded' && (
        <div style={{ padding: 20, background: 'var(--s1)', borderRadius: 8, border: '1px solid var(--bd)', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Files uploaded</div>
          <Btn variant="primary" size="lg" onClick={processAll}>Analyze & Caption</Btn>
        </div>
      )}
      {phase === 'processing' && <><ProgressBar label="Analyzing" done={processProgress.done} total={processProgress.total} color="var(--orange)" />{processProgress.current && <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 6, fontStyle: 'italic' }}>{processProgress.current}</div>}</>}
      {phase === 'processed' && (
        <div style={{ padding: 20, background: 'var(--s1)', borderRadius: 8, border: '1px solid var(--bd)', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{processErrors > 0 ? `Done (${processErrors} errors)` : 'All analyzed'}</div>
          <Btn variant="primary" size="lg" onClick={scheduleBatch}>Schedule</Btn>
        </div>
      )}
      {phase === 'scheduling' && <div style={{ textAlign: 'center', padding: 30 }}><div style={{ width: 20, height: 20, border: '2px solid var(--bd)', borderTop: '2px solid var(--cyan)', borderRadius: '50%', animation: 'spin .6s linear infinite', margin: '0 auto 8px' }} /><div style={{ fontSize: 12, color: 'var(--tx-dim)' }}>Scheduling...</div></div>}
      {phase === 'scheduled' && scheduleResult && (
        <div style={{ padding: 20, background: 'var(--s1)', borderRadius: 8, border: '1px solid rgba(0,240,160,0.2)', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>{scheduleResult.scheduled} posts scheduled</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Btn variant="primary" onClick={() => onNavigate('calendar')}>View Calendar</Btn>
            <Btn onClick={approveBatch}>Approve All</Btn>
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