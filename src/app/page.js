'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DEFAULT_BUSINESSES, EMPTY_DESIGN_SYSTEM } from '@/lib/businesses';
import { Btn, Input, Select, Tag, FieldLabel, Icon } from '@/components/ui';
import { saveFeedback, getFeedbackForAPI, getFeedbackStats, clearFeedback } from '@/lib/feedback';
import { getPhotos, uploadPhotos, updatePhoto, deletePhoto, getPhotoManifestForAPI } from '@/lib/photo-storage';

// ── Persist ─────────────────────────────────────────────────────────
function lsGet(k, fb) { if (typeof window==='undefined') return fb; try { const r=localStorage.getItem(k); return r?JSON.parse(r):fb; } catch{return fb;} }
function lsSet(k, v) { if (typeof window==='undefined') return; try { localStorage.setItem(k, JSON.stringify(v)); } catch{} }

// ══════════════════════════════════════════════════════════════════════
export default function ContentFarm() {
  const [page, setPage] = useState('queue');
  const [biz, setBiz] = useState([]);
  const [lib, setLib] = useState([]);
  const [ready, setReady] = useState(false);
  const [photoRefresh, setPhotoRefresh] = useState(0);

  useEffect(() => { setBiz(lsGet('cf_biz3', DEFAULT_BUSINESSES)); setLib(lsGet('cf_lib3', [])); setReady(true); }, []);
  useEffect(() => { if(ready) lsSet('cf_biz3', biz); }, [biz, ready]);
  useEffect(() => { if(ready){ const m=lib.map(({image_data,...r})=>r); lsSet('cf_lib3',m); }}, [lib, ready]);

  const addLib = useCallback((items) => { const a=Array.isArray(items)?items:[items]; setLib(p=>[...a,...p]); }, []);
  const nav = [
    {id:'queue',l:'Queue',ic:'folder'},
    {id:'generate',l:'Generate',ic:'bolt'},
    {id:'businesses',l:'Businesses',ic:'briefcase'},
    {id:'assets',l:'Assets',ic:'image'},
    {id:'photos',l:'Photo Bank',ic:'image'},
    {id:'library',l:'Library',ic:'folder'},
  ];

  if(!ready) return null;

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden'}}>
      <div style={{width:200,borderRight:'1px solid var(--bd)',display:'flex',flexDirection:'column',flexShrink:0,background:'var(--bg)'}}>
        <div style={{padding:'20px 16px 16px',borderBottom:'1px solid var(--bd)'}}>
          <div style={{fontSize:13,fontWeight:800,letterSpacing:'.08em',color:'var(--gold)'}}>CONTENT FARM</div>
          <div style={{fontSize:10,color:'var(--tx-dim)',marginTop:2,fontWeight:600,letterSpacing:'.06em'}}>MULTI-BRAND ENGINE</div>
        </div>
        <nav style={{padding:'8px 6px',flex:1}}>
          {nav.map(n=>{const a=page===n.id;return(
            <button key={n.id} onClick={()=>setPage(n.id)} style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 10px',border:'none',background:a?'var(--s1)':'transparent',color:a?'var(--tx)':'var(--tx-muted)',borderRadius:7,cursor:'pointer',fontSize:13,fontWeight:a?600:400,fontFamily:'inherit',marginBottom:1}}>
              <span style={{opacity:a?1:0.4}}><Icon name={n.ic} size={16}/></span>{n.l}
            </button>
          );})}
        </nav>
        <div style={{padding:'12px 16px',borderTop:'1px solid var(--bd)',fontSize:10,color:'var(--tx-dim)'}}>
          {biz.length} businesses
        </div>
      </div>
      <div style={{flex:1,overflow:'auto',background:'var(--bg)'}}>
        {page==='queue' && <QueuePage biz={biz}/>}
        {page==='generate' && <GenPage biz={biz} addLib={addLib} key={photoRefresh}/>}
        {page==='businesses' && <BizPage biz={biz} setBiz={setBiz}/>}
        {page==='assets' && <AssetsPage biz={biz}/>}
        {page==='photos' && <PhotoPage biz={biz} onUpdate={()=>setPhotoRefresh(p=>p+1)}/>}
        {page==='library' && <LibPage lib={lib} biz={biz} setLib={setLib}/>}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// QUEUE PAGE — Review, approve, reject automated posts
// ══════════════════════════════════════════════════════════════════════
function QueuePage({biz}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [bizFilter, setBizFilter] = useState('all');
  const [acting, setActing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const fetchQueue = async () => {
    setLoading(true);
    try {
      let url = '/api/queue?limit=50';
      if (filter !== 'all') url += `&status=${filter}`;
      if (bizFilter !== 'all') url += `&business_id=${bizFilter}`;
      const resp = await fetch(url);
      const data = await resp.json();
      setItems(data.items || []);
    } catch (e) {
      console.error('Queue fetch failed:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchQueue(); }, [filter, bizFilter]);

  const approve = async (id) => {
    setActing(id);
    try {
      const resp = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      });
      const data = await resp.json();
      if (data.error) alert(`Approve failed: ${data.error}`);
      else fetchQueue();
    } catch (e) { alert(`Error: ${e.message}`); }
    setActing(null);
  };

  const reject = async (id) => {
    setActing(id);
    try {
      const resp = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject', notes: rejectNotes }),
      });
      const data = await resp.json();
      if (data.error) alert(`Reject failed: ${data.error}`);
      else { setRejectId(null); setRejectNotes(''); fetchQueue(); }
    } catch (e) { alert(`Error: ${e.message}`); }
    setActing(null);
  };

  const statusColors = {
    planned: 'var(--tx-dim)',
    researching: 'var(--blue)',
    generating: 'var(--blue)',
    rendering: 'var(--gold)',
    review: 'var(--gold)',
    approved: 'var(--green)',
    posting: 'var(--blue)',
    posted: 'var(--green)',
    failed: 'var(--red)',
    rejected: 'var(--red)',
  };

  const statuses = ['all','planned','generating','rendering','review','approved','posted','failed','rejected'];
  const counts = {};
  statuses.forEach(s => { counts[s] = s === 'all' ? items.length : items.filter(i => i.status === s).length; });

  return (
    <div style={{padding:28}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:22}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>Content Queue</h1>
          <p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>Review, approve, and publish automated posts. Approve sends directly to Instagram.</p>
        </div>
        <Btn size="sm" onClick={fetchQueue}><Icon name="refresh" size={12}/> Refresh</Btn>
      </div>

      {/* Status filter tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,flexWrap:'wrap'}}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding:'6px 14px',borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:600,
            textTransform:'capitalize',
            background: filter===s ? (statusColors[s]||'var(--gold)')+'18' : 'var(--s1)',
            border: `1px solid ${filter===s ? (statusColors[s]||'var(--gold)') : 'var(--bd)'}`,
            color: filter===s ? (statusColors[s]||'var(--gold)') : 'var(--tx-dim)',
          }}>{s}{counts[s]>0 && s!=='all' ? ` (${counts[s]})` : ''}</button>
        ))}
      </div>

      {/* Business filter */}
      <div style={{display:'flex',gap:4,marginBottom:20}}>
        <button onClick={() => setBizFilter('all')} style={{padding:'4px 12px',borderRadius:6,border:`1px solid ${bizFilter==='all'?'var(--gold)':'var(--bd)'}`,background:bizFilter==='all'?'rgba(201,164,76,0.08)':'var(--s1)',color:bizFilter==='all'?'var(--gold)':'var(--tx-dim)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>All</button>
        {biz.map(b => (
          <button key={b.id} onClick={() => setBizFilter(b.id)} style={{padding:'4px 12px',borderRadius:6,border:`1px solid ${bizFilter===b.id?'var(--gold)':'var(--bd)'}`,background:bizFilter===b.id?'rgba(201,164,76,0.08)':'var(--s1)',color:bizFilter===b.id?'var(--gold)':'var(--tx-dim)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>{b.name.split(' ').map(w=>w[0]).join('')}</button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'60px 20px'}}>
          <div style={{width:24,height:24,border:'2px solid var(--bd)',borderTop:'2px solid var(--gold)',borderRadius:'50%',animation:'spin .7s linear infinite',margin:'0 auto 12px'}}/>
          <div style={{fontSize:13,color:'var(--tx-muted)'}}>Loading queue...</div>
        </div>
      ) : !items.length ? (
        <div style={{textAlign:'center',padding:'60px 20px',background:'var(--s1)',borderRadius:12,border:'1px dashed var(--bd)'}}>
          <div style={{fontSize:15,color:'var(--tx-muted)',fontWeight:500}}>No posts in queue</div>
          <div style={{fontSize:12,color:'var(--tx-dim)',marginTop:4}}>Run the plan cron to create posts, then the process cron to generate them.</div>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',gap:16}}>
          {items.filter(i => filter === 'all' || i.status === filter).filter(i => bizFilter === 'all' || i.business_id === bizFilter).map(item => (
            <div key={item.id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden'}}>

              {/* Image preview */}
              {item.render_output_url ? (
                <div style={{width:'100%',aspectRatio:'1080/1350',backgroundImage:`url(${item.render_output_url})`,backgroundSize:'cover',backgroundPosition:'center',position:'relative'}}>
                  <div style={{position:'absolute',top:8,left:8}}>
                    <Tag color={statusColors[item.status]||'var(--tx-dim)'}>{item.status}</Tag>
                  </div>
                  <div style={{position:'absolute',top:8,right:8}}>
                    <Tag color="var(--tx-muted)">{item.cf_businesses?.name || ''}</Tag>
                  </div>
                </div>
              ) : (
                <div style={{width:'100%',aspectRatio:'1080/1350',background:'var(--s2)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,position:'relative'}}>
                  <div style={{fontSize:48,opacity:0.1}}><Icon name="image" size={48}/></div>
                  <div style={{fontSize:12,color:'var(--tx-dim)'}}>No render</div>
                  <div style={{position:'absolute',top:8,left:8}}>
                    <Tag color={statusColors[item.status]||'var(--tx-dim)'}>{item.status}</Tag>
                  </div>
                </div>
              )}

              {/* Content info */}
              <div style={{padding:14}}>
                <div style={{display:'flex',gap:4,marginBottom:6,flexWrap:'wrap'}}>
                  <Tag color="var(--blue)">{item.ai_content?.template?.replace(/_/g,' ') || '—'}</Tag>
                  <Tag color="var(--tx-muted)">{item.ai_content?.content_type?.replace(/_/g,' ') || '—'}</Tag>
                </div>

                <div style={{fontSize:15,fontWeight:700,lineHeight:1.3,marginBottom:4}}>{item.ai_content?.headline || '(generating...)'}</div>
                <div style={{fontSize:12,color:'var(--tx-muted)',lineHeight:1.4,marginBottom:8}}>{item.ai_content?.subtext || ''}</div>

                {/* Expandable caption */}
                {expanded === item.id && (
                  <div style={{fontSize:11,lineHeight:1.6,whiteSpace:'pre-wrap',marginBottom:10,padding:'10px 12px',background:'var(--bg)',borderRadius:8,border:'1px solid var(--bd)'}}>
                    {item.caption || item.ai_content?.caption || ''}
                    <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:3}}>
                      {(item.hashtags || item.ai_content?.hashtags || []).map((h,i) => <Tag key={i} color="var(--purple)">#{h}</Tag>)}
                    </div>
                    {item.content_attributes && (
                      <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--bd)'}}>
                        <div style={{fontSize:9,fontWeight:700,color:'var(--tx-dim)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Content Attributes</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                          {Object.entries(item.content_attributes).filter(([k,v]) => v && v !== 'none' && v !== false && k !== 'posted_day_of_week').map(([k,v]) => (
                            <span key={k} style={{fontSize:9,padding:'2px 6px',background:'var(--s2)',borderRadius:4,color:'var(--tx-dim)'}}>{k}: {String(v)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.reviewer_notes && (
                      <div style={{marginTop:8,padding:'6px 8px',background:'rgba(231,74,74,0.06)',borderRadius:6,fontSize:10,color:'var(--red)'}}>
                        QC: {item.reviewer_notes}
                      </div>
                    )}
                  </div>
                )}

                {/* Metadata row */}
                <div style={{display:'flex',gap:8,alignItems:'center',fontSize:10,color:'var(--tx-dim)',marginBottom:10}}>
                  <span>{item.type?.replace(/_/g,' ')}</span>
                  <span>·</span>
                  <span>{item.scheduled_for ? new Date(item.scheduled_for).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</span>
                  <span>·</span>
                  <span>{item.render_duration_ms ? `${(item.render_duration_ms/1000).toFixed(1)}s` : '—'}</span>
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  <Btn size="sm" variant="ghost" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                    {expanded === item.id ? 'Less' : 'More'}
                  </Btn>

                  {item.render_output_url && (
                    <Btn size="sm" variant="ghost" onClick={() => window.open(item.render_output_url, '_blank')}>
                      <Icon name="image" size={11}/> View
                    </Btn>
                  )}

                  {item.status === 'review' && (
                    <>
                      <Btn size="sm" variant="primary" onClick={() => approve(item.id)} disabled={acting === item.id}>
                        {acting === item.id ? 'Publishing...' : 'Approve + Publish'}
                      </Btn>
                      {rejectId === item.id ? (
                        <div style={{display:'flex',gap:4,alignItems:'center',flex:1}}>
                          <input value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} placeholder="What was wrong?" style={{flex:1,background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:6,padding:'5px 8px',color:'var(--tx)',fontSize:11,fontFamily:'inherit',outline:'none'}}/>
                          <Btn size="sm" variant="danger" onClick={() => reject(item.id)} disabled={acting === item.id}>Reject</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => {setRejectId(null);setRejectNotes('');}}>X</Btn>
                        </div>
                      ) : (
                        <Btn size="sm" variant="danger" onClick={() => setRejectId(item.id)}>Reject</Btn>
                      )}
                    </>
                  )}

                  {item.status === 'posted' && item.platform_post_id && (
                    <Tag color="var(--green)">Published</Tag>
                  )}

                  {item.status === 'failed' && (
                    <div style={{fontSize:10,color:'var(--red)',flex:1}}>{item.error_log || 'Unknown error'}</div>
                  )}
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
// ASSETS PAGE — Upload logos, badges, brand imagery per business
// ══════════════════════════════════════════════════════════════════════
function AssetsPage({biz}) {
  const [bizId, setBizId] = useState(biz[0]?.id || '');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fRef = useRef(null);
  const b = biz.find(x => x.id === bizId);

  // Load assets from Supabase Storage
  const loadAssets = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/queue?status=__assets_hack__`); // placeholder
      // For now, load from Supabase Storage directly
      // We'll use the content-renders bucket with an assets/ prefix
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadAssets(); }, [bizId]);

  const upload = async (e, assetType) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('business_id', bizId);
        formData.append('asset_type', assetType);

        // Upload to Supabase Storage via a simple fetch
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result;
          setAssets(prev => [...prev, {
            id: Date.now() + '-' + Math.random().toString(36).slice(2,6),
            type: assetType,
            filename: file.name,
            preview: base64,
            business_id: bizId,
          }]);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }

    setUploading(false);
    if (fRef.current) fRef.current.value = '';
  };

  const removeAsset = (id) => {
    setAssets(prev => prev.filter(a => a.id !== id));
  };

  const bizAssets = assets.filter(a => a.business_id === bizId);
  const logos = bizAssets.filter(a => a.type === 'logo');
  const badges = bizAssets.filter(a => a.type === 'badge');
  const imagery = bizAssets.filter(a => a.type === 'imagery');

  return (
    <div style={{padding:28}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:700}}>Brand Assets</h1>
        <p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>Upload logos, trust badges, and brand imagery per business. These get used in rendered templates.</p>
      </div>

      <div style={{display:'flex',gap:14,alignItems:'flex-end',marginBottom:28}}>
        <div style={{minWidth:220}}>
          <Select label="Business" value={bizId} onChange={v => setBizId(v)} options={biz.map(x => ({value:x.id,label:x.name}))}/>
        </div>
      </div>

      {/* Logo Section */}
      <div style={{marginBottom:32}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>Logo</div>
            <div style={{fontSize:11,color:'var(--tx-dim)',marginTop:2}}>Primary logo used on posts and CTA bars</div>
          </div>
          <div>
            <input ref={fRef} type="file" accept="image/*" onChange={e => upload(e, 'logo')} style={{display:'none'}}/>
            <Btn size="sm" onClick={() => fRef.current?.click()} disabled={uploading}>
              <Icon name="plus" size={12}/> Upload Logo
            </Btn>
          </div>
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          {logos.length ? logos.map(a => (
            <div key={a.id} style={{width:120,height:120,borderRadius:12,background:'var(--s1)',border:'1px solid var(--bd)',overflow:'hidden',position:'relative'}}>
              <img src={a.preview} style={{width:'100%',height:'100%',objectFit:'contain',padding:12}} alt=""/>
              <button onClick={() => removeAsset(a.id)} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,.7)',border:'none',color:'var(--red)',cursor:'pointer',borderRadius:5,padding:'2px 4px',display:'flex'}}><Icon name="trash" size={10}/></button>
            </div>
          )) : (
            <div style={{padding:'20px 32px',background:'var(--s1)',borderRadius:12,border:'1px dashed var(--bd)',fontSize:12,color:'var(--tx-dim)'}}>No logo uploaded</div>
          )}
        </div>
      </div>

      {/* Trust Badges Section */}
      <div style={{marginBottom:32}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>Trust Badges</div>
            <div style={{fontSize:11,color:'var(--tx-dim)',marginTop:2}}>BBB, certifications, review badges — displayed on applicable templates</div>
          </div>
          <div>
            <input type="file" accept="image/*" multiple onChange={e => upload(e, 'badge')} style={{display:'none'}} id="badge-upload"/>
            <Btn size="sm" onClick={() => document.getElementById('badge-upload')?.click()} disabled={uploading}>
              <Icon name="plus" size={12}/> Upload Badges
            </Btn>
          </div>
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          {badges.length ? badges.map(a => (
            <div key={a.id} style={{width:100,height:100,borderRadius:10,background:'var(--s1)',border:'1px solid var(--bd)',overflow:'hidden',position:'relative'}}>
              <img src={a.preview} style={{width:'100%',height:'100%',objectFit:'contain',padding:8}} alt=""/>
              <button onClick={() => removeAsset(a.id)} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,.7)',border:'none',color:'var(--red)',cursor:'pointer',borderRadius:5,padding:'2px 4px',display:'flex'}}><Icon name="trash" size={10}/></button>
              <div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(0,0,0,0.6)',padding:'2px 4px',fontSize:8,color:'white',textAlign:'center',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{a.filename}</div>
            </div>
          )) : (
            <div style={{padding:'20px 32px',background:'var(--s1)',borderRadius:12,border:'1px dashed var(--bd)',fontSize:12,color:'var(--tx-dim)'}}>No badges uploaded</div>
          )}
        </div>
      </div>

      {/* Brand Imagery Section */}
      <div style={{marginBottom:32}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>Brand Imagery</div>
            <div style={{fontSize:11,color:'var(--tx-dim)',marginTop:2}}>Screenshots, product shots, team photos — referenced in content generation</div>
          </div>
          <div>
            <input type="file" accept="image/*" multiple onChange={e => upload(e, 'imagery')} style={{display:'none'}} id="imagery-upload"/>
            <Btn size="sm" onClick={() => document.getElementById('imagery-upload')?.click()} disabled={uploading}>
              <Icon name="plus" size={12}/> Upload Images
            </Btn>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))',gap:12}}>
          {imagery.length ? imagery.map(a => (
            <div key={a.id} style={{aspectRatio:'4/3',borderRadius:10,background:'var(--s1)',border:'1px solid var(--bd)',overflow:'hidden',position:'relative'}}>
              <img src={a.preview} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
              <button onClick={() => removeAsset(a.id)} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,.7)',border:'none',color:'var(--red)',cursor:'pointer',borderRadius:5,padding:'2px 4px',display:'flex'}}><Icon name="trash" size={10}/></button>
              <div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(0,0,0,0.6)',padding:'3px 6px',fontSize:9,color:'white',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{a.filename}</div>
            </div>
          )) : (
            <div style={{padding:'20px 32px',background:'var(--s1)',borderRadius:12,border:'1px dashed var(--bd)',fontSize:12,color:'var(--tx-dim)',gridColumn:'1/-1'}}>No imagery uploaded</div>
          )}
        </div>
      </div>

      {/* Current design system preview */}
      {b && (
        <div style={{padding:20,background:'var(--s1)',borderRadius:12,border:'1px solid var(--bd)'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Design System Preview — {b.name}</div>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            {[b.primary_color, b.secondary_color, b.accent_color, b.bg_color].filter(Boolean).map((c,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:24,height:24,borderRadius:6,background:c,border:'1px solid var(--bd)'}}/>
                <span style={{fontSize:10,color:'var(--tx-dim)',fontFamily:'monospace'}}>{c}</span>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:'var(--tx-muted)',lineHeight:1.5}}>
            Fonts: {b.design_system?.fonts?.headline?.family || '—'} / {b.design_system?.fonts?.body?.family || '—'}
          </div>
          {b.design_system?.cta_bar?.phone && (
            <div style={{fontSize:11,color:'var(--tx-muted)',marginTop:4}}>Phone: {b.design_system.cta_bar.phone}</div>
          )}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// GENERATE PAGE (existing — unchanged)
// ══════════════════════════════════════════════════════════════════════
function GenPage({biz, addLib}) {
  const [bizId, setBizId] = useState(biz[0]?.id||'');
  const [platform, setPlatform] = useState('instagram');
  const [loading, setLoading] = useState(false);
  const [batch, setBatch] = useState([]);
  const [err, setErr] = useState(null);
  const [allCopied, setAllCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [fbStats, setFbStats] = useState({total:0,good:0,bad:0});
  const b = biz.find(x=>x.id===bizId);

  useEffect(()=>{setFbStats(getFeedbackStats(bizId));},[bizId,batch]);

  const generateBatch = async()=>{
    if(!b) return;
    setLoading(true); setErr(null); setBatch([]); setRenderProgress(0);
    try {
      const feedback = getFeedbackForAPI(bizId);
      const photoManifest = await getPhotoManifestForAPI(bizId);
      const photos = await getPhotos(bizId);
      const resp = await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business:b,mode:'batch',feedback,photoManifest,platform})});
      const data = await resp.json();
      if(data.error) throw new Error(data.error);
      const items = (data.results||[]).map((r,idx)=>({...r,imageData:null,selected:r.success,id:`${Date.now()}-${idx}`,feedbackGiven:false}));
      setBatch(items);
      setLoading(false);
      await renderAllServer(items, b, photos);
    } catch(e) { setErr(e.message||'Failed'); setLoading(false); }
  };

  const renderAllServer = async(items, bizData, photos)=>{
    setRendering(true); setRenderProgress(0);
    const upd=[...items];
    const renderUrl = 'https://urchin-app-bqb4i.ondigitalocean.app/api/content-render';
    const renderKey = process.env.NEXT_PUBLIC_RENDER_KEY || '';
    for(let i=0;i<upd.length;i++){
      const item=upd[i]; if(!item.success||!item.result) continue;
      let photoDataUrl=null;
      const pidx = item.result.photo_index;
      if(pidx>=0 && photos[pidx]) photoDataUrl = photos[pidx].public_url;
      else if(['photo_hero','process_steps','did_you_know','split_feature'].includes(item.result.template)&&photos.length>0) photoDataUrl = photos[i%photos.length].public_url;
      try {
        const headers = {'Content-Type':'application/json'};
        if(renderKey) headers['X-Render-Key'] = renderKey;
        const resp = await fetch(`${renderUrl}/render`,{method:'POST',headers,body:JSON.stringify({content:item.result,business:bizData,templateId:item.result.template,photoDataUrl,platform})});
        const data = await resp.json();
        if(data.image){upd[i]={...upd[i],imageData:data.image};setBatch([...upd]);}
      } catch(e){ console.error(`Render ${i} failed:`,e); }
      setRenderProgress(i+1);
    }
    setBatch([...upd]); setRendering(false);
  };

  const toggle=(idx)=>setBatch(p=>p.map((it,i)=>i===idx?{...it,selected:!it.selected}:it));
  const selAll=()=>setBatch(p=>p.map(it=>({...it,selected:it.success})));
  const desel=()=>setBatch(p=>p.map(it=>({...it,selected:false})));
  const dlOne=(item,idx)=>{if(!item.imageData)return;const a=document.createElement('a');a.href=item.imageData;a.download=`${b?.slug||'post'}-${idx+1}.png`;document.body.appendChild(a);a.click();document.body.removeChild(a);};
  const dlZip=async()=>{const sel=batch.filter(i=>i.selected&&i.imageData);if(!sel.length)return;const JSZip=(await import('jszip')).default;const zip=new JSZip();sel.forEach((it,i)=>{zip.file(`${b?.slug||'post'}-${i+1}-${it.result?.content_type||'post'}.png`,it.imageData.split(',')[1],{base64:true});});const blob=await zip.generateAsync({type:'blob'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${b?.slug}-batch-${Date.now()}.zip`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);};
  const cpAll=()=>{const sel=batch.filter(i=>i.selected&&i.success);if(!sel.length)return;const t=sel.map((it,i)=>`--- POST ${i+1} (${it.result.content_type}) ---\n\n${it.result.caption}\n\n${(it.result.hashtags||[]).map(h=>'#'+h).join(' ')}`).join('\n\n\n');navigator.clipboard.writeText(t).then(()=>{setAllCopied(true);setTimeout(()=>setAllCopied(false),2000);});};
  const saveLib=()=>{const sel=batch.filter(i=>i.selected&&i.success&&i.imageData);if(!sel.length)return;addLib(sel.map(it=>({id:Date.now()+'-'+Math.random().toString(36).slice(2,6),biz_id:bizId,biz_name:b?.name||'',tpl:it.result.template,content:it.result,image_data:it.imageData,created:new Date().toISOString()})));};
  const handleFB=(idx,rating,reason)=>{const it=batch[idx];if(!it?.result)return;saveFeedback(bizId,{id:`fb-${Date.now()}-${idx}`,headline:it.result.headline,content_type:it.result.content_type,template:it.result.template,rating,reason:reason||'',created_at:new Date().toISOString()});setBatch(p=>p.map((x,i)=>i===idx?{...x,feedbackGiven:true,feedbackRating:rating}:x));setFbStats(getFeedbackStats(bizId));};

  const selCount=batch.filter(i=>i.selected).length;
  const okCount=batch.filter(i=>i.success).length;
  const [photoCount, setPhotoCount] = useState(0);
  useEffect(()=>{getPhotos(bizId).then(p=>setPhotoCount(p.length));},[bizId,batch]);

  return(
    <div style={{padding:28}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-.02em'}}>Generate Content</h1>
        <p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>12 unique posts per batch. Rate posts to train AI.</p>
      </div>
      <div style={{display:'flex',gap:14,alignItems:'flex-end',marginBottom:22,flexWrap:'wrap'}}>
        <div style={{minWidth:220}}><Select label="Business" value={bizId} onChange={v=>{setBizId(v);setBatch([]);}} options={biz.map(x=>({value:x.id,label:x.name}))}/></div>
        <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:'1px solid var(--bd)',height:38,alignSelf:'flex-end'}}>
          {['instagram','linkedin'].map(p=>(<button key={p} onClick={()=>setPlatform(p)} style={{padding:'0 16px',fontSize:12,fontWeight:600,fontFamily:'inherit',cursor:'pointer',border:'none',textTransform:'capitalize',background:platform===p?'var(--blue)':'var(--s1)',color:platform===p?'#fff':'var(--tx-muted)'}}>{p}</button>))}
        </div>
        <Btn variant="primary" size="lg" onClick={generateBatch} disabled={loading||!b}>{loading?'Generating...':'Generate 12 Posts'}</Btn>
        {fbStats.total>0&&(<div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',background:'var(--s1)',borderRadius:8,border:'1px solid var(--bd)'}}><span style={{fontSize:11,color:'var(--tx-dim)'}}>AI Learning:</span><Tag color="var(--green)">{fbStats.good} good</Tag><Tag color="var(--red)">{fbStats.bad} bad</Tag><button onClick={()=>{clearFeedback(bizId);setFbStats({total:0,good:0,bad:0});}} style={{background:'none',border:'none',color:'var(--tx-dim)',fontSize:10,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline'}}>clear</button></div>)}
        {photoCount>0&&<Tag color="var(--blue)">{photoCount} photos</Tag>}
      </div>
      {err&&<div style={{padding:'12px 18px',background:'rgba(231,74,74,0.08)',border:'1px solid rgba(231,74,74,0.2)',borderRadius:10,color:'var(--red)',fontSize:13,marginBottom:20}}>{err}</div>}
      {loading&&(<div style={{textAlign:'center',padding:'60px 20px'}}><div style={{width:36,height:36,border:'3px solid var(--bd)',borderTop:'3px solid var(--gold)',borderRadius:'50%',animation:'spin .7s linear infinite',margin:'0 auto 16px'}}/><div style={{fontSize:14,color:'var(--tx-muted)',fontWeight:500}}>Generating...</div></div>)}
      {rendering&&!loading&&(<div style={{padding:'12px 18px',background:'rgba(201,164,76,0.08)',border:'1px solid rgba(201,164,76,0.2)',borderRadius:10,color:'var(--gold)',fontSize:13,marginBottom:20,display:'flex',alignItems:'center',gap:10}}><div style={{width:16,height:16,border:'2px solid var(--bd)',borderTop:'2px solid var(--gold)',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>Rendering... ({renderProgress}/{batch.filter(i=>i.success).length})</div>)}
      {batch.length>0&&!loading&&(
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}><Tag color="var(--green)">{okCount}/12</Tag><span style={{fontSize:12,color:'var(--tx-dim)'}}>{selCount} selected</span></div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <Btn size="sm" variant="ghost" onClick={selAll}>Select All</Btn>
              <Btn size="sm" variant="ghost" onClick={desel}>Deselect</Btn>
              <Btn size="sm" onClick={cpAll} disabled={!selCount}><Icon name={allCopied?'check':'copy'} size={12}/> Captions</Btn>
              <Btn size="sm" onClick={dlZip} disabled={!selCount}><Icon name="download" size={12}/> Zip</Btn>
              <Btn size="sm" variant="primary" onClick={saveLib} disabled={!selCount}><Icon name="check" size={12}/> Save</Btn>
              <Btn size="sm" variant="ghost" onClick={generateBatch}><Icon name="refresh" size={12}/> Regen</Btn>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',gap:16}}>
            {batch.map((item,idx)=><BatchCard key={item.id||idx} item={item} idx={idx} onToggle={()=>toggle(idx)} onDownload={()=>dlOne(item,idx)} onFeedback={(r,t)=>handleFB(idx,r,t)}/>)}
          </div>
        </>
      )}
      {!batch.length&&!loading&&(<div style={{textAlign:'center',padding:'60px 20px'}}><div style={{opacity:0.07,marginBottom:10}}><Icon name="bolt" size={64}/></div><div style={{fontSize:15,color:'var(--tx-muted)',fontWeight:500,marginTop:14}}>Select a business and generate a batch</div></div>)}
    </div>
  );
}

// BatchCard, BizPage, PhotoPage, LibPage remain unchanged from original
function BatchCard({item,idx,onToggle,onDownload,onFeedback}){const [exp,setExp]=useState(false);const [cpd,setCpd]=useState(false);const [fbMode,setFbMode]=useState(null);const [fbText,setFbText]=useState('');if(!item.success) return(<div style={{background:'var(--s1)',border:'1px solid rgba(231,74,74,0.2)',borderRadius:12,padding:20,textAlign:'center'}}><div style={{fontSize:13,color:'var(--red)',fontWeight:600}}>Post {idx+1} failed</div><div style={{fontSize:11,color:'var(--tx-dim)',marginTop:4}}>{item.error}</div></div>);const r=item.result;const tc={photo_hero:'var(--blue)',full_graphic:'var(--gold)',checklist:'var(--green)',review_showcase:'var(--purple)',process_steps:'var(--blue)',stat_callout:'var(--purple)',service_highlight:'var(--green)',offer_coupon:'var(--red)',warning_signs:'var(--red)',did_you_know:'var(--gold)',brand_intro:'var(--blue)',split_feature:'var(--green)'};const cp=()=>{navigator.clipboard.writeText((r.caption||'')+'\n\n'+(r.hashtags||[]).map(h=>'#'+h).join(' ')).then(()=>{setCpd(true);setTimeout(()=>setCpd(false),2000);});};const submit=(rating)=>{onFeedback(rating,fbText.trim());setFbMode(null);setFbText('');};return(<div style={{background:'var(--s1)',border:`1px solid ${item.selected?'var(--gold)':'var(--bd)'}`,borderRadius:12,overflow:'hidden',opacity:item.selected?1:0.55}}>{item.imageData?(<div onClick={onToggle} style={{width:'100%',aspectRatio:'1080/1350',backgroundImage:`url(${item.imageData})`,backgroundSize:'cover',backgroundPosition:'center',cursor:'pointer',position:'relative'}}><div style={{position:'absolute',top:10,right:10,width:24,height:24,borderRadius:6,background:item.selected?'var(--gold)':'rgba(0,0,0,0.5)',border:item.selected?'none':'2px solid rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center'}}>{item.selected&&<Icon name="check" size={14}/>}</div><div style={{position:'absolute',top:10,left:10,background:'rgba(0,0,0,0.6)',borderRadius:5,padding:'2px 8px',fontSize:10,fontWeight:700,color:'#fff'}}>{idx+1}</div></div>):(<div onClick={onToggle} style={{width:'100%',aspectRatio:'1080/1350',background:'var(--s2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:12,color:'var(--tx-dim)'}}>Rendering...</div>)}<div style={{padding:12}}><div style={{display:'flex',gap:4,marginBottom:6,flexWrap:'wrap'}}><Tag color={tc[r.template]||'var(--tx-dim)'}>{r.template?.replace(/_/g,' ')}</Tag><Tag color="var(--tx-muted)">{r.content_type?.replace(/_/g,' ')}</Tag></div><div style={{fontSize:13,fontWeight:700,lineHeight:1.3,marginBottom:4}}>{r.headline}</div><div style={{fontSize:11,color:'var(--tx-muted)',lineHeight:1.4,marginBottom:8}}>{r.subtext}</div>{exp&&(<div style={{fontSize:11,lineHeight:1.6,whiteSpace:'pre-wrap',marginBottom:8,padding:'8px 10px',background:'var(--bg)',borderRadius:6,border:'1px solid var(--bd)'}}>{r.caption}<div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:3}}>{(r.hashtags||[]).map((h,i)=><Tag key={i} color="var(--purple)">#{h}</Tag>)}</div></div>)}<div style={{display:'flex',gap:4,marginBottom:item.feedbackGiven?0:8}}><Btn size="sm" variant="ghost" onClick={()=>setExp(!exp)}>{exp?'Less':'More'}</Btn><Btn size="sm" variant="ghost" onClick={cp}><Icon name={cpd?'check':'copy'} size={11}/></Btn><Btn size="sm" variant="ghost" onClick={onDownload} disabled={!item.imageData}><Icon name="download" size={11}/></Btn></div>{!item.feedbackGiven&&(<div style={{borderTop:'1px solid var(--bd)',paddingTop:8,marginTop:4}}>{fbMode===null?(<div style={{display:'flex',gap:6,alignItems:'center'}}><span style={{fontSize:10,color:'var(--tx-dim)',marginRight:4}}>Rate:</span><button onClick={()=>submit('good')} style={{background:'rgba(52,199,123,0.1)',border:'1px solid rgba(52,199,123,0.2)',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:600,color:'var(--green)',fontFamily:'inherit'}}>Good</button><button onClick={()=>setFbMode('bad')} style={{background:'rgba(231,74,74,0.1)',border:'1px solid rgba(231,74,74,0.2)',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:600,color:'var(--red)',fontFamily:'inherit'}}>Bad</button><button onClick={()=>setFbMode('good')} style={{background:'none',border:'none',color:'var(--tx-dim)',fontSize:10,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline'}}>+ note</button></div>):(<div><div style={{fontSize:10,color:fbMode==='good'?'var(--green)':'var(--red)',fontWeight:700,marginBottom:4,textTransform:'uppercase'}}>{fbMode==='good'?'What did you like?':'What was wrong?'}</div><textarea value={fbText} onChange={e=>setFbText(e.target.value)} placeholder={fbMode==='good'?'Great tone...':'Too generic...'} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:6,padding:'6px 8px',color:'var(--tx)',fontSize:11,fontFamily:'inherit',resize:'vertical',minHeight:50,outline:'none',boxSizing:'border-box'}}/><div style={{display:'flex',gap:4,marginTop:4}}><button onClick={()=>submit(fbMode)} style={{background:fbMode==='good'?'var(--green)':'var(--red)',border:'none',borderRadius:5,padding:'4px 12px',cursor:'pointer',fontSize:11,fontWeight:600,color:'#fff',fontFamily:'inherit'}}>Submit</button><button onClick={()=>{setFbMode(null);setFbText('');}} style={{background:'none',border:'none',color:'var(--tx-dim)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button></div></div>)}</div>)}</div></div>);}

function BizPage({biz,setBiz}){const [editing,setEditing]=useState(null);const [form,setForm]=useState({});const [tab,setTab]=useState('profile');const u=k=>v=>setForm(p=>({...p,[k]:v}));const uds=(path,val)=>{setForm(p=>{const ds={...(p.design_system||EMPTY_DESIGN_SYSTEM)};const parts=path.split('.');let ref=ds;for(let i=0;i<parts.length-1;i++){ref[parts[i]]={...ref[parts[i]]};ref=ref[parts[i]];}ref[parts[parts.length-1]]=val;return{...p,design_system:ds};});};const startEdit=b=>{setForm({...b,design_system:{...EMPTY_DESIGN_SYSTEM,...(b.design_system||{})}});setEditing(b.id);setTab('profile');};const startAdd=()=>{setForm({id:'biz_'+Date.now(),name:'',slug:'',website:'',industry:'consulting',industry_label:'',tagline:'',primary_color:'#3B82F6',secondary_color:'#60A5FA',accent_color:'#F59E0B',bg_color:'#0A0A14',text_color:'#FFFFFF',tone:'',icp:'',services:'',service_areas:'',certifications:'',cta_phrases:'',fact_sheet:'',banned_words:'',design_system:{...EMPTY_DESIGN_SYSTEM}});setEditing('new');setTab('profile');};const save=()=>{if(!form.name)return;if(editing==='new'){form.slug=form.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,20);setBiz(p=>[...p,form]);}else{setBiz(p=>p.map(b=>b.id===editing?form:b));}setEditing(null);};const del=id=>setBiz(p=>p.filter(b=>b.id!==id));const indOpts=[{value:'home_service',label:'Home Service'},{value:'saas_tech',label:'SaaS / Tech (B2B)'},{value:'saas_smb',label:'SaaS / SMB (B2C)'},{value:'agency_dev',label:'Agency / Dev'},{value:'consulting',label:'Consulting'},{value:'logistics_advisory',label:'Logistics Advisory'}];const ds=form.design_system||EMPTY_DESIGN_SYSTEM;return(<div style={{padding:28}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}><div><h1 style={{fontSize:22,fontWeight:700}}>Businesses</h1><p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>Brand profiles with full design systems.</p></div><Btn variant="primary" onClick={startAdd}><Icon name="plus" size={14}/> Add Business</Btn></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(310px, 1fr))',gap:12}}>{biz.map(b=>(<div key={b.id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden'}}><div style={{height:4,background:`linear-gradient(90deg, ${b.primary_color}, ${b.accent_color})`}}/><div style={{padding:16}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}><div><div style={{fontSize:15,fontWeight:700}}>{b.name}</div><div style={{fontSize:11,color:'var(--tx-muted)',marginTop:2}}>{b.industry_label||b.industry}</div></div><div style={{display:'flex',gap:3}}><div style={{width:16,height:16,borderRadius:3,background:b.primary_color,border:'1px solid var(--bd)'}}/><div style={{width:16,height:16,borderRadius:3,background:b.accent_color,border:'1px solid var(--bd)'}}/></div></div>{b.website&&<div style={{fontSize:10,color:'var(--tx-dim)',marginBottom:5}}>{b.website}</div>}<div style={{display:'flex',gap:5}}><Btn size="sm" onClick={()=>startEdit(b)}><Icon name="edit" size={12}/> Edit</Btn><Btn size="sm" variant="danger" onClick={()=>del(b.id)}><Icon name="trash" size={12}/></Btn></div></div></div>))}</div>{editing!==null&&(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={e=>{if(e.target===e.currentTarget)setEditing(null);}}><div style={{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:14,width:'94%',maxWidth:740,maxHeight:'90vh',overflow:'auto',padding:0}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'18px 24px',borderBottom:'1px solid var(--bd)'}}><h2 style={{fontSize:18,fontWeight:700,margin:0}}>{editing==='new'?'Add Business':'Edit Business'}</h2><Btn variant="ghost" onClick={()=>setEditing(null)}><Icon name="x" size={14}/></Btn></div><div style={{display:'flex',gap:0,borderBottom:'1px solid var(--bd)'}}>{['profile','colors','design','content'].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{padding:'10px 20px',border:'none',borderBottom:tab===t?'2px solid var(--gold)':'2px solid transparent',background:'transparent',color:tab===t?'var(--gold)':'var(--tx-muted)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase',letterSpacing:'.04em'}}>{t}</button>))}</div><div style={{padding:24}}>{tab==='profile'&&(<><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 14px'}}><Input label="Business Name" value={form.name} onChange={u('name')} placeholder="Reliable Solutions Atlanta"/><Input label="Website" value={form.website} onChange={u('website')} placeholder="waterhelpme.com"/><Select label="Industry" value={form.industry} onChange={u('industry')} options={indOpts}/><Input label="Industry Label" value={form.industry_label} onChange={u('industry_label')} placeholder="Foundation Repair"/><Input label="Tagline" value={form.tagline} onChange={u('tagline')}/></div><Input label="Tone" value={form.tone} onChange={u('tone')} textarea/><Input label="ICP" value={form.icp} onChange={u('icp')} textarea/><Input label="Services" value={form.services} onChange={u('services')} textarea/><Input label="Service Areas" value={form.service_areas} onChange={u('service_areas')}/><Input label="Certifications" value={form.certifications} onChange={u('certifications')}/><Input label="CTAs" value={form.cta_phrases} onChange={u('cta_phrases')}/><Input label="Fact Sheet" value={form.fact_sheet} onChange={u('fact_sheet')} textarea/><Input label="Banned Words" value={form.banned_words} onChange={u('banned_words')}/></>)}{tab==='colors'&&(<><FieldLabel text="Brand Colors"/><div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:'0 8px'}}><Input label="Primary" value={form.primary_color} onChange={u('primary_color')} type="color" style={{padding:3,height:38}}/><Input label="Secondary" value={form.secondary_color} onChange={u('secondary_color')} type="color" style={{padding:3,height:38}}/><Input label="Accent" value={form.accent_color} onChange={u('accent_color')} type="color" style={{padding:3,height:38}}/><Input label="BG" value={form.bg_color} onChange={u('bg_color')} type="color" style={{padding:3,height:38}}/><Input label="Text" value={form.text_color} onChange={u('text_color')} type="color" style={{padding:3,height:38}}/></div><FieldLabel text="Extended Colors"/><div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:'0 8px'}}><Input label="Urgency" value={ds.colors_extended?.urgency||''} onChange={v=>uds('colors_extended.urgency',v)} type="color" style={{padding:3,height:38}}/><Input label="Urgency Dark" value={ds.colors_extended?.urgency_dark||''} onChange={v=>uds('colors_extended.urgency_dark',v)} type="color" style={{padding:3,height:38}}/><Input label="Accent Light" value={ds.colors_extended?.accent_light||''} onChange={v=>uds('colors_extended.accent_light',v)} type="color" style={{padding:3,height:38}}/><Input label="Text on Light" value={ds.colors_extended?.text_on_light||''} onChange={v=>uds('colors_extended.text_on_light',v)} type="color" style={{padding:3,height:38}}/><Input label="Border" value={ds.colors_extended?.border||''} onChange={v=>uds('colors_extended.border',v)} type="color" style={{padding:3,height:38}}/></div><FieldLabel text="Gradients"/><Input label="Header" value={ds.gradients?.header||''} onChange={v=>uds('gradients.header',v)}/><Input label="Accent" value={ds.gradients?.accent||''} onChange={v=>uds('gradients.accent',v)}/><Input label="CTA" value={ds.gradients?.cta||''} onChange={v=>uds('gradients.cta',v)}/><Input label="Photo Overlay" value={ds.gradients?.photo_overlay||''} onChange={v=>uds('gradients.photo_overlay',v)}/></>)}{tab==='design'&&(<><FieldLabel text="Headline Font"/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0 10px'}}><Input label="Family" value={ds.fonts?.headline?.family||''} onChange={v=>uds('fonts.headline.family',v)}/><Input label="Weight" value={ds.fonts?.headline?.weight||''} onChange={v=>uds('fonts.headline.weight',v)}/><Input label="Size Range" value={ds.fonts?.headline?.size_range||''} onChange={v=>uds('fonts.headline.size_range',v)}/></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 10px'}}><Input label="Transform" value={ds.fonts?.headline?.transform||''} onChange={v=>uds('fonts.headline.transform',v)}/><Input label="Letter Spacing" value={ds.fonts?.headline?.letter_spacing||''} onChange={v=>uds('fonts.headline.letter_spacing',v)}/></div><FieldLabel text="Body Font"/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0 10px'}}><Input label="Family" value={ds.fonts?.body?.family||''} onChange={v=>uds('fonts.body.family',v)}/><Input label="Weight" value={ds.fonts?.body?.weight||''} onChange={v=>uds('fonts.body.weight',v)}/><Input label="Size Range" value={ds.fonts?.body?.size_range||''} onChange={v=>uds('fonts.body.size_range',v)}/></div><FieldLabel text="CTA Bar"/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 10px'}}><Select label="Enabled" value={ds.cta_bar?.enabled?'yes':'no'} onChange={v=>uds('cta_bar.enabled',v==='yes')} options={[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}/><Input label="Phone" value={ds.cta_bar?.phone||''} onChange={v=>uds('cta_bar.phone',v)}/></div><Input label="CTA Variations (one per line)" value={(ds.cta_bar?.cta_variations||[]).join('\n')} onChange={v=>uds('cta_bar.cta_variations',v.split('\n').filter(Boolean))} textarea/><Input label="Trust Badges" value={(ds.trust_badges||[]).join(', ')} onChange={v=>uds('trust_badges',v.split(',').map(s=>s.trim()).filter(Boolean))}/><Input label="Style Notes" value={ds.style_notes||''} onChange={v=>uds('style_notes',v)} textarea/></>)}{tab==='content'&&(<><FieldLabel text="Enabled Post Types"/><div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>{(ds.post_types||[]).map((pt,i)=>(<button key={pt.id} onClick={()=>{const updated=[...(ds.post_types||[])];updated[i]={...updated[i],enabled:!updated[i].enabled};uds('post_types',updated);}} style={{padding:'8px 16px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,background:pt.enabled?'rgba(201,164,76,0.1)':'var(--s2)',border:`1px solid ${pt.enabled?'var(--gold)':'var(--bd)'}`,color:pt.enabled?'var(--gold)':'var(--tx-dim)'}}>{pt.name}</button>))}</div></>)}</div><div style={{display:'flex',gap:8,justifyContent:'flex-end',padding:'16px 24px',borderTop:'1px solid var(--bd)'}}><Btn onClick={()=>setEditing(null)}>Cancel</Btn><Btn variant="primary" onClick={save}>Save Business</Btn></div></div></div>)}</div>);}

function PhotoPage({biz,onUpdate}){const [bizId,setBizId]=useState(biz[0]?.id||'');const [photos,setPhotos]=useState([]);const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);const fRef=useRef(null);const debounceTimers=useRef({});useEffect(()=>{setLoading(true);getPhotos(bizId).then(p=>{setPhotos(p);setLoading(false);});},[bizId]);const upload=async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;setBusy(true);const newPhotos=await uploadPhotos(bizId,files);if(newPhotos.length)setPhotos(p=>[...p,...newPhotos]);setBusy(false);if(fRef.current)fRef.current.value='';onUpdate();};const del=async(photo)=>{setPhotos(p=>p.filter(x=>x.id!==photo.id));await deletePhoto(photo.id,photo.storage_path);onUpdate();};const upd=(photo,field,val)=>{setPhotos(p=>p.map(x=>x.id===photo.id?{...x,[field]:val}:x));const key=photo.id+field;if(debounceTimers.current[key])clearTimeout(debounceTimers.current[key]);debounceTimers.current[key]=setTimeout(()=>{updatePhoto(photo.id,{[field]:val});},field==='phone_visible'?0:300);};const svcTypes=['general','exterior-waterproofing','foundation-repair','crawl-space','basement-waterproofing','drainage','mold-remediation','commercial','team-branded','product','office','lifestyle','equipment','screenshot'];const moods=['professional','casual','action','result','dramatic','clean'];return(<div style={{padding:28}}><div style={{marginBottom:22}}><h1 style={{fontSize:22,fontWeight:700}}>Photo Bank</h1><p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>Upload photos with metadata for AI selection.</p></div><div style={{display:'flex',gap:14,alignItems:'flex-end',marginBottom:22}}><div style={{minWidth:220}}><Select label="Business" value={bizId} onChange={v=>setBizId(v)} options={biz.map(x=>({value:x.id,label:x.name}))}/></div><input ref={fRef} type="file" accept="image/*" multiple onChange={upload} style={{display:'none'}}/><Btn variant="primary" onClick={()=>fRef.current?.click()} disabled={busy}><Icon name="plus" size={14}/> {busy?'Uploading...':'Upload Photos'}</Btn><span style={{fontSize:12,color:'var(--tx-dim)'}}>{photos.length} photos</span></div>{loading?(<div style={{textAlign:'center',padding:'40px 20px'}}><div style={{fontSize:13,color:'var(--tx-muted)'}}>Loading...</div></div>):!photos.length?(<div style={{textAlign:'center',padding:'50px 20px',background:'var(--s1)',borderRadius:12,border:'1px dashed var(--bd)'}}><div style={{fontSize:14,color:'var(--tx-muted)',fontWeight:500}}>No photos</div></div>):(<div style={{display:'flex',flexDirection:'column',gap:12}}>{photos.map((p)=>(<div key={p.id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',display:'grid',gridTemplateColumns:'160px 1fr',gap:0}}><div style={{width:160,aspectRatio:'4/5',backgroundImage:`url(${p.public_url})`,backgroundSize:'cover',backgroundPosition:'center',position:'relative',flexShrink:0}}><button onClick={()=>del(p)} style={{position:'absolute',top:5,right:5,background:'rgba(0,0,0,.7)',border:'none',color:'var(--red)',cursor:'pointer',borderRadius:5,padding:'3px 5px',display:'flex'}}><Icon name="trash" size={12}/></button></div><div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}><div style={{fontSize:10,color:'var(--tx-dim)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.filename}</div><input value={p.description||''} onChange={e=>upd(p,'description',e.target.value)} placeholder="Description..." style={{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'5px 8px',color:'var(--tx)',fontSize:11,fontFamily:'inherit',width:'100%',outline:'none',boxSizing:'border-box'}}/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}><div><div style={{fontSize:9,color:'var(--tx-dim)',marginBottom:2,textTransform:'uppercase'}}>Service</div><select value={p.service_type||'general'} onChange={e=>upd(p,'service_type',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'3px 5px',color:'var(--tx)',fontSize:10,fontFamily:'inherit'}}>{svcTypes.map(s=><option key={s} value={s}>{s.replace(/-/g,' ')}</option>)}</select></div><div><div style={{fontSize:9,color:'var(--tx-dim)',marginBottom:2,textTransform:'uppercase'}}>Mood</div><select value={p.mood||'professional'} onChange={e=>upd(p,'mood',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'3px 5px',color:'var(--tx)',fontSize:10,fontFamily:'inherit'}}>{moods.map(m=><option key={m} value={m}>{m}</option>)}</select></div><div><div style={{fontSize:9,color:'var(--tx-dim)',marginBottom:2,textTransform:'uppercase'}}>Phone?</div><button onClick={()=>upd(p,'phone_visible',!p.phone_visible)} style={{width:'100%',padding:'3px 5px',borderRadius:5,fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit',background:p.phone_visible?'rgba(52,199,123,0.15)':'var(--bg)',border:`1px solid ${p.phone_visible?'rgba(52,199,123,0.3)':'var(--bd)'}`,color:p.phone_visible?'var(--green)':'var(--tx-dim)'}}>{p.phone_visible?'Yes':'No'}</button></div></div></div></div>))}</div>)}</div>);}

function LibPage({lib,biz,setLib}){const [filter,setFilter]=useState('all');const [cpId,setCpId]=useState(null);const fl=filter==='all'?lib:lib.filter(x=>x.biz_id===filter);const dlItem=item=>{if(!item.image_data)return;const a=document.createElement('a');a.href=item.image_data;a.download=`${item.biz_id}-${item.id}.png`;document.body.appendChild(a);a.click();document.body.removeChild(a);};const cpItem=item=>{const t=(item.content?.caption||'')+'\n\n'+(item.content?.hashtags||[]).map(h=>'#'+h).join(' ');navigator.clipboard.writeText(t).then(()=>{setCpId(item.id);setTimeout(()=>setCpId(null),2000);});};const del=id=>setLib(p=>p.filter(x=>x.id!==id));const fOpts=[{value:'all',label:'All'},...biz.map(b=>({value:b.id,label:b.name.split(' ').map(w=>w[0]).join('').slice(0,3)}))];return(<div style={{padding:28}}><div style={{marginBottom:22}}><h1 style={{fontSize:22,fontWeight:700}}>Content Library</h1><p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>{lib.length} items.</p></div><div style={{display:'flex',gap:4,marginBottom:18,flexWrap:'wrap'}}>{fOpts.map(f=><button key={f.value} onClick={()=>setFilter(f.value)} style={{padding:'5px 13px',borderRadius:6,border:`1px solid ${filter===f.value?'var(--gold)':'var(--bd)'}`,background:filter===f.value?'rgba(201,164,76,0.08)':'var(--s1)',color:filter===f.value?'var(--gold)':'var(--tx-muted)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>{f.label}</button>)}</div>{!fl.length?(<div style={{textAlign:'center',padding:'50px 20px',background:'var(--s1)',borderRadius:12,border:'1px dashed var(--bd)'}}><div style={{fontSize:14,color:'var(--tx-muted)',fontWeight:500}}>No content yet</div></div>):(<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',gap:14}}>{fl.map(item=>(<div key={item.id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden'}}>{item.image_data&&<div style={{width:'100%',aspectRatio:'1080/1350',backgroundImage:`url(${item.image_data})`,backgroundSize:'cover',backgroundPosition:'center'}}/>}<div style={{padding:14}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}><Tag>{item.biz_name||item.biz_id}</Tag><span style={{fontSize:10,color:'var(--tx-dim)'}}>{item.created?new Date(item.created).toLocaleDateString():''}</span></div><div style={{fontSize:14,fontWeight:700,marginBottom:4,lineHeight:1.3}}>{item.content?.headline}</div><div style={{fontSize:11,color:'var(--tx-muted)',lineHeight:1.5,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical'}}>{item.content?.caption}</div><div style={{display:'flex',gap:4,marginTop:10}}><Btn size="sm" onClick={()=>dlItem(item)}><Icon name="download" size={12}/></Btn><Btn size="sm" onClick={()=>cpItem(item)}><Icon name={cpId===item.id?'check':'copy'} size={12}/></Btn><Btn size="sm" variant="danger" onClick={()=>del(item.id)}><Icon name="trash" size={12}/></Btn></div></div></div>))}</div>)}</div>);}