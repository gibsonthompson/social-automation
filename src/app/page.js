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

  const addToLibrary = useCallback((item) => {
    setLibrary((prev) => [item, ...prev]);
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
// GENERATE PAGE
// ══════════════════════════════════════════════════════════════════════
function GeneratePage({ businesses, photos, addToLibrary }) {
  const [bizId, setBizId] = useState(businesses[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [tpl, setTpl] = useState('bold_statement');
  const [photoIdx, setPhotoIdx] = useState(-1);
  const [imgData, setImgData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);

  const biz = businesses.find((b) => b.id === bizId);
  const bizPhotos = photos[bizId] || [];

  const generate = async () => {
    if (!biz) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setImgData(null);

    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: biz }),
      });

      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      setResult(data.result);
      setTpl(data.result.template && TEMPLATES[data.result.template] ? data.result.template : 'bold_statement');
    } catch (e) {
      setError(e.message || 'Generation failed');
    }

    setLoading(false);
  };

  // Re-render canvas when result, template, or photo changes
  const renderCanvas = useCallback(async () => {
    if (!result || !biz || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const photo = photoIdx >= 0 && bizPhotos[photoIdx] ? bizPhotos[photoIdx].data : null;
    const template = TEMPLATES[tpl];
    if (template) {
      await template.render(ctx, biz, result, photo);
    }
    setImgData(canvas.toDataURL('image/png'));
  }, [result, biz, tpl, photoIdx, bizPhotos]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const downloadPng = () => {
    if (!imgData) return;
    const a = document.createElement('a');
    a.href = imgData;
    a.download = `${biz?.slug || 'post'}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const saveToLibrary = () => {
    if (!result || !imgData || !biz) return;
    addToLibrary({
      id: String(Date.now()),
      biz_id: bizId,
      biz_name: biz.name,
      tpl,
      content: result,
      image_data: imgData,
      created: new Date().toISOString(),
    });
  };

  const copyCaption = () => {
    if (!result) return;
    const full =
      (result.caption || '') +
      '\n\n' +
      (result.hashtags || []).map((h) => '#' + h).join(' ');
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>Generate Content</h1>
        <p style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 4 }}>
          Select a business, generate AI content, preview the image, and download as PNG.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <Select
            label="Business"
            value={bizId}
            onChange={setBizId}
            options={businesses.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
        <Btn variant="primary" size="lg" onClick={generate} disabled={loading || !biz}>
          {loading ? 'Generating...' : 'Generate Content'}
        </Btn>
        {result && (
          <Btn variant="ghost" onClick={generate} disabled={loading}>
            <Icon name="refresh" size={14} /> Regenerate
          </Btn>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '12px 18px',
            background: 'rgba(231,74,74,0.08)',
            border: '1px solid rgba(231,74,74,0.2)',
            borderRadius: 10,
            color: 'var(--red)',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 22, alignItems: 'start' }}>
          {/* Left: Preview */}
          <div>
            <div
              style={{
                background: 'var(--s1)',
                border: '1px solid var(--bd)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '11px 14px',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--tx-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                  }}
                >
                  Preview 1080 x 1350
                </span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <Btn size="sm" onClick={downloadPng} disabled={!imgData}>
                    <Icon name="download" size={13} /> PNG
                  </Btn>
                  <Btn size="sm" variant="primary" onClick={saveToLibrary} disabled={!imgData}>
                    <Icon name="check" size={13} /> Save
                  </Btn>
                </div>
              </div>
              <div style={{ padding: 10, background: '#000', display: 'flex', justifyContent: 'center' }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '100%',
                    maxWidth: 380,
                    height: 'auto',
                    aspectRatio: '1080/1350',
                    borderRadius: 4,
                    display: 'block',
                  }}
                />
              </div>
            </div>

            {/* Template selector */}
            <div style={{ marginTop: 12 }}>
              <FieldLabel text="Template" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(TEMPLATES).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => setTpl(key)}
                    style={{
                      padding: '5px 11px',
                      borderRadius: 6,
                      border: `1px solid ${tpl === key ? 'var(--gold)' : 'var(--bd)'}`,
                      background: tpl === key ? 'rgba(201,164,76,0.08)' : 'var(--s1)',
                      color: tpl === key ? 'var(--gold)' : 'var(--tx-muted)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Photo selector */}
            {bizPhotos.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <FieldLabel text={`Photo ${photoIdx >= 0 ? `(${photoIdx + 1}/${bizPhotos.length})` : '(None)'}`} />
                <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4 }}>
                  <button
                    onClick={() => setPhotoIdx(-1)}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 6,
                      border: `2px solid ${photoIdx === -1 ? 'var(--gold)' : 'var(--bd)'}`,
                      background: 'var(--s1)',
                      color: 'var(--tx-muted)',
                      fontSize: 9,
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                    }}
                  >
                    None
                  </button>
                  {bizPhotos.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIdx(i)}
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 6,
                        border: `2px solid ${photoIdx === i ? 'var(--gold)' : 'var(--bd)'}`,
                        backgroundImage: `url(${p.data})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Content details */}
          <div>
            <div
              style={{
                background: 'var(--s1)',
                border: '1px solid var(--bd)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '11px 14px',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--tx-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                    }}
                  >
                    Content
                  </span>
                  <Tag color="var(--blue)">{result.content_type || 'post'}</Tag>
                </div>
                <Btn size="sm" onClick={copyCaption}>
                  <Icon name={copied ? 'check' : 'copy'} size={12} />
                  {copied ? 'Copied' : 'Copy Caption'}
                </Btn>
              </div>

              <div style={{ padding: 20 }}>
                <div style={{ marginBottom: 18 }}>
                  <FieldLabel text="Headline" />
                  <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>{result.headline}</div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <FieldLabel text="Subtext" />
                  <div style={{ fontSize: 14, color: 'var(--tx-muted)', lineHeight: 1.5 }}>
                    {result.subtext}
                  </div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <FieldLabel text="Caption" />
                  <div style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                    {result.caption}
                  </div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <FieldLabel text="Hashtags" />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(result.hashtags || []).map((h, i) => (
                      <Tag key={i} color="var(--purple)">
                        #{h}
                      </Tag>
                    ))}
                  </div>
                </div>
                {result.cta && (
                  <div>
                    <FieldLabel text="CTA" />
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>{result.cta}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ opacity: 0.07, marginBottom: 10 }}>
            <Icon name="bolt" size={64} />
          </div>
          <div style={{ fontSize: 15, color: 'var(--tx-muted)', fontWeight: 500, marginTop: 14 }}>
            Select a business and hit Generate
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 5 }}>
            AI creates a unique post with headline, caption, hashtags, and a 1080x1350 PNG.
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid var(--bd)',
              borderTop: '3px solid var(--gold)',
              borderRadius: '50%',
              animation: 'spin .7s linear infinite',
              margin: '0 auto 14px',
            }}
          />
          <div style={{ fontSize: 13, color: 'var(--tx-muted)' }}>
            Generating content for {biz?.name}...
          </div>
        </div>
      )}
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
