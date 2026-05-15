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
    { id: 'queue', l: 'Today', ic: 'bolt' },
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
      {/* Active business banner */}
      <div style={{ padding: '12px 16px', background: `linear-gradient(135deg, ${b?.primary_color || 'var(--cyan)'}20, transparent)`, border: `1px solid ${b?.primary_color || 'var(--cyan)'}40`, borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: b?.primary_color || 'var(--cyan)', boxShadow: `0 0 8px ${b?.primary_color || 'var(--cyan)'}` }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: b?.primary_color || 'var(--cyan)' }}>Uploading to: {b?.name || 'Select a business'}</div>
          <div style={{ fontSize: 10, color: 'var(--tx-dim)' }}>All files will be assigned to this business. Switch tabs above to change.</div>
        </div>
      </div>

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
  const deleteOne = async (id) => { if (!confirm('Delete this post?')) return; const r = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', upload_id: id }) }); const d = await r.json(); if (d.error) { alert(d.error); return; } setExpanded(null); fetch_(); };
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

  const preview = (p) => {
    if (p.media_type?.includes('video')) return p.thumbnail_url || null;
    return p.media_url || p.backup_url || null;
  };

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
          {/* Flat grid of all scheduled posts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
            {days.flatMap(dayNum => {
              const posts = byDay[dayNum].sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
              return posts.map(post => <PostCard key={post.id} post={post} preview={preview(post)} expanded={expanded} setExpanded={setExpanded} editId={editId} setEditId={setEditId} editText={editText} setEditText={setEditText} approveOne={approveOne} deleteOne={deleteOne} saveCaption={saveCaption} />);
            })}
          </div>

          {unscheduled.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', letterSpacing: '.06em' }}>UNSCHEDULED ({unscheduled.length})</div>
                {unscheduled.some(p => p.status === 'captioned') && (
                  <Btn variant="primary" size="sm" onClick={async () => {
                    const captioned = unscheduled.filter(p => p.status === 'captioned');
                    if (!captioned.length) return;
                    const batchIds = [...new Set(captioned.map(p => p.batch_id))];
                    for (const bid of batchIds) {
                      await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'schedule', batch_id: bid }) });
                    }
                    fetch_();
                  }}>Schedule {unscheduled.filter(p => p.status === 'captioned').length} Posts</Btn>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                {unscheduled.map(p => {
                  const prev = p.media_type?.includes('video') ? (p.thumbnail_url || null) : (p.media_url || p.backup_url || null);
                  return (
                    <div key={p.id} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: '100%', aspectRatio: '4/5', position: 'relative', background: 'var(--s2)' }}>
                        {prev ? <img src={prev} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: 9 }}>▶</div>
                        )}
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
  const dayLabel = post.scheduled_for ? new Date(post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const isVid = post.media_type?.includes('video');

  return (
    <div style={{ background: 'var(--s1)', border: `1px solid ${isExp ? 'var(--cyan)30' : 'var(--bd)'}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color .15s' }}>
      {/* Thumbnail — 4:5 Instagram ratio */}
      <div onClick={() => setExpanded(isExp ? null : post.id)} style={{ width: '100%', aspectRatio: '4/5', position: 'relative', cursor: 'pointer', background: 'var(--s2)' }}>
        {preview ? <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" /> : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontSize: 28, opacity: 0.15 }}>{isVid ? '▶' : '—'}</span>
            <span style={{ fontSize: 10, color: 'var(--tx-dim)' }}>{isVid ? 'Video' : 'No preview'}</span>
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, left: 6 }}><Tag color={STATUS[post.status]}>{post.status}</Tag></div>
        {isVid && preview && <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.85)', borderRadius: 4, padding: '2px 7px', fontSize: 9, color: 'var(--cyan)', fontWeight: 700 }}>REEL</div>}
        <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,.85)', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: '#fff', fontWeight: 700 }}>{dayLabel} · {time}</div>
        <button onClick={e => { e.stopPropagation(); deleteOne(post.id); }} style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,.85)', border: 'none', color: 'var(--red)', cursor: 'pointer', borderRadius: 4, padding: '3px 5px', display: 'flex', opacity: 0.6 }}><Icon name="trash" size={11} /></button>
      </div>

      {/* Caption preview — Instagram style */}
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

      {/* Expanded — full Instagram-style caption */}
      {isExp && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--bd)', overflow: 'hidden' }}>
            {/* Instagram-style caption area */}
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
                  {/* Caption like Instagram */}
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--tx)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 10 }}>
                    {post.instagram_caption || 'No caption generated'}
                  </div>

                  {/* Hashtags */}
                  {post.hashtags?.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--blue)', lineHeight: 1.6, marginBottom: 10 }}>
                      {post.hashtags.map(h => `#${h}`).join(' ')}
                    </div>
                  )}

                  {/* Facebook caption */}
                  {post.facebook_caption && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--s2)', borderRadius: 6 }}>
                      <div style={{ fontSize: 9, color: 'var(--tx-dim)', fontWeight: 700, marginBottom: 4, letterSpacing: '.06em' }}>FACEBOOK VERSION</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--tx-muted)', whiteSpace: 'pre-wrap' }}>{post.facebook_caption}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions bar */}
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

// ── Queue Page ───────────────────────────────────────────────────

function QueuePage({ bizId }) {
  const [uploads, setUploads] = useState([]);
  const [businesses, setBiz] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = async () => {
    setLoading(true);
    try {
      // Fetch businesses first
      const bizResp = await fetch('/api/businesses');
      const bizData = await bizResp.json();
      const allBiz = bizData.businesses || [];
      setBiz(allBiz);

      // Fetch uploads for ALL businesses
      const today = new Date().toISOString().split('T')[0];
      const allUploads = [];
      for (const b of allBiz) {
        const r = await fetch(`/api/uploads?business_id=${b.id}`);
        const d = await r.json();
        const todayPosts = (d.uploads || []).filter(u => {
          if (!u.scheduled_for) return false;
          return u.scheduled_for.split('T')[0] === today;
        }).map(u => ({ ...u, _bizName: b.name, _bizSlug: b.slug, _bizColor: b.primary_color }));
        allUploads.push(...todayPosts);
      }

      // Sort by scheduled time
      allUploads.sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
      setUploads(allUploads);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const preview = (p) => {
    if (p.media_type?.includes('video')) return p.thumbnail_url || null;
    return p.media_url || p.backup_url || null;
  };

  const posted = uploads.filter(u => u.status === 'posted').length;
  const pending = uploads.filter(u => ['approved', 'scheduled'].includes(u.status)).length;
  const publishing = uploads.filter(u => ['posting', 'publishing_video'].includes(u.status)).length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)' }}>Today</h1>
          <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} — {uploads.length} posts across all businesses
            {posted > 0 && <span style={{ color: 'var(--green)' }}> · {posted} posted</span>}
            {pending > 0 && <span style={{ color: 'var(--orange)' }}> · {pending} pending</span>}
            {publishing > 0 && <span style={{ color: 'var(--cyan)' }}> · {publishing} publishing</span>}
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={fetch_}><Icon name="refresh" size={12} /></Btn>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-dim)', fontSize: 12 }}>Loading...</div> : !uploads.length ? (
        <div style={{ textAlign: 'center', padding: 50, background: 'var(--s1)', borderRadius: 8, border: '1px dashed var(--bd)', color: 'var(--tx-dim)', fontSize: 13 }}>No posts scheduled for today</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {uploads.map(p => {
            const time = new Date(p.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const prev = preview(p);
            const isVid = p.media_type?.includes('video');
            return (
              <div key={p.id} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 6, overflow: 'hidden' }}>
                {/* Thumbnail */}
                <div style={{ width: '100%', aspectRatio: '3/4', position: 'relative', background: 'var(--s2)' }}>
                  {prev ? <img src={prev} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: 9 }}>{isVid ? '▶ Video' : '—'}</div>
                  )}
                  <div style={{ position: 'absolute', top: 3, left: 3 }}><Tag color={STATUS[p.status]}>{p.status}</Tag></div>
                  {isVid && prev && <div style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,.8)', borderRadius: 3, padding: '1px 4px', fontSize: 7, color: 'var(--cyan)', fontWeight: 700 }}>REEL</div>}
                  <div style={{ position: 'absolute', bottom: 3, right: 3, background: 'rgba(0,0,0,.85)', borderRadius: 3, padding: '1px 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>{time}</div>
                  {/* Business badge */}
                  <div style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,.85)', borderRadius: 3, padding: '1px 6px', fontSize: 8, color: p._bizColor || 'var(--cyan)', fontWeight: 700 }}>{p._bizName}</div>
                </div>

                {/* Info */}
                <div style={{ padding: '5px 8px 7px' }}>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 3, flexWrap: 'wrap' }}>
                    {p.content_pillar && <Tag color="var(--blue)">{p.content_pillar}</Tag>}
                    {p.content_type && <Tag color="var(--tx-dim)">{p.content_type}</Tag>}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--tx-muted)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {p.instagram_caption || '—'}
                  </div>
                  {p.platform_post_id && <div style={{ marginTop: 3, fontSize: 8, color: 'var(--green)' }}>✓ Published</div>}
                  {p.status === 'failed' && <div style={{ marginTop: 3, fontSize: 8, color: 'var(--red)' }}>{p.error_log?.slice(0, 40) || 'Failed'}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Insights Page ────────────────────────────────────────────────

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
  const history = insights?.history || [];

  const S = (props) => <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 12, ...props.style }}>{props.children}</div>;
  const Label = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{children}</div>;

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-dim)', fontSize: 12 }}>Loading...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cyan)', marginBottom: 4 }}>Insights & Learning</h1>
      <p style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 16 }}>AI-powered performance analysis. Data drives every future caption.</p>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {[{ l: 'Posted', v: posted, c: 'var(--green)' }, { l: 'Approved', v: approved, c: 'var(--cyan)' }, { l: 'Scheduled', v: scheduled, c: 'var(--orange)' }, { l: 'Failed', v: failed, c: 'var(--red)' }].map(s => (
          <div key={s.l} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.c, textShadow: `0 0 10px ${s.c}30` }}>{s.v}</div>
            <div style={{ fontSize: 9, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {!analysis ? (
        <S>
          <div style={{ textAlign: 'center', padding: 30 }}>
            <div style={{ fontSize: 14, color: 'var(--tx-dim)', marginBottom: 4 }}>No analysis data yet</div>
            <div style={{ fontSize: 11, color: 'var(--tx-dim)' }}>The learning system needs 5+ published posts with 7 days of metrics data. Keep posting — the first analysis will run automatically on Sunday.</div>
          </div>
        </S>
      ) : (
        <>
          {/* AI Summary */}
          <S>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <Label>AI Analysis Summary</Label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {analysis.engagement_trend && (
                  <Tag color={analysis.engagement_trend === 'improving' ? 'var(--green)' : analysis.engagement_trend === 'declining' ? 'var(--red)' : 'var(--orange)'}>{analysis.engagement_trend}</Tag>
                )}
                <span style={{ fontSize: 9, color: 'var(--tx-dim)' }}>{new Date(analysis.analyzed_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--tx)', marginBottom: 12 }}>{analysis.summary}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <div style={{ padding: 8, background: 'var(--s2)', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--cyan)' }}>{analysis.avg_composite_score || '—'}</div>
                <div style={{ fontSize: 8, color: 'var(--tx-dim)', marginTop: 2 }}>AVG COMPOSITE</div>
              </div>
              <div style={{ padding: 8, background: 'var(--s2)', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{analysis.avg_engagement_rate || '—'}%</div>
                <div style={{ fontSize: 8, color: 'var(--tx-dim)', marginTop: 2 }}>AVG ENGAGEMENT</div>
              </div>
              <div style={{ padding: 8, background: 'var(--s2)', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--purple)' }}>{analysis.avg_share_to_reach || '—'}%</div>
                <div style={{ fontSize: 8, color: 'var(--tx-dim)', marginTop: 2 }}>SHARE-TO-REACH</div>
              </div>
            </div>
          </S>

          {/* What to do more / less */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <S style={{ marginBottom: 0, borderColor: 'rgba(0,240,160,0.15)' }}>
              <Label>Double Down (do more)</Label>
              {(analysis.double_down || []).map((item, i) => (
                <div key={i} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--green)', marginBottom: 6, paddingLeft: 10, borderLeft: '2px solid var(--green)' }}>{item}</div>
              ))}
            </S>
            <S style={{ marginBottom: 0, borderColor: 'rgba(255,59,92,0.15)' }}>
              <Label>Stop Doing (underperforming)</Label>
              {(analysis.avoid || []).map((item, i) => (
                <div key={i} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--red)', marginBottom: 6, paddingLeft: 10, borderLeft: '2px solid var(--red)' }}>{item}</div>
              ))}
            </S>
          </div>

          {/* Recommendations */}
          <S>
            <Label>AI Recommendations</Label>
            {(analysis.recommendations || []).map((rec, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--tx)', marginBottom: 8, padding: '8px 10px', background: 'var(--s2)', borderRadius: 6, borderLeft: '3px solid var(--cyan)' }}>
                {rec}
              </div>
            ))}
          </S>

          {/* Best/Worst breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <S style={{ marginBottom: 0 }}>
              <Label>Best Pillar</Label>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', textTransform: 'capitalize' }}>{analysis.best_pillar || '—'}</div>
              <div style={{ fontSize: 9, color: 'var(--tx-dim)', marginTop: 4 }}>Worst: <span style={{ color: 'var(--red)' }}>{analysis.worst_pillar || '—'}</span></div>
            </S>
            <S style={{ marginBottom: 0 }}>
              <Label>Best Content Type</Label>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{analysis.best_content_type || '—'}</div>
              <div style={{ fontSize: 9, color: 'var(--tx-dim)', marginTop: 4 }}>Worst: <span style={{ color: 'var(--red)' }}>{analysis.worst_content_type || '—'}</span></div>
            </S>
            <S style={{ marginBottom: 0 }}>
              <Label>Best Mood & Time</Label>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{analysis.best_mood || '—'}</div>
              <div style={{ fontSize: 9, color: 'var(--tx-dim)', marginTop: 4 }}>Best hour: <span style={{ color: 'var(--cyan)' }}>{analysis.best_posting_hour || '—'} UTC</span></div>
            </S>
          </div>

          {/* Content mix recommendation */}
          {analysis.content_mix && (
            <S>
              <Label>Recommended Content Mix</Label>
              <div style={{ display: 'flex', gap: 12 }}>
                {Object.entries(analysis.content_mix).map(([key, val]) => {
                  const label = key.replace('_pct', '');
                  const color = label === 'educate' ? 'var(--blue)' : label === 'engage' ? 'var(--green)' : label === 'inspire' ? 'var(--orange)' : 'var(--red)';
                  return (
                    <div key={key} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
                      <div style={{ fontSize: 9, color: 'var(--tx-dim)', textTransform: 'capitalize' }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </S>
          )}

          {/* Hook patterns + drivers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <S style={{ marginBottom: 0 }}>
              <Label>What Drives Shares</Label>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--tx-muted)' }}>{analysis.share_drivers || 'Not enough data yet'}</div>
            </S>
            <S style={{ marginBottom: 0 }}>
              <Label>What Drives Saves</Label>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--tx-muted)' }}>{analysis.save_drivers || 'Not enough data yet'}</div>
            </S>
          </div>

          {/* Hook patterns */}
          <S>
            <Label>Hook Patterns That Work</Label>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--tx)', marginBottom: 10 }}>{analysis.hook_patterns || 'Not enough data yet'}</div>
            {analysis.top_hooks?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'var(--tx-dim)', fontWeight: 700, marginBottom: 6 }}>TOP PERFORMING HOOKS:</div>
                {analysis.top_hooks.map((hook, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--cyan)', padding: '6px 8px', background: 'var(--s2)', borderRadius: 4, marginBottom: 4, fontStyle: 'italic' }}>"{hook}"</div>
                ))}
              </div>
            )}
          </S>

          {/* Top posts table */}
          {topPosts.length > 0 && (
            <S>
              <Label>Top Performing Posts (by composite score)</Label>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bd)' }}>
                      {['Hook', 'Pillar', 'Type', 'Score', 'Shares', 'Saves', 'Reach', 'Eng%'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 9, color: 'var(--tx-dim)', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topPosts.slice(0, 8).map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                        <td style={{ padding: '6px 8px', color: 'var(--tx-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.hook_text || '—'}</td>
                        <td style={{ padding: '6px 8px' }}><Tag color="var(--blue)">{p.content_pillar}</Tag></td>
                        <td style={{ padding: '6px 8px' }}><Tag color="var(--tx-dim)">{p.content_type}</Tag></td>
                        <td style={{ padding: '6px 8px', color: 'var(--cyan)', fontWeight: 700 }}>{p.composite_score?.toFixed(0)}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--purple)' }}>{p.shares || 0}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--green)' }}>{p.saves || 0}</td>
                        <td style={{ padding: '6px 8px' }}>{p.reach || 0}</td>
                        <td style={{ padding: '6px 8px' }}>{p.engagement_rate?.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </S>
          )}

          {/* Trend history */}
          {history.length > 1 && (
            <S>
              <Label>Weekly Trend</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                {history.reverse().map((h, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--s2)', borderRadius: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>{h.avg_composite_score?.toFixed(0) || '—'}</div>
                    <div style={{ fontSize: 8, color: 'var(--tx-dim)' }}>{new Date(h.analyzed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    <div style={{ fontSize: 8, color: h.engagement_trend === 'improving' ? 'var(--green)' : h.engagement_trend === 'declining' ? 'var(--red)' : 'var(--orange)' }}>{h.engagement_trend || '—'}</div>
                  </div>
                ))}
              </div>
            </S>
          )}

          {/* Data quality note */}
          {analysis.data_quality_note && (
            <div style={{ fontSize: 10, color: 'var(--tx-dim)', fontStyle: 'italic', padding: '8px 12px', background: 'var(--s1)', borderRadius: 6, border: '1px solid var(--bd)' }}>
              Note: {analysis.data_quality_note}
            </div>
          )}
        </>
      )}
    </div>
  );
}