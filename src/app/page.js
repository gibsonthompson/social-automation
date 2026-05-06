'use client';

import { useState, useEffect, useRef } from 'react';
import { Btn, Input, Select, Tag, Icon } from '@/components/ui';

const DO_URL = 'https://urchin-app-bqb4i.ondigitalocean.app';

export default function ContentFarm() {
  const [page, setPage] = useState('calendar');
  const [biz, setBiz] = useState([]);
  const [bizId, setBizId] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/businesses')
      .then(r => r.json())
      .then(d => { if (d.businesses?.length) { setBiz(d.businesses); setBizId(d.businesses[0]?.id || ''); } })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const nav = [
    { id: 'upload', l: 'Upload', ic: 'plus' },
    { id: 'calendar', l: 'Calendar', ic: 'folder' },
    { id: 'queue', l: 'Queue', ic: 'bolt' },
    { id: 'insights', l: 'Insights', ic: 'bolt' },
  ];

  const b = biz.find(x => x.id === bizId);
  if (!ready) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
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

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Business tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--bd)', background: 'var(--s1)', flexShrink: 0 }}>
          {biz.map(b2 => {
            const active = b2.id === bizId;
            return (
              <button key={b2.id} onClick={() => setBizId(b2.id)} style={{
                padding: '12px 20px', border: 'none', borderBottom: active ? '2px solid var(--cyan)' : '2px solid transparent',
                background: active ? 'var(--cyan-dim)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--tx-dim)',
                fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '.02em', transition: 'all .15s',
              }}>
                {b2.name}
              </button>
            );
          })}
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {page === 'upload' && <UploadPage biz={biz} bizId={bizId} b={b} onNavigate={setPage} />}
          {page === 'calendar' && <CalendarPage bizId={bizId} b={b} />}
          {page === 'queue' && <QueuePage bizId={bizId} />}
          {page === 'insights' && <InsightsPage bizId={bizId} />}
        </div>
      </div>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────

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

// ── Upload Page ──────────────────────────────────────────────────

function UploadPage({ biz, bizId, b, onNavigate }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [batchId, setBatchId] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState({ done: 0, total: 0, current: '' });
  const [processErrors, setProcessErrors] = useState(0);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [phase, setPhase] = useState('select');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleFiles = (fl) => { const arr = Array.from(fl).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')); setFiles(prev => [...prev, ...arr.map(f => ({ file: f, status: 'pending', url: null, result: null }))]); };

  // Reset upload state when business changes
  useEffect(() => {
    setFiles([]); setPhase('select'); setBatchId(null); setScheduleResult(null); setProcessErrors(0);
  }, [bizId]);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));
  const clearAll = () => { setFiles([]); setPhase('select'); setBatchId(null); setScheduleResult(null); };

  const uploadAll = async () => {
    if (!b || !files.length) return;
    setUploading(true); setPhase('uploading'); setUploadProgress({ done: 0, total: files.length });
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
    } catch (err) { console.error('Batch create failed:', err); }
    setUploading(false);
  };

  const processAll = async () => {
    if (!batchId) return;
    setProcessing(true); setPhase('processing'); setProcessErrors(0);
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
    setProcessErrors(errors); setProcessing(false); setPhase('processed');
  };

  const scheduleBatch = async () => {
    if (!batchId) return;
    setScheduling(true); setPhase('scheduling');
    try {
      const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'schedule', batch_id: batchId }) });
      setScheduleResult(await resp.json()); setPhase('scheduled');
    } catch (err) { console.error(err); }
    setScheduling(false);
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
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--cyan)' }}>Upload Content</h1>
      <p style={{ color: 'var(--tx-dim)', fontSize: 12, marginBottom: 20 }}>Drop files → AI analyzes → captions → schedule → auto-post</p>

      {phase === 'select' && (
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} onClick={() => fileRef.current?.click()} style={{ border: `1px solid ${dragOver ? 'var(--cyan)' : 'var(--bd)'}`, borderRadius: 8, padding: files.length ? 24 : '60px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--cyan-dim)' : 'var(--s1)', transition: 'all 0.2s', marginBottom: 16, boxShadow: dragOver ? '0 0 20px var(--bd-glow)' : 'none' }}>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: dragOver ? 'var(--cyan)' : 'var(--tx-muted)' }}>{files.length ? `${files.length} files — drop more` : 'Drop images and videos here'}</div>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 4 }}>PNG, JPG, MP4</div>
        </div>
      )}

      {files.length > 0 && phase === 'select' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{files.length} files</span>
            <Btn variant="ghost" size="sm" onClick={clearAll}>Clear</Btn>
          </div>
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
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginBottom: 16 }}>AI will analyze each post and generate captions.</div>
          <Btn variant="primary" size="lg" onClick={processAll}>Analyze & Caption</Btn>
        </div>
      )}
      {phase === 'processing' && <><ProgressBar label="Analyzing" done={processProgress.done} total={processProgress.total} color="var(--orange)" />{processProgress.current && <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 6, fontStyle: 'italic' }}>{processProgress.current}</div>}</>}
      {phase === 'processed' && (
        <div style={{ padding: 20, background: 'var(--s1)', borderRadius: 8, border: '1px solid var(--bd)', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{processErrors > 0 ? `Done (${processErrors} errors)` : 'All analyzed'}</div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginBottom: 16 }}>Schedule across {b?.posts_per_day || 3} posts/day.</div>
          <Btn variant="primary" size="lg" onClick={scheduleBatch}>Schedule</Btn>
        </div>
      )}
      {phase === 'scheduling' && <div style={{ textAlign: 'center', padding: 30 }}><div style={{ width: 20, height: 20, border: '2px solid var(--bd)', borderTop: '2px solid var(--cyan)', borderRadius: '50%', animation: 'spin .6s linear infinite', margin: '0 auto 8px' }} /><div style={{ fontSize: 12, color: 'var(--tx-dim)' }}>Scheduling...</div></div>}
      {phase === 'scheduled' && scheduleResult && (
        <div style={{ padding: 20, background: 'var(--s1)', borderRadius: 8, border: '1px solid rgba(0,240,160,0.2)', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>{scheduleResult.scheduled} posts scheduled</div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginBottom: 6 }}>{scheduleResult.startDate} → {scheduleResult.endDate}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            <Tag color="var(--blue)">EDU {scheduleResult.byPillar?.educate || 0}</Tag>
            <Tag color="var(--green)">ENG {scheduleResult.byPillar?.engage || 0}</Tag>
            <Tag color="var(--orange)">INS {scheduleResult.byPillar?.inspire || 0}</Tag>
            <Tag color="var(--red)">PRO {scheduleResult.byPillar?.promote || 0}</Tag>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Btn variant="primary" onClick={() => onNavigate('calendar')}>View Calendar</Btn>
            <Btn onClick={approveBatch}>Approve All</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calendar Page ────────────────────────────────────────────────

function CalendarPage({ bizId, b }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  const fetch_ = async () => { setLoading(true); try { const r = await fetch(`/api/uploads?business_id=${bizId}`); const d = await r.json(); setUploads(d.uploads || []); } catch(e){} setLoading(false); };
  useEffect(() => { fetch_(); }, [bizId]);

  const approveOne = async (id) => { await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', upload_id: id }) }); fetch_(); };
  const deleteOne = async (id) => { if (!confirm('Delete this post?')) return; await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', upload_id: id }) }); setExpanded(null); fetch_(); };
  const saveCaption = async (id) => { await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_caption', upload_id: id, instagram_caption: editText }) }); setEditId(null); fetch_(); };
  const approveAll = async () => { const s = uploads.filter(u => u.status === 'scheduled'); for (const u of s) await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', upload_id: u.id }) }); alert(`Approved ${s.length}`); fetch_(); };

  const scheduled = uploads.filter(u => u.day_number);
  const unscheduled = uploads.filter(u => !u.day_number && u.status !== 'failed');
  const failed = uploads.filter(u => u.status === 'failed');
  const byDay = {};
  scheduled.forEach(u => { if (!byDay[u.day_number]) byDay[u.day_number] = []; byDay[u.day_number].push(u); });
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);

  const scheduledCount = uploads.filter(u => u.status === 'scheduled').length;
  const approvedCount = uploads.filter(u => u.status === 'approved').length;
  const postedCount = uploads.filter(u => u.status === 'posted').length;

  const preview = (p) => p.media_type?.includes('video') ? (p.thumbnail_url || null) : (p.media_url || null);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)' }}>Calendar</h1>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 2 }}>{uploads.length} total · {scheduledCount} sched · {approvedCount} approved · {postedCount} posted</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {scheduledCount > 0 && <Btn variant="primary" size="sm" onClick={approveAll}>Approve All ({scheduledCount})</Btn>}
          <Btn variant="ghost" size="sm" onClick={fetch_}><Icon name="refresh" size={12} /></Btn>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-dim)', fontSize: 12 }}>Loading...</div> : !days.length && !unscheduled.length && !failed.length ? (
        <div style={{ textAlign: 'center', padding: 50, background: 'var(--s1)', borderRadius: 8, border: '1px dashed var(--bd)' }}>
          <div style={{ fontSize: 14, color: 'var(--tx-dim)' }}>No content. Upload to get started.</div>
        </div>
      ) : (
        <>
          {days.map(dayNum => {
            const posts = byDay[dayNum].sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
            const dayDate = posts[0]?.scheduled_for ? new Date(posts[0].scheduled_for).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
            return (
              <div key={dayNum} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--cyan)', letterSpacing: '.08em' }}>DAY {dayNum}</span>
                  <span style={{ fontSize: 11, color: 'var(--tx-dim)' }}>{dayDate}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                  {posts.map(post => <PostCard key={post.id} post={post} preview={preview(post)} expanded={expanded} setExpanded={setExpanded} editId={editId} setEditId={setEditId} editText={editText} setEditText={setEditText} approveOne={approveOne} deleteOne={deleteOne} saveCaption={saveCaption} />)}
                </div>
              </div>
            );
          })}

          {unscheduled.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', marginBottom: 8, letterSpacing: '.06em' }}>UNSCHEDULED ({unscheduled.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                {unscheduled.map(p => (
                  <div key={p.id} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 6, padding: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Tag color={STATUS[p.status]}>{p.status}</Tag>
                      <div style={{ fontSize: 9, color: 'var(--tx-dim)', marginTop: 3 }}>{p.filename?.slice(0, 25) || '—'}</div>
                    </div>
                    <button onClick={() => deleteOne(p.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', opacity: 0.5, padding: 2 }}><Icon name="trash" size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 8, letterSpacing: '.06em' }}>FAILED ({failed.length})</div>
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
  const isVid = post.media_type?.includes('video');

  return (
    <div style={{ background: 'var(--s1)', border: `1px solid ${isExp ? 'var(--bd-glow)' : 'var(--bd)'}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color .15s' }}>
      {/* Thumbnail + overlay */}
      <div onClick={() => setExpanded(isExp ? null : post.id)} style={{ width: '100%', aspectRatio: '1', position: 'relative', cursor: 'pointer', background: 'var(--s2)' }}>
        {preview ? <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: 10 }}>{isVid ? '▶ Video' : '—'}</div>
        )}
        <div style={{ position: 'absolute', top: 4, left: 4 }}><Tag color={STATUS[post.status]}>{post.status}</Tag></div>
        {isVid && preview && <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.8)', borderRadius: 3, padding: '1px 6px', fontSize: 8, color: 'var(--cyan)', fontWeight: 700, letterSpacing: '.05em' }}>REEL</div>}
        <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,.8)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#fff', fontWeight: 700 }}>{time}</div>
        {/* Delete button */}
        <button onClick={e => { e.stopPropagation(); deleteOne(post.id); }} style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,.8)', border: 'none', color: 'var(--red)', cursor: 'pointer', borderRadius: 4, padding: '3px 5px', display: 'flex', opacity: 0.7 }}><Icon name="trash" size={11} /></button>
      </div>

      {/* Info bar */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4, flexWrap: 'wrap' }}>
          {post.content_pillar && <Tag color="var(--blue)">{post.content_pillar}</Tag>}
          {post.content_type && <Tag color="var(--tx-dim)">{post.content_type}</Tag>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--tx-muted)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {post.instagram_caption || post.content_description || '—'}
        </div>
      </div>

      {/* Expanded */}
      {isExp && (
        <div style={{ padding: '0 10px 10px' }}>
          <div style={{ padding: 10, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--bd)' }}>
            {post.content_description && <div style={{ fontSize: 9, color: 'var(--tx-dim)', marginBottom: 8, padding: '4px 6px', background: 'var(--s2)', borderRadius: 4, fontStyle: 'italic' }}>AI: {post.content_description}</div>}
            {isEdit ? (
              <div>
                <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ width: '100%', minHeight: 120, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 6, padding: 8, color: 'var(--tx)', fontSize: 11, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <Btn size="sm" variant="primary" onClick={() => saveCaption(post.id)}>Save</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Btn>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{post.instagram_caption || 'No caption'}</div>
                {post.hashtags?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>{post.hashtags.map((h, i) => <Tag key={i} color="var(--purple)">#{h}</Tag>)}</div>}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="ghost" onClick={() => { setEditId(post.id); setEditText(post.instagram_caption || ''); }}><Icon name="edit" size={10} /> Edit</Btn>
                  {post.status === 'scheduled' && <Btn size="sm" variant="primary" onClick={() => approveOne(post.id)}>Approve</Btn>}
                  {post.media_url && <Btn size="sm" variant="ghost" onClick={() => window.open(post.media_url, '_blank')}>View</Btn>}
                  <Btn size="sm" variant="danger" onClick={() => deleteOne(post.id)}><Icon name="trash" size={10} /> Delete</Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Queue Page ───────────────────────────────────────────────────

function QueuePage({ bizId }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetch_ = async () => { setLoading(true); try { const r = await fetch(`/api/uploads?business_id=${bizId}`); const d = await r.json(); const today = new Date().toISOString().split('T')[0]; setUploads((d.uploads || []).filter(u => { if (!u.scheduled_for) return u.status === 'failed'; return u.scheduled_for.startsWith(today) || ['posting', 'publishing_video', 'failed', 'posted'].includes(u.status); })); } catch(e){} setLoading(false); };
  useEffect(() => { fetch_(); }, [bizId]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)' }}>Today's Queue</h1>
        <Btn variant="ghost" size="sm" onClick={fetch_}><Icon name="refresh" size={12} /></Btn>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-dim)', fontSize: 12 }}>Loading...</div> : !uploads.length ? (
        <div style={{ textAlign: 'center', padding: 50, background: 'var(--s1)', borderRadius: 8, border: '1px dashed var(--bd)', color: 'var(--tx-dim)', fontSize: 13 }}>No posts for today</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {uploads.map(p => (
            <div key={p.id} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Tag color={STATUS[p.status]}>{p.status}</Tag>
                  <span style={{ fontSize: 10, color: 'var(--tx-dim)' }}>{p.scheduled_for ? new Date(p.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{p.instagram_caption || p.content_description || '—'}</div>
                {p.status === 'failed' && p.error_log && <div style={{ marginTop: 6, padding: '4px 6px', background: 'rgba(255,59,92,0.06)', borderRadius: 4, fontSize: 9, color: 'var(--red)' }}>{p.error_log}</div>}
                {p.platform_post_id && <div style={{ marginTop: 6, fontSize: 9, color: 'var(--green)' }}>Published: {p.platform_post_id}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Insights Page ────────────────────────────────────────────────

function InsightsPage({ bizId }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); fetch(`/api/uploads?business_id=${bizId}`).then(r => r.json()).then(d => { setUploads(d.uploads || []); setLoading(false); }).catch(() => setLoading(false)); }, [bizId]);
  const posted = uploads.filter(u => u.status === 'posted').length;
  const approved = uploads.filter(u => u.status === 'approved').length;
  const scheduled = uploads.filter(u => u.status === 'scheduled').length;
  const failedArr = uploads.filter(u => u.status === 'failed');
  const pillars = { educate: 0, engage: 0, inspire: 0, promote: 0 };
  uploads.forEach(u => { if (u.content_pillar && pillars[u.content_pillar] !== undefined) pillars[u.content_pillar]++; });

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)', marginBottom: 16 }}>Insights</h1>
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-dim)', fontSize: 12 }}>Loading...</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
            {[{ l: 'Posted', v: posted, c: 'var(--green)' }, { l: 'Approved', v: approved, c: 'var(--cyan)' }, { l: 'Scheduled', v: scheduled, c: 'var(--orange)' }, { l: 'Failed', v: failedArr.length, c: 'var(--red)' }].map(s => (
              <div key={s.l} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.c, textShadow: `0 0 12px ${s.c}30` }}>{s.v}</div>
                <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Pillar Distribution</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {Object.entries(pillars).map(([p, c]) => (
                <div key={p} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 10, color: 'var(--tx-dim)', textTransform: 'capitalize' }}>{p}</span><span style={{ fontSize: 10, fontWeight: 700 }}>{c}</span></div>
                  <div style={{ height: 4, background: 'var(--s2)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${uploads.length ? (c / uploads.length * 100) : 0}%`, background: p === 'educate' ? 'var(--blue)' : p === 'engage' ? 'var(--green)' : p === 'inspire' ? 'var(--orange)' : 'var(--red)', borderRadius: 2 }} /></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}