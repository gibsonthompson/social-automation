'use client';

/**
 * Insights: the weekly AI analysis and the best performing posts.
 *
 * Path: src/components/farm/InsightsView.jsx
 */

import { useEffect, useState } from 'react';
import { Icon, Tag, toast } from '@/components/ui';
import { api, compact, PILLAR_COLOR } from './shared';

export default function InsightsView({ b }) {
  const [data, setData] = useState(null);
  const [postedTotal, setPostedTotal] = useState(null);

  useEffect(() => {
    if (!b) return;
    setData(null);
    Promise.all([
      api(`/api/insights?business_id=${b.id}`),
      api(`/api/history?business_id=${b.id}&status=posted&limit=1`),
    ]).then(([ins, hist]) => { setData(ins); setPostedTotal(hist.total); })
      .catch(e => { toast(e.message, 'error'); setData({}); });
  }, [b?.id]);

  if (!b) return null;
  if (!data) return <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}><div className="cf-spinner" /></div>;

  const a = data.analysis;
  const top = data.topPosts || [];
  const perf = data.performance || [];
  const avg = (k) => (perf.length ? perf.reduce((s, p) => s + (Number(p[k]) || 0), 0) / perf.length : 0);
  const er = avg('engagement_rate');
  const trendTone = a?.engagement_trend === 'improving' ? 'is-live' : a?.engagement_trend === 'declining' ? 'is-danger' : 'is-paused';

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="cf-grid cf-grid-4" style={{ marginBottom: 18 }}>
        {[
          { l: 'Total Posted', v: postedTotal ?? 0 },
          { l: 'Avg Reach, 7 Days', v: compact(Math.round(avg('reach'))) },
          { l: 'Avg Engagement Rate', v: `${(er < 1 ? er * 100 : er).toFixed(1)}%` },
          { l: 'Avg Score', v: Math.round(avg('composite_score')) },
        ].map(s => <div key={s.l} className="cf-card cf-stat"><div className="cf-stat-label">{s.l}</div><div className="cf-stat-value">{s.v}</div></div>)}
      </div>

      {!a ? (
        <div className="cf-empty">
          <div className="cf-empty-title">No Analysis Yet</div>
          The learning system needs 5 or more published posts with 7 days of metrics. It runs automatically every Sunday.
        </div>
      ) : (
        <>
          <div className="cf-card cf-card-pad" style={{ marginBottom: 14 }}>
            <div className="cf-card-head">
              <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="sparkle" size={15} style={{ color: 'var(--cyan)' }} />Weekly Analysis</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {a.engagement_trend && <span className={`cf-pill ${trendTone}`}>{a.engagement_trend}</span>}
                <span style={{ fontSize: 12, color: 'var(--tx-dim)' }}>{new Date(a.analyzed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.65 }}>{a.summary}</div>
          </div>

          <div className="cf-grid cf-grid-2" style={{ marginBottom: 14 }}>
            <div className="cf-card cf-card-pad">
              <div className="cf-card-title" style={{ marginBottom: 12, color: 'var(--green)' }}>Double Down</div>
              {(a.double_down || []).map((t, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid var(--green)' }}>{t}</div>)}
            </div>
            <div className="cf-card cf-card-pad">
              <div className="cf-card-title" style={{ marginBottom: 12, color: 'var(--red)' }}>Stop Doing</div>
              {(a.avoid || []).map((t, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid var(--red)' }}>{t}</div>)}
            </div>
          </div>

          {(a.recommendations || []).length > 0 && (
            <div className="cf-card cf-card-pad" style={{ marginBottom: 14 }}>
              <div className="cf-card-title" style={{ marginBottom: 12 }}>Recommendations</div>
              {a.recommendations.map((r, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8, padding: '10px 12px', background: 'var(--s2)', borderRadius: 9, borderLeft: '3px solid var(--cyan)' }}>{r}</div>)}
            </div>
          )}
        </>
      )}

      {top.length > 0 && (
        <div className="cf-card cf-card-pad" style={{ marginTop: 14 }}>
          <div className="cf-card-title" style={{ marginBottom: 12 }}>Top Performing Posts</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Hook', 'Pillar', 'Type', 'Score', 'Reach', 'Shares', 'Saves'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--tx-dim)', fontWeight: 600, borderBottom: '1px solid var(--bd)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {top.slice(0, 10).map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                    <td style={{ padding: '9px 10px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tx-muted)' }}>{p.hook_text || 'No hook text'}</td>
                    <td style={{ padding: '9px 10px' }}>{p.content_pillar && <Tag color={PILLAR_COLOR[p.content_pillar] || 'var(--tx-muted)'}>{p.content_pillar}</Tag>}</td>
                    <td style={{ padding: '9px 10px' }}>{p.content_type && <Tag>{String(p.content_type).replace(/_/g, ' ')}</Tag>}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--cyan)', fontWeight: 700 }}>{p.composite_score != null ? Math.round(p.composite_score) : ''}</td>
                    <td style={{ padding: '9px 10px', fontVariantNumeric: 'tabular-nums' }}>{compact(p.reach || 0)}</td>
                    <td style={{ padding: '9px 10px', fontVariantNumeric: 'tabular-nums' }}>{compact(p.shares || 0)}</td>
                    <td style={{ padding: '9px 10px', fontVariantNumeric: 'tabular-nums' }}>{compact(p.saves || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
