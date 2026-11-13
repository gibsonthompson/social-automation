'use client';

/**
 * History: every post that has gone out (or failed), with thumbnail,
 * caption, where it went and how it performed. Filter by brand, status,
 * media type, search text; sort by newest, oldest or best performing.
 *
 * Path: src/components/farm/HistoryView.jsx
 */

import { useEffect, useRef, useState } from 'react';
import { Btn, Icon, Select, Segmented, toast } from '@/components/ui';
import { api, compact, fmtDate, fmtTime, tzOf, StatusPill, PostTags, PostThumb, PostViewer, previewSrc, isVideo, LoadingRows } from './shared';

const PAGE = 36;

function Metrics({ m }) {
  if (!m) return <div className="cf-metrics" style={{ color: 'var(--tx-dim)' }}>No metrics yet</div>;
  return (
    <div className="cf-metrics">
      <span className="cf-metric" title="Views"><Icon name="eye" size={13} />{compact(m.views)}</span>
      <span className="cf-metric" title="Likes"><Icon name="heart" size={13} />{compact(m.likes)}</span>
      <span className="cf-metric" title="Comments"><Icon name="message" size={13} />{compact(m.comments)}</span>
      <span className="cf-metric" title="Shares"><Icon name="share" size={13} />{compact(m.shares)}</span>
      <span className="cf-metric" title="Saves"><Icon name="bookmark" size={13} />{compact(m.saves)}</span>
    </div>
  );
}

function PlatformLinks({ p }) {
  const stop = (e) => e.stopPropagation();
  return (
    <div className="cf-links">
      {p.links?.instagram && <a href={p.links.instagram} target="_blank" rel="noopener noreferrer" onClick={stop} title="Open on Instagram"><Btn size="sm" variant="ghost" icon><Icon name="instagram" size={15} /></Btn></a>}
      {p.links?.facebook && <a href={p.links.facebook} target="_blank" rel="noopener noreferrer" onClick={stop} title="Open on Facebook"><Btn size="sm" variant="ghost" icon><Icon name="facebook" size={15} /></Btn></a>}
      {p.fb_error && <span title={`Facebook failed: ${p.fb_error}`} style={{ color: 'var(--red)', display: 'grid', placeItems: 'center', width: 30 }}><Icon name="alert" size={15} /></span>}
    </div>
  );
}

function Tile({ p, biz, onOpen }) {
  const [broken, setBroken] = useState(false);
  const tz = tzOf(biz);
  const src = previewSrc(p);
  const when = p.posted_at || p.updated_at;
  return (
    <div className="cf-card cf-tile" onClick={onOpen}>
      <div className="cf-tile-media">
        {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <div className="cf-thumb-empty"><Icon name={isVideo(p) ? 'play' : 'image'} size={22} /></div>}
        <div className="cf-tile-top">
          <span className="cf-tile-chip"><span className="cf-biz-dot" style={{ background: biz?.primary_color || 'var(--cyan)', width: 7, height: 7 }} />{biz?.name}</span>
          {isVideo(p) && <span className="cf-tile-chip"><Icon name="play" size={10} />Reel</span>}
        </div>
        {p.status === 'failed' && <div style={{ position: 'absolute', bottom: 8, left: 8 }}><StatusPill status="failed" /></div>}
        {p.metrics?.score != null && <div style={{ position: 'absolute', bottom: 8, right: 8 }} className="cf-tile-chip" title="Composite score">Score {Math.round(p.metrics.score)}</div>}
      </div>
      <div className="cf-tile-body">
        <div style={{ fontSize: 12, color: 'var(--tx-dim)' }}>{fmtDate(when, tz)} · {fmtTime(when, tz)}</div>
        <div className="cf-tile-caption">{p.instagram_caption || p.content_description || p.filename}</div>
        <Metrics m={p.metrics} />
        <PlatformLinks p={p} />
      </div>
    </div>
  );
}

export default function HistoryView({ biz, initialScope = 'all' }) {
  const [scope, setScope] = useState(initialScope);
  const [status, setStatus] = useState('posted');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [layout, setLayout] = useState('grid');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [posts, setPosts] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState(null);
  const reqId = useRef(0);
  const bizById = Object.fromEntries(biz.map(b => [b.id, b]));

  useEffect(() => { setScope(initialScope); }, [initialScope]);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const fetchPage = async (n, append) => {
    const id = ++reqId.current;
    const params = new URLSearchParams({ business_id: scope, status, type, sort, page: String(n), limit: String(PAGE) });
    if (debounced) params.set('q', debounced);
    try {
      const d = await api(`/api/history?${params}`);
      if (id !== reqId.current) return;
      setPosts(prev => (append ? [...(prev || []), ...d.posts] : d.posts));
      setTotal(d.total); setPage(d.page); setPages(d.pages);
    } catch (e) {
      if (id === reqId.current) { toast(e.message, 'error'); if (!append) setPosts([]); }
    }
  };

  useEffect(() => { setPosts(null); fetchPage(1, false); }, [scope, status, type, sort, debounced]);

  const more = async () => { setLoadingMore(true); await fetchPage(page + 1, true); setLoadingMore(false); };

  const scopeOptions = [{ value: 'all', label: 'All Brands' }, ...biz.map(b => ({ value: b.id, label: b.name, dot: b.primary_color || 'var(--cyan)' }))];

  return (
    <>
      <div className="cf-toolbar">
        <Select value={scope} onChange={setScope} options={scopeOptions} width={210} />
        <Segmented value={status} onChange={setStatus} options={[{ value: 'posted', label: 'Posted' }, { value: 'failed', label: 'Failed' }, { value: 'all', label: 'Both' }]} />
        <Segmented value={type} onChange={setType} options={[{ value: 'all', label: 'All Media' }, { value: 'video', label: 'Reels' }, { value: 'image', label: 'Images' }]} />
        <Select value={sort} onChange={setSort} width={170} options={[{ value: 'newest', label: 'Newest First' }, { value: 'oldest', label: 'Oldest First' }, { value: 'top', label: 'Best Performing' }]} />
        <div className="cf-search"><Icon name="search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search captions and files" />{q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', display: 'grid' }}><Icon name="x" size={13} /></button>}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: 'var(--tx-muted)' }}>
          {posts === null ? 'Loading' : `${total.toLocaleString()} ${total === 1 ? 'post' : 'posts'}${posts.length < total ? `, showing ${posts.length}` : ''}`}
        </div>
        <Segmented value={layout} onChange={setLayout} options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]} />
      </div>

      {posts === null ? (
        layout === 'grid'
          ? <div className="cf-tiles">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="cf-skeleton" style={{ aspectRatio: '4 / 6.4' }} />)}</div>
          : <LoadingRows rows={6} />
      ) : !posts.length ? (
        <div className="cf-empty"><div className="cf-empty-title">No Posts Match</div>Try a different brand, filter or search.</div>
      ) : layout === 'grid' ? (
        <div className="cf-tiles">
          {posts.map(p => <Tile key={p.id} p={p} biz={bizById[p.business_id]} onOpen={() => setView(p)} />)}
        </div>
      ) : (
        <div>
          {posts.map(p => {
            const b = bizById[p.business_id];
            const tz = tzOf(b);
            const when = p.posted_at || p.updated_at;
            return (
              <div key={p.id} className="cf-row" style={{ cursor: 'pointer' }} onClick={() => setView(p)}>
                <PostThumb post={p} width={52} />
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(when, tz, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>{fmtTime(when, tz)}</div>
                </div>
                <div className="cf-row-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                    <span className="cf-biz-dot" style={{ background: b?.primary_color || 'var(--cyan)', width: 7, height: 7 }} />{b?.name}
                  </div>
                  <div className="cf-row-caption" style={{ WebkitLineClamp: 1 }}>{p.instagram_caption || p.filename}</div>
                  <div className="cf-row-tags">{p.status === 'failed' && <StatusPill status="failed" />}<PostTags post={p} /></div>
                </div>
                <div style={{ width: 290, flexShrink: 0 }}><Metrics m={p.metrics} /></div>
                <PlatformLinks p={p} />
              </div>
            );
          })}
        </div>
      )}

      {posts && page < pages && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
          <Btn onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading' : `Load ${Math.min(PAGE, total - posts.length)} More`}</Btn>
        </div>
      )}

      {view && <PostViewer post={view} business={bizById[view.business_id]} onClose={() => setView(null)} actions={false} />}
    </>
  );
}
