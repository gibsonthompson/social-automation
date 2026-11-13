'use client';

/**
 * Shared pieces for the Content Farm screens: API helpers, date formatting
 * in each brand's own timezone, status labels, thumbnails and the post
 * viewer used by Queue, Review and History.
 *
 * Path: src/components/farm/shared.jsx
 */

import { useEffect, useRef, useState } from 'react';
import { Btn, Icon, Tag, toast } from '@/components/ui';
import { DEFAULT_TIMEZONE } from '@/lib/content-farm/cadence';

// ── API ─────────────────────────────────────────────────────────

export async function api(path, body) {
  const opts = body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' };
  const r = await fetch(path, opts);
  let data = {};
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok || data.error) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

export const uploadsAction = (body) => api('/api/uploads', body);

// ── Formatting ──────────────────────────────────────────────────

export const tzOf = (b) => b?.timezone || DEFAULT_TIMEZONE;

export function fmtTime(iso, tz) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(iso, tz, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: tz, ...opts });
}

export function fmtDateTime(iso, tz) {
  if (!iso) return '';
  return `${fmtDate(iso, tz)}, ${fmtTime(iso, tz)}`;
}

export function localDateKey(iso, tz) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
}

export function relativeDay(iso, tz) {
  const key = localDateKey(iso, tz);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: tz });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: tz });
  if (key === today) return 'Today';
  if (key === tomorrow) return 'Tomorrow';
  if (key === yesterday) return 'Yesterday';
  return fmtDate(iso, tz, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const fut = s < 0; const a = Math.abs(s);
  const unit = a < 60 ? [a, 'sec'] : a < 3600 ? [Math.round(a / 60), 'min'] : a < 86400 ? [Math.round(a / 3600), 'hr'] : [Math.round(a / 86400), 'day'];
  const label = `${unit[0]} ${unit[1]}${unit[0] === 1 || unit[1] === 'sec' || unit[1] === 'min' ? '' : 's'}`;
  return fut ? `in ${label}` : `${label} ago`;
}

export function compact(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export const hashtagText = (tags) => (tags || []).map(h => (String(h).startsWith('#') ? h : `#${h}`)).join(' ');

// ── Status ──────────────────────────────────────────────────────

export const STATUS_META = {
  uploaded: { label: 'Uploaded', tone: 'neutral' },
  analyzing: { label: 'Analyzing', tone: 'info' },
  captioned: { label: 'Captioned', tone: 'info' },
  scheduled: { label: 'Needs Review', tone: 'paused' },
  approved: { label: 'Approved', tone: 'live' },
  posting: { label: 'Publishing', tone: 'info' },
  publishing_video: { label: 'Publishing', tone: 'info' },
  posted: { label: 'Posted', tone: 'live' },
  failed: { label: 'Failed', tone: 'danger' },
};

export function StatusPill({ status }) {
  const m = STATUS_META[status] || { label: status, tone: 'neutral' };
  return <span className={`cf-pill is-${m.tone}`}>{m.label}</span>;
}

export function LivePill({ business }) {
  const on = business?.auto_post === true;
  return (
    <span className={`cf-pill ${on ? 'is-live' : 'is-paused'}`} title={on ? 'Approved posts publish on schedule' : 'Nothing publishes until Publishing is turned on in Settings'}>
      <span className="cf-pill-dot" />{on ? 'Live' : 'Paused'}
    </span>
  );
}

export const PILLAR_COLOR = { educate: '#60A5FA', engage: '#A78BFA', inspire: '#34D399', promote: '#FBBF24' };

export function PostTags({ post }) {
  return (
    <>
      {post.content_pillar && <Tag color={PILLAR_COLOR[post.content_pillar] || 'var(--tx-muted)'}>{post.content_pillar}</Tag>}
      {post.content_type && <Tag>{String(post.content_type).replace(/_/g, ' ')}</Tag>}
    </>
  );
}

// ── Media ───────────────────────────────────────────────────────

export const isVideo = (p) => !!p?.media_type?.includes('video');
export const previewSrc = (p) => (isVideo(p) ? p?.thumbnail_url || null : p?.thumbnail_url || p?.media_url || p?.backup_url || null);

export function PostThumb({ post, width = 56, onClick }) {
  const [broken, setBroken] = useState(false);
  const src = previewSrc(post);
  return (
    <div className="cf-thumb" style={{ width, height: Math.round(width * 1.25) }} onClick={onClick} title="Open">
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : (
        <div className="cf-thumb-empty"><Icon name={isVideo(post) ? 'play' : 'image'} size={16} /></div>
      )}
      {isVideo(post) && src && !broken && <div className="cf-thumb-play"><Icon name="play" size={Math.max(12, width / 4)} /></div>}
    </div>
  );
}

// ── Post viewer (player, captions, metrics, links, actions) ─────

export function PostViewer({ post, business, onClose, onChanged, actions = true }) {
  const candidates = [post?.media_url, post?.backup_url].filter(Boolean);
  const [srcIdx, setSrcIdx] = useState(0);
  const [state, setState] = useState('loading');
  const [muted, setMuted] = useState(true);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post?.instagram_caption || '');
  const [fbText, setFbText] = useState(post?.facebook_caption || '');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const tz = tzOf(business);
  const vid = isVideo(post);
  const poster = post?.thumbnail_url || null;
  const src = candidates[srcIdx] || null;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !editing) onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, editing]);

  useEffect(() => { setSrcIdx(0); setState('loading'); setMuted(true); setEditing(false); setText(post?.instagram_caption || ''); setFbText(post?.facebook_caption || ''); }, [post?.id]);

  if (!post) return null;

  const onErr = () => { if (srcIdx < candidates.length - 1) { setSrcIdx(i => i + 1); setState('loading'); } else setState('error'); };
  const onReady = () => { setState('ready'); videoRef.current?.play().catch(() => {}); };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); if (!v.muted && v.paused) v.play().catch(() => {}); };

  const save = async () => {
    setBusy(true);
    try {
      await uploadsAction({ action: 'update_caption', upload_id: post.id, instagram_caption: text, facebook_caption: fbText });
      toast('Caption saved', 'success');
      setEditing(false);
      onChanged?.({ ...post, instagram_caption: text, facebook_caption: fbText, caption_edited: true });
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const editable = ['scheduled', 'approved', 'captioned', 'failed'].includes(post.status);
  const when = post.status === 'posted' ? post.posted_at : post.scheduled_for;
  const m = post.metrics;
  const links = post.links || {
    instagram: post.ig_permalink || null,
    facebook: post.fb_post_id ? `https://www.facebook.com/${post.fb_post_id}` : null,
  };

  return (
    <div className="cf-overlay" onClick={onClose}>
      <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 18, right: 20, width: 36, height: 36, borderRadius: 10, background: 'var(--s2)', border: '1px solid var(--bd-light)', cursor: 'pointer', display: 'grid', placeItems: 'center', zIndex: 2 }}>
        <Icon name="x" size={16} />
      </button>

      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 24, alignItems: 'stretch', maxWidth: 1080, width: '100%', maxHeight: '100%', flexWrap: 'wrap', justifyContent: 'center', overflowY: 'auto' }}>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ height: 'min(78vh, 720px)', aspectRatio: '9 / 16', background: '#000', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--bd-light)', boxShadow: '0 30px 80px rgba(0,0,0,.6)', position: 'relative' }}>
            {vid && src && state !== 'error' ? (
              <>
                <video ref={videoRef} key={src} src={src} poster={poster || undefined} controls muted={muted} autoPlay playsInline preload="auto"
                  onLoadedData={onReady} onCanPlay={onReady} onError={onErr}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }} />
                {state === 'loading' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><div className="cf-spinner" /></div>}
              </>
            ) : vid && state === 'error' ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 22, textAlign: 'center' }}>
                {poster && <img src={poster} alt="" style={{ maxWidth: '72%', borderRadius: 10, opacity: .55 }} />}
                <div style={{ fontSize: 13, color: 'var(--tx-muted)' }}>The video file is no longer on the media server.</div>
                <div style={{ fontSize: 12, color: 'var(--tx-dim)' }}>{links.instagram ? 'You can still watch it on Instagram.' : 'The post record, caption and metrics are intact.'}</div>
                {links.instagram && <a href={links.instagram} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>Open on Instagram</a>}
              </div>
            ) : (
              <img src={poster || post.media_url || post.backup_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}
          </div>
          {vid && state === 'ready' && (
            <Btn size="sm" variant="ghost" onClick={toggleMute}><Icon name={muted ? 'mute' : 'volume'} size={14} />{muted ? 'Tap for Sound' : 'Sound On'}</Btn>
          )}
        </div>

        <div style={{ flex: '1 1 360px', minWidth: 300, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {business && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}><span className="cf-biz-dot" style={{ background: business.primary_color || 'var(--cyan)' }} />{business.name}</span>}
            <StatusPill status={post.status} />
            <PostTags post={post} />
          </div>
          {when && <div style={{ fontSize: 12.5, color: 'var(--tx-muted)' }}>{post.status === 'posted' ? 'Posted' : 'Scheduled for'} {fmtDateTime(when, tz)}</div>}

          {(links.instagram || links.facebook || post.fb_error || post.error_log) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {links.instagram && <a href={links.instagram} target="_blank" rel="noopener noreferrer"><Btn size="sm"><Icon name="instagram" size={14} />Instagram<Icon name="external" size={12} /></Btn></a>}
              {links.facebook && <a href={links.facebook} target="_blank" rel="noopener noreferrer"><Btn size="sm"><Icon name="facebook" size={14} />Facebook<Icon name="external" size={12} /></Btn></a>}
            </div>
          )}
          {post.fb_error && <div className="cf-banner is-danger" style={{ marginBottom: 0 }}><Icon name="alert" size={15} /><span className="cf-banner-text">Facebook: {post.fb_error}</span></div>}
          {post.status === 'failed' && post.error_log && <div className="cf-banner is-danger" style={{ marginBottom: 0 }}><Icon name="alert" size={15} /><span className="cf-banner-text">{post.error_log}</span></div>}

          {m && (
            <div className="cf-card" style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--tx-muted)', marginBottom: 10 }}>Performance after {m.window}</div>
              <div className="cf-grid cf-grid-3" style={{ gap: 10 }}>
                {[['Views', m.views], ['Reach', m.reach], ['Likes', m.likes], ['Comments', m.comments], ['Shares', m.shares], ['Saves', m.saves]].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: 11.5, color: 'var(--tx-dim)' }}>{l}</div><div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v == null ? '0' : compact(v)}</div></div>
                ))}
              </div>
            </div>
          )}

          <div className="cf-card" style={{ padding: 16 }}>
            {editing ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--tx-muted)', marginBottom: 6 }}>Instagram Caption</div>
                <textarea className="cf-textarea" autoFocus value={text} onChange={e => setText(e.target.value)} />
                <div style={{ fontSize: 12, color: 'var(--tx-muted)', margin: '12px 0 6px' }}>Facebook Caption</div>
                <textarea className="cf-textarea" style={{ minHeight: 110 }} value={fbText} onChange={e => setFbText(e.target.value)} placeholder="Leave empty to reuse the Instagram caption" />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <Btn variant="primary" size="sm" onClick={save} disabled={busy}>{busy ? 'Saving' : 'Save Caption'}</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{post.instagram_caption || <span style={{ color: 'var(--tx-dim)' }}>No caption</span>}</div>
                {post.hashtags?.length > 0 && <div style={{ fontSize: 13, color: 'var(--blue)', lineHeight: 1.6, marginTop: 12 }}>{hashtagText(post.hashtags)}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bd)', flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(`${post.instagram_caption || ''}${post.hashtags?.length ? `\n\n${hashtagText(post.hashtags)}` : ''}`); toast('Caption copied', 'success'); }}><Icon name="copy" size={13} />Copy</Btn>
                  {actions && editable && <Btn size="sm" variant="ghost" onClick={() => setEditing(true)}><Icon name="edit" size={13} />Edit</Btn>}
                  {src && <a href={src} target="_blank" rel="noopener noreferrer"><Btn size="sm" variant="ghost"><Icon name="download" size={13} />Media File</Btn></a>}
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

          {post.content_description && (
            <div style={{ fontSize: 12, color: 'var(--tx-dim)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--tx-muted)', fontWeight: 600 }}>What the AI saw: </span>{post.content_description}
            </div>
          )}
          {post.filename && <div style={{ fontSize: 11.5, color: 'var(--tx-dim)' }}>{post.filename}</div>}
        </div>
      </div>
    </div>
  );
}

export function LoadingRows({ rows = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="cf-skeleton" style={{ height: 82, marginBottom: 8 }} />)}
    </div>
  );
}
