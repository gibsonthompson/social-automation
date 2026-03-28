'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DEFAULT_BUSINESSES, EMPTY_DESIGN_SYSTEM } from '@/lib/businesses';
import { Btn, Input, Select, Tag, FieldLabel, Icon } from '@/components/ui';
import { saveFeedback, getFeedbackForAPI, getFeedbackStats, clearFeedback } from '@/lib/feedback';

// ── Persist ─────────────────────────────────────────────────────────
function lsGet(k, fb) { if (typeof window==='undefined') return fb; try { const r=localStorage.getItem(k); return r?JSON.parse(r):fb; } catch{return fb;} }
function lsSet(k, v) { if (typeof window==='undefined') return; try { localStorage.setItem(k, JSON.stringify(v)); } catch{} }

// ── Photo Manifest helpers ──────────────────────────────────────────
function getPhotoManifest(bizId) { return lsGet('cf_photos_'+bizId, []); }
function setPhotoManifest(bizId, manifest) { lsSet('cf_photos_'+bizId, manifest); }
// Strip base64 data for API (just metadata)
function getManifestForAPI(bizId) {
  return getPhotoManifest(bizId).map(({data, ...rest}) => rest);
}

// ══════════════════════════════════════════════════════════════════════
export default function ContentFarm() {
  const [page, setPage] = useState('generate');
  const [biz, setBiz] = useState([]);
  const [lib, setLib] = useState([]);
  const [ready, setReady] = useState(false);
  const [photoRefresh, setPhotoRefresh] = useState(0); // trigger re-reads

  useEffect(() => { setBiz(lsGet('cf_biz3', DEFAULT_BUSINESSES)); setLib(lsGet('cf_lib3', [])); setReady(true); }, []);
  useEffect(() => { if(ready) lsSet('cf_biz3', biz); }, [biz, ready]);
  useEffect(() => { if(ready){ const m=lib.map(({image_data,...r})=>r); lsSet('cf_lib3',m); }}, [lib, ready]);

  const addLib = useCallback((items) => { const a=Array.isArray(items)?items:[items]; setLib(p=>[...a,...p]); }, []);
  const nav = [
    {id:'generate',l:'Generate',ic:'bolt'},
    {id:'businesses',l:'Businesses',ic:'briefcase'},
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
        {page==='generate' && <GenPage biz={biz} addLib={addLib} key={photoRefresh}/>}
        {page==='businesses' && <BizPage biz={biz} setBiz={setBiz}/>}
        {page==='photos' && <PhotoPage biz={biz} onUpdate={()=>setPhotoRefresh(p=>p+1)}/>}
        {page==='library' && <LibPage lib={lib} biz={biz} setLib={setLib}/>}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// GENERATE PAGE
// ══════════════════════════════════════════════════════════════════════
function GenPage({biz, addLib}) {
  const [bizId, setBizId] = useState(biz[0]?.id||'');
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
      const photoManifest = getManifestForAPI(bizId);
      const photos = getPhotoManifest(bizId);

      const resp = await fetch('/api/generate',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({business:b, mode:'batch', feedback, photoManifest}),
      });
      const data = await resp.json();
      if(data.error) throw new Error(data.error);

      const items = (data.results||[]).map((r,idx)=>({
        ...r, imageData:null, selected:r.success, id:`${Date.now()}-${idx}`, feedbackGiven:false,
      }));
      setBatch(items);
      setLoading(false);

      // Render images progressively via server
      await renderAllServer(items, b, photos);
    } catch(e) { setErr(e.message||'Failed'); setLoading(false); }
  };

  const renderAllServer = async(items, bizData, photos)=>{
    setRendering(true); setRenderProgress(0);
    const upd=[...items];
    const renderUrl = process.env.NEXT_PUBLIC_RENDER_URL || '/api/render';
    const renderKey = process.env.NEXT_PUBLIC_RENDER_KEY || '';

    for(let i=0;i<upd.length;i++){
      const item=upd[i]; if(!item.success||!item.result) continue;

      // Determine which photo to send
      let photoDataUrl=null;
      const pidx = item.result.photo_index;
      if(pidx>=0 && photos[pidx]) {
        photoDataUrl = photos[pidx].data;
      } else if(['photo_hero','process_steps','did_you_know','split_feature'].includes(item.result.template)&&photos.length>0){
        photoDataUrl = photos[i%photos.length].data;
      }

      try {
        const headers = {'Content-Type':'application/json'};
        if(renderKey) headers['X-Render-Key'] = renderKey;

        const resp = await fetch(`${renderUrl}/render`,{
          method:'POST', headers,
          body:JSON.stringify({
            content:item.result,
            business:bizData,
            templateId:item.result.template,
            photoDataUrl,
          }),
        });
        const data = await resp.json();
        if(data.image){
          upd[i]={...upd[i], imageData:data.image};
          setBatch([...upd]);
        }
      } catch(e){ console.error(`Render ${i} failed:`,e); }
      setRenderProgress(i+1);
    }
    setBatch([...upd]); setRendering(false);
  };

  const toggle=(idx)=>setBatch(p=>p.map((it,i)=>i===idx?{...it,selected:!it.selected}:it));
  const selAll=()=>setBatch(p=>p.map(it=>({...it,selected:it.success})));
  const desel=()=>setBatch(p=>p.map(it=>({...it,selected:false})));

  const dlOne=(item,idx)=>{if(!item.imageData)return;const a=document.createElement('a');a.href=item.imageData;a.download=`${b?.slug||'post'}-${idx+1}.png`;document.body.appendChild(a);a.click();document.body.removeChild(a);};

  const dlZip=async()=>{
    const sel=batch.filter(i=>i.selected&&i.imageData);if(!sel.length)return;
    const JSZip=(await import('jszip')).default;const zip=new JSZip();
    sel.forEach((it,i)=>{zip.file(`${b?.slug||'post'}-${i+1}-${it.result?.content_type||'post'}.png`,it.imageData.split(',')[1],{base64:true});});
    const blob=await zip.generateAsync({type:'blob'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`${b?.slug}-batch-${Date.now()}.zip`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  };

  const cpAll=()=>{
    const sel=batch.filter(i=>i.selected&&i.success);if(!sel.length)return;
    const t=sel.map((it,i)=>`--- POST ${i+1} (${it.result.content_type}) ---\n\n${it.result.caption}\n\n${(it.result.hashtags||[]).map(h=>'#'+h).join(' ')}`).join('\n\n\n');
    navigator.clipboard.writeText(t).then(()=>{setAllCopied(true);setTimeout(()=>setAllCopied(false),2000);});
  };

  const saveLib=()=>{
    const sel=batch.filter(i=>i.selected&&i.success&&i.imageData);if(!sel.length)return;
    addLib(sel.map(it=>({id:Date.now()+'-'+Math.random().toString(36).slice(2,6),biz_id:bizId,biz_name:b?.name||'',tpl:it.result.template,content:it.result,image_data:it.imageData,created:new Date().toISOString()})));
  };

  const handleFB=(idx,rating,reason)=>{
    const it=batch[idx];if(!it?.result)return;
    saveFeedback(bizId,{id:`fb-${Date.now()}-${idx}`,headline:it.result.headline,content_type:it.result.content_type,template:it.result.template,rating,reason:reason||'',created_at:new Date().toISOString()});
    setBatch(p=>p.map((x,i)=>i===idx?{...x,feedbackGiven:true,feedbackRating:rating}:x));
    setFbStats(getFeedbackStats(bizId));
  };

  const selCount=batch.filter(i=>i.selected).length;
  const okCount=batch.filter(i=>i.success).length;
  const photoCount=getPhotoManifest(bizId).length;

  return(
    <div style={{padding:28}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-.02em'}}>Generate Content</h1>
        <p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>12 unique posts per batch. Rate posts to train AI. Photos selected intelligently from manifest.</p>
      </div>

      <div style={{display:'flex',gap:14,alignItems:'flex-end',marginBottom:22,flexWrap:'wrap'}}>
        <div style={{minWidth:220}}>
          <Select label="Business" value={bizId} onChange={v=>{setBizId(v);setBatch([]);}} options={biz.map(x=>({value:x.id,label:x.name}))}/>
        </div>
        <Btn variant="primary" size="lg" onClick={generateBatch} disabled={loading||!b}>
          {loading?'Generating 12 posts...':'Generate 12 Posts'}
        </Btn>
        {fbStats.total>0&&(
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',background:'var(--s1)',borderRadius:8,border:'1px solid var(--bd)'}}>
            <span style={{fontSize:11,color:'var(--tx-dim)'}}>AI Learning:</span>
            <Tag color="var(--green)">{fbStats.good} good</Tag>
            <Tag color="var(--red)">{fbStats.bad} bad</Tag>
            <button onClick={()=>{clearFeedback(bizId);setFbStats({total:0,good:0,bad:0});}} style={{background:'none',border:'none',color:'var(--tx-dim)',fontSize:10,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline'}}>clear</button>
          </div>
        )}
        {photoCount>0&&<Tag color="var(--blue)">{photoCount} photos in bank</Tag>}
      </div>

      {err&&<div style={{padding:'12px 18px',background:'rgba(231,74,74,0.08)',border:'1px solid rgba(231,74,74,0.2)',borderRadius:10,color:'var(--red)',fontSize:13,marginBottom:20}}>{err}</div>}

      {loading&&(
        <div style={{textAlign:'center',padding:'60px 20px'}}>
          <div style={{width:36,height:36,border:'3px solid var(--bd)',borderTop:'3px solid var(--gold)',borderRadius:'50%',animation:'spin .7s linear infinite',margin:'0 auto 16px'}}/>
          <div style={{fontSize:14,color:'var(--tx-muted)',fontWeight:500}}>Generating 12 posts for {b?.name}...</div>
          <div style={{fontSize:12,color:'var(--tx-dim)',marginTop:6}}>12 parallel AI calls. ~10-15s.{fbStats.total>0?` Learning from ${fbStats.total} ratings.`:''}{photoCount>0?` Selecting from ${photoCount} photos.`:''}</div>
        </div>
      )}

      {rendering&&!loading&&(
        <div style={{padding:'12px 18px',background:'rgba(201,164,76,0.08)',border:'1px solid rgba(201,164,76,0.2)',borderRadius:10,color:'var(--gold)',fontSize:13,marginBottom:20,display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:16,height:16,border:'2px solid var(--bd)',borderTop:'2px solid var(--gold)',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>Rendering images... ({renderProgress}/{batch.filter(i=>i.success).length})
        </div>
      )}

      {batch.length>0&&!loading&&(
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <Tag color="var(--green)">{okCount}/12</Tag>
              {batch.some(i=>!i.success)&&<Tag color="var(--red)">{12-okCount} failed</Tag>}
              <span style={{fontSize:12,color:'var(--tx-dim)'}}>{selCount} selected</span>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <Btn size="sm" variant="ghost" onClick={selAll}>Select All</Btn>
              <Btn size="sm" variant="ghost" onClick={desel}>Deselect</Btn>
              <Btn size="sm" onClick={cpAll} disabled={!selCount}><Icon name={allCopied?'check':'copy'} size={12}/> {allCopied?'Copied':'Captions'}</Btn>
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

      {!batch.length&&!loading&&(
        <div style={{textAlign:'center',padding:'60px 20px'}}>
          <div style={{opacity:0.07,marginBottom:10}}><Icon name="bolt" size={64}/></div>
          <div style={{fontSize:15,color:'var(--tx-muted)',fontWeight:500,marginTop:14}}>Select a business and generate a batch</div>
          <div style={{fontSize:12,color:'var(--tx-dim)',marginTop:5}}>12 unique posts. AI selects photos from your manifest. Rate to improve over time.</div>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// BATCH CARD
// ══════════════════════════════════════════════════════════════════════
function BatchCard({item,idx,onToggle,onDownload,onFeedback}){
  const [exp,setExp]=useState(false);
  const [cpd,setCpd]=useState(false);
  const [fbMode,setFbMode]=useState(null);
  const [fbText,setFbText]=useState('');

  if(!item.success) return(
    <div style={{background:'var(--s1)',border:'1px solid rgba(231,74,74,0.2)',borderRadius:12,padding:20,textAlign:'center'}}>
      <div style={{fontSize:13,color:'var(--red)',fontWeight:600}}>Post {idx+1} failed</div>
      <div style={{fontSize:11,color:'var(--tx-dim)',marginTop:4}}>{item.error}</div>
    </div>
  );

  const r=item.result;
  const tc={photo_hero:'var(--blue)',full_graphic:'var(--gold)',checklist:'var(--green)',review_showcase:'var(--purple)',process_steps:'var(--blue)',stat_callout:'var(--purple)',service_highlight:'var(--green)',offer_coupon:'var(--red)',warning_signs:'var(--red)',did_you_know:'var(--gold)',brand_intro:'var(--blue)',split_feature:'var(--green)'};

  const cp=()=>{navigator.clipboard.writeText((r.caption||'')+'\n\n'+(r.hashtags||[]).map(h=>'#'+h).join(' ')).then(()=>{setCpd(true);setTimeout(()=>setCpd(false),2000);});};
  const submit=(rating)=>{onFeedback(rating,fbText.trim());setFbMode(null);setFbText('');};

  return(
    <div style={{background:'var(--s1)',border:`1px solid ${item.selected?'var(--gold)':'var(--bd)'}`,borderRadius:12,overflow:'hidden',opacity:item.selected?1:0.55}}>
      {item.imageData?(
        <div onClick={onToggle} style={{width:'100%',aspectRatio:'1080/1350',backgroundImage:`url(${item.imageData})`,backgroundSize:'cover',backgroundPosition:'center',cursor:'pointer',position:'relative'}}>
          <div style={{position:'absolute',top:10,right:10,width:24,height:24,borderRadius:6,background:item.selected?'var(--gold)':'rgba(0,0,0,0.5)',border:item.selected?'none':'2px solid rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            {item.selected&&<Icon name="check" size={14}/>}
          </div>
          <div style={{position:'absolute',top:10,left:10,background:'rgba(0,0,0,0.6)',borderRadius:5,padding:'2px 8px',fontSize:10,fontWeight:700,color:'#fff'}}>{idx+1}</div>
          {item.feedbackGiven&&<div style={{position:'absolute',bottom:10,right:10,background:'rgba(0,0,0,0.7)',borderRadius:5,padding:'3px 8px',fontSize:10,fontWeight:700,color:item.feedbackRating==='good'?'var(--green)':'var(--red)'}}>{item.feedbackRating==='good'?'APPROVED':'REJECTED'}</div>}
          {r.photo_index>=0&&<div style={{position:'absolute',bottom:10,left:10,background:'rgba(0,0,0,0.6)',borderRadius:5,padding:'2px 8px',fontSize:9,color:'var(--blue)'}}>Photo #{r.photo_index+1}</div>}
        </div>
      ):(
        <div onClick={onToggle} style={{width:'100%',aspectRatio:'1080/1350',background:'var(--s2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:12,color:'var(--tx-dim)'}}>Rendering...</div>
      )}
      <div style={{padding:12}}>
        <div style={{display:'flex',gap:4,marginBottom:6,flexWrap:'wrap'}}>
          <Tag color={tc[r.template]||'var(--tx-dim)'}>{r.template?.replace(/_/g,' ')}</Tag>
          <Tag color="var(--tx-muted)">{r.content_type?.replace(/_/g,' ')}</Tag>
        </div>
        <div style={{fontSize:13,fontWeight:700,lineHeight:1.3,marginBottom:4}}>{r.headline}</div>
        <div style={{fontSize:11,color:'var(--tx-muted)',lineHeight:1.4,marginBottom:8}}>{r.subtext}</div>
        {exp&&(
          <div style={{fontSize:11,lineHeight:1.6,whiteSpace:'pre-wrap',marginBottom:8,padding:'8px 10px',background:'var(--bg)',borderRadius:6,border:'1px solid var(--bd)'}}>
            {r.caption}
            <div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:3}}>{(r.hashtags||[]).map((h,i)=><Tag key={i} color="var(--purple)">#{h}</Tag>)}</div>
          </div>
        )}
        <div style={{display:'flex',gap:4,marginBottom:item.feedbackGiven?0:8}}>
          <Btn size="sm" variant="ghost" onClick={()=>setExp(!exp)}>{exp?'Less':'More'}</Btn>
          <Btn size="sm" variant="ghost" onClick={cp}><Icon name={cpd?'check':'copy'} size={11}/></Btn>
          <Btn size="sm" variant="ghost" onClick={onDownload} disabled={!item.imageData}><Icon name="download" size={11}/></Btn>
        </div>
        {!item.feedbackGiven&&(
          <div style={{borderTop:'1px solid var(--bd)',paddingTop:8,marginTop:4}}>
            {fbMode===null?(
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{fontSize:10,color:'var(--tx-dim)',marginRight:4}}>Rate:</span>
                <button onClick={()=>submit('good')} style={{background:'rgba(52,199,123,0.1)',border:'1px solid rgba(52,199,123,0.2)',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:600,color:'var(--green)',fontFamily:'inherit'}}>Good</button>
                <button onClick={()=>setFbMode('bad')} style={{background:'rgba(231,74,74,0.1)',border:'1px solid rgba(231,74,74,0.2)',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:600,color:'var(--red)',fontFamily:'inherit'}}>Bad</button>
                <button onClick={()=>setFbMode('good')} style={{background:'none',border:'none',color:'var(--tx-dim)',fontSize:10,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline'}}>+ note</button>
              </div>
            ):(
              <div>
                <div style={{fontSize:10,color:fbMode==='good'?'var(--green)':'var(--red)',fontWeight:700,marginBottom:4,textTransform:'uppercase'}}>{fbMode==='good'?'What did you like?':'What was wrong?'}</div>
                <textarea value={fbText} onChange={e=>setFbText(e.target.value)} placeholder={fbMode==='good'?'Great tone, keep this angle...':'Too generic, wrong photo...'} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:6,padding:'6px 8px',color:'var(--tx)',fontSize:11,fontFamily:'inherit',resize:'vertical',minHeight:50,outline:'none',boxSizing:'border-box'}}/>
                <div style={{display:'flex',gap:4,marginTop:4}}>
                  <button onClick={()=>submit(fbMode)} style={{background:fbMode==='good'?'var(--green)':'var(--red)',border:'none',borderRadius:5,padding:'4px 12px',cursor:'pointer',fontSize:11,fontWeight:600,color:'#fff',fontFamily:'inherit'}}>Submit</button>
                  <button onClick={()=>{setFbMode(null);setFbText('');}} style={{background:'none',border:'none',color:'var(--tx-dim)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// BUSINESSES PAGE — TABBED EDITOR WITH DESIGN SYSTEM
// ══════════════════════════════════════════════════════════════════════
function BizPage({biz,setBiz}){
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({});
  const [tab,setTab]=useState('profile');
  const u=k=>v=>setForm(p=>({...p,[k]:v}));
  const uds=(path,val)=>{
    setForm(p=>{
      const ds={...(p.design_system||EMPTY_DESIGN_SYSTEM)};
      const parts=path.split('.');
      let ref=ds;
      for(let i=0;i<parts.length-1;i++){ref[parts[i]]={...ref[parts[i]]};ref=ref[parts[i]];}
      ref[parts[parts.length-1]]=val;
      return{...p,design_system:ds};
    });
  };

  const startEdit=b=>{setForm({...b,design_system:{...EMPTY_DESIGN_SYSTEM,...(b.design_system||{})}});setEditing(b.id);setTab('profile');};
  const startAdd=()=>{
    setForm({id:'biz_'+Date.now(),name:'',slug:'',website:'',industry:'consulting',industry_label:'',tagline:'',primary_color:'#3B82F6',secondary_color:'#60A5FA',accent_color:'#F59E0B',bg_color:'#0A0A14',text_color:'#FFFFFF',tone:'',icp:'',services:'',service_areas:'',certifications:'',cta_phrases:'',fact_sheet:'',banned_words:'',design_system:{...EMPTY_DESIGN_SYSTEM}});
    setEditing('new');setTab('profile');
  };
  const save=()=>{
    if(!form.name)return;
    if(editing==='new'){form.slug=form.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,20);setBiz(p=>[...p,form]);}
    else{setBiz(p=>p.map(b=>b.id===editing?form:b));}
    setEditing(null);
  };
  const del=id=>setBiz(p=>p.filter(b=>b.id!==id));

  const indOpts=[{value:'home_service',label:'Home Service'},{value:'saas_tech',label:'SaaS / Tech (B2B)'},{value:'saas_smb',label:'SaaS / SMB (B2C)'},{value:'agency_dev',label:'Agency / Dev'},{value:'consulting',label:'Consulting'},{value:'logistics_advisory',label:'Logistics Advisory'}];
  const ds=form.design_system||EMPTY_DESIGN_SYSTEM;

  return(
    <div style={{padding:28}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>Businesses</h1>
          <p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>Brand profiles with full design systems. Each business is its own rendering engine.</p>
        </div>
        <Btn variant="primary" onClick={startAdd}><Icon name="plus" size={14}/> Add Business</Btn>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(310px, 1fr))',gap:12}}>
        {biz.map(b=>(
          <div key={b.id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden'}}>
            <div style={{height:4,background:`linear-gradient(90deg, ${b.primary_color}, ${b.accent_color})`}}/>
            <div style={{padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700}}>{b.name}</div>
                  <div style={{fontSize:11,color:'var(--tx-muted)',marginTop:2}}>{b.industry_label||b.industry}</div>
                </div>
                <div style={{display:'flex',gap:3}}>
                  <div style={{width:16,height:16,borderRadius:3,background:b.primary_color,border:'1px solid var(--bd)'}}/>
                  <div style={{width:16,height:16,borderRadius:3,background:b.accent_color,border:'1px solid var(--bd)'}}/>
                </div>
              </div>
              {b.website&&<div style={{fontSize:10,color:'var(--tx-dim)',marginBottom:5}}>{b.website}</div>}
              {b.design_system?.style_notes&&<div style={{fontSize:11,color:'var(--tx-muted)',lineHeight:1.4,marginBottom:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.design_system.style_notes}</div>}
              <div style={{display:'flex',gap:5}}>
                <Btn size="sm" onClick={()=>startEdit(b)}><Icon name="edit" size={12}/> Edit</Btn>
                <Btn size="sm" variant="danger" onClick={()=>del(b.id)}><Icon name="trash" size={12}/></Btn>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── EDIT MODAL WITH TABS ── */}
      {editing!==null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={e=>{if(e.target===e.currentTarget)setEditing(null);}}>
          <div style={{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:14,width:'94%',maxWidth:740,maxHeight:'90vh',overflow:'auto',padding:0}}>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'18px 24px',borderBottom:'1px solid var(--bd)'}}>
              <h2 style={{fontSize:18,fontWeight:700,margin:0}}>{editing==='new'?'Add Business':'Edit Business'}</h2>
              <Btn variant="ghost" onClick={()=>setEditing(null)}><Icon name="x" size={14}/></Btn>
            </div>
            {/* Tabs */}
            <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--bd)'}}>
              {['profile','colors','design','content'].map(t=>(
                <button key={t} onClick={()=>setTab(t)} style={{padding:'10px 20px',border:'none',borderBottom:tab===t?'2px solid var(--gold)':'2px solid transparent',background:'transparent',color:tab===t?'var(--gold)':'var(--tx-muted)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase',letterSpacing:'.04em'}}>{t}</button>
              ))}
            </div>
            {/* Tab content */}
            <div style={{padding:24}}>
              {tab==='profile'&&(
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 14px'}}>
                    <Input label="Business Name" value={form.name} onChange={u('name')} placeholder="Reliable Solutions Atlanta"/>
                    <Input label="Website" value={form.website} onChange={u('website')} placeholder="waterhelpme.com"/>
                    <Select label="Industry (Prompt Strategy)" value={form.industry} onChange={u('industry')} options={indOpts}/>
                    <Input label="Industry Label" value={form.industry_label} onChange={u('industry_label')} placeholder="Foundation Repair"/>
                    <Input label="Tagline" value={form.tagline} onChange={u('tagline')} placeholder="Carrier Resources, Brokerage Results"/>
                  </div>
                  <Input label="Tone of Voice" value={form.tone} onChange={u('tone')} textarea placeholder="Authoritative and trustworthy..."/>
                  <Input label="Ideal Customer Profile" value={form.icp} onChange={u('icp')} textarea placeholder="Homeowners in metro Atlanta..."/>
                  <Input label="Services (comma separated)" value={form.services} onChange={u('services')} textarea placeholder="Foundation Repair, Waterproofing..."/>
                  <Input label="Service Areas" value={form.service_areas} onChange={u('service_areas')} placeholder="Atlanta, Marietta"/>
                  <Input label="Certifications" value={form.certifications} onChange={u('certifications')} placeholder="BBB A+, IICRC"/>
                  <Input label="Preferred CTAs" value={form.cta_phrases} onChange={u('cta_phrases')} placeholder="Schedule Your Free Inspection"/>
                  <Input label="Fact Sheet" value={form.fact_sheet} onChange={u('fact_sheet')} textarea placeholder="Founded 2020, served 500+ homes..."/>
                  <Input label="Banned Words" value={form.banned_words} onChange={u('banned_words')} placeholder="cheap, guarantee, #1"/>
                </>
              )}
              {tab==='colors'&&(
                <>
                  <FieldLabel text="Brand Colors"/>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:'0 8px'}}>
                    <Input label="Primary" value={form.primary_color} onChange={u('primary_color')} type="color" style={{padding:3,height:38}}/>
                    <Input label="Secondary" value={form.secondary_color} onChange={u('secondary_color')} type="color" style={{padding:3,height:38}}/>
                    <Input label="Accent" value={form.accent_color} onChange={u('accent_color')} type="color" style={{padding:3,height:38}}/>
                    <Input label="BG" value={form.bg_color} onChange={u('bg_color')} type="color" style={{padding:3,height:38}}/>
                    <Input label="Text" value={form.text_color} onChange={u('text_color')} type="color" style={{padding:3,height:38}}/>
                  </div>
                  <FieldLabel text="Extended Colors"/>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:'0 8px'}}>
                    <Input label="Urgency" value={ds.colors_extended?.urgency||''} onChange={v=>uds('colors_extended.urgency',v)} type="color" style={{padding:3,height:38}}/>
                    <Input label="Urgency Dark" value={ds.colors_extended?.urgency_dark||''} onChange={v=>uds('colors_extended.urgency_dark',v)} type="color" style={{padding:3,height:38}}/>
                    <Input label="Accent Light" value={ds.colors_extended?.accent_light||''} onChange={v=>uds('colors_extended.accent_light',v)} type="color" style={{padding:3,height:38}}/>
                    <Input label="Text on Light" value={ds.colors_extended?.text_on_light||''} onChange={v=>uds('colors_extended.text_on_light',v)} type="color" style={{padding:3,height:38}}/>
                    <Input label="Border" value={ds.colors_extended?.border||''} onChange={v=>uds('colors_extended.border',v)} type="color" style={{padding:3,height:38}}/>
                  </div>
                  <FieldLabel text="Gradients (CSS)"/>
                  <Input label="Header" value={ds.gradients?.header||''} onChange={v=>uds('gradients.header',v)} placeholder="linear-gradient(160deg, #1a2a6c, #273373)"/>
                  <Input label="Accent" value={ds.gradients?.accent||''} onChange={v=>uds('gradients.accent',v)} placeholder="linear-gradient(90deg, ...)"/>
                  <Input label="CTA" value={ds.gradients?.cta||''} onChange={v=>uds('gradients.cta',v)} placeholder="linear-gradient(135deg, #C62828, #B71C1C)"/>
                  <Input label="Photo Overlay" value={ds.gradients?.photo_overlay||''} onChange={v=>uds('gradients.photo_overlay',v)} placeholder="linear-gradient(0deg, ...)"/>
                </>
              )}
              {tab==='design'&&(
                <>
                  <FieldLabel text="Headline Font"/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0 10px'}}>
                    <Input label="Family" value={ds.fonts?.headline?.family||''} onChange={v=>uds('fonts.headline.family',v)} placeholder="Bebas Neue"/>
                    <Input label="Weight" value={ds.fonts?.headline?.weight||''} onChange={v=>uds('fonts.headline.weight',v)} placeholder="700"/>
                    <Input label="Size Range" value={ds.fonts?.headline?.size_range||''} onChange={v=>uds('fonts.headline.size_range',v)} placeholder="80-116px"/>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 10px'}}>
                    <Input label="Transform" value={ds.fonts?.headline?.transform||''} onChange={v=>uds('fonts.headline.transform',v)} placeholder="uppercase"/>
                    <Input label="Letter Spacing" value={ds.fonts?.headline?.letter_spacing||''} onChange={v=>uds('fonts.headline.letter_spacing',v)} placeholder="2px"/>
                  </div>
                  <FieldLabel text="Body Font"/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0 10px'}}>
                    <Input label="Family" value={ds.fonts?.body?.family||''} onChange={v=>uds('fonts.body.family',v)} placeholder="Montserrat"/>
                    <Input label="Weight" value={ds.fonts?.body?.weight||''} onChange={v=>uds('fonts.body.weight',v)} placeholder="700"/>
                    <Input label="Size Range" value={ds.fonts?.body?.size_range||''} onChange={v=>uds('fonts.body.size_range',v)} placeholder="20-26px"/>
                  </div>
                  <FieldLabel text="CTA Bar"/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 10px'}}>
                    <Select label="Enabled" value={ds.cta_bar?.enabled?'yes':'no'} onChange={v=>uds('cta_bar.enabled',v==='yes')} options={[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}/>
                    <Input label="Phone" value={ds.cta_bar?.phone||''} onChange={v=>uds('cta_bar.phone',v)} placeholder="770-895-2039"/>
                  </div>
                  <Input label="CTA Variations (one per line)" value={(ds.cta_bar?.cta_variations||[]).join('\n')} onChange={v=>uds('cta_bar.cta_variations',v.split('\n').filter(Boolean))} textarea placeholder="Call Today For Your | FREE ESTIMATE!"/>
                  <Input label="Trust Badges (comma separated)" value={(ds.trust_badges||[]).join(', ')} onChange={v=>uds('trust_badges',v.split(',').map(s=>s.trim()).filter(Boolean))} placeholder="BBB A+, IICRC, Google 5.0"/>
                  <Input label="Style Notes" value={ds.style_notes||''} onChange={v=>uds('style_notes',v)} textarea placeholder="Three-zone layout: Visual → Content → CTA bar..."/>
                </>
              )}
              {tab==='content'&&(
                <>
                  <FieldLabel text="Enabled Post Types"/>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>
                    {(ds.post_types||[]).map((pt,i)=>(
                      <button key={pt.id} onClick={()=>{
                        const updated=[...(ds.post_types||[])];
                        updated[i]={...updated[i],enabled:!updated[i].enabled};
                        uds('post_types',updated);
                      }} style={{
                        padding:'8px 16px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,
                        background:pt.enabled?'rgba(201,164,76,0.1)':'var(--s2)',
                        border:`1px solid ${pt.enabled?'var(--gold)':'var(--bd)'}`,
                        color:pt.enabled?'var(--gold)':'var(--tx-dim)',
                      }}>{pt.name}</button>
                    ))}
                  </div>
                  <p style={{fontSize:12,color:'var(--tx-dim)',marginBottom:16}}>
                    The design system controls how images are rendered via server-side HTML templates. Fonts, gradients, CTA bar format, and trust badges are all baked into the rendering pipeline. The AI uses this context to write content that fits each visual identity.
                  </p>
                </>
              )}
            </div>
            {/* Footer */}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',padding:'16px 24px',borderTop:'1px solid var(--bd)'}}>
              <Btn onClick={()=>setEditing(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={save}>Save Business</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// PHOTO BANK — RICH MANIFEST EDITOR
// ══════════════════════════════════════════════════════════════════════
function PhotoPage({biz,onUpdate}){
  const [bizId,setBizId]=useState(biz[0]?.id||'');
  const [photos,setPhotos]=useState([]);
  const [busy,setBusy]=useState(false);
  const fRef=useRef(null);

  // Load from localStorage
  useEffect(()=>{setPhotos(getPhotoManifest(bizId));},[bizId]);
  // Save on change
  useEffect(()=>{if(photos.length>=0) setPhotoManifest(bizId,photos);},[photos,bizId]);

  const upload=async e=>{
    const files=Array.from(e.target.files||[]);if(!files.length)return;
    setBusy(true);
    const arr=[];
    for(const f of files){
      if(!f.type.startsWith('image/'))continue;
      const data=await new Promise(r=>{const rd=new FileReader();rd.onload=()=>r(rd.result);rd.readAsDataURL(f);});
      arr.push({data,filename:f.name,description:'',service_type:'general',branding:'',best_use:'',phone_visible:false,mood:'professional'});
    }
    setPhotos(p=>[...p,...arr]);
    setBusy(false);
    if(fRef.current)fRef.current.value='';
    onUpdate();
  };

  const del=idx=>{setPhotos(p=>p.filter((_,i)=>i!==idx));onUpdate();};
  const upd=(idx,field,val)=>{setPhotos(p=>{const a=[...p];a[idx]={...a[idx],[field]:val};return a;});};

  const svcTypes=['general','exterior-waterproofing','foundation-repair','crawl-space','basement-waterproofing','drainage','mold-remediation','commercial','team-branded','product','office','lifestyle','equipment','screenshot'];
  const moods=['professional','casual','action','result','dramatic','clean'];

  return(
    <div style={{padding:28}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:700}}>Photo Bank</h1>
        <p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>Upload photos with rich metadata. The AI reads descriptions, service types, and branding notes to select the right photo for each post.</p>
      </div>
      <div style={{display:'flex',gap:14,alignItems:'flex-end',marginBottom:22}}>
        <div style={{minWidth:220}}>
          <Select label="Business" value={bizId} onChange={v=>{setBizId(v);}} options={biz.map(x=>({value:x.id,label:x.name}))}/>
        </div>
        <input ref={fRef} type="file" accept="image/*" multiple onChange={upload} style={{display:'none'}}/>
        <Btn variant="primary" onClick={()=>fRef.current?.click()} disabled={busy}><Icon name="plus" size={14}/> {busy?'Uploading...':'Upload Photos'}</Btn>
        <span style={{fontSize:12,color:'var(--tx-dim)'}}>{photos.length} photos</span>
      </div>

      {!photos.length?(
        <div style={{textAlign:'center',padding:'50px 20px',background:'var(--s1)',borderRadius:12,border:'1px dashed var(--bd)'}}>
          <div style={{fontSize:14,color:'var(--tx-muted)',fontWeight:500}}>No photos for this business</div>
          <div style={{fontSize:12,color:'var(--tx-dim)',marginTop:4}}>Upload photos and add descriptions so the AI can select the right one for each post.</div>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {photos.map((p,idx)=>(
            <div key={idx} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',display:'grid',gridTemplateColumns:'160px 1fr',gap:0}}>
              <div style={{width:160,aspectRatio:'4/5',backgroundImage:`url(${p.data})`,backgroundSize:'cover',backgroundPosition:'center',position:'relative',flexShrink:0}}>
                <button onClick={()=>del(idx)} style={{position:'absolute',top:5,right:5,background:'rgba(0,0,0,.7)',border:'none',color:'var(--red)',cursor:'pointer',borderRadius:5,padding:'3px 5px',display:'flex'}}><Icon name="trash" size={12}/></button>
                <div style={{position:'absolute',bottom:5,left:5,background:'rgba(0,0,0,.6)',borderRadius:4,padding:'1px 6px',fontSize:9,color:'#fff',fontWeight:700}}>#{idx+1}</div>
              </div>
              <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}>
                <div style={{fontSize:10,color:'var(--tx-dim)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.filename}</div>
                <input value={p.description||''} onChange={e=>upd(idx,'description',e.target.value)} placeholder="Wide side view, white brick split-level, 3+ crew digging..." style={{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'5px 8px',color:'var(--tx)',fontSize:11,fontFamily:'inherit',width:'100%',outline:'none',boxSizing:'border-box'}}/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                  <div>
                    <div style={{fontSize:9,color:'var(--tx-dim)',marginBottom:2,textTransform:'uppercase'}}>Service</div>
                    <select value={p.service_type||'general'} onChange={e=>upd(idx,'service_type',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'3px 5px',color:'var(--tx)',fontSize:10,fontFamily:'inherit'}}>
                      {svcTypes.map(s=><option key={s} value={s}>{s.replace(/-/g,' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:'var(--tx-dim)',marginBottom:2,textTransform:'uppercase'}}>Mood</div>
                    <select value={p.mood||'professional'} onChange={e=>upd(idx,'mood',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'3px 5px',color:'var(--tx)',fontSize:10,fontFamily:'inherit'}}>
                      {moods.map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:'var(--tx-dim)',marginBottom:2,textTransform:'uppercase'}}>Phone #?</div>
                    <button onClick={()=>upd(idx,'phone_visible',!p.phone_visible)} style={{
                      width:'100%',padding:'3px 5px',borderRadius:5,fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                      background:p.phone_visible?'rgba(52,199,123,0.15)':'var(--bg)',
                      border:`1px solid ${p.phone_visible?'rgba(52,199,123,0.3)':'var(--bd)'}`,
                      color:p.phone_visible?'var(--green)':'var(--tx-dim)',
                    }}>{p.phone_visible?'Yes':'No'}</button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  <input value={p.branding||''} onChange={e=>upd(idx,'branding',e.target.value)} placeholder="Branding: Blue shirts, phone # legible" style={{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'4px 7px',color:'var(--tx)',fontSize:10,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                  <input value={p.best_use||''} onChange={e=>upd(idx,'best_use',e.target.value)} placeholder="Best for: Hero shot, project showcase" style={{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'4px 7px',color:'var(--tx)',fontSize:10,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
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
function LibPage({lib,biz,setLib}){
  const [filter,setFilter]=useState('all');
  const [cpId,setCpId]=useState(null);
  const fl=filter==='all'?lib:lib.filter(x=>x.biz_id===filter);

  const dlItem=item=>{if(!item.image_data)return;const a=document.createElement('a');a.href=item.image_data;a.download=`${item.biz_id}-${item.id}.png`;document.body.appendChild(a);a.click();document.body.removeChild(a);};
  const cpItem=item=>{const t=(item.content?.caption||'')+'\n\n'+(item.content?.hashtags||[]).map(h=>'#'+h).join(' ');navigator.clipboard.writeText(t).then(()=>{setCpId(item.id);setTimeout(()=>setCpId(null),2000);});};
  const del=id=>setLib(p=>p.filter(x=>x.id!==id));

  const fOpts=[{value:'all',label:'All'},...biz.map(b=>({value:b.id,label:b.name.split(' ').map(w=>w[0]).join('').slice(0,3)}))];

  return(
    <div style={{padding:28}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:700}}>Content Library</h1>
        <p style={{color:'var(--tx-muted)',fontSize:13,marginTop:4}}>{lib.length} items. Image data is session-only.</p>
      </div>
      <div style={{display:'flex',gap:4,marginBottom:18,flexWrap:'wrap'}}>
        {fOpts.map(f=><button key={f.value} onClick={()=>setFilter(f.value)} style={{padding:'5px 13px',borderRadius:6,border:`1px solid ${filter===f.value?'var(--gold)':'var(--bd)'}`,background:filter===f.value?'rgba(201,164,76,0.08)':'var(--s1)',color:filter===f.value?'var(--gold)':'var(--tx-muted)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>{f.label}</button>)}
      </div>
      {!fl.length?(
        <div style={{textAlign:'center',padding:'50px 20px',background:'var(--s1)',borderRadius:12,border:'1px dashed var(--bd)'}}>
          <div style={{fontSize:14,color:'var(--tx-muted)',fontWeight:500}}>No content yet</div>
        </div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',gap:14}}>
          {fl.map(item=>(
            <div key={item.id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden'}}>
              {item.image_data&&<div style={{width:'100%',aspectRatio:'1080/1350',backgroundImage:`url(${item.image_data})`,backgroundSize:'cover',backgroundPosition:'center'}}/>}
              <div style={{padding:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
                  <Tag>{item.biz_name||item.biz_id}</Tag>
                  <span style={{fontSize:10,color:'var(--tx-dim)'}}>{item.created?new Date(item.created).toLocaleDateString():''}</span>
                </div>
                <div style={{fontSize:14,fontWeight:700,marginBottom:4,lineHeight:1.3}}>{item.content?.headline}</div>
                <div style={{fontSize:11,color:'var(--tx-muted)',lineHeight:1.5,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical'}}>{item.content?.caption}</div>
                <div style={{display:'flex',gap:4,marginTop:10}}>
                  <Btn size="sm" onClick={()=>dlItem(item)}><Icon name="download" size={12}/></Btn>
                  <Btn size="sm" onClick={()=>cpItem(item)}><Icon name={cpId===item.id?'check':'copy'} size={12}/></Btn>
                  <Btn size="sm" variant="danger" onClick={()=>del(item.id)}><Icon name="trash" size={12}/></Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}