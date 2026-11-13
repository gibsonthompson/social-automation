'use client';

/**
 * Queue: everything that has not posted yet for the selected brand,
 * grouped by day in the brand's timezone. Replaces the old Calendar and
 * Today screens.
 *
 * Path: src/components/farm/QueueView.jsx
 */

import { useEffect, useMemo, useState } from 'react';
import { Btn, Icon, Segmented, confirmDialog, toast } from '@/components/ui';
import { describeCadence } from '@/lib/content-farm/cadence';
import {
  uploadsAction, api, fmtTime, relativeDay, localDateKey, tzOf,
  StatusPill, PostTags, PostThumb, PostViewer, LoadingRows,
} from './shared';

const OPEN_STATUSES = ['uploaded', 'analyzing', 'captioned', 'scheduled', 'approved', 'posting', 'publishing_video', 'failed'];

export default function QueueView({ b, refreshBiz, onNavigate }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const tz = tzOf(b);

  const load = async () => {
    if (!b) return;
    try {
      const d = await api(`/api/uploads?business_id=${b.id}&statuses=${OPEN_STATUSES.join(',')}&limit=2000`);
      setRows(d.uploads || []);
    } catch (e) { toast(e.message, 'error'); setRows([]); }
  };

  useEffect(() => { setRows(null); load(); }, [b?.id]);

  const all = rows || [];
  const scheduledRows = all.filter(u => ['scheduled', 'approved', 'posting', 'publishing_video'].includes(u.status) && u.scheduled_for)
    .sort((a, c) => new Date(a.scheduled_for) - new Date(c.scheduled_for));
  const needsReview = scheduledRows.filter(u => u.status === 'scheduled');
  const unscheduled = all.filter(u => ['uploaded', 'analyzing', 'captioned'].includes(u.status) || (u.status === 'scheduled' && !u.scheduled_for));
  const failed = all.filter(u => u.status === 'failed');

  const visible = filter === 'review' ? needsReview : filter === 'approved' ? scheduledRows.filter(u => u.status === 'approved') : scheduledRows;

  const groups = useMemo(() => {
    const out = [];
    let cur = null;
    for (const p of visible) {
      const key = localDateKey(p.scheduled_for, tz);
      if (!cur || cur.key !== key) { cur = { key, first: p.scheduled_for, items: [] }; out.push(cur); }
      cur.items.push(p);
    }
    return out;
  }, [visible, tz]);

  const replaceRow = (next) => { setRows(r => (r || []).map(x => (x.id === next.id ? { ...x, ...next } : x))); setView(v => (v && v.id === next.id ? { ...v, ...next } : v)); };

  const approve = async (p) => {
    try { await uploadsAction({ action: 'approve', upload_id: p.id }); replaceRow({ ...p, status: 'approved' }); refreshBiz(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const remove = async (p) => {
    const ok = await confirmDialog({ title: 'Delete This Post?', body: 'The file and caption are removed and the rest of the queue keeps its times.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await uploadsAction({ action: 'delete', upload_id: p.id }); setRows(r => r.filter(x => x.id !== p.id)); setView(null); refreshBiz(); toast('Post deleted', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };

  const retry = async (p) => {
    try { await uploadsAction({ action: 'retry', upload_id: p.id }); toast('Back in the queue at the next open slot', 'success'); load(); refreshBiz(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const approveAll = async () => {
    const ok = await confirmDialog({ title: `Approve ${needsReview.length} Posts?`, body: 'They will publish at their scheduled times while Publishing is on.', confirmLabel: 'Approve All' });
    if (!ok) return;
    setBusy(true);
    const batches = [...new Set(needsReview.map(p => p.batch_id).filter(Boolean))];
    try {
      for (const id of batches) await uploadsAction({ action: 'approve', batch_id: id });
      const loose = needsReview.filter(p => !p.batch_id);
      for (const p of loose) await uploadsAction({ action: 'approve', upload_id: p.id });
      toast(`Approved ${needsReview.length} posts`, 'success');
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false); load(); refreshBiz();
  };

  const reflow = async () => {
    setBusy(true);
    try {
      const r = await uploadsAction({ action: 'reschedule', business_id: b.id });
      toast(r.queued ? `Re-timed ${r.queued} posts to the current schedule` : 'Nothing queued to re-time', 'success');
      load(); refreshBiz();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const scheduleCaptioned = async () => {
    const captioned = unscheduled.filter(p => p.status === 'captioned');
    const batches = [...new Set(captioned.map(p => p.batch_id))];
    setBusy(true);
    try {
      for (const id of batches) await uploadsAction({ action: 'schedule', batch_id: id });
      toast(`Scheduled ${captioned.length} posts after the current queue`, 'success');
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false); load(); refreshBiz();
  };

  const clearSection = async (list, label) => {
    const ok = await confirmDialog({ title: `Delete ${list.length} ${label} Posts?`, body: 'This cannot be undone.', confirmLabel: 'Delete All', danger: true });
    if (!ok) return;
    setBusy(true);
    for (const p of list) { try { await uploadsAction({ action: 'delete', upload_id: p.id }); } catch { /* keep going */ } }
    setBusy(false); load(); refreshBiz();
  };

  if (!b) return null;
  const cad = describeCadence(b);
  const paused = b.auto_post !== true;

  return (
    <>
      {paused && (
        <div className="cf-banner">
          <Icon name="power" size={16} style={{ color: 'var(--orange)' }} />
          <span className="cf-banner-text"><strong>Publishing is off for {b.name}.</strong> Nothing below will post until you turn it on.</span>
          <Btn size="sm" onClick={() => onNavigate('settings')}>Open Settings</Btn>
        </div>
      )}

      <div className="cf-toolbar">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all', label: `All (${scheduledRows.length})` },
          { value: 'review', label: `Needs Review (${needsReview.length})` },
          { value: 'approved', label: `Approved (${scheduledRows.length - needsReview.length})` },
        ]} />
        <div className="cf-spacer" />
        <span style={{ fontSize: 12.5, color: 'var(--tx-muted)' }}>{cad.text}</span>
        <Btn size="sm" variant="ghost" onClick={reflow} disabled={busy || !scheduledRows.length} title="Re-time every queued post to the current Settings"><Icon name="clock" size={14} />Re-apply Schedule</Btn>
        {needsReview.length > 0 && <Btn size="sm" variant="primary" onClick={approveAll} disabled={busy}><Icon name="check" size={14} />Approve All</Btn>}
        <Btn size="sm" variant="ghost" icon onClick={load} title="Refresh"><Icon name="refresh" size={14} /></Btn>
      </div>

      {rows === null ? <LoadingRows /> : !groups.length ? (
        <div className="cf-empty">
          <div className="cf-empty-title">{filter === 'all' ? 'The Queue Is Empty' : 'Nothing in This Filter'}</div>
          {filter === 'all' && <div style={{ marginBottom: 14 }}>Upload a batch and it lands here, timed to your Settings.</div>}
          {filter === 'all' && <Btn variant="primary" onClick={() => onNavigate('upload')}><Icon name="upload" size={14} />Upload Content</Btn>}
        </div>
      ) : groups.map(g => (
        <div key={g.key} className="cf-day">
          <div className="cf-day-head">
            <div className="cf-day-name">{relativeDay(g.first, tz)}</div>
            <div className="cf-day-meta">{g.items.length} {g.items.length === 1 ? 'post' : 'posts'}</div>
          </div>
          {g.items.map(p => (
            <div key={p.id} className="cf-row">
              <PostThumb post={p} width={52} onClick={() => setView(p)} />
              <div className="cf-row-time">{fmtTime(p.scheduled_for, tz)}</div>
              <div className="cf-row-body" onClick={() => setView(p)} style={{ cursor: 'pointer' }}>
                <div className="cf-row-caption">{p.instagram_caption || p.content_description || p.filename}</div>
                <div className="cf-row-tags"><StatusPill status={p.status} /><PostTags post={p} /></div>
              </div>
              <div className="cf-row-actions">
                {p.status === 'scheduled' && <Btn size="sm" variant="success" onClick={() => approve(p)}><Icon name="check" size={13} />Approve</Btn>}
                <Btn size="sm" variant="ghost" icon title="Open" onClick={() => setView(p)}><Icon name="eye" size={15} /></Btn>
                {!['posting', 'publishing_video'].includes(p.status) && <Btn size="sm" variant="ghost" icon title="Delete" onClick={() => remove(p)}><Icon name="trash" size={15} /></Btn>}
              </div>
            </div>
          ))}
        </div>
      ))}

      {unscheduled.length > 0 && (
        <>
          <div className="cf-section-title" style={{ marginTop: 28 }}>
            Not Scheduled Yet ({unscheduled.length})
            <span className="cf-spacer" />
            {unscheduled.some(p => p.status === 'captioned') && <Btn size="sm" variant="primary" onClick={scheduleCaptioned} disabled={busy}>Schedule {unscheduled.filter(p => p.status === 'captioned').length} Posts</Btn>}
            <Btn size="sm" variant="danger" onClick={() => clearSection(unscheduled, 'Unscheduled')} disabled={busy}><Icon name="trash" size={13} />Delete All</Btn>
          </div>
          {unscheduled.map(p => (
            <div key={p.id} className="cf-row">
              <PostThumb post={p} width={44} onClick={() => setView(p)} />
              <div className="cf-row-body"><div className="cf-row-caption" style={{ WebkitLineClamp: 1 }}>{p.instagram_caption || p.filename}</div><div className="cf-row-tags"><StatusPill status={p.status} /></div></div>
              <Btn size="sm" variant="ghost" icon title="Delete" onClick={() => remove(p)}><Icon name="trash" size={15} /></Btn>
            </div>
          ))}
        </>
      )}

      {failed.length > 0 && (
        <>
          <div className="cf-section-title" style={{ marginTop: 28, color: 'var(--red)' }}>
            Failed ({failed.length})
            <span className="cf-spacer" />
            <Btn size="sm" variant="danger" onClick={() => clearSection(failed, 'Failed')} disabled={busy}><Icon name="trash" size={13} />Delete All</Btn>
          </div>
          {failed.map(p => (
            <div key={p.id} className="cf-row" style={{ borderColor: 'rgba(248,113,113,.2)' }}>
              <PostThumb post={p} width={44} onClick={() => setView(p)} />
              <div className="cf-row-body">
                <div className="cf-row-caption" style={{ WebkitLineClamp: 1 }}>{p.instagram_caption || p.filename}</div>
                <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.error_log || 'Failed'}</div>
              </div>
              <div className="cf-row-actions">
                {p.instagram_caption && <Btn size="sm" onClick={() => retry(p)}><Icon name="refresh" size={13} />Retry</Btn>}
                <Btn size="sm" variant="ghost" icon title="Delete" onClick={() => remove(p)}><Icon name="trash" size={15} /></Btn>
              </div>
            </div>
          ))}
        </>
      )}

      {view && <PostViewer post={view} business={b} onClose={() => setView(null)} onChanged={replaceRow} />}
    </>
  );
}
