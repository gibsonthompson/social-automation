'use client';

/**
 * Settings: publishing on/off, posting times, active days, timezone and
 * platforms for one brand. Shows a live preview of the next slots, and on
 * save re-times every post already in the queue so the change is real
 * immediately, not just for future uploads.
 *
 * Path: src/components/farm/SettingsView.jsx
 */

import { useEffect, useMemo, useState } from 'react';
import { Btn, Icon, Select, Segmented, Switch, toast } from '@/components/ui';
import {
  WEEK_ORDER, MAX_POSTS_PER_DAY, normalizeTimes, generateSlots, describeCadence,
  formatTime12, todayLocal, DEFAULT_TIMEZONE,
} from '@/lib/content-farm/cadence';
import { api, fmtDateTime, relativeDay, fmtTime } from './shared';

const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAY_PRESETS = [
  { label: 'Every Day', days: WEEK_ORDER },
  { label: 'Weekdays', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { label: 'Mon, Wed, Fri', days: ['mon', 'wed', 'fri'] },
  { label: 'Tue, Thu', days: ['tue', 'thu'] },
];
const TIME_PRESETS = ['08:00', '09:00', '12:00', '15:00', '18:00', '19:30'];
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time', hint: 'New York' },
  { value: 'America/Chicago', label: 'Central Time', hint: 'Chicago' },
  { value: 'America/Denver', label: 'Mountain Time', hint: 'Denver' },
  { value: 'America/Phoenix', label: 'Arizona Time', hint: 'Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', hint: 'Los Angeles' },
  { value: 'America/Anchorage', label: 'Alaska Time', hint: 'Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time', hint: 'Honolulu' },
  { value: 'Europe/London', label: 'UK Time', hint: 'London' },
  { value: 'UTC', label: 'UTC' },
];
const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(m => ({ value: m, label: `:${m}` }));

function fromBusiness(b) {
  return {
    auto_post: b?.auto_post === true,
    posting_times: normalizeTimes(b?.posting_times).length ? normalizeTimes(b?.posting_times) : ['12:00'],
    active_days: Array.isArray(b?.active_days) && b.active_days.length ? WEEK_ORDER.filter(d => b.active_days.includes(d)) : [...WEEK_ORDER],
    timezone: b?.timezone || DEFAULT_TIMEZONE,
    publish_to: b?.publish_to || 'both',
  };
}

function Section({ title, sub, children, right }) {
  return (
    <div className="cf-card cf-card-pad" style={{ marginBottom: 14 }}>
      <div className="cf-card-head" style={{ alignItems: 'flex-start', marginBottom: children ? 14 : 0 }}>
        <div><div className="cf-card-title">{title}</div>{sub && <div className="cf-card-sub">{sub}</div>}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function SettingsView({ b, onSaved }) {
  const [form, setForm] = useState(fromBusiness(b));
  const [base, setBase] = useState(fromBusiness(b));
  const [applyQueue, setApplyQueue] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [hour, setHour] = useState('9');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmpm] = useState('AM');

  useEffect(() => { setResult(null); setApplyQueue(true); }, [b?.id]);
  useEffect(() => { const f = fromBusiness(b); setForm(f); setBase(f); }, [b?.id, b?.updated_at]);

  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  const cadenceDirty = ['posting_times', 'active_days', 'timezone'].some(k => JSON.stringify(form[k]) !== JSON.stringify(base[k]));
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setResult(null); };

  const queued = (b?.stats?.approved || 0) + (b?.stats?.needs_review || 0);
  const preview = useMemo(() => {
    const today = todayLocal(form.timezone);
    const used = b?.stats?.posted_today ? { [today]: b.stats.posted_today } : {};
    return generateSlots({ ...form }, 6, { usedPerDay: used });
  }, [form, b?.stats?.posted_today]);
  const summary = describeCadence(form);

  const addTime = (t) => {
    const next = normalizeTimes([...form.posting_times, t]);
    if (next.length === form.posting_times.length) { toast(next.includes(t) ? `${formatTime12(t)} is already on the list` : `Up to ${MAX_POSTS_PER_DAY} times a day`, 'info'); return; }
    set('posting_times', next);
  };
  const addPicked = () => {
    let h = Number(hour) % 12; if (ampm === 'PM') h += 12;
    addTime(`${String(h).padStart(2, '0')}:${minute}`);
  };
  const removeTime = (t) => {
    if (form.posting_times.length === 1) { toast('Keep at least one posting time. To stop posting, turn Publishing off.', 'info'); return; }
    set('posting_times', form.posting_times.filter(x => x !== t));
  };
  const toggleDay = (d) => {
    const has = form.active_days.includes(d);
    if (has && form.active_days.length === 1) { toast('Keep at least one day. To stop posting, turn Publishing off.', 'info'); return; }
    set('active_days', WEEK_ORDER.filter(x => (x === d ? !has : form.active_days.includes(x))));
  };

  const save = async () => {
    setSaving(true);
    try {
      const d = await api('/api/businesses', { business_id: b.id, ...form, apply_to_queue: applyQueue });
      const saved = fromBusiness(d.business);
      setForm(saved); setBase(saved);
      setResult(d.reschedule || null);
      await onSaved?.(d.business);
      const moved = d.reschedule?.queued;
      toast(moved ? `Saved. ${moved} queued ${moved === 1 ? 'post' : 'posts'} re-timed.` : 'Settings saved', 'success');
    } catch (e) { toast(`Not saved: ${e.message}`, 'error'); }
    setSaving(false);
  };

  if (!b) return null;

  return (
    <div style={{ maxWidth: 860 }}>
      <Section
        title="Publishing"
        sub={form.auto_post ? 'On. Approved posts go out at their scheduled times.' : 'Off. Nothing publishes for this brand, even approved posts. The queue is kept.'}
        right={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className={`cf-pill ${form.auto_post ? 'is-live' : 'is-paused'}`}><span className="cf-pill-dot" />{form.auto_post ? 'Live' : 'Paused'}</span><Switch on={form.auto_post} onChange={v => set('auto_post', v)} label="Publishing" /></div>}
      />

      <Section title="Posting Times" sub={`Each time is one post on every active day. ${form.posting_times.length} of ${MAX_POSTS_PER_DAY} used.`}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {form.posting_times.map(t => (
            <span key={t} className="cf-chip"><Icon name="clock" size={13} style={{ color: 'var(--cyan)' }} />{formatTime12(t)}<button onClick={() => removeTime(t)} aria-label={`Remove ${formatTime12(t)}`}><Icon name="x" size={13} /></button></span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select value={hour} onChange={setHour} options={HOURS} width={78} />
          <Select value={minute} onChange={setMinute} options={MINUTES} width={86} />
          <Segmented value={ampm} onChange={setAmpm} options={['AM', 'PM']} />
          <Btn onClick={addPicked} disabled={form.posting_times.length >= MAX_POSTS_PER_DAY}><Icon name="plus" size={14} />Add Time</Btn>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--tx-dim)', marginRight: 4 }}>Quick add</span>
          {TIME_PRESETS.map(t => <Btn key={t} size="sm" variant="ghost" onClick={() => addTime(t)} disabled={form.posting_times.includes(t)}>{formatTime12(t)}</Btn>)}
        </div>
      </Section>

      <Section title="Active Days" sub="Posts only go out on these days.">
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {WEEK_ORDER.map(d => <button key={d} className={`cf-day-toggle ${form.active_days.includes(d) ? 'is-on' : ''}`} onClick={() => toggleDay(d)} aria-pressed={form.active_days.includes(d)}>{DAY_LABEL[d]}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAY_PRESETS.map(p => <Btn key={p.label} size="sm" variant="ghost" onClick={() => set('active_days', [...p.days])}>{p.label}</Btn>)}
        </div>
      </Section>

      <div className="cf-grid cf-grid-2" style={{ marginBottom: 14 }}>
        <div className="cf-card cf-card-pad">
          <div className="cf-card-title" style={{ marginBottom: 4 }}>Timezone</div>
          <div className="cf-card-sub" style={{ marginBottom: 12 }}>Posting times are in this zone.</div>
          <Select value={form.timezone} onChange={v => set('timezone', v)} options={TIMEZONES.some(z => z.value === form.timezone) ? TIMEZONES : [...TIMEZONES, { value: form.timezone, label: form.timezone }]} />
        </div>
        <div className="cf-card cf-card-pad">
          <div className="cf-card-title" style={{ marginBottom: 4 }}>Publish To</div>
          <div className="cf-card-sub" style={{ marginBottom: 12 }}>Where each post goes.</div>
          <Segmented value={form.publish_to} onChange={v => set('publish_to', v)} options={[{ value: 'instagram', label: 'Instagram' }, { value: 'facebook', label: 'Facebook' }, { value: 'both', label: 'Both' }]} />
        </div>
      </div>

      <Section title="What This Looks Like" sub={`${summary.text}. ${summary.perWeek} ${summary.perWeek === 1 ? 'post' : 'posts'} a week.`}>
        <div className="cf-grid cf-grid-3" style={{ gap: 8 }}>
          {preview.map(s => (
            <div key={s.iso} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--s2)', border: '1px solid var(--bd)' }}>
              <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>{relativeDay(s.iso, form.timezone)}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtTime(s.iso, form.timezone)}</div>
            </div>
          ))}
        </div>
        {b.stats?.posted_today > 0 && <div style={{ fontSize: 12, color: 'var(--tx-dim)', marginTop: 10 }}>Already posted {b.stats.posted_today} today, so today only gets what is left of the daily count.</div>}
        {!form.auto_post && <div style={{ fontSize: 12, color: 'var(--orange)', marginTop: 10 }}>Publishing is off, so these slots are planned but nothing will post.</div>}
      </Section>

      {result && (
        <div className="cf-banner is-info">
          <Icon name="checkCircle" size={16} style={{ color: 'var(--cyan)' }} />
          <span className="cf-banner-text">
            {result.queued ? <>Re-timed {result.queued} queued {result.queued === 1 ? 'post' : 'posts'}. Next goes out {fmtDateTime(result.first, form.timezone)}, last on {fmtDateTime(result.last, form.timezone)}.</> : result.error ? <>Saved, but re-timing failed: {result.error}</> : 'Saved. Nothing was queued to re-time.'}
          </span>
        </div>
      )}

      {dirty && (
        <div className="cf-savebar">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Unsaved Changes</div>
            {cadenceDirty && queued > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--tx-muted)', marginTop: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={applyQueue} onChange={e => setApplyQueue(e.target.checked)} style={{ accentColor: 'var(--cyan)' }} />
                Also re-time the {queued} {queued === 1 ? 'post' : 'posts'} already queued
              </label>
            )}
          </div>
          <Btn variant="ghost" onClick={() => { setForm(base); setResult(null); }} disabled={saving}>Discard</Btn>
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving' : 'Save Settings'}</Btn>
        </div>
      )}
    </div>
  );
}
