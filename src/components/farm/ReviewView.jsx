'use client';

/**
 * Review: go through posts waiting for approval one at a time, with
 * keyboard shortcuts. Decisions are staged and only applied on confirm.
 *
 * Path: src/components/farm/ReviewView.jsx
 */

import { useEffect, useRef, useState } from 'react';
import { Btn, Icon, toast } from '@/components/ui';
import { api, uploadsAction, fmtDateTime, tzOf, hashtagText, PostTags } from './shared';

const SEEK_TO = 2.5; // matches the Instagram thumb_offset

function Key({ children }) { return <kbd className="cf-kbd">{children}</kbd>; }

export default function ReviewView({ b, onNavigate, refreshBiz }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [decisions, setDecisions] = useState({});
  const [order, setOrder] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(null);
  const videoRef = useRef(null);
  const tz = tzOf(b);

  const load = async () => {
    if (!b) return;
    setLoading(true);
    try {
      const d = await api(`/api/uploads?business_id=${b.id}&status=scheduled&limit=2000`);
      setItems((d.uploads || []).sort((x, y) => new Date(x.scheduled_for) - new Date(y.scheduled_for)));
      setIdx(0); setDecisions({}); setOrder([]); setCommitted(null);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [b?.id]);

  const post = items[idx];
  const decided = Object.keys(decisions).length;
  const count = (v) => Object.values(decisions).filter(x => x === v).length;
  const approveCount = count('approve'); const rejectCount = count('reject'); const skipCount = count('skip');
  const atEnd = idx >= items.length;

  useEffect(() => { setVideoFailed(false); setPlaying(false); setEditing(false); }, [idx]);
  useEffect(() => {
    const h = (e) => { if (decided > 0 && !committed) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [decided, committed]);

  const decide = (v) => { if (!post) return; setDecisions(p => ({ ...p, [post.id]: v })); setOrder(p => [...p, post.id]); setIdx(i => i + 1); };
  const undo = () => {
    if (!order.length) return;
    const last = order[order.length - 1];
    setOrder(p => p.slice(0, -1));
    setDecisions(p => { const n = { ...p }; delete n[last]; return n; });
    const back = items.findIndex(i => i.id === last);
    if (back >= 0) setIdx(back);
  };
  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play().then(() => setPlaying(true)).catch(() => {}); else { v.pause(); setPlaying(false); } };
  const restart = () => { const v = videoRef.current; if (!v) return; v.currentTime = 0; v.play().then(() => setPlaying(true)).catch(() => {}); };

  const saveCaption = async () => {
    try {
      await uploadsAction({ action: 'update_caption', upload_id: post.id, instagram_caption: editText });
      setItems(p => p.map(x => (x.id === post.id ? { ...x, instagram_caption: editText } : x)));
      setEditing(false); toast('Caption saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (committed) return;
      if (atEnd) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } return; }
      if (editing) { if (e.key === 'Escape') setEditing(false); return; }
      if (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT') return;
      if (e.metaKey || e.ctrlKey) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } return; }
      const k = e.key.toLowerCase();
      if (k === 'arrowright' || k === 'a') { e.preventDefault(); decide('approve'); }
      else if (k === 'arrowleft' || k === 'x' || k === 'd') { e.preventDefault(); decide('reject'); }
      else if (k === 's' || k === 'arrowdown') { e.preventDefault(); decide('skip'); }
      else if (k === 'z') { e.preventDefault(); undo(); }
      else if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 'r') { e.preventDefault(); restart(); }
      else if (k === 'e' && post) { e.preventDefault(); setEditText(post.instagram_caption || ''); setEditing(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [post, editing, order, items, idx, committed, atEnd]);

  const commit = async () => {
    setCommitting(true);
    let approved = 0, deleted = 0, errors = 0;
    for (const [id, v] of Object.entries(decisions)) {
      try {
        if (v === 'approve') { await uploadsAction({ action: 'approve', upload_id: id }); approved++; }
        else if (v === 'reject') { await uploadsAction({ action: 'delete', upload_id: id }); deleted++; }
      } catch { errors++; }
    }
    setCommitting(false);
    setCommitted({ approved, deleted, skipped: skipCount, errors });
    refreshBiz?.();
  };

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}><div className="cf-spinner" /></div>;

  if (!items.length) {
    return (
      <div className="cf-empty">
        <div className="cf-empty-title">Nothing Waiting for Review</div>
        <div style={{ marginBottom: 14 }}>Posts land here after a batch is scheduled, before they are approved.</div>
        <Btn onClick={() => onNavigate('queue')}>Open Queue</Btn>
      </div>
    );
  }

  const Summary = ({ title, sub, stats, children }) => (
    <div style={{ maxWidth: 560 }}>
      <div className="cf-card cf-card-pad">
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 18 }}>{sub}</div>}
        <div className="cf-grid cf-grid-3" style={{ marginBottom: 20 }}>
          {stats.map(s => <div key={s.l} style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 800, color: s.c }}>{s.v}</div><div style={{ fontSize: 12, color: 'var(--tx-dim)' }}>{s.l}</div></div>)}
        </div>
        {children}
      </div>
    </div>
  );

  if (committed) {
    return (
      <Summary title="Review Complete" sub={b?.auto_post ? 'Approved posts publish at their scheduled times.' : 'Publishing is off for this brand, so approved posts wait until you turn it on.'}
        stats={[{ l: 'Approved', v: committed.approved, c: 'var(--green)' }, { l: 'Deleted', v: committed.deleted, c: 'var(--red)' }, { l: 'Skipped', v: committed.skipped, c: 'var(--tx-muted)' }]}>
        {committed.errors > 0 && <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>{committed.errors} actions failed. Check the queue.</div>}
        <div style={{ display: 'flex', gap: 8 }}><Btn variant="primary" onClick={() => onNavigate('queue')}>Go to Queue</Btn><Btn variant="ghost" onClick={load}>Review More</Btn></div>
      </Summary>
    );
  }

  if (atEnd) {
    return (
      <Summary title="Ready to Apply" sub="Nothing has changed yet. Confirm to apply your decisions."
        stats={[{ l: 'Approve', v: approveCount, c: 'var(--green)' }, { l: 'Delete', v: rejectCount, c: 'var(--red)' }, { l: 'Leave Alone', v: skipCount, c: 'var(--tx-muted)' }]}>
        {rejectCount > 0 && <div className="cf-banner" style={{ marginBottom: 14 }}><Icon name="alert" size={15} style={{ color: 'var(--orange)' }} /><span className="cf-banner-text">{rejectCount} {rejectCount === 1 ? 'post' : 'posts'} will be permanently deleted.</span></div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="primary" size="lg" onClick={commit} disabled={committing || decided === 0}>{committing ? 'Applying' : `Apply ${decided} Decisions`}</Btn>
          <Btn variant="ghost" size="lg" onClick={undo} disabled={!order.length}><Icon name="undo" size={14} />Undo Last</Btn>
        </div>
      </Summary>
    );
  }

  const mediaSrc = post.media_url || post.backup_url || null;
  const posterSrc = post.thumbnail_url || null;
  const nextSrc = items[idx + 1]?.media_url || null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)' }}>Post {idx + 1} of {items.length} · scheduled for {fmtDateTime(post.scheduled_for, tz)}</div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', alignItems: 'center' }}>
            <span style={{ color: 'var(--green)' }}>{approveCount} approve</span>
            <span style={{ color: 'var(--red)' }}>{rejectCount} delete</span>
            <span style={{ color: 'var(--tx-dim)' }}>{skipCount} skip</span>
            <Btn variant="ghost" size="sm" onClick={undo} disabled={!order.length}><Icon name="undo" size={13} />Undo</Btn>
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--s2)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(idx / items.length) * 100}%`, background: 'linear-gradient(90deg, var(--cyan), var(--green))', transition: 'width .25s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 300, flexShrink: 0 }}>
          <div onClick={togglePlay} style={{ aspectRatio: '9 / 16', background: '#000', borderRadius: 14, overflow: 'hidden', position: 'relative', cursor: 'pointer', border: '1px solid var(--bd-light)', boxShadow: '0 16px 40px rgba(0,0,0,.45)' }}>
            {mediaSrc && !videoFailed ? (
              <video ref={videoRef} key={post.id} src={mediaSrc} poster={posterSrc || undefined} preload="auto" playsInline
                onLoadedMetadata={e => { try { e.currentTarget.currentTime = Math.min(SEEK_TO, (e.currentTarget.duration || 5) - 0.1); } catch { /* ignore */ } }}
                onError={() => setVideoFailed(true)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : posterSrc ? <img src={posterSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="cf-thumb-empty">Preview unavailable</div>}
            {!playing && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,.2)', display: 'grid', placeItems: 'center', color: '#fff' }}><Icon name="play" size={20} /></div></div>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <Btn variant="ghost" size="sm" onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={13} />{playing ? 'Pause' : 'Play'} <Key>Space</Key></Btn>
            <Btn variant="ghost" size="sm" onClick={restart}><Icon name="refresh" size={13} />Restart <Key>R</Key></Btn>
          </div>
        </div>

        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <PostTags post={post} />
            {post.hook_strength ? <span className="cf-pill is-info">Hook {post.hook_strength}/10</span> : null}
          </div>
          <div className="cf-card" style={{ padding: 18 }}>
            {editing ? (
              <>
                <textarea className="cf-textarea" autoFocus value={editText} onChange={e => setEditText(e.target.value)} style={{ minHeight: 240 }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><Btn size="sm" variant="primary" onClick={saveCaption}>Save Caption</Btn><Btn size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel <Key>Esc</Key></Btn></div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14.5, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{post.instagram_caption || 'No caption generated'}</div>
                {post.hashtags?.length > 0 && <div style={{ fontSize: 13, color: 'var(--blue)', lineHeight: 1.6, marginTop: 12 }}>{hashtagText(post.hashtags)}</div>}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bd)' }}>
                  <Btn size="sm" variant="ghost" onClick={() => { setEditText(post.instagram_caption || ''); setEditing(true); }}><Icon name="edit" size={13} />Edit Caption <Key>E</Key></Btn>
                </div>
              </>
            )}
          </div>
          {post.facebook_caption && !editing && (
            <div className="cf-card" style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--tx-muted)', marginBottom: 6 }}>Facebook Version</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--tx-muted)', whiteSpace: 'pre-wrap' }}>{post.facebook_caption}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', paddingTop: 18, marginTop: 18, borderTop: '1px solid var(--bd)' }}>
        <button onClick={() => decide('reject')} style={{ padding: '10px 26px', borderRadius: 11, cursor: 'pointer', background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,.35)', color: 'var(--red)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Delete</span><span style={{ fontSize: 10.5, opacity: .75 }}>Left or X</span>
        </button>
        <button onClick={() => decide('skip')} style={{ padding: '10px 24px', borderRadius: 11, cursor: 'pointer', background: 'var(--s2)', border: '1px solid var(--bd-light)', color: 'var(--tx-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Skip</span><span style={{ fontSize: 10.5, opacity: .75 }}>S</span>
        </button>
        <button onClick={() => decide('approve')} style={{ padding: '10px 36px', borderRadius: 11, cursor: 'pointer', background: 'var(--green-dim)', border: '1px solid rgba(52,211,153,.45)', color: 'var(--green)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Approve</span><span style={{ fontSize: 10.5, opacity: .75 }}>Right or A</span>
        </button>
      </div>

      {nextSrc && <video src={nextSrc} preload="metadata" style={{ display: 'none' }} />}
    </div>
  );
}
