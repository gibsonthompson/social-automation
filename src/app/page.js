'use client';

/**
 * Content Farm app shell: sidebar navigation, brand switcher with live
 * status, page header, and the screens.
 *
 * Path: src/app/page.js
 */

import { useCallback, useEffect, useState } from 'react';
import { Btn, Icon, Overlays, toast } from '@/components/ui';
import { describeCadence } from '@/lib/content-farm/cadence';
import { api, LivePill } from '@/components/farm/shared';
import OverviewView from '@/components/farm/OverviewView';
import QueueView from '@/components/farm/QueueView';
import ReviewView from '@/components/farm/ReviewView';
import UploadView from '@/components/farm/UploadView';
import HistoryView from '@/components/farm/HistoryView';
import InsightsView from '@/components/farm/InsightsView';
import SettingsView from '@/components/farm/SettingsView';

const NAV = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'queue', label: 'Queue', icon: 'calendar' },
  { id: 'review', label: 'Review', icon: 'check' },
  { id: 'upload', label: 'Upload', icon: 'upload' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const TITLES = {
  overview: 'Overview',
  queue: 'Queue',
  review: 'Review',
  upload: 'Upload Content',
  history: 'Post History',
  insights: 'Insights',
  settings: 'Posting Settings',
};

function readPref(key, fallback) {
  try { return window.localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
}

export default function ContentFarm() {
  const [page, setPageState] = useState('overview');
  const [biz, setBiz] = useState([]);
  const [bizId, setBizIdState] = useState('');
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [historyScope, setHistoryScope] = useState('all');

  const refreshBiz = useCallback(async () => {
    try {
      const d = await api('/api/businesses');
      const list = d.businesses || [];
      setBiz(list);
      setBizIdState(cur => (cur && list.some(b => b.id === cur) ? cur : (list.find(b => b.id === readPref('cf.biz', ''))?.id || list[0]?.id || '')));
      setLoadError(null);
      return list;
    } catch (e) { setLoadError(e.message); return []; }
  }, []);

  useEffect(() => {
    const saved = readPref('cf.page', 'overview');
    if (NAV.some(n => n.id === saved)) setPageState(saved);
    refreshBiz().finally(() => setReady(true));
    const t = setInterval(refreshBiz, 60000);
    return () => clearInterval(t);
  }, [refreshBiz]);

  const setPage = (p) => { setPageState(p); writePref('cf.page', p); if (p === 'history') setHistoryScope('all'); };
  const setBizId = (id) => { setBizIdState(id); writePref('cf.biz', id); };
  const openBiz = (id, p) => { setBizId(id); setPageState(p); writePref('cf.page', p); if (p === 'history') setHistoryScope(id); };

  const b = biz.find(x => x.id === bizId);
  const reviewCount = b?.stats?.needs_review || 0;
  const brandScoped = !['overview', 'history'].includes(page);

  const onSettingsSaved = async (saved) => {
    setBiz(list => list.map(x => (x.id === saved.id ? { ...x, ...saved } : x)));
    await refreshBiz();
  };

  if (!ready) {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><div className="cf-spinner" /></div>;
  }

  const subtitle = (() => {
    if (page === 'overview') return `${biz.length} brands · ${biz.filter(x => x.auto_post === true).length} live`;
    if (page === 'history') return 'Every post that went out, with captions, links and results';
    if (!b) return '';
    return `${b.name} · ${describeCadence(b).text}`;
  })();

  return (
    <div className="cf-app">
      <aside className="cf-side">
        <div className="cf-brand">
          <div className="cf-brand-mark"><Icon name="bolt" size={16} stroke={2.4} /></div>
          <div><div className="cf-brand-name">Content Farm</div><div className="cf-brand-sub">Automated Posting</div></div>
        </div>

        <nav className="cf-nav">
          {NAV.map(n => (
            <button key={n.id} className={`cf-nav-item ${page === n.id ? 'is-active' : ''}`} onClick={() => setPage(n.id)}>
              <Icon name={n.icon} size={16} />{n.label}
              {n.id === 'review' && reviewCount > 0 && <span className="cf-nav-badge">{reviewCount}</span>}
            </button>
          ))}
        </nav>

        <div className="cf-side-label">Brands</div>
        <div className="cf-bizlist">
          {biz.map(x => {
            const live = x.auto_post === true;
            return (
              <button key={x.id} className={`cf-biz ${x.id === bizId ? 'is-active' : ''}`} onClick={() => setBizId(x.id)} title={live ? 'Live' : 'Paused'}>
                <span className="cf-biz-dot" style={{ background: x.primary_color || 'var(--cyan)', boxShadow: live ? `0 0 0 3px ${(x.primary_color || '#22D3EE')}22` : 'none', opacity: live ? 1 : 0.45 }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <div className="cf-biz-name">{x.name}</div>
                  <div className="cf-biz-meta">{live ? 'Live' : 'Paused'} · {x.stats?.approved ?? 0} queued</div>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="cf-main">
        <header className="cf-header">
          <div style={{ minWidth: 0 }}>
            <h1 className="cf-title">{TITLES[page]}</h1>
            <div className="cf-subtitle">{subtitle}</div>
          </div>
          <div className="cf-header-actions">
            {brandScoped && b && <LivePill business={b} />}
            {page !== 'upload' && brandScoped && b && <Btn size="sm" variant="primary" onClick={() => setPage('upload')}><Icon name="upload" size={14} />Upload</Btn>}
            {page === 'overview' && <Btn size="sm" variant="ghost" icon onClick={() => refreshBiz().then(() => toast('Refreshed', 'success'))} title="Refresh"><Icon name="refresh" size={14} /></Btn>}
          </div>
        </header>

        <div className="cf-content" key={`${page}:${brandScoped ? bizId : ''}`}>
          {loadError && <div className="cf-banner is-danger"><Icon name="alert" size={16} /><span className="cf-banner-text">Could not load brands: {loadError}</span><Btn size="sm" onClick={refreshBiz}>Retry</Btn></div>}
          {!biz.length && !loadError && <div className="cf-empty"><div className="cf-empty-title">No Brands Yet</div>Add a row to cf_businesses to get started.</div>}

          {biz.length > 0 && (
            <>
              {page === 'overview' && <OverviewView biz={biz} onOpenBiz={openBiz} />}
              {page === 'queue' && <QueueView b={b} refreshBiz={refreshBiz} onNavigate={setPage} />}
              {page === 'review' && <ReviewView b={b} refreshBiz={refreshBiz} onNavigate={setPage} />}
              {page === 'upload' && <UploadView b={b} refreshBiz={refreshBiz} onNavigate={setPage} />}
              {page === 'history' && <HistoryView biz={biz} initialScope={historyScope} />}
              {page === 'insights' && <InsightsView b={b} />}
              {page === 'settings' && <SettingsView b={b} onSaved={onSettingsSaved} />}
            </>
          )}
        </div>
      </main>

      <Overlays />
    </div>
  );
}
