'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Btn, Input, Select, Tag, FieldLabel, Icon } from '@/components/ui';

const DO_URL = 'https://urchin-app-bqb4i.ondigitalocean.app';

function lsGet(k, fb) { if (typeof window==='undefined') return fb; try { const r=localStorage.getItem(k); return r?JSON.parse(r):fb; } catch{return fb;} }
function lsSet(k, v) { if (typeof window==='undefined') return; try { localStorage.setItem(k, JSON.stringify(v)); } catch{} }

export default function ContentFarm() {
  const [page, setPage] = useState('upload');
  const [biz, setBiz] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/businesses')
      .then(r => r.json())
      .then(d => { if (d.businesses?.length) setBiz(d.businesses); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const nav = [
    { id: 'upload', l: 'Upload', ic: 'plus' },
    { id: 'calendar', l: 'Calendar', ic: 'folder' },
    { id: 'queue', l: 'Queue', ic: 'bolt' },
    { id: 'insights', l: 'Insights', ic: 'bolt' },
    { id: 'businesses', l: 'Businesses', ic: 'briefcase' },
  ];

  if (!ready) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: 200, borderRight: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--bg)' }}>
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', color: 'var(--gold)' }}>CONTENT FARM</div>
          <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginTop: 2, fontWeight: 600, letterSpacing: '.06em' }}>v2 — UPLOAD + SCHEDULE</div>
        </div>
        <nav style={{ padding: '8px 6px', flex: 1 }}>
          {nav.map(n => { const a = page === n.id; return (
            <button key={n.id} onClick={() => setPage(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px', border: 'none', background: a ? 'var(--s1)' : 'transparent', color: a ? 'var(--tx)' : 'var(--tx-muted)', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: a ? 600 : 400, fontFamily: 'inherit', marginBottom: 1 }}>
              <span style={{ opacity: a ? 1 : 0.4 }}><Icon name={n.ic} size={16} /></span>{n.l}
            </button>
          ); })}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--bd)', fontSize: 10, color: 'var(--tx-dim)' }}>{biz.length} businesses</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {page === 'upload' && <UploadPage biz={biz} onNavigate={setPage} />}
        {page === 'calendar' && <CalendarPage biz={biz} />}
        {page === 'queue' && <QueuePage biz={biz} />}
        {page === 'insights' && <InsightsPage biz={biz} />}
        {page === 'businesses' && <BusinessesPage biz={biz} />}
      </div>
    </div>
  );
}

function ProgressBar({ label, done, total, color }) {
  const pct = total > 0 ? (done / total * 100) : 0;
  return (
    <div style={{ padding: 20, background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--bd)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--tx-muted)' }}>{done}/{total}</span>
      </div>
      <div style={{ height: 8, background: 'var(--s2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function UploadPage({ biz, onNavigate }) {
  const [bizId, setBizId] = useState(biz[0]?.id || '');
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
  const b = biz.find(x => x.id === bizId);

  const handleFiles = (fl) => {
    const arr = Array.from(fl).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    setFiles(prev => [...prev, ...arr.map(f => ({ file: f, status: 'pending', url: null, result: null }))]);
  };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };
  const onFileSelect = (e) => { handleFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; };
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
      const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bizId, batch_id: newBatchId, files: uploadedFiles }) });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setBatchId(newBatchId); setPhase('uploaded');
    } catch (err) { console.error('Batch create failed:', err); }
    setUploading(false);
  };

  const processAll = async () => {
    if (!batchId) return;
    setProcessing(true); setPhase('processing'); setProcessErrors(0);
    const total = files.filter(f => f.status === 'uploaded').length; let done = 0; let errors = 0;
    const maxIterations = total + 10;
    let iterations = 0;
    while (iterations < maxIterations) {
      iterations++;
      try {
        const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', batch_id: batchId }) });
        const data = await resp.json();
        if (data.processed === 0 || data.reason === 'all_processed') break;
        if (data.error || data.skipped) { errors++; done++; setProcessProgress({ done, total, current: `Skipped: ${data.error || 'unknown'}` }); continue; }
        done++; setProcessProgress({ done, total, current: data.result?.analysis?.content_description || '' });
      } catch (err) { console.error('Process error:', err); errors++; if (errors > 5) break; }
    }
    setProcessErrors(errors);
    setProcessing(false); setPhase('processed');
  };

  const scheduleBatch = async () => {
    if (!batchId) return;
    setScheduling(true); setPhase('scheduling');
    try {
      const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'schedule', batch_id: batchId }) });
      const data = await resp.json(); setScheduleResult(data); setPhase('scheduled');
    } catch (err) { console.error('Schedule error:', err); }
    setScheduling(false);
  };

  const approveBatch = async () => {
    if (!batchId) return;
    try {
      const resp = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', batch_id: batchId }) });
      const data = await resp.json();
      alert(`Approved ${data.approved} posts. They will publish at their scheduled times.`);
      onNavigate('calendar');
    } catch (err) { console.error('Approve error:', err); }
  };

  const uploadedCount = files.filter(f => f.status === 'uploaded').length;

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Upload Content</h1>
        <p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>Drop your content. AI analyzes, captions, and schedules across 30 days.</p>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 24 }}>
        <div style={{ minWidth: 220 }}><Select label="Business" value={bizId} onChange={v => { setBizId(v); clearAll(); }} options={biz.map(x => ({ value: x.id, label: x.name }))} /></div>
        {files.length > 0 && phase === 'select' && <Btn variant="ghost" size="sm" onClick={clearAll}>Clear All</Btn>}
      </div>

      {phase === 'select' && (
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--bd)'}`, borderRadius: 16, padding: files.length ? '32px' : '80px 32px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(201,164,76,0.04)' : 'var(--s1)', transition: 'all 0.2s', marginBottom: 20 }}>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onFileSelect} style={{ display: 'none' }} />
          <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 12 }}><Icon name="plus" size={40} /></div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx-muted)' }}>{files.length ? `${files.length} files selected — drop more or click to add` : 'Drop images and videos here'}</div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 6 }}>PNG, JPG, MP4 — up to 100MB per file</div>
        </div>
      )}

      {files.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{files.length} files</span>
            {phase === 'select' && <Btn variant="primary" size="lg" onClick={uploadAll} disabled={!b}>Upload {files.length} Files</Btn>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, maxHeight: phase === 'select' ? 400 : 160, overflow: 'auto' }}>
            {files.map((f, i) => (
              <div key={i} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                {f.file.type.startsWith('image/') ? <div style={{ width: '100%', aspectRatio: '1', backgroundImage: `url(${URL.createObjectURL(f.file)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} /> : <div style={{ width: '100%', aspectRatio: '1', background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--tx-dim)' }}>VIDEO</div>}
                <div style={{ padding: '4px 6px', fontSize: 8, color: f.status === 'uploaded' ? 'var(--green)' : f.status === 'failed' ? 'var(--red)' : 'var(--tx-dim)', fontWeight: 600 }}>{f.status === 'pending' ? `${(f.file.size/1024/1024).toFixed(1)}MB` : f.status.toUpperCase()}</div>
                {phase === 'select' && <button onClick={e => { e.stopPropagation(); removeFile(i); }} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.7)', border: 'none', color: 'var(--red)', cursor: 'pointer', borderRadius: 4, padding: '1px 3px', display: 'flex' }}><Icon name="x" size={8} /></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'uploading' && <ProgressBar label="Uploading files" done={uploadProgress.done} total={uploadProgress.total} color="var(--blue)" />}

      {phase === 'uploaded' && (
        <div style={{ padding: 24, background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--bd)', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{uploadedCount} files uploaded</div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 20 }}>Next: AI analyzes each post and generates captions.</div>
          <Btn variant="primary" size="lg" onClick={processAll}>Analyze & Generate Captions</Btn>
        </div>
      )}

      {phase === 'processing' && (
        <div>
          <ProgressBar label="Analyzing content" done={processProgress.done} total={processProgress.total} color="var(--gold)" />
          {processProgress.current && <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 8, fontStyle: 'italic' }}>"{processProgress.current}"</div>}
        </div>
      )}

      {phase === 'processed' && (
        <div style={{ padding: 24, background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--bd)', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            {processErrors > 0 ? `Analyzed with ${processErrors} errors` : 'All posts analyzed and captioned'}
          </div>
          {processErrors > 0 && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>Failed posts will be skipped during scheduling.</div>}
          <div style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 20 }}>Next: Schedule across 30 days (3 posts/day).</div>
          <Btn variant="primary" size="lg" onClick={scheduleBatch}>Schedule 30 Days</Btn>
        </div>
      )}

      {phase === 'scheduling' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ width: 24, height: 24, border: '2px solid var(--bd)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, color: 'var(--tx-muted)' }}>Scheduling...</div>
        </div>
      )}

      {phase === 'scheduled' && scheduleResult && (
        <div style={{ padding: 24, background: 'var(--s1)', borderRadius: 12, border: '1px solid rgba(52,199,123,0.3)', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>{scheduleResult.scheduled} posts scheduled</div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 8 }}>{scheduleResult.startDate} → {scheduleResult.endDate} ({scheduleResult.totalDays} days)</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
            <Tag color="var(--blue)">Educate: {scheduleResult.byPillar?.educate || 0}</Tag>
            <Tag color="var(--green)">Engage: {scheduleResult.byPillar?.engage || 0}</Tag>
            <Tag color="var(--gold)">Inspire: {scheduleResult.byPillar?.inspire || 0}</Tag>
            <Tag color="var(--red)">Promote: {scheduleResult.byPillar?.promote || 0}</Tag>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Btn variant="primary" size="lg" onClick={() => onNavigate('calendar')}>View Calendar</Btn>
            <Btn size="lg" onClick={approveBatch}>Approve All Now</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarPage({ biz }) {
  const [bizId, setBizId] = useState(biz[0]?.id || '');
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [editingCaption, setEditingCaption] = useState(null);
  const [captionText, setCaptionText] = useState('');

  const fetchUploads = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/uploads?business_id=${bizId}`);
      const data = await resp.json();
      setUploads(data.uploads || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchUploads(); }, [bizId]);

  const approveOne = async (id) => {
    await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', upload_id: id }) });
    fetchUploads();
  };

  const saveCaption = async (id) => {
    await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_caption', upload_id: id, instagram_caption: captionText }) });
    setEditingCaption(null);
    fetchUploads();
  };

  const approveAll = async () => {
    // Approve each scheduled post individually (reliable)
    const scheduled = uploads.filter(u => u.status === 'scheduled');
    for (const u of scheduled) {
      await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', upload_id: u.id }) });
    }
    alert(`Approved ${scheduled.length} posts.`);
    fetchUploads();
  };

  // Group by day
  const byDay = {};
  uploads.filter(u => u.day_number).forEach(u => {
    if (!byDay[u.day_number]) byDay[u.day_number] = [];
    byDay[u.day_number].push(u);
  });
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);

  const statusColors = { uploaded: 'var(--tx-dim)', analyzing: 'var(--blue)', captioned: 'var(--gold)', scheduled: 'var(--tx-muted)', approved: 'var(--green)', posting: 'var(--blue)', posted: 'var(--green)', failed: 'var(--red)', publishing_video: 'var(--blue)' };

  const scheduledCount = uploads.filter(u => u.status === 'scheduled').length;
  const approvedCount = uploads.filter(u => u.status === 'approved').length;
  const postedCount = uploads.filter(u => u.status === 'posted').length;
  const failedCount = uploads.filter(u => u.status === 'failed').length;

  // Get thumbnail for any post (images use media_url, videos use thumbnail_url)
  const getPreviewUrl = (post) => {
    if (post.media_type?.includes('video')) return post.thumbnail_url || null;
    return post.media_url || null;
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Content Calendar</h1>
          <p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>
            {uploads.length} total — {scheduledCount} scheduled, {approvedCount} approved, {postedCount} posted{failedCount > 0 ? `, ${failedCount} failed` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {scheduledCount > 0 && <Btn variant="primary" onClick={approveAll}>Approve All ({scheduledCount})</Btn>}
          <Btn size="sm" onClick={fetchUploads}><Icon name="refresh" size={12} /></Btn>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ minWidth: 220 }}>
          <Select label="Business" value={bizId} onChange={v => setBizId(v)} options={biz.map(x => ({ value: x.id, label: x.name }))} />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--tx-muted)' }}>Loading...</div>
      ) : !days.length ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--s1)', borderRadius: 12, border: '1px dashed var(--bd)' }}>
          <div style={{ fontSize: 15, color: 'var(--tx-muted)', fontWeight: 500 }}>No scheduled content</div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 4 }}>Upload content to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {days.map(dayNum => {
            const dayPosts = byDay[dayNum].sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
            const dayDate = dayPosts[0]?.scheduled_for
              ? new Date(dayPosts[0].scheduled_for).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
              : `Day ${dayNum}`;
            const dayScheduled = dayPosts.filter(p => p.status === 'scheduled').length;

            return (
              <div key={dayNum} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
                {/* Day header */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)', minWidth: 50 }}>DAY {dayNum}</span>
                    <span style={{ fontSize: 13, color: 'var(--tx-muted)' }}>{dayDate}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--tx-dim)' }}>{dayPosts.length} posts</span>
                  </div>
                </div>

                {/* Posts as horizontal cards */}
                <div style={{ display: 'flex', gap: 0 }}>
                  {dayPosts.map((post, postIdx) => {
                    const time = post.scheduled_for ? new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                    const isExp = expanded === post.id;
                    const isEdit = editingCaption === post.id;
                    const isVid = post.media_type?.includes('video');
                    const previewUrl = getPreviewUrl(post);

                    return (
                      <div key={post.id} style={{ flex: 1, borderRight: postIdx < dayPosts.length - 1 ? '1px solid var(--bd)' : 'none', padding: 16, display: 'flex', flexDirection: 'column' }}>
                        {/* Thumbnail */}
                        <div
                          onClick={() => setExpanded(isExp ? null : post.id)}
                          style={{ width: '100%', aspectRatio: '4/5', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', position: 'relative', background: 'var(--s2)', marginBottom: 12 }}
                        >
                          {previewUrl ? (
                            <img src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <span style={{ fontSize: 24, opacity: 0.2 }}>{isVid ? '▶' : '—'}</span>
                              <span style={{ fontSize: 10, color: 'var(--tx-dim)' }}>{isVid ? 'Video' : 'No preview'}</span>
                            </div>
                          )}
                          {/* Status badge */}
                          <div style={{ position: 'absolute', top: 8, left: 8 }}>
                            <Tag color={statusColors[post.status] || 'var(--tx-dim)'}>{post.status}</Tag>
                          </div>
                          {/* Video indicator */}
                          {isVid && previewUrl && (
                            <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', borderRadius: 5, padding: '2px 8px', fontSize: 9, color: '#fff', fontWeight: 700 }}>REEL</div>
                          )}
                          {/* Time */}
                          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.75)', borderRadius: 6, padding: '4px 10px', fontSize: 13, color: '#fff', fontWeight: 700 }}>{time}</div>
                        </div>

                        {/* Content info */}
                        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                          {post.content_pillar && <Tag color="var(--blue)">{post.content_pillar}</Tag>}
                          {post.content_type && <Tag color="var(--tx-muted)">{post.content_type}</Tag>}
                          {post.hook_strength && <Tag color="var(--gold)">⚡{post.hook_strength}</Tag>}
                        </div>

                        {/* Caption preview */}
                        <div style={{ fontSize: 11, color: 'var(--tx-muted)', lineHeight: 1.5, marginBottom: 8, flex: 1 }}>
                          {isExp ? null : (
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                              {post.instagram_caption || post.content_description || '—'}
                            </div>
                          )}
                        </div>

                        {/* Expanded view */}
                        {isExp && (
                          <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--bd)', marginBottom: 8 }}>
                            {post.content_description && (
                              <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginBottom: 10, padding: '6px 8px', background: 'var(--s2)', borderRadius: 6, fontStyle: 'italic' }}>
                                AI Analysis: {post.content_description}
                              </div>
                            )}

                            {isEdit ? (
                              <div>
                                <textarea
                                  value={captionText}
                                  onChange={e => setCaptionText(e.target.value)}
                                  style={{ width: '100%', minHeight: 140, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, padding: 10, color: 'var(--tx)', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }}
                                />
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                  <Btn size="sm" variant="primary" onClick={() => saveCaption(post.id)}>Save Caption</Btn>
                                  <Btn size="sm" variant="ghost" onClick={() => setEditingCaption(null)}>Cancel</Btn>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 10, color: 'var(--tx)' }}>
                                  {post.instagram_caption || 'No caption generated'}
                                </div>
                                {post.hashtags?.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                                    {post.hashtags.map((h, i) => <Tag key={i} color="var(--purple)">#{h}</Tag>)}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <Btn size="sm" variant="ghost" onClick={() => { setEditingCaption(post.id); setCaptionText(post.instagram_caption || ''); }}>
                                    <Icon name="edit" size={11} /> Edit Caption
                                  </Btn>
                                  {post.status === 'scheduled' && (
                                    <Btn size="sm" variant="primary" onClick={() => approveOne(post.id)}>Approve</Btn>
                                  )}
                                  {post.media_url && (
                                    <Btn size="sm" variant="ghost" onClick={() => window.open(post.media_url, '_blank')}>
                                      <Icon name="image" size={11} /> View Full
                                    </Btn>
                                  )}
                                </div>
                              </div>
                            )}

                            {post.status === 'failed' && post.error_log && (
                              <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(231,74,74,0.06)', borderRadius: 6, fontSize: 11, color: 'var(--red)' }}>
                                Error: {post.error_log}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Quick actions */}
                        {!isExp && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Btn size="sm" variant="ghost" onClick={() => setExpanded(post.id)}>Details</Btn>
                            {post.status === 'scheduled' && <Btn size="sm" variant="primary" onClick={() => approveOne(post.id)}>Approve</Btn>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unscheduled posts */}
      {uploads.filter(u => !u.day_number && u.status !== 'failed').length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--tx-muted)' }}>Unscheduled</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {uploads.filter(u => !u.day_number && u.status !== 'failed').map(post => (
              <div key={post.id} style={{ background: 'var(--s2)', borderRadius: 8, padding: 8, fontSize: 10, color: 'var(--tx-dim)' }}>
                <Tag color={statusColors[post.status] || 'var(--tx-dim)'}>{post.status}</Tag>
                <div style={{ marginTop: 4 }}>{post.filename || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed posts */}
      {failedCount > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--red)' }}>Failed ({failedCount})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {uploads.filter(u => u.status === 'failed').map(post => (
              <div key={post.id} style={{ background: 'var(--s1)', border: '1px solid rgba(231,74,74,0.2)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>{post.filename || post.content_description || '—'}</div>
                  <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>{post.error_log || 'Unknown error'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QueuePage({ biz }) {
  const [bizId, setBizId] = useState(biz[0]?.id || '');
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchQueue = async () => { setLoading(true); try { const resp = await fetch(`/api/uploads?business_id=${bizId}`); const data = await resp.json(); const now = new Date(); const todayStr = now.toISOString().split('T')[0]; setUploads((data.uploads || []).filter(u => { if (!u.scheduled_for) return u.status === 'failed'; return u.scheduled_for.startsWith(todayStr) || ['posting', 'publishing_video', 'failed', 'posted'].includes(u.status); })); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { fetchQueue(); }, [bizId]);
  const statusColors = { approved: 'var(--green)', posting: 'var(--blue)', posted: 'var(--green)', failed: 'var(--red)', publishing_video: 'var(--blue)', scheduled: 'var(--tx-muted)' };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700 }}>Today's Queue</h1><p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>Posts scheduled for today and recent activity.</p></div>
        <Btn size="sm" onClick={fetchQueue}><Icon name="refresh" size={12} /></Btn>
      </div>
      <div style={{ marginBottom: 24 }}><div style={{ minWidth: 220 }}><Select label="Business" value={bizId} onChange={v => setBizId(v)} options={biz.map(x => ({ value: x.id, label: x.name }))} /></div></div>
      {loading ? <div style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--tx-muted)' }}>Loading...</div> : !uploads.length ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--s1)', borderRadius: 12, border: '1px dashed var(--bd)' }}><div style={{ fontSize: 15, color: 'var(--tx-muted)', fontWeight: 500 }}>No posts for today</div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {uploads.map(post => (
            <div key={post.id} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
              {post.media_url && !post.media_type?.includes('video') && <div style={{ width: '100%', aspectRatio: '1', backgroundImage: `url(${post.media_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Tag color={statusColors[post.status] || 'var(--tx-dim)'}>{post.status}</Tag>
                  <span style={{ fontSize: 11, color: 'var(--tx-dim)' }}>{post.scheduled_for ? new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{post.instagram_caption || post.content_description || '—'}</div>
                {post.status === 'failed' && post.error_log && <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(231,74,74,0.06)', borderRadius: 6, fontSize: 10, color: 'var(--red)' }}>{post.error_log}</div>}
                {post.platform_post_id && <div style={{ marginTop: 8, fontSize: 10, color: 'var(--green)' }}>Published: {post.platform_post_id}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightsPage({ biz }) {
  const [bizId, setBizId] = useState(biz[0]?.id || '');
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); fetch(`/api/uploads?business_id=${bizId}`).then(r => r.json()).then(d => { setUploads(d.uploads || []); setLoading(false); }).catch(() => setLoading(false)); }, [bizId]);
  const posted = uploads.filter(u => u.status === 'posted');
  const failed = uploads.filter(u => u.status === 'failed');
  const approved = uploads.filter(u => u.status === 'approved');
  const scheduled = uploads.filter(u => u.status === 'scheduled');
  const pillars = { educate: 0, engage: 0, inspire: 0, promote: 0 };
  uploads.forEach(u => { if (u.content_pillar && pillars[u.content_pillar] !== undefined) pillars[u.content_pillar]++; });

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 22 }}><h1 style={{ fontSize: 22, fontWeight: 700 }}>Insights</h1><p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>Performance data appears after 2-3 weeks of published content.</p></div>
      <div style={{ marginBottom: 24 }}><div style={{ minWidth: 220 }}><Select label="Business" value={bizId} onChange={v => setBizId(v)} options={biz.map(x => ({ value: x.id, label: x.name }))} /></div></div>
      {loading ? <div style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--tx-muted)' }}>Loading...</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[{ l: 'Posted', v: posted.length, c: 'var(--green)' }, { l: 'Approved', v: approved.length, c: 'var(--blue)' }, { l: 'Scheduled', v: scheduled.length, c: 'var(--gold)' }, { l: 'Failed', v: failed.length, c: 'var(--red)' }].map(s => (
              <div key={s.l} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 12, color: 'var(--tx-muted)', marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Content Pillar Distribution</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {Object.entries(pillars).map(([p, c]) => (
                <div key={p} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12, color: 'var(--tx-muted)', textTransform: 'capitalize' }}>{p}</span><span style={{ fontSize: 12, fontWeight: 600 }}>{c}</span></div>
                  <div style={{ height: 8, background: 'var(--s2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${uploads.length ? (c / uploads.length * 100) : 0}%`, background: p === 'educate' ? 'var(--blue)' : p === 'engage' ? 'var(--green)' : p === 'inspire' ? 'var(--gold)' : 'var(--red)', borderRadius: 4 }} /></div>
                </div>
              ))}
            </div>
          </div>
          {failed.length > 0 && (
            <div style={{ background: 'var(--s1)', border: '1px solid rgba(231,74,74,0.2)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 12 }}>Failed Posts</div>
              {failed.slice(0, 5).map(f => <div key={f.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--bd)', fontSize: 12 }}><span style={{ color: 'var(--tx-muted)' }}>{f.content_description || f.filename}</span> <span style={{ color: 'var(--red)', marginLeft: 8 }}>{f.error_log}</span></div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BusinessesPage({ biz }) {
  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 22 }}><h1 style={{ fontSize: 22, fontWeight: 700 }}>Businesses</h1><p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>Business profiles managed in Supabase (cf_businesses).</p></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        {biz.map(b => (
          <div key={b.id} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ height: 4, background: `linear-gradient(90deg, ${b.primary_color || '#3B82F6'}, ${b.accent_color || '#F59E0B'})` }} />
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{b.name}</div>
              <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginBottom: 8 }}>{b.industry_label || b.industry}</div>
              {b.website && <div style={{ fontSize: 11, color: 'var(--tx-dim)', marginBottom: 8 }}>{b.website}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 11 }}>
                <div><span style={{ color: 'var(--tx-dim)' }}>Timezone:</span> <span>{b.timezone || '—'}</span></div>
                <div><span style={{ color: 'var(--tx-dim)' }}>Publish to:</span> <span>{b.publish_to || '—'}</span></div>
                <div><span style={{ color: 'var(--tx-dim)' }}>Posts/day:</span> <span>{b.posts_per_day || '—'}</span></div>
                <div><span style={{ color: 'var(--tx-dim)' }}>Auto post:</span> <span style={{ color: b.auto_post ? 'var(--green)' : 'var(--red)' }}>{b.auto_post ? 'Yes' : 'No'}</span></div>
              </div>
              {b.posting_times && <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>{(Array.isArray(b.posting_times) ? b.posting_times : []).map((t, i) => <Tag key={i} color="var(--blue)">{t}</Tag>)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}