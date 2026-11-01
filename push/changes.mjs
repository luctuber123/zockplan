/* Zockplan – Änderungen zwischen zwei Ständen erkennen (gleiche Logik wie „Neu seit letztem Besuch“ in der App). */

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = n => String(n).padStart(2, '0');
export const dayLabel = ds => { const [y, m, d] = ds.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return `${WD[dt.getUTCDay()]} ${pad(d)}.${pad(m)}.`; };
export const berlinToday = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);

/* Kompakter Stand aus den Rohdaten */
export function buildSnap(people, sessions, games){
  const persons = {};
  for (const [pid, d] of Object.entries(people)){
    const slots = {}; for (const [sid, x] of Object.entries(d.slots || {})) if (x && x.date) slots[sid] = [x.date, x.from, x.to];
    const plus = {}; for (const [k, v] of Object.entries(d.plus || {})) if (v && v.date) plus[k] = v.date;
    const notes = {}; for (const [dt, arr] of Object.entries(d.notes || {})) notes[dt] = (arr || []).map(n => n && n.id).filter(Boolean);
    const votes = {}; for (const [dt, arr] of Object.entries(d.votes || {})) if (Array.isArray(arr)) votes[dt] = [...arr];
    persons[pid] = { slots, days: { ...(d.days || {}) }, plus, votes, notes, series: Object.keys(d.series || {}) };
  }
  const sess = {}; for (const [dt, x] of Object.entries(sessions)) if (x && x.from) sess[dt] = [x.from, x.to, x.game || null, x.by || null];
  return { persons, sessions: sess, games: Object.keys(games) };
}

const RHYTHM_DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function seriesText(x){
  const label = x.title || (x.kind === 'free' ? 'Zeit frei' : x.kind === 'busy' ? 'Belegt' : 'Kann nicht');
  const days = [1, 2, 3, 4, 5, 6, 0].filter(i => (x.days || []).includes(i)).map(i => RHYTHM_DAYS[i]).join(', ');
  return `${label}, ${(x.every || 1) === 2 ? 'alle 2 Wochen' : 'jeden'} ${days}`;
}

/* Liste von Ereignissen {actor, date, text}. actor = wer es ausgelöst hat (null = unbekannt). */
export function diff(old, people, sessions, games, nameOf, today){
  const out = [], dl = dayLabel, gname = id => (games[id] && games[id].name) || null;
  for (const [p, d] of Object.entries(people)){
    const o = old.persons[p] || { slots: {}, days: {}, plus: {}, votes: {}, notes: {}, series: null }, nm = nameOf(p);
    for (const [sid, x] of Object.entries(d.slots || {})){
      if (!x || !x.date || x.date < today) continue;
      const ox = (o.slots || {})[sid];
      if (!ox) out.push({ actor: p, date: x.date, text: `${nm} hat ${dl(x.date)} ${x.from}–${x.to} eingetragen` });
      else if (ox[0] !== x.date || ox[1] !== x.from || ox[2] !== x.to) out.push({ actor: p, date: x.date, text: `${nm} hat die Zeit am ${dl(x.date)} auf ${x.from}–${x.to} geändert` });
    }
    for (const [sid, ox] of Object.entries(o.slots || {})) if (!(d.slots || {})[sid] && ox[0] >= today) out.push({ actor: p, date: ox[0], text: `${nm} hat ${dl(ox[0])} ${ox[1]}–${ox[2]} gelöscht` });
    for (const [dt, st] of Object.entries(d.days || {})) if (dt >= today && (o.days || {})[dt] !== st)
      out.push({ actor: p, date: dt, text: st === 'no' ? `${nm} kann ${dl(dt)} nicht` : st === 'maybe' ? `${nm} kann ${dl(dt)} vielleicht` : `${nm} kann ${dl(dt)}` });
    for (const [k, v] of Object.entries(d.plus || {})){
      if (!v || !v.date || v.date < today || (o.plus || {})[k]) continue;
      const [owner, sid] = k.split('/'), sl = owner && people[owner] && (people[owner].slots || {})[sid];
      out.push({ actor: p, date: v.date, text: `${nm} ist ${dl(v.date)}${sl ? ` ${sl.from}–${sl.to}` : ''} dabei (+1)` });
    }
    for (const [dt, arr] of Object.entries(d.votes || {})){
      if (dt < today || !Array.isArray(arr)) continue;
      const oa = (o.votes || {})[dt] || [], added = arr.filter(g => !oa.includes(g) && gname(g));
      if (added.length) out.push({ actor: p, date: dt, text: `${nm} stimmt für ${added.map(gname).join(' & ')} (${dl(dt)})` });
    }
    if (o.series) for (const [id, x] of Object.entries(d.series || {})) if (!o.series.includes(id) && x && x.days)
      out.push({ actor: p, date: null, text: `${nm} hat eine Serie angelegt: ${seriesText(x)}` });
    for (const [dt, arr] of Object.entries(d.notes || {})){
      const oa = (o.notes || {})[dt] || [];
      for (const n of (arr || [])) if (n && n.id && !oa.includes(n.id))
        out.push({ actor: p, date: dt, text: `${nm} zu ${dl(dt)}: „${n.text.length > 80 ? n.text.slice(0, 80) + '…' : n.text}“` });
    }
  }
  for (const [dt, x] of Object.entries(sessions)) if (x && x.from && dt >= today){
    const ox = old.sessions[dt], g = gname(x.game);
    if (!ox) out.push({ actor: x.by || null, date: dt, text: `${dl(dt)} ${x.from}–${x.to} ist jetzt fest ausgemacht${g ? ` – ${g}` : ''}` });
    else if (ox[0] !== x.from || ox[1] !== x.to) out.push({ actor: null, date: dt, text: `Die Session am ${dl(dt)} ist jetzt ${x.from}–${x.to}` });
    else if (x.game && ox[2] !== x.game && g) out.push({ actor: null, date: dt, text: `Am ${dl(dt)} wird ${g} gespielt` });
  }
  for (const dt of Object.keys(old.sessions || {})) if (dt >= today && !sessions[dt]) out.push({ actor: null, date: dt, text: `Die Session am ${dl(dt)} wurde abgesagt` });
  for (const [id, g] of Object.entries(games)) if (!(old.games || []).includes(id)) out.push({ actor: null, date: null, text: `Neues Spiel: ${g.name}` });
  return out;
}
