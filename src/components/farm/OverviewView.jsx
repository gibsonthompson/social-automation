'use client';

/**
 * Overview: every brand at a glance (live or paused, cadence, next post,
 * queue depth, anything needing attention) plus what publishes next.
 *
 * Path: src/components/farm/OverviewView.jsx
 */

import { useEffect, useState } from 'react';
import { Btn, Icon } from '@/components/ui';
import { describeCadence } from '@/lib/content-farm/cadence';
import { api, fmtDateTime, fmtTime, relativeDay, timeAgo, tzOf, LivePill, PostThumb, PostViewer, LoadingRows } from './shared';

function gridCols(n) {
  // Balanced rows: never leave a single card alone on the last row.
  if (n <= 1) return 1;
  if (n === 2 || n === 4) return 2;
  if (n % 3 === 1 && n % 2 === 0) return 2;
  return 3;
}

export default function OverviewView({ biz, onOpenBiz }) {
  const [upNext, setUpNext] = useState(null);
  const [view, setView] = useState(null);
  const bizById = Object.fromEntries(biz.map(b => [b.id, b]));

  useEffect(() => {
    api('/api/uploads?statuses=approved,scheduled&limit=400')
      .then(d => {
        const now = Date.now() - 6 * 3600 * 1000;
        setUpNext((d.uploads || []).filter(u => u.scheduled_for && new Date(u.scheduled_for).getTime() > now).slice(0, 10));
      })
      .catch(() => setUpNext([]));
  }, [biz.map(b => b.id).join()]);

  const totals = biz.reduce((t, b) => {
    const s = b.stats || {};
    t.approved += s.approved || 0; t.review += s.needs_review || 0; t.today += s.posted_today || 0; t.failed += s.failed || 0;
    return t;
  }, { approved: 0, review: 0, today: 0, failed: 0 });

  const cols = gridCols(biz.length);

  return (
    <>
      <div className="cf-grid cf-grid-4" style={{ marginBottom: 22 }}>
        {[
          { l: 'Posted Today', v: totals.today, c: 'var(--green)' },
          { l: 'Queued and Approved', v: totals.approved, c: 'var(--cyan)' },
          { l: 'Waiting for Review', v: totals.review, c: 'var(--orange)' },
          { l: 'Failed Posts', v: totals.failed, c: totals.failed ? 'var(--red)' : 'var(--tx-muted)' },
        ].map(s => (
          <div key={s.l} className="cf-card cf-stat">
            <div className="cf-stat-label">{s.l}</div>
            <div className="cf-stat-value" style={{ color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="cf-section-title">Brands</div>
      <div className="cf-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {biz.map(b => {
          const s = b.stats || {};
          const tz = tzOf(b);
          const cad = describeCadence(b);
          return (
            <div key={b.id} className="cf-card cf-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="cf-biz-dot" style={{ background: b.primary_color || 'var(--cyan)', width: 11, height: 11 }} />
                <div style={{ fontWeight: 650, fontSize: 15, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                <LivePill business={b} />
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--tx-muted)' }}>{cad.text}<span style={{ color: 'var(--tx-dim)' }}> · {cad.perWeek} a week</span></div>

              <div className="cf-grid cf-grid-2" style={{ gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-dim)' }}>Next Post</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{s.next_post_at ? `${relativeDay(s.next_post_at, tz)}, ${fmtTime(s.next_post_at, tz)}` : 'Nothing queued'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-dim)' }}>Last Post</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{s.last_post_at ? timeAgo(s.last_post_at) : 'Never'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-dim)' }}>Queued</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{s.approved || 0} approved{s.needs_review ? <span style={{ color: 'var(--orange)' }}>, {s.needs_review} to review</span> : ''}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-dim)' }}>Publishes To</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{b.publish_to === 'instagram' ? 'Instagram only' : b.publish_to === 'facebook' ? 'Facebook only' : 'Instagram and Facebook'}</div>
                </div>
              </div>

              {s.failed > 0 && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="alert" size={14} />{s.failed} failed {s.failed === 1 ? 'post' : 'posts'} in the queue</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <Btn size="sm" onClick={() => onOpenBiz(b.id, 'queue')}><Icon name="calendar" size={14} />Queue</Btn>
                <Btn size="sm" onClick={() => onOpenBiz(b.id, 'history')}><Icon name="history" size={14} />History</Btn>
                <Btn size="sm" variant="ghost" onClick={() => onOpenBiz(b.id, 'settings')}><Icon name="settings" size={14} />Settings</Btn>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cf-section-title" style={{ marginTop: 30 }}>Up Next Across All Brands</div>
      {upNext === null ? <LoadingRows rows={4} /> : !upNext.length ? (
        <div className="cf-empty"><div className="cf-empty-title">Nothing Queued</div>Upload a batch to fill the calendar.</div>
      ) : upNext.map(p => {
        const b = bizById[p.business_id];
        const tz = tzOf(b);
        const paused = b && b.auto_post !== true;
        return (
          <div key={p.id} className="cf-row" style={{ opacity: paused ? 0.6 : 1 }}>
            <PostThumb post={p} width={44} onClick={() => setView(p)} />
            <div style={{ width: 150, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{relativeDay(p.scheduled_for, tz)}</div>
              <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>{fmtTime(p.scheduled_for, tz)}</div>
            </div>
            <div className="cf-row-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                <span className="cf-biz-dot" style={{ background: b?.primary_color || 'var(--cyan)', width: 7, height: 7 }} />{b?.name}
                {paused && <span style={{ color: 'var(--orange)', fontWeight: 500 }}>· paused, will not publish</span>}
                {p.status === 'scheduled' && <span style={{ color: 'var(--orange)', fontWeight: 500 }}>· needs review</span>}
              </div>
              <div className="cf-row-caption" style={{ WebkitLineClamp: 1 }}>{p.instagram_caption || p.content_description || p.filename}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx-dim)', flexShrink: 0 }} title={fmtDateTime(p.scheduled_for, tz)}>{timeAgo(p.scheduled_for)}</div>
          </div>
        );
      })}

      {view && <PostViewer post={view} business={bizById[view.business_id]} onClose={() => setView(null)} actions={false} />}
    </>
  );
}
