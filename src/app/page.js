'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DEFAULT_BUSINESSES } from '@/lib/businesses';
import { TEMPLATES, W, H } from '@/lib/templates';
import { Btn, Input, Select, Tag, FieldLabel, Icon } from '@/components/ui';

// ── Persist helpers (localStorage) ──────────────────────────────────
function lsGet(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, val) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch { /* quota exceeded, silently fail */ }
}

// ── Main App ────────────────────────────────────────────────────────
export default function ContentFarm() {
  const [page, setPage] = useState('generate');
  const [businesses, setBusinesses] = useState([]);
  const [photos, setPhotos] = useState({}); // { bizId: [{ data, filename, category, mood }] }
  const [library, setLibrary] = useState([]);
  const [ready, setReady] = useState(false);

  // Load persisted data
  useEffect(() => {
    setBusinesses(lsGet('cf_businesses', DEFAULT_BUSINESSES));
    setLibrary(lsGet('cf_library', []));
    setReady(true);
  }, []);

  // Save businesses on change
  useEffect(() => {
    if (ready) lsSet('cf_businesses', businesses);
  }, [businesses, ready]);

  // Save library metadata (strip image_data to save space)
  useEffect(() => {
    if (ready) {
      const meta = library.map(({ image_data, ...rest }) => rest);
      lsSet('cf_library', meta);
    }
  }, [library, ready]);

  const addToLibrary = useCallback((items) => {
    const arr = Array.isArray(items) ? items : [items];
    setLibrary((prev) => [...arr, ...prev]);
  }, []);

  const totalPhotos = Object.values(photos).reduce((a, b) => a + b.length, 0);

  const navItems = [
    { id: 'generate', label: 'Generate', icon: 'bolt' },
    { id: 'businesses', label: 'Businesses', icon: 'briefcase' },
    { id: 'photos', label: 'Photo Bank', icon: 'image' },
    { id: 'library', label: 'Library', icon: 'folder' },
  ];

  if (!ready) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── Sidebar ── */}
      <div
        style={{
          width: 200,
          borderRight: '1px solid var(--bd)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          background: 'var(--bg)',
        }}
      >
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', color: 'var(--gold)' }}>
            CONTENT FARM
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginTop: 2, fontWeight: 600, letterSpacing: '.06em' }}>
            MULTI-BRAND ENGINE
          </div>
        </div>

        <nav style={{ padding: '8px 6px', flex: 1 }}>
          {navItems.map((n) => {
            const active = page === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '9px 10px',
                  border: 'none',
                  background: active ? 'var(--s1)' : 'transparent',
                  color: active ? 'var(--tx)' : 'var(--tx-muted)',
                  borderRadius: 7,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  fontFamily: 'inherit',
                  marginBottom: 1,
                }}
              >
                <span style={{ opacity: active ? 1 : 0.4 }}>
                  <Icon name={n.icon} size={16} />
                </span>
                {n.label}
              </button>
            );
          })}
        </nav>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--bd)',
            fontSize: 10,
            color: 'var(--tx-dim)',
          }}
        >
          {businesses.length} businesses / {totalPhotos} photos
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {page === 'generate' && (
          <GeneratePage businesses={businesses} photos={photos} addToLibrary={addToLibrary} />
        )}
        {page === 'businesses' && (
          <BusinessesPage businesses={businesses} setBusinesses={setBusinesses} />
        )}
        {page === 'photos' && (
          <PhotoBankPage businesses={businesses} photos={photos} setPhotos={setPhotos} />
        )}
        {page === 'library' && (
          <LibraryPage library={library} businesses={businesses} setLibrary={setLibrary} />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// GENERATE PAGE — BATCH MODE (12 posts per generation)
// ══════════════════════════════════════════════════════════════════════
function GeneratePage({ businesses, photos, addToLibrary }) {
  const [bizId, setBizId] = useState(businesses[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 12 });
  const [batch, setBatch] = useState([]); // array of { success, result, planItem, imageData, selected }
  const [error, setError] = useState(null);
  const [allCopied, setAllCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef(null);

  const biz = businesses.find((b) => b.id === bizId);
  const bizPhotos = photos[bizId] || [];

  // ── Generate batch ──────────────────────────────────────────────
  const generateBatch = async () => {
    if (!biz) return;
    setLoading(true);
    setError(null);
    setBatch([]);
    setProgress({ done: 0, total: 12 });

    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: biz, mode: 'batch' }),
      });

      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      const items = (data.results || []).map((r, idx) => ({
        ...r,
        imageData: null,
        selected: r.success,
        id: `${Date.now()}-${idx}`,
      }));

      setBatch(items);
      setProgress({ done: data.summary?.success || 0, total: 12 });

      // Render all successful items to canvas
      await renderAllImages(items, biz);
    } catch (e) {
      setError(e.message || 'Batch generation failed');
    }

    setLoading(false);
  };

  // ── Render all images sequentially ──────────────────────────────
  const renderAllImages = async (items, bizData) => {
    setRendering(true);
    const canvas = canvasRef.current;
    if (!canvas) { setRendering(false); return; }
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const updated = [...items];

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      if (!item.success || !item.result) continue;

      ctx.clearRect(0, 0, W, H);

      // Assign a photo for photo_feature and service_spotlight templates
      let photo = null;
      if (
        (item.result.template === 'photo_feature' || item.result.template === 'service_spotlight') &&
        bizPhotos.length > 0
      ) {
        photo = bizPhotos[i % bizPhotos.length].data;
      }

      const tpl = TEMPLATES[item.result.template];
      if (tpl) {
        try {
          await tpl.render(ctx, bizData, item.result, photo);
          updated[i] = { ...updated[i], imageData: canvas.toDataURL('image/png') };
        } catch (e) {
          console.error(`Render failed for item ${i}:`, e);
        }
      }
    }

    setBatch(updated);
    setRendering(false);
  };

  // ── Toggle selection ────────────────────────────────────────────
  const toggleSelect = (idx) => {
    setBatch((prev) => prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item)));
  };

  const selectAll = () => setBatch((prev) => prev.map((item) => ({ ...item, selected: item.success })));
  const deselectAll = () => setBatch((prev) => prev.map((item) => ({ ...item, selected: false })));

  // ── Download single ─────────────────────────────────────────────
  const downloadOne = (item, idx) => {
    if (!item.imageData) return;
    const a = document.createElement('a');
    a.href = item.imageData;
    a.download = `${biz?.slug || 'post'}-${idx + 1}-${item.result?.content_type || 'post'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Download all selected as zip ────────────────────────────────
  const downloadAllZip = async () => {
    const selected = batch.filter((item) => item.selected && item.imageData);
    if (selected.length === 0) return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    selected.forEach((item, idx) => {
      const base64 = item.imageData.split(',')[1];
      const filename = `${biz?.slug || 'post'}-${idx + 1}-${item.result?.content_type || 'post'}.png`;
      zip.file(filename, base64, { base64: true });
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${biz?.slug || 'content'}-batch-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Copy all captions ───────────────────────────────────────────
  const copyAllCaptions = () => {
    const selected = batch.filter((item) => item.selected && item.success);
    if (selected.length === 0) return;

    const text = selected
      .map((item, idx) => {
        const r = item.result;
        return `--- POST ${idx + 1} (${r.content_type}) ---\n\n${r.caption}\n\n${(r.hashtags || []).map((h) => '#' + h).join(' ')}`;
      })
      .join('\n\n\n');

    navigator.clipboard.writeText(text).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    });
  };

  // ── Save selected to library ────────────────────────────────────
  const saveSelectedToLibrary = () => {
    const selected = batch.filter((item) => item.selected && item.success && item.imageData);
    if (selected.length === 0) return;

    const items = selected.map((item) => ({
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 6),
      biz_id: bizId,
      biz_name: biz?.name || '',
      tpl: item.result.template,
      content: item.result,
      image_data: item.imageData,
      created: new Date().toISOString(),
    }));

    addToLibrary(items);
  };

  const selectedCount = batch.filter((item) => item.selected).length;
  const successCount = batch.filter((item) => item.success).length;

  return (
    <div style={{ padding: 28 }}>
      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>Generate Content</h1>
        <p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>
          Generates 12 unique posts per batch with varied templates, content types, and angles.
        </p>
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <Select
            label="Business"
            value={bizId}
            onChange={(v) => { setBizId(v); setBatch([]); }}
            options={businesses.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
        <Btn variant="primary" size="lg" onClick={generateBatch} disabled={loading || !biz}>
          {loading ? `Generating... (${progress.done}/12)` : 'Generate 12 Posts'}
        </Btn>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          padding: '12px 18px',
          background: 'rgba(231,74,74,0.08)',
          border: '1px solid rgba(231,74,74,0.2)',
          borderRadius: 10,
          color: 'var(--red)',
          fontSize: 13,
          marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{
            width: 36, height: 36,
            border: '3px solid var(--bd)',
            borderTop: '3px solid var(--gold)',
            borderRadius: '50%',
            animation: 'spin .7s linear infinite',
            margin: '0 auto 16px',
          }} />
          <div style={{ fontSize: 14, color: 'var(--tx-muted)', fontWeight: 500 }}>
            Generating 12 posts for {biz?.name}...
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 6 }}>
            Running 12 parallel AI calls. This takes about 10-15 seconds.
          </div>
        </div>
      )}

      {/* ── Rendering indicator ── */}
      {rendering && !loading && (
        <div style={{
          padding: '12px 18px',
          background: 'rgba(201,164,76,0.08)',
          border: '1px solid rgba(201,164,76,0.2)',
          borderRadius: 10,
          color: 'var(--gold)',
          fontSize: 13,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 16, height: 16,
            border: '2px solid var(--bd)',
            borderTop: '2px solid var(--gold)',
            borderRadius: '50%',
            animation: 'spin .7s linear infinite',
          }} />
          Rendering images...
        </div>
      )}

      {/* ── Batch Results ── */}
      {batch.length > 0 && !loading && (
        <>
          {/* ── Action Bar ── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 10,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Tag color="var(--green)">{successCount}/12 generated</Tag>
              {batch.some((item) => !item.success) && (
                <Tag color="var(--red)">{12 - successCount} failed</Tag>
              )}
              <span style={{ fontSize: 12, color: 'var(--tx-dim)' }}>
                {selectedCount} selected
              </span>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <Btn size="sm" variant="ghost" onClick={selectAll}>Select All</Btn>
              <Btn size="sm" variant="ghost" onClick={deselectAll}>Deselect</Btn>
              <Btn size="sm" onClick={copyAllCaptions} disabled={selectedCount === 0}>
                <Icon name={allCopied ? 'check' : 'copy'} size={12} />
                {allCopied ? 'Copied' : 'Copy Captions'}
              </Btn>
              <Btn size="sm" onClick={downloadAllZip} disabled={selectedCount === 0}>
                <Icon name="download" size={12} /> Download Zip
              </Btn>
              <Btn size="sm" variant="primary" onClick={saveSelectedToLibrary} disabled={selectedCount === 0}>
                <Icon name="check" size={12} /> Save to Library
              </Btn>
              <Btn size="sm" variant="ghost" onClick={generateBatch}>
                <Icon name="refresh" size={12} /> Regenerate
              </Btn>
            </div>
          </div>

          {/* ── Grid ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {batch.map((item, idx) => (
              <BatchCard
                key={item.id || idx}
                item={item}
                idx={idx}
                onToggle={() => toggleSelect(idx)}
                onDownload={() => downloadOne(item, idx)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Empty State ── */}
      {batch.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ opacity: 0.07, marginBottom: 10 }}>
            <Icon name="bolt" size={64} />
          </div>
          <div style={{ fontSize: 15, color: 'var(--tx-muted)', fontWeight: 500, marginTop: 14 }}>
            Select a business and generate a batch
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 5 }}>
            Creates 12 unique posts with varied templates, content categories, and angles.
            <br />Each post gets a different prompt strategy based on the business industry.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Batch Card Component ──────────────────────────────────────────
function BatchCard({ item, idx, onToggle, onDownload }) {
  const [expanded, setExpanded] = useState(false);
  const [captionCopied, setCaptionCopied] = useState(false);

  if (!item.success) {
    return (
      <div style={{
        background: 'var(--s1)',
        border: '1px solid rgba(231,74,74,0.2)',
        borderRadius: 12,
        padding: 20,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>
          Post {idx + 1} failed
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx-dim)' }}>
          {item.error || 'Unknown error'}
        </div>
        <div style={{ marginTop: 8 }}>
          <Tag color="var(--tx-dim)">{item.planItem?.category || 'unknown'}</Tag>
        </div>
      </div>
    );
  }

  const r = item.result;
  const templateColors = {
    bold_statement: 'var(--gold)',
    photo_feature: 'var(--blue)',
    tip_card: 'var(--green)',
    stat_callout: 'var(--purple)',
    service_spotlight: 'var(--red)',
  };

  const copyCaption = () => {
    const full = (r.caption || '') + '\n\n' + (r.hashtags || []).map((h) => '#' + h).join(' ');
    navigator.clipboard.writeText(full).then(() => {
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 2000);
    });
  };

  return (
    <div style={{
      background: 'var(--s1)',
      border: `1px solid ${item.selected ? 'var(--gold)' : 'var(--bd)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.15s',
      opacity: item.selected ? 1 : 0.55,
    }}>
      {/* Image */}
      {item.imageData ? (
        <div
          onClick={onToggle}
          style={{
            width: '100%',
            aspectRatio: '1080/1350',
            backgroundImage: `url(${item.imageData})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          {/* Selection indicator */}
          <div style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 24,
            height: 24,
            borderRadius: 6,
            background: item.selected ? 'var(--gold)' : 'rgba(0,0,0,0.5)',
            border: item.selected ? 'none' : '2px solid rgba(255,255,255,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {item.selected && <Icon name="check" size={14} />}
          </div>

          {/* Post number */}
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 5,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
          }}>
            {idx + 1}
          </div>
        </div>
      ) : (
        <div
          onClick={onToggle}
          style={{
            width: '100%',
            aspectRatio: '1080/1350',
            background: 'var(--s2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--tx-dim)',
          }}
        >
          Rendering...
        </div>
      )}

      {/* Content */}
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <Tag color={templateColors[r.template] || 'var(--tx-dim)'}>{r.template?.replace('_', ' ')}</Tag>
            <Tag color="var(--tx-muted)">{r.content_type?.replace('_', ' ')}</Tag>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>
          {r.headline}
        </div>

        <div style={{
          fontSize: 11,
          color: 'var(--tx-muted)',
          lineHeight: 1.4,
          marginBottom: 8,
        }}>
          {r.subtext}
        </div>

        {/* Expandable caption */}
        {expanded && (
          <div style={{
            fontSize: 11,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            marginBottom: 8,
            padding: '8px 10px',
            background: 'var(--bg)',
            borderRadius: 6,
            border: '1px solid var(--bd)',
          }}>
            {r.caption}
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {(r.hashtags || []).map((h, i) => (
                <Tag key={i} color="var(--purple)">#{h}</Tag>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4 }}>
          <Btn size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Less' : 'More'}
          </Btn>
          <Btn size="sm" variant="ghost" onClick={copyCaption}>
            <Icon name={captionCopied ? 'check' : 'copy'} size={11} />
          </Btn>
          <Btn size="sm" variant="ghost" onClick={onDownload} disabled={!item.imageData}>
            <Icon name="download" size={11} />
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// BUSINESSES PAGE
// ══════════════════════════════════════════════════════════════════════
function BusinessesPage({ businesses, setBusinesses }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const u = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }));

  const startEdit = (b) => {
    setForm({ ...b });
    setEditing(b.id);
  };

  const startAdd = () => {
    setForm({
      id: 'biz_' + Date.now(),
      name: '',
      slug: '',
      website: '',
      industry: 'consulting',
      industry_label: '',
      tagline: '',
      primary_color: '#3B82F6',
      secondary_color: '#60A5FA',
      accent_color: '#F59E0B',
      bg_color: '#0A0A14',
      text_color: '#FFFFFF',
      tone: '',
      icp: '',
      services: '',
      service_areas: '',
      certifications: '',
      cta_phrases: '',
      fact_sheet: '',
      banned_words: '',
    });
    setEditing('new');
  };

  const save = () => {
    if (!form.name) return;
    if (editing === 'new') {
      form.slug = form.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 20);
      setBusinesses((prev) => [...prev, form]);
    } else {
      setBusinesses((prev) => prev.map((b) => (b.id === editing ? form : b)));
    }
    setEditing(null);
  };

  const del = (id) => setBusinesses((prev) => prev.filter((b) => b.id !== id));

  const industryOptions = [
    { value: 'home_service', label: 'Home Service' },
    { value: 'saas_tech', label: 'SaaS / Tech (B2B)' },
    { value: 'saas_smb', label: 'SaaS / SMB (B2C)' },
    { value: 'agency_dev', label: 'Agency / Dev' },
    { value: 'consulting', label: 'Consulting' },
  ];

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Businesses</h1>
          <p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>
            Manage brand profiles for content generation. Each business gets unique prompt strategies based on its industry type.
          </p>
        </div>
        <Btn variant="primary" onClick={startAdd}>
          <Icon name="plus" size={14} /> Add Business
        </Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 12 }}>
        {businesses.map((b) => (
          <div
            key={b.id}
            style={{
              background: 'var(--s1)',
              border: '1px solid var(--bd)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: 4,
                background: `linear-gradient(90deg, ${b.primary_color}, ${b.accent_color})`,
              }}
            />
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 2 }}>
                    {b.industry_label || b.industry}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: b.primary_color }} />
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: b.accent_color }} />
                </div>
              </div>
              {b.website && <div style={{ fontSize: 10, color: 'var(--tx-dim)', marginBottom: 5 }}>{b.website}</div>}
              {b.tone && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--tx-muted)',
                    lineHeight: 1.4,
                    marginBottom: 10,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.tone}
                </div>
              )}
              <div style={{ display: 'flex', gap: 5 }}>
                <Btn size="sm" onClick={() => startEdit(b)}>
                  <Icon name="edit" size={12} /> Edit
                </Btn>
                <Btn size="sm" variant="danger" onClick={() => del(b.id)}>
                  <Icon name="trash" size={12} />
                </Btn>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editing !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--bd)',
              borderRadius: 14,
              width: '92%',
              maxWidth: 660,
              maxHeight: '88vh',
              overflow: 'auto',
              padding: 26,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                {editing === 'new' ? 'Add Business' : 'Edit Business'}
              </h2>
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                <Icon name="x" size={14} />
              </Btn>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <Input label="Business Name" value={form.name} onChange={u('name')} placeholder="Reliable Solutions Atlanta" />
              <Input label="Website" value={form.website} onChange={u('website')} placeholder="waterhelpme.com" />
              <Select label="Industry (Prompt Strategy)" value={form.industry} onChange={u('industry')} options={industryOptions} />
              <Input label="Industry Label" value={form.industry_label} onChange={u('industry_label')} placeholder="Foundation Repair & Waterproofing" />
              <Input label="Tagline" value={form.tagline} onChange={u('tagline')} placeholder="Protecting Atlanta homes" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0 8px' }}>
              <Input label="Primary" value={form.primary_color} onChange={u('primary_color')} type="color" style={{ padding: 3, height: 38 }} />
              <Input label="Secondary" value={form.secondary_color} onChange={u('secondary_color')} type="color" style={{ padding: 3, height: 38 }} />
              <Input label="Accent" value={form.accent_color} onChange={u('accent_color')} type="color" style={{ padding: 3, height: 38 }} />
              <Input label="BG" value={form.bg_color} onChange={u('bg_color')} type="color" style={{ padding: 3, height: 38 }} />
              <Input label="Text" value={form.text_color} onChange={u('text_color')} type="color" style={{ padding: 3, height: 38 }} />
            </div>

            <Input label="Tone of Voice" value={form.tone} onChange={u('tone')} textarea placeholder="Authoritative and trustworthy..." />
            <Input label="Ideal Customer Profile" value={form.icp} onChange={u('icp')} textarea placeholder="Homeowners in metro Atlanta..." />
            <Input label="Services (comma separated)" value={form.services} onChange={u('services')} textarea placeholder="Foundation Repair, Waterproofing..." />
            <Input label="Service Areas" value={form.service_areas} onChange={u('service_areas')} placeholder="Atlanta, Marietta" />
            <Input label="Certifications" value={form.certifications} onChange={u('certifications')} placeholder="Licensed, Bonded, Insured" />
            <Input label="Preferred CTAs" value={form.cta_phrases} onChange={u('cta_phrases')} placeholder="Schedule Your Free Inspection" />
            <Input label="Fact Sheet" value={form.fact_sheet} onChange={u('fact_sheet')} textarea placeholder="Founded 2020, served 500+ homes..." />
            <Input label="Banned Words" value={form.banned_words} onChange={u('banned_words')} placeholder="cheap, guarantee, #1" />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Btn onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={save}>
                Save Business
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// PHOTO BANK PAGE
// ══════════════════════════════════════════════════════════════════════
function PhotoBankPage({ businesses, photos, setPhotos }) {
  const [bizId, setBizId] = useState(businesses[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const bizPhotos = photos[bizId] || [];

  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    const arr = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(f);
      });
      arr.push({ data, filename: f.name, category: 'general', mood: 'professional' });
    }
    setPhotos((prev) => ({
      ...prev,
      [bizId]: [...(prev[bizId] || []), ...arr],
    }));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const deletePhoto = (idx) => {
    setPhotos((prev) => ({
      ...prev,
      [bizId]: (prev[bizId] || []).filter((_, i) => i !== idx),
    }));
  };

  const updateTag = (idx, category, mood) => {
    setPhotos((prev) => {
      const updated = [...(prev[bizId] || [])];
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], category, mood };
      }
      return { ...prev, [bizId]: updated };
    });
  };

  const categories = ['general', 'team', 'jobsite', 'product', 'office', 'testimonial', 'lifestyle', 'before_after', 'equipment'];
  const moods = ['professional', 'casual', 'action', 'result', 'dramatic', 'clean'];

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Photo Bank</h1>
        <p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>
          Upload and tag photos per business. Photos stay in memory for this session.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 22 }}>
        <div style={{ minWidth: 220 }}>
          <Select
            label="Business"
            value={bizId}
            onChange={setBizId}
            options={businesses.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={upload} style={{ display: 'none' }} />
        <Btn variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="plus" size={14} /> {busy ? 'Uploading...' : 'Upload Photos'}
        </Btn>
      </div>

      {bizPhotos.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '50px 20px',
            background: 'var(--s1)',
            borderRadius: 12,
            border: '1px dashed var(--bd)',
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--tx-muted)', fontWeight: 500 }}>No photos for this business</div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 4 }}>
            Upload images the AI can composite into generated social posts.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {bizPhotos.map((photo, idx) => (
            <div
              key={idx}
              style={{
                background: 'var(--s1)',
                border: '1px solid var(--bd)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: '4/3',
                  backgroundImage: `url(${photo.data})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                }}
              >
                <button
                  onClick={() => deletePhoto(idx)}
                  style={{
                    position: 'absolute',
                    top: 5,
                    right: 5,
                    background: 'rgba(0,0,0,.7)',
                    border: 'none',
                    color: 'var(--red)',
                    cursor: 'pointer',
                    borderRadius: 5,
                    padding: '3px 5px',
                    display: 'flex',
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
              <div style={{ padding: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--tx-dim)',
                    marginBottom: 5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {photo.filename}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select
                    value={photo.category}
                    onChange={(e) => updateTag(idx, e.target.value, photo.mood)}
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--bd)',
                      borderRadius: 5,
                      padding: '3px 5px',
                      color: 'var(--tx)',
                      fontSize: 10,
                      fontFamily: 'inherit',
                    }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={photo.mood}
                    onChange={(e) => updateTag(idx, photo.category, e.target.value)}
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--bd)',
                      borderRadius: 5,
                      padding: '3px 5px',
                      color: 'var(--tx)',
                      fontSize: 10,
                      fontFamily: 'inherit',
                    }}
                  >
                    {moods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LIBRARY PAGE
// ══════════════════════════════════════════════════════════════════════
function LibraryPage({ library, businesses, setLibrary }) {
  const [filter, setFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  const filtered = filter === 'all' ? library : library.filter((x) => x.biz_id === filter);

  const downloadItem = (item) => {
    if (!item.image_data) return;
    const a = document.createElement('a');
    a.href = item.image_data;
    a.download = `${item.biz_id}-${item.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const copyCaption = (item) => {
    const text =
      (item.content?.caption || '') +
      '\n\n' +
      (item.content?.hashtags || []).map((h) => '#' + h).join(' ');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const deleteItem = (id) => setLibrary((prev) => prev.filter((x) => x.id !== id));

  const filterOptions = [
    { value: 'all', label: 'All' },
    ...businesses.map((b) => ({
      value: b.id,
      label: b.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 3),
    })),
  ];

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Content Library</h1>
        <p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>
          {library.length} items generated. Image data only persists for the current session.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, flexWrap: 'wrap' }}>
        {filterOptions.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: '5px 13px',
                borderRadius: 6,
                border: `1px solid ${active ? 'var(--gold)' : 'var(--bd)'}`,
                background: active ? 'rgba(201,164,76,0.08)' : 'var(--s1)',
                color: active ? 'var(--gold)' : 'var(--tx-muted)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '50px 20px',
            background: 'var(--s1)',
            borderRadius: 12,
            border: '1px dashed var(--bd)',
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--tx-muted)', fontWeight: 500 }}>No content yet</div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 4 }}>
            Generate content and save it here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'var(--s1)',
                border: '1px solid var(--bd)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {item.image_data && (
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1080/1350',
                    backgroundImage: `url(${item.image_data})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
              )}
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <Tag>{item.biz_name || item.biz_id}</Tag>
                  <span style={{ fontSize: 10, color: 'var(--tx-dim)' }}>
                    {item.created ? new Date(item.created).toLocaleDateString() : ''}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>
                  {item.content?.headline}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--tx-muted)',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {item.content?.caption}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                  <Btn size="sm" onClick={() => downloadItem(item)}>
                    <Icon name="download" size={12} />
                  </Btn>
                  <Btn size="sm" onClick={() => copyCaption(item)}>
                    <Icon name={copiedId === item.id ? 'check' : 'copy'} size={12} />
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => deleteItem(item.id)}>
                    <Icon name="trash" size={12} />
                  </Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}