
(() => {
  const $ = id => document.getElementById(id);
  const PCOL = ['#64d2ff','#ff9f40','#c47bff','#ffd84d','#ff7cb6','#5bdcb1'];
  const WD = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const NAME_KEY = 'zockplan-name', GUEST_KEY = 'zockplan-guest-id';
  const ICON_PIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  const ICON_THUMB = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 10.5A1.5 1.5 0 0 1 3.5 9h2A1.5 1.5 0 0 1 7 10.5v9A1.5 1.5 0 0 1 5.5 21h-2A1.5 1.5 0 0 1 2 19.5v-9ZM9 20.2V10l4.1-6.4c.5-.8 1.6-1 2.3-.4.6.4.8 1.2.6 1.9L14.9 9H19a2.5 2.5 0 0 1 2.4 3.1l-1.8 6.9A2.5 2.5 0 0 1 17.2 21H10a1 1 0 0 1-1-.8Z"/></svg>';
  const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h.5A2.5 2.5 0 0 1 20 12.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5v-7A2.5 2.5 0 0 1 6.5 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>';

  /* ---------- Datum & Zeit ---------- */
  const pad = n => String(n).padStart(2,'0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
  const addDays = (d,n) => { const x = new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate()+n); return x; };
  const startOfWeek = d => addDays(d, -((d.getDay()+6)%7));
  const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); const day = t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-day); const y0 = new Date(Date.UTC(t.getUTCFullYear(),0,1)); return Math.ceil(((t-y0)/86400000+1)/7); };
  const fmtLong = d => new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long'}).format(d);
  const fmtShort = d => `${WD[(d.getDay()+6)%7]} ${pad(d.getDate())}.${pad(d.getMonth()+1)}.`;
  const monthName = d => new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(d);
  const monthShort = d => new Intl.DateTimeFormat('de-DE',{month:'short'}).format(d);
  const toMin = s => { const [h,m] = s.split(':').map(Number); return h*60+m; };
  const fmtMin = m => { m = ((m%1440)+1440)%1440; return `${pad(Math.floor(m/60))}:${pad(m%60)}`; };
  const span = s => { const a = toMin(s.from); let b = toMin(s.to); if (b <= a) b += 1440; return [a,b]; };
  const norm = s => (s||'').trim().toLowerCase();
  const hash = s => { let h = 0; for (const c of String(s)) h = (h*31 + c.charCodeAt(0))|0; return Math.abs(h); };
  const rid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36);
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  let now = new Date(), todayStr = ymd(now);

  function h(tag, attrs, ...kids){
    const el = document.createElement(tag);
    if (attrs) for (const [k,v] of Object.entries(attrs)){
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }

  /* ---------- Zustand ---------- */
  const S = {
    view:'week', anchor:new Date(now.getFullYear(),now.getMonth(),now.getDate()),
    persons:new Map(), legacy:[], games:[], sessions:{},
    loaded:{people:false, games:false},
    db:null, user:null, assets:null, readOnly:false,
    me:null, myData:null, myLoaded:false, profiles:{}, profilesAsked:false,
    sheetDate:null, editingSid:null, picked:[], confirmSlot:null, confirmGame:null, confirmCancel:false,
    uploading:null, uploadFor:null, newPic:null, migrating:new Set(), gateAuto:false, C:null,
  };
  let localName = ''; try { localName = localStorage.getItem(NAME_KEY) || ''; } catch(e){}

  /* ---------- Personen ---------- */
  function personData(pid){
    if (S.me && pid === S.me.pid && S.myData) return S.myData;
    const p = S.persons.get(pid); return (p && p.data) || {};
  }
  function nameOf(pid){
    if (pid.startsWith('l:')){ const l = S.legacy.find(x => 'l:'+norm(x.name) === pid); return (l && l.name) || 'Mitspieler'; }
    const d = personData(pid);
    if (d.nick) return d.nick;
    const p = S.profiles[pid]; if (p && p.name) return p.name;
    return S.me && pid === S.me.pid ? 'Du' : 'Mitspieler';
  }
  function colorOf(pid){ const p = S.profiles[pid]; return (p && p.color) || PCOL[hash(pid) % PCOL.length]; }
  function avatar(pid, cls){
    const p = S.profiles[pid], d = personData(pid);
    const el = h('span',{class:'av '+(cls||''), style:'background:var(--neutral-av)', title:nameOf(pid)});
    if (p && p.avatarUrl && !d.nick) el.append(h('img',{src:p.avatarUrl, alt:'', referrerpolicy:'no-referrer'}));
    else el.textContent = (nameOf(pid)[0] || '?').toUpperCase();
    return el;
  }
  const isMe = pid => !!S.me && pid === S.me.pid;
  const myName = () => S.me ? (personData(S.me.pid).nick || (S.profiles[S.me.pid] && S.profiles[S.me.pid].name) || '') : '';

  /* ---------- Ableitungen (einmal pro Render) ---------- */
  /* ---------- Gesetzliche Feiertage in Berlin (nur als Hinweis) ---------- */
  function easter(y){
    const a = y % 19, b = Math.floor(y/100), c = y % 100, d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25),
      g = Math.floor((b-f+1)/3), hh = (19*a + b - d - g + 15) % 30, i = Math.floor(c/4), k = c % 4,
      l = (32 + 2*e + 2*i - hh - k) % 7, m = Math.floor((a + 11*hh + 22*l)/451),
      month = Math.floor((hh + l - 7*m + 114)/31), day = ((hh + l - 7*m + 114) % 31) + 1;
    return new Date(y, month-1, day);
  }
  const HOL = {};
  function holidaysOf(y){
    if (HOL[y]) return HOL[y];
    const o = {}, add = (d, n) => { o[ymd(d)] = n; }, E = easter(y);
    add(new Date(y,0,1), 'Neujahr');
    if (y >= 2019) add(new Date(y,2,8), 'Internationaler Frauentag');
    add(addDays(E,-2), 'Karfreitag');
    add(addDays(E,1), 'Ostermontag');
    add(new Date(y,4,1), 'Tag der Arbeit');
    add(addDays(E,39), 'Christi Himmelfahrt');
    add(addDays(E,50), 'Pfingstmontag');
    add(new Date(y,9,3), 'Tag der Deutschen Einheit');
    add(new Date(y,11,25), '1. Weihnachtstag');
    add(new Date(y,11,26), '2. Weihnachtstag');
    if (y === 2025) add(new Date(2025,4,8), '80. Jahrestag Kriegsende (einmalig)');
    if (y === 2028) add(new Date(2028,5,17), '75 Jahre Volksaufstand 17. Juni (einmalig)');
    return (HOL[y] = o);
  }
  const holidayOn = ds => holidaysOf(+ds.slice(0,4))[ds] || null;
  const ICON_HOLI = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.4 5.3 5.8.6-4.3 3.9 1.2 5.7L12 15.1 6.9 18l1.2-5.7L3.8 8.4l5.8-.6L12 2.5Z"/></svg>';
  const holiPill = ds => { const n = holidayOn(ds); return n ? h('span',{class:'holi',title:'Feiertag in Berlin'}, h('span',{html:ICON_HOLI,style:'display:inline-flex'}), n) : null; };

  /* ---------- Serien: wiederkehrende Termine (z. B. jeden Montag Tanzen) ---------- */
  const WDL = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const WDLONG = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const WD_ORDER = [1,2,3,4,5,6,0];
  const ICON_REPEAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>';
  const SKIND = { no:'Kann nicht (ganzer Tag)', busy:'Belegt (Uhrzeit)', free:'Kann (Uhrzeit)' };
  function seriesOf(pid){
    return Object.entries(personData(pid).series || {}).map(([id,x]) => ({...x, id, pid}))
      .filter(x => x && Array.isArray(x.days) && x.days.length && x.start && SKIND[x.kind] && (x.kind === 'no' || (x.from && x.to)));
  }
  function occurs(x, date){
    if (date < x.start || (x.until && date > x.until)) return false;
    if (!x.days.includes(parse(date).getDay())) return false;
    if ((x.skip || []).includes(date)) return false;
    if ((x.every || 1) === 2){
      const w = Math.round((startOfWeek(parse(date)) - startOfWeek(parse(x.start))) / (7*86400000));
      if (w % 2) return false;
    }
    return true;
  }
  function seriesOn(date, kind){
    const out = [];
    for (const p of allPids()) for (const x of seriesOf(p)) if ((!kind || x.kind === kind) && occurs(x, date)) out.push(x);
    return out;
  }
  function rhythmText(x){
    const d = WD_ORDER.filter(i => x.days.includes(i)).map(i => WDL[i]).join(', ');
    return `${(x.every || 1) === 2 ? 'alle 2 Wochen' : 'jeden'} ${d}`;
  }
  const seriesLabel = x => x.title || (x.kind === 'free' ? 'Zeit frei' : x.kind === 'busy' ? 'Belegt' : 'Kann nicht');
  /* Belegte Zeitfenster aus einer Zeitspanne herausschneiden */
  function subtract(seg, cuts){
    let parts = [seg];
    for (const [c1,c2] of cuts){
      const next = [];
      for (const [a,b] of parts){
        if (c2 <= a || c1 >= b){ next.push([a,b]); continue; }
        if (c1 > a) next.push([a, c1]);
        if (c2 < b) next.push([c2, b]);
      }
      parts = next;
    }
    return parts.filter(([a,b]) => b > a);
  }

  function compute(){
    const slots = [], plus = new Map();
    const pids = new Set(S.persons.keys()); if (S.me && S.myData) pids.add(S.me.pid);
    for (const pid of pids){
      const d = personData(pid);
      for (const [sid, s] of Object.entries(d.slots || {})) if (s && s.date && s.from && s.to) slots.push({...s, games:s.games||[], key:pid+'/'+sid, sid, pid});
      for (const k of Object.keys(d.plus || {})){ if (!plus.has(k)) plus.set(k, []); plus.get(k).push(pid); }
    }
    for (const l of S.legacy) slots.push({...l, games:l.games||[], key:'legacy/'+l.id, sid:l.id, pid:'l:'+norm(l.name), legacy:true});
    const frees = []; for (const pid of pids) for (const x of seriesOf(pid)) if (x.kind === 'free') frees.push(x);
    if (frees.length){
      const a = new Date(Math.min(addDays(now, -60), new Date(S.anchor.getFullYear(), S.anchor.getMonth(), 1)));
      const b = new Date(Math.max(addDays(now, 200), addDays(new Date(S.anchor.getFullYear(), S.anchor.getMonth()+1, 0), 7)));
      for (let d = startOfWeek(a); d <= b; d = addDays(d, 1)){
        const ds = ymd(d);
        for (const x of frees) if (occurs(x, ds))
          slots.push({date:ds, from:x.from, to:x.to, games:x.games || [], key:x.pid+'/r:'+x.id+':'+ds, sid:'r:'+x.id+':'+ds, pid:x.pid, series:x});
      }
    }
    slots.sort((a,b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
    const byDate = new Map();
    for (const s of slots){ s.plus = [...new Set([...(plus.get(s.key) || []), ...(s.legacy ? [] : (plus.get('legacy/'+s.sid) || []))])].filter(p => p !== s.pid); if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
    S.C = { slots, byDate, match:new Map() };
  }
  const slotsOn = date => S.C.byDate.get(date) || [];
  const gameById = id => S.games.find(g => g.id === id);

  function participants(date){
    const m = new Map();
    for (const s of slotsOn(date)) for (const pid of [s.pid, ...s.plus]){ if (!m.has(pid)) m.set(pid, []); m.get(pid).push(s); }
    return m;
  }
  function prefs(pid, date){
    const v = (personData(pid).votes || {})[date];
    if (Array.isArray(v)) return v.filter(gameById);
    const set = new Set();
    for (const s of slotsOn(date)) if (s.pid === pid || s.plus.includes(pid)) for (const g of s.games) if (gameById(g)) set.add(g);
    return [...set];
  }
  /* Abstimmen darf jeder, auch ohne eigene Zeit an dem Tag */
  function votersOn(date){
    const set = new Set(participants(date).keys());
    for (const p of allPids()) if (Array.isArray((personData(p).votes || {})[date])) set.add(p);
    return [...set];
  }
  /* Abstimmung nur, wenn eine Zeit ohne Spiel eingetragen ist (oder schon abgestimmt wurde) */
  const hasVotes = date => allPids().some(p => ((personData(p).votes || {})[date] || []).length);
  function needsVote(date){
    if (!S.games.length || blocked(date)) return false;
    const sl = slotsOn(date); if (!sl.length) return false;
    const fx = S.sessions[date]; if (fx && fx.game) return false;
    if (date < todayStr) return hasVotes(date);
    return sl.some(x => !x.games.some(gameById)) || hasVotes(date);
  }
  /* Alle Beteiligten haben abgestimmt (mind. zwei Personen) */
  function allVoted(date){
    const vs = votersOn(date);
    return vs.length >= 2 && vs.every(p => prefs(p, date).length);
  }
  function leader(date){
    const t = tally(date).filter(x => x.voters.length);
    if (!t.length) return null;
    const n = t[0].voters.length, top = t.filter(x => x.voters.length === n).map(x => x.g);
    return { games:top, n, tie: top.length > 1 };
  }
  function tally(date){
    const pids = votersOn(date);
    return S.games.map(g => ({ g, voters: pids.filter(p => prefs(p, date).includes(g.id)) }))
      .sort((a,b) => b.voters.length - a.voters.length || (a.g.createdAt||0) - (b.g.createdAt||0));
  }
  function matchOn(date){
    if (S.C.match.has(date)) return S.C.match.get(date);
    if (blocked(date)){ S.C.match.set(date, null); return null; }
    const parts = participants(date), ps = [...parts.keys()];
    let best = null;
    for (let i=0;i<ps.length;i++) for (let j=i+1;j<ps.length;j++)
      for (const a of parts.get(ps[i])) for (const b of parts.get(ps[j])){
        if (a === b) continue;
        const [a1,a2] = span(a), [b1,b2] = span(b);
        const s0 = Math.max(a1,b1), e0 = Math.min(a2,b2);
        if (e0 - s0 <= 0) continue;
        const cuts = seriesOn(date, 'busy').filter(x => x.pid === ps[i] || x.pid === ps[j]).map(x => span(x));
        for (const [s,e] of subtract([s0,e0], cuts))
          if (!best || (e-s) > (best.e-best.s)) best = { s, e, pids:[ps[i], ps[j]] };
      }
    if (best){
      const pa = prefs(best.pids[0], date), pb = prefs(best.pids[1], date);
      best.games = tally(date).map(t => t.g.id).filter(id => pa.includes(id) && pb.includes(id));
    }
    S.C.match.set(date, best);
    return best;
  }
  function sessionGame(date){
    const s = S.sessions[date]; if (!s) return null;
    if (s.game && gameById(s.game)) return gameById(s.game);
    const m = matchOn(date); return m && m.games.length ? gameById(m.games[0]) : null;
  }
  function sessionTimes(s){
    const start = parse(s.date); const [hh,mm] = s.from.split(':').map(Number); start.setHours(hh,mm,0,0);
    const [a,b] = span(s); return [start, new Date(start.getTime() + (b-a)*60000)];
  }
  /* Bestätigt = fest ausgemacht (Fix) oder vom anderen per +1 bestätigt */
  function nextConfirmed(){
    if (!S.C) return null;
    const out = [];
    for (const x of Object.values(S.sessions)) if (x && x.date && x.from && x.to){
      const m = matchOn(x.date);
      out.push({date:x.date, from:x.from, to:x.to, kind:'fix', pids:(x.pids && x.pids.length) ? x.pids : (m ? m.pids : []), game:sessionGame(x.date)});
    }
    for (const sl of S.C.slots) if (sl.plus.length && !S.sessions[sl.date] && !blocked(sl.date)){
      const m = matchOn(sl.date);
      const gid = (m && m.games[0]) || sl.games.find(gameById);
      out.push({date:sl.date, from:sl.from, to:sl.to, kind:'plus', pids:[sl.pid, ...sl.plus], game:gid ? gameById(gid) : null});
    }
    return out.filter(x => sessionTimes(x)[1] > now).sort((a,b) => sessionTimes(a)[0] - sessionTimes(b)[0])[0] || null;
  }
  function nextSession(){
    return Object.values(S.sessions).filter(s => s && s.date && s.from && s.to && sessionTimes(s)[1] > now)
      .sort((a,b) => sessionTimes(a)[0] - sessionTimes(b)[0])[0] || null;
  }
  function countdown(s){
    const [start, end] = sessionTimes(s);
    if (now >= start && now < end) return {live:true, text:'Läuft gerade'};
    const mins = Math.max(1, Math.round((start - now)/60000));
    if (mins < 60) return {text:`in ${mins} Min`};
    const days = Math.round((parse(s.date) - parse(todayStr))/86400000);
    if (days === 0) return {text:`heute in ${Math.floor(mins/60)} Std ${mins%60} Min`};
    if (days === 1) return {text:`morgen um ${s.from}`};
    return {text:`in ${days} Tagen`};
  }

  /* Kommentare pro Tag; jede Person speichert ihre eigenen im eigenen Dokument */
  const ICON_BUBBLE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.4 3.6A1 1 0 0 1 5 18.8V16h0a2.5 2.5 0 0 1-1-2V5.5Z"/></svg>';
  let seen = {}; try { seen = JSON.parse(localStorage.getItem('zockplan-seen') || '{}') || {}; } catch(e){}
  function markSeen(date){ seen[date] = Date.now(); try { localStorage.setItem('zockplan-seen', JSON.stringify(seen)); } catch(e){} }
  function notesOn(date){
    const out = [];
    for (const p of allPids()) for (const n of ((personData(p).notes || {})[date] || [])) if (n && n.text) out.push({...n, pid:p});
    return out.sort((a,b) => (a.at||0) - (b.at||0));
  }
  const unreadOn = date => notesOn(date).filter(n => !isMe(n.pid) && (n.at||0) > (seen[date]||0)).length;
  function noteBadge(date){
    const n = notesOn(date).length; if (!n) return null;
    const u = unreadOn(date);
    return h('span',{class:'nbadge'+(u?' unread':''),title:u ? `${u} neue Kommentare` : `${n} Kommentare`},
      h('span',{html:ICON_BUBBLE,style:'display:inline-flex'}), u ? `${u} neu` : n);
  }
  function fmtAgo(at){
    const m = Math.round((Date.now() - at)/60000);
    if (m < 1) return 'gerade eben';
    if (m < 60) return `vor ${m} Min`;
    if (m < 60*12) return `vor ${Math.round(m/60)} Std`;
    const d = new Date(at); return `${pad(d.getDate())}.${pad(d.getMonth()+1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* Tagesstatus pro Person: yes = kann, maybe = vielleicht, no = kann nicht */
  const ST = { yes:{label:'Kann'}, maybe:{label:'Vielleicht'}, no:{label:'Kann nicht'} };
  function allPids(){ const p = new Set(S.persons.keys()); if (S.me && S.myData) p.add(S.me.pid); return [...p]; }
  function statuses(date){
    const out = [];
    for (const p of allPids()){
      const v = (personData(p).days || {})[date];
      if (ST[v]){ out.push({pid:p, st:v}); continue; }
      const x = seriesOf(p).find(x => x.kind === 'no' && occurs(x, date));
      if (x) out.push({pid:p, st:'no', series:x});
    }
    return out;
  }
  const myExplicit = date => S.me ? ((personData(S.me.pid).days || {})[date] || null) : null;
  const myStatus = date => { if (!S.me) return null; const x = statuses(date).find(y => y.pid === S.me.pid); return x ? x.st : null; };
  function dayState(date){
    const s = statuses(date);
    if (!s.length) return null;
    if (s.some(x => x.st === 'no')) return 'no';
    if (s.some(x => x.st === 'maybe')) return 'maybe';
    return s.length >= 2 ? 'both' : 'yes';
  }
  const blocked = date => dayState(date) === 'no';
  const blockers = date => statuses(date).filter(x => x.st === 'no').map(x => x.pid);
  function stText(date){
    const st = dayState(date), s = statuses(date);
    if (st === 'no') return s.filter(x => x.st === 'no').map(x => nameOf(x.pid) + (x.series ? ` (${seriesLabel(x.series)})` : '')).join(' & ') + ' kann nicht';
    if (st === 'maybe') return s.length > 1 ? 'Noch nicht sicher' : `${nameOf(s[0].pid)}: vielleicht`;
    if (st === 'both') return 'Ihr könnt beide';
    if (st === 'yes') return `${nameOf(s[0].pid)} kann`;
    return '';
  }
  function stAvatars(date){
    const s = statuses(date); if (!s.length) return null;
    return h('span',{class:'avs'}, s.map(x => { const a = avatar(x.pid); a.classList.add('ring-'+x.st); a.title = `${nameOf(x.pid)}: ${ST[x.st].label}`; return a; }));
  }
  function statusPicker(date, big){
    if (!canWrite() || date < todayStr) return null;
    const cur = myStatus(date);
    return h('div',{class:'stpick'+(big?' big':''), role:'group','aria-label':'Dein Status für diesen Tag',
      onclick:e=>e.stopPropagation(), onkeydown:e=>e.stopPropagation()},
      Object.entries(ST).map(([k,v]) => h('button',{type:'button',class:'stb '+k+(S.bounce==='s:'+date+k?' boing':''),
        'aria-pressed':String(cur===k),'aria-label':v.label,title:v.label,onclick:()=>setStatus(date,k)}, h('i'), big ? v.label : null)));
  }

  function visibleDays(){
    if (S.view === 'week'){ const s = startOfWeek(S.anchor); return Array.from({length:7},(_,i)=>addDays(s,i)); }
    const first = new Date(S.anchor.getFullYear(), S.anchor.getMonth(), 1);
    const last = new Date(S.anchor.getFullYear(), S.anchor.getMonth()+1, 0);
    return Array.from({length:last.getDate()},(_,i)=>addDays(first,i));
  }

  /* ---------- Bausteine ---------- */
  function initials(name){
    const w = name.split(/\s+/).filter(Boolean); const big = w.filter(x => x.length > 2);
    return ((big.length ? big : w).slice(0,2).map(x => x[0]).join('') || '?').toUpperCase();
  }
  function cover(g, cls){
    const hue = hash(g.name) % 360;
    const el = h('div',{class:'cover '+(cls||''), style:`background:linear-gradient(145deg,hsl(${hue} 78% 58%),hsl(${(hue+55)%360} 70% 30%) 70%,hsl(${(hue+90)%360} 60% 18%))`},
      h('span',{class:'ini'}, initials(g.name)));
    const src = g.img || (g.image ? '/_blob/'+g.image : null);
    if (src){ const img = h('img',{src, alt:'', loading:'lazy', draggable:'false'}); img.addEventListener('error', () => img.remove()); el.append(img); }
    return el;
  }
  const gameChip = g => h('span',{class:'chip'}, cover(g), g.name);
  const personTag = pid => h('span',{class:'pname'}, avatar(pid), nameOf(pid));
  function timeTag(s){ const b = span(s)[1]; return h('span',{class:'time'}, `${s.from}–${s.to}${b>1440?' (+1)':''}`); }
  const dragGame = g => e => { e.dataTransfer.setData('text/plain', g.id); e.dataTransfer.effectAllowed = 'copy'; };
  const canWrite = () => !!(S.db && S.me && !S.readOnly);

  function busyRow(x){
    return h('div',{class:'entry busy'},
      h('div',{class:'erow'}, personTag(x.pid), h('span',{class:'time'}, `${x.from}–${x.to}`),
        h('span',{class:'busylbl',title:rhythmText(x)}, h('span',{html:ICON_REPEAT,style:'display:inline-flex'}), seriesLabel(x))));
  }
  function entryRow(s, compact){
    const canPlus = canWrite() && !isMe(s.pid) && !blocked(s.date);
    const on = S.me && s.plus.includes(S.me.pid);
    const label = on ? 'Zusage zurücknehmen' : `Termin von ${nameOf(s.pid)} bestätigen: Ich kann auch`;
    const cls = 'plus' + (compact ? ' round' : '') + (S.bounce === 'p:'+s.key ? ' boing' : '');
    const click = e => { e.stopPropagation(); togglePlus(s); };
    const plusBtn = !canPlus ? null : compact
      ? h('button',{type:'button',class:cls,'aria-pressed':String(on),'aria-label':label,title:on ? 'Bin dabei' : '+1 Ich kann auch',html:ICON_THUMB,onclick:click})
      : h('button',{type:'button',class:cls,'aria-pressed':String(on),'aria-label':label,onclick:click},
          h('span',{html:ICON_THUMB,style:'display:inline-flex'}), on ? 'Bin dabei' : '+1 Ich kann auch');
    return h('div',{class:'entry',style:compact?'align-self:stretch':''},
      h('div',{class:'erow',style:compact?'width:100%':''}, personTag(s.pid), timeTag(s),
        s.series ? h('span',{class:'rep',title:'Serie: ' + rhythmText(s.series),html:ICON_REPEAT}) : null,
        s.legacy ? h('span',{class:'legacy-tag'},'alter Eintrag') : null,
        s.plus.map(p => h('span',{class:'joined',title:`${nameOf(p)} kann auch`}, h('span',{html:ICON_THUMB,style:'display:inline-flex'}), nameOf(p))),
        compact ? plusBtn : null),
      s.games.length ? h('span',{class:'chips'}, s.games.map(gameById).filter(Boolean).map(gameChip)) : null,
      compact ? null : plusBtn);
  }

  /* ---------- Darstellung ---------- */
  function renderHeader(){
    const wa = $('whoAv'); wa.replaceWith(Object.assign(S.me ? avatar(S.me.pid,'lg') : h('span',{class:'av lg'},'?'), {id:'whoAv'}));
    $('whoName').textContent = S.me ? (myName() || '…') : 'nicht angemeldet';
    $('vWeek').setAttribute('aria-pressed', S.view==='week');
    $('vMonth').setAttribute('aria-pressed', S.view==='month');
    const r = $('range'); r.textContent = '';
    if (S.view === 'week'){
      const s = startOfWeek(S.anchor), e = addDays(s,6);
      r.append(`KW ${isoWeek(s)}`, h('small',null, `${pad(s.getDate())}.${pad(s.getMonth()+1)}. – ${pad(e.getDate())}.${pad(e.getMonth()+1)}.`));
    } else r.append(monthName(S.anchor), h('small',null,'Monatsansicht'));
  }

  function renderNext(){
    const box = $('nextBox'); box.textContent = '';
    const n = nextConfirmed(); if (!n) return;
    const g = n.game, cd = countdown(n), d = parse(n.date);
    box.append(h('button',{type:'button',class:'next',onclick:()=>openSheet(n.date)},
      g ? cover(g) : h('div',{class:'cover',style:'background:linear-gradient(145deg,#8f7bff,#4ea4ff)'}, h('span',{class:'ini',html:ICON_LOCK,style:'width:26px;height:26px;display:grid'})),
      h('span',{class:'ntxt'},
        h('span',{class:'nlabel'}, n.kind === 'fix' ? 'Nächster Termin · fix' : 'Nächster Termin · bestätigt'),
        h('span',{class:'nmain'}, `${fmtShort(d)} · ${n.from}–${n.to}`),
        h('span',{class:'nsub'},
          h('span',{class:'cd'+(cd.live?' live':'')}, cd.text),
          g ? g.name : 'Spiel noch offen',
          n.pids.length ? h('span',{class:'avs'}, n.pids.map(p => avatar(p))) : null))));
  }

  /* "Neu seit deinem letzten Besuch": Vergleich mit dem Stand, den dieses Gerät zuletzt gesehen hat */
  const snapKey = () => 'zockplan-snap-' + (S.me ? S.me.pid : 'x');
  function buildSnap(){
    const persons = {};
    for (const p of allPids()){
      if (isMe(p)) continue;
      const d = personData(p);
      const slots = {}; for (const [sid,x] of Object.entries(d.slots || {})) if (x && x.date) slots[sid] = [x.date, x.from, x.to];
      const plus = {}; for (const [k,v] of Object.entries(d.plus || {})) if (v && v.date) plus[k] = v.date;
      const notes = {}; for (const [dt,arr] of Object.entries(d.notes || {})) notes[dt] = (arr || []).map(n => n.id);
      persons[p] = { slots, days:{...(d.days || {})}, plus, votes:clone(d.votes), notes, series:Object.keys(d.series || {}) };
    }
    const sessions = {}; for (const [dt,x] of Object.entries(S.sessions)) sessions[dt] = [x.from, x.to, x.game || null, x.by || null];
    return { persons, sessions, games:S.games.map(g => g.id), t:Date.now() };
  }
  function storeSnap(o){ try { localStorage.setItem(snapKey(), JSON.stringify(o)); } catch(e){} }
  function markFeedRead(){ S.snap = buildSnap(); storeSnap(S.snap); S.feedAll = false; }
  function initSnap(){
    if (S.snapInit || !S.me || !S.loaded.people || !S.loaded.sessions || !S.loaded.games) return;
    S.snapInit = true;
    try { S.snap = JSON.parse(localStorage.getItem(snapKey()) || 'null'); } catch(e){ S.snap = null; }
    if (!S.snap || !S.snap.persons){ S.snap = buildSnap(); storeSnap(S.snap); }
  }
  function changes(){
    const old = S.snap; if (!old) return [];
    const out = [], dl = dt => fmtShort(parse(dt));
    for (const p of allPids()){
      if (isMe(p)) continue;
      const d = personData(p), o = old.persons[p] || {slots:{}, days:{}, plus:{}, votes:{}, notes:{}}, nm = nameOf(p);
      for (const [sid,x] of Object.entries(d.slots || {})){
        if (!x || !x.date || x.date < todayStr) continue;
        const ox = o.slots[sid];
        if (!ox) out.push({pid:p, date:x.date, text:`${nm} hat ${dl(x.date)} ${x.from}–${x.to} eingetragen`});
        else if (ox[0] !== x.date || ox[1] !== x.from || ox[2] !== x.to) out.push({pid:p, date:x.date, text:`${nm} hat die Zeit am ${dl(x.date)} auf ${x.from}–${x.to} geändert`});
      }
      for (const [sid,ox] of Object.entries(o.slots || {})) if (!(d.slots || {})[sid] && ox[0] >= todayStr) out.push({pid:p, date:ox[0], text:`${nm} hat ${dl(ox[0])} ${ox[1]}–${ox[2]} gelöscht`});
      for (const [dt,st] of Object.entries(d.days || {})) if (dt >= todayStr && (o.days || {})[dt] !== st)
        out.push({pid:p, date:dt, text: st === 'no' ? `${nm} kann ${dl(dt)} nicht` : st === 'maybe' ? `${nm} kann ${dl(dt)} vielleicht` : `${nm} kann ${dl(dt)}`});
      for (const [k,v] of Object.entries(d.plus || {})){
        if (!v || !v.date || v.date < todayStr || (o.plus || {})[k]) continue;
        const sl = S.C.slots.find(x => x.key === k);
        out.push({pid:p, date:v.date, text:`${nm} ist ${dl(v.date)}${sl ? ` ${sl.from}–${sl.to}` : ''} dabei (+1)`});
      }
      for (const [dt,arr] of Object.entries(d.votes || {})){
        if (dt < todayStr) continue;
        const oa = (o.votes || {})[dt] || [], added = (arr || []).filter(g => !oa.includes(g) && gameById(g));
        if (added.length) out.push({pid:p, date:dt, text:`${nm} stimmt für ${added.map(g => gameById(g).name).join(' & ')} (${dl(dt)})`});
      }
      if (o.series) for (const [id,x] of Object.entries(d.series || {})) if (!o.series.includes(id) && x && x.days)
        out.push({pid:p, date:null, series:true, text:`${nm} hat eine Serie angelegt: ${seriesLabel(x)}, ${rhythmText(x)}`});
      for (const [dt,arr] of Object.entries(d.notes || {})){
        const oa = (o.notes || {})[dt] || [];
        for (const n of (arr || [])) if (n && n.id && !oa.includes(n.id))
          out.push({pid:p, date:dt, text:`${nm} zu ${dl(dt)}: „${n.text.length > 70 ? n.text.slice(0,70) + '…' : n.text}“`});
      }
    }
    for (const [dt,x] of Object.entries(S.sessions)) if (dt >= todayStr && !old.sessions[dt]) out.push({pid:(x.by && !isMe(x.by)) ? x.by : null, date:dt, text:`${dl(dt)} ${x.from}–${x.to} ist jetzt fest ausgemacht`});
    for (const [dt] of Object.entries(old.sessions || {})) if (dt >= todayStr && !S.sessions[dt]) out.push({pid:null, date:dt, text:`Die Session am ${dl(dt)} wurde abgesagt`});
    for (const g of S.games) if (!(old.games || []).includes(g.id)) out.push({pid:null, date:null, text:`Neues Spiel: ${g.name}`});
    return out.sort((a,b) => (a.date || '9').localeCompare(b.date || '9'));
  }
  function renderFeed(){
    const box = $('feedBox'); box.textContent = '';
    initSnap();
    if (!S.snap) return;
    const list = changes(); if (!list.length) return;
    S.feedShown = true;
    const max = S.feedAll ? list.length : 5;
    box.append(h('section',{class:'feed glass','aria-label':'Neu seit deinem letzten Besuch'},
      h('div',{class:'feedhead'},
        h('p',{class:'label fhl'}, 'Neu seit letztem Besuch', h('span',{class:'fcount'}, list.length)),
        h('button',{type:'button',class:'linkbtn',onclick:()=>{ markFeedRead(); render(); }}, 'Gelesen')),
      h('div',{class:'feedlist'}, list.slice(0, max).map(c => h('button',{type:'button',class:'fitem',
          onclick:()=>{ if (c.series) openSeries(); else if (c.date) openSheet(c.date); else setTab('games'); }},
        c.pid ? avatar(c.pid) : h('span',{class:'av fdot'}, '•'),
        h('span',{class:'ftxt'}, c.text),
        h('span',{class:'fchev','aria-hidden':'true'}, '›')))),
      list.length > max ? h('button',{type:'button',class:'linkbtn fmore',onclick:()=>{ S.feedAll = true; renderFeed(); }}, `${list.length - max} weitere anzeigen`) : null));
  }
  /* Was angezeigt wurde, gilt beim Verlassen der Seite als gesehen */
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.feedShown && S.snapInit){ markFeedRead(); S.feedShown = false; } });

  /* Pop-up beim Öffnen: zeigt den nächsten bestätigten Termin */
  function maybePop(){
    if (S.popShown || !S.loaded.people || !S.loaded.sessions || !S.loaded.games) return;
    if (!$('gate').hidden || !$('sheet').hidden) return;
    S.popShown = true;
    const n = nextConfirmed(); if (!n) return;
    const g = n.game, cd = countdown(n), d = parse(n.date);
    const box = $('popBody'); box.textContent = '';
    box.append(
      g ? cover(g, 'popcover') : h('div',{class:'cover popcover',style:'background:linear-gradient(145deg,#8f7bff,#4ea4ff)'}, h('span',{class:'ini',html:ICON_LOCK,style:'width:40px;height:40px;display:grid'})),
      h('p',{class:'label poplabel'}, n.kind === 'fix' ? 'Nächster Termin · fest ausgemacht' : 'Nächster Termin · per +1 bestätigt'),
      h('h2',{id:'popTitle'}, fmtLong(d)),
      h('div',{class:'poptime'}, `${n.from}–${n.to}`),
      h('span',{class:'cd'+(cd.live?' live':'')}, cd.text),
      h('div',{class:'popwho'}, n.pids.length ? h('span',{class:'avs'}, n.pids.map(p => avatar(p,'lg'))) : null,
        n.pids.map(nameOf).join(' & ')),
      h('div',{class:'popgame'}, g ? `Gespielt wird: ${g.name}` : 'Spiel noch offen – stimmt im Tag ab'));
    $('popDetails').onclick = () => { closePop(); openSheet(n.date); };
    $('nextPop').hidden = false;
    setTimeout(() => $('popOk').focus(), 0);
  }
  function closePop(){ $('nextPop').hidden = true; }

  function renderHits(){
    $('hitsLabel').textContent = S.view === 'week' ? 'Treffer diese Woche' : `Treffer im ${new Intl.DateTimeFormat('de-DE',{month:'long'}).format(S.anchor)}`;
    const box = $('hitList'); box.textContent = '';
    const sec = box.closest('.hits'); sec.hidden = true;
    if (!S.loaded.people && S.db) return;
    const hits = visibleDays().map(d => ({d, ds:ymd(d), m:matchOn(ymd(d)), fx:S.sessions[ymd(d)]})).filter(x => x.m || x.fx);
    if (!hits.length) return;
    sec.hidden = false;
    for (const {d,ds,m,fx} of hits){
      const games = fx ? [sessionGame(ds)].filter(Boolean) : m.games.map(gameById);
      const time = fx ? `${fx.from}–${fx.to}` : `${fmtMin(m.s)}–${fmtMin(m.e)}`;
      box.append(h('button',{type:'button',class:'hit'+(fx?' fixed':''),onclick:()=>openSheet(ds)},
        games.length ? h('span',{class:'stack'}, games.slice(0,3).map(g => cover(g))) : h('span',{class:'noimg',html:fx?ICON_LOCK:'✓',style:fx?'color:#cfc6ff;background:rgba(143,123,255,.3)':''}),
        h('span',{class:'txt'},
          h('strong',null, fmtShort(d), fx ? ' · fix' : ''),
          h('span',{class:'t'}, time),
          h('span',{class:'g'}, games.length ? games.map(g=>g.name).join(', ') : 'Spiel offen · abstimmen'))));
    }
  }

  function dropHandlers(date, el){
    return {
      ondragover: e => { if (!canWrite()) return; e.preventDefault(); el().classList.add('drop'); },
      ondragleave: () => el().classList.remove('drop'),
      ondrop: e => { e.preventDefault(); el().classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); if (id) dropGame(date, id); },
    };
  }

  function renderWeek(){
    const wrap = h('div',{class:'week'});
    for (const d of visibleDays()){
      const ds = ymd(d), list = slotsOn(ds), m = matchOn(ds), fx = S.sessions[ds];
      const past = ds < todayStr, slim = past || (!list.length && !fx);
      const st = dayState(ds);
      if (slim){
        const who = [...participants(ds).keys()];
        let card;
        card = h('div',{role:'button',tabindex:'0','aria-label':fmtLong(d)+(st?', '+stText(ds):''),
          class:'day glass slim'+(ds===todayStr?' today':'')+(past?' past':'')+(st?' st-'+st:''),
          onclick:()=>openSheet(ds),
          onkeydown:e=>{ if (e.target === card && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openSheet(ds); } },
          ...dropHandlers(ds, ()=>card)},
          h('div',{class:'dhead'},
            h('span',{class:'wd'}, WD[(d.getDay()+6)%7]),
            h('span',{class:'dn'}, d.getDate()),
            h('span',{class:'mo'}, monthShort(d)),
            ds===todayStr ? h('span',{class:'today-tag'},'Heute') : null),
          h('div',{class:'dbody slimrow'},
            holiPill(ds),
            who.length
              ? h('span',{class:'slimsum'}, h('span',{class:'avs'}, who.map(p => avatar(p))), fx ? `Gezockt ${fx.from}–${fx.to}` : m ? 'Treffer' : `${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'}`)
              : st ? h('span',{class:'slimsum'}, stAvatars(ds), stText(ds))
              : seriesOn(ds,'busy').length ? h('span',{class:'slimsum'}, h('span',{html:ICON_REPEAT,class:'rep'}), seriesOn(ds,'busy').map(x => `${nameOf(x.pid)}: ${seriesLabel(x)} ${x.from}–${x.to}`).join(' · '))
              : holidayOn(ds) ? null : h('span',{class:'add-hint'}, past ? 'Keine Einträge' : '+ Zeit eintragen'),
            noteBadge(ds),
            statusPicker(ds)));
        wrap.append(card);
        continue;
      }
      let card;
      card = h('div',{role:'button',tabindex:'0','aria-label':fmtLong(d),
        class:'day glass'+(ds===todayStr?' today':'')+(m?' is-hit':'')+(fx?' is-fixed':'')+(st?' st-'+st:''),
        onclick:()=>openSheet(ds),
        onkeydown:e=>{ if (e.target === card && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openSheet(ds); } },
        ...dropHandlers(ds, ()=>card)},
        h('div',{class:'dhead'},
          h('span',{class:'wd'}, WD[(d.getDay()+6)%7]),
          h('span',{class:'dn'}, d.getDate()),
          h('span',{class:'mo'}, monthShort(d)),
          ds===todayStr ? h('span',{class:'today-tag'},'Heute') : null),
        h('div',{class:'dbody'},
          holiPill(ds),
          (st || statusPicker(ds) || noteBadge(ds)) ? h('div',{class:'strow'}, h('span',{class:'sttext'}, stAvatars(ds), stText(ds)), h('span',{class:'stright'}, noteBadge(ds), statusPicker(ds))) : null,
          fx ? h('span',{class:'fixbadge'}, h('span',{html:ICON_LOCK,style:'display:inline-flex;font-family:inherit'}), 'Fix', h('span',null,`${fx.from}–${fx.to}`))
             : m ? h('span',{class:'hitline'}, 'Treffer', h('span',null,`${fmtMin(m.s)}–${fmtMin(m.e)}`)) : null,
          (() => { if (!needsVote(ds)) return null; const l = leader(ds);
            if (!l) return h('span',{class:'favline open'}, 'Spiel offen · abstimmen');
            return h('span',{class:'favline'}, l.tie ? null : cover(l.games[0]),
              l.tie ? `Gleichstand: ${l.games.map(g => g.name).join(' & ')}` : `${allVoted(ds) ? 'Gewinner' : 'Favorit'}: ${l.games[0].name}`,
              h('b',null, ` · ${l.n} ${l.n === 1 ? 'Stimme' : 'Stimmen'}`)); })(),
          list.map(s => entryRow(s, true)),
          seriesOn(ds, 'busy').map(busyRow)));
      wrap.append(card);
    }
    return wrap;
  }

  function renderMonth(){
    const grid = h('div',{class:'month glass'});
    WD.forEach(w => grid.append(h('div',{class:'mwd'}, w)));
    const first = new Date(S.anchor.getFullYear(), S.anchor.getMonth(), 1);
    const last = new Date(S.anchor.getFullYear(), S.anchor.getMonth()+1, 0);
    let d = startOfWeek(first);
    const end = addDays(startOfWeek(last), 6);
    while (d <= end){
      const ds = ymd(d), m = matchOn(ds), fx = S.sessions[ds], out = d.getMonth() !== S.anchor.getMonth(), day = d;
      const who = [...participants(ds).keys()];
      const st = dayState(ds);
      let cell;
      cell = h('button',{type:'button',
        class:'cell'+(out?' out':'')+(ds===todayStr?' today':'')+(m?' is-hit':'')+(fx?' is-fixed':'')+(st?' st-'+st:''),
        'aria-label': fmtLong(day)+(st?', '+stText(ds):'')+(fx?', fest ausgemacht':m?', Treffer':'')+(who.length?`, ${who.length} Personen`:''),
        onclick:()=>openSheet(ds), ...dropHandlers(ds, ()=>cell)},
        h('span',{class:'n'}, day.getDate()),
        holidayOn(ds) ? h('span',{class:'mholi',title:holidayOn(ds)}, h('i'), h('em',null, holidayOn(ds))) : null,
        h('span',{class:'mlist'}, slotsOn(ds).slice(0,3).map(x => h('span',{class:'mrow'}, avatar(x.pid), `${x.from}–${x.to}`)),
          slotsOn(ds).length > 3 ? h('span',{class:'mrow more'}, `+${slotsOn(ds).length - 3} weitere`) : null),
        h('span',{class:'dots'}, who.map(p => h('i',{title:nameOf(p)})), notesOn(ds).length ? h('b',{class:'ndot'+(unreadOn(ds)?' unread':''),title:'Kommentare',html:ICON_BUBBLE}) : null),
        fx ? h('span',{class:'mfix'}, `Fix ${fx.from}`) : m ? h('span',{class:'mhit'}, `${fmtMin(m.s)}–${fmtMin(m.e)}`) : null);
      grid.append(cell);
      d = addDays(d,1);
    }
    return grid;
  }

  function renderGames(){
    const box = $('gameList'); box.textContent = '';
    if (!S.games.length) box.append(h('p',{style:'grid-column:1/-1'}, S.loaded.games ? 'Noch keine Spiele. Füge unten das erste hinzu.' : 'Spiele werden geladen …'));
    for (const g of S.games){
      const cv = cover(g);
      if (S.uploading === g.id) cv.append(h('div',{class:'layer'},'Bild lädt …'));
      else if (S.confirmGame === g.id) cv.append(h('div',{class:'layer'}, `${g.name} löschen?`,
        h('div',{class:'row'},
          h('button',{type:'button',class:'yes',onclick:()=>deleteGame(g.id)},'Ja'),
          h('button',{type:'button',class:'no',onclick:()=>{S.confirmGame=null;renderGames();}},'Nein'))));
      else if (S.db && !S.readOnly) cv.append(h('div',{class:'tacts'},
        S.assets ? h('button',{type:'button',class:'mini',title:'Vorschaubild ändern','aria-label':`Bild für ${g.name} ändern`,html:ICON_PIC,onclick:()=>pickImageFor(g.id)}) : null,
        h('button',{type:'button',class:'mini',title:'Spiel entfernen','aria-label':`${g.name} entfernen`,html:ICON_X,onclick:()=>{S.confirmGame=g.id;renderGames();}})));
      box.append(h('div',{class:'tile',draggable:'true',ondragstart:dragGame(g)}, cv, h('span',{class:'tname'}, g.name)));
    }
    $('newGame').disabled = !S.db || S.readOnly;
    $('addGame').querySelector('[type=submit]').disabled = !S.db || S.readOnly;
    const pb = $('newPic');
    pb.hidden = !S.assets || S.readOnly;
    pb.innerHTML = '';
    if (S.newPic) pb.append(h('img',{src:S.newPic.url,alt:''})); else pb.innerHTML = ICON_PIC;
  }

  function render(){
    compute();
    renderHeader(); renderFeed(); renderNext(); renderHits();
    const cal = $('cal'); cal.textContent = '';
    cal.append(S.view === 'week' ? renderWeek() : renderMonth());
    renderGames();
    if (S.sheetDate) renderSheet();
    renderSeries();
    askProfiles();
    maybeGate();
    maybePop();
  }

  /* Namen & Bilder der Konten nachladen; neu zeichnen nur wenn sich etwas ändert */
  function askProfiles(){
    if (!S.user) return;
    const ids = [...new Set([...S.persons.keys(), S.me && S.me.pid].filter(p => p && !p.includes(':')))];
    if (!ids.length) return;
    S.user.profiles(ids).then(ps => {
      let changed = false;
      for (const id of ids){ const p = ps[id], o = S.profiles[id]; if (!p) continue; if (!o || o.name !== p.name || o.avatarUrl !== p.avatarUrl || o.color !== p.color) changed = true; S.profiles[id] = p; }
      S.profilesAsked = true;
      if (changed) render(); else maybeGate();
    }).catch(()=>{});
  }

  /* ---------- Tages-Fenster ---------- */
  function setRepeat(v){ S.repeat = v; document.querySelectorAll('#repeatSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.rep === v))); }
  function resetForm(){ setRepeat(0); S.editingSid = null; S.picked = []; $('tFrom').value = ''; $('tTo').value = ''; $('formErr').hidden = true; }
  function openSheet(date, opts){
    S.sheetDate = date; S.confirmSlot = null; S.confirmCancel = false;
    resetForm();
    if (opts && opts.preGame) S.picked = [opts.preGame];
    if (!S.C) compute();
    S.formOpen = !!(opts && opts.preGame) || (!slotsOn(date).length && date >= todayStr);
    $('sheet').hidden = false;
    renderSheet();
    setTimeout(()=>$('sheetClose').focus(), 0);
  }
  function closeSheet(){ if (S.sheetDate) markSeen(S.sheetDate); setTimeout(render, 0); S.confirmNote = null; S.sheetDate = null; S.editingSid = null; $('sheet').hidden = true; }

  function renderSheet(){
    if (!S.C) compute();
    const date = S.sheetDate, d = parse(date);
    $('sheetKw').textContent = `KW ${isoWeek(d)}`;
    $('sheetTitle').textContent = fmtLong(d);
    const hn = holidayOn(date); $('sheetHoli').hidden = !hn;
    if (hn){ $('sheetHoli').innerHTML = ICON_HOLI; $('sheetHoli').append(`Feiertag in Berlin: ${hn}`); }
    const m = matchOn(date), fx = S.sessions[date];

    /* Status */
    const sb = $('sheetStatus'); sb.textContent = '';
    const sts = statuses(date), picker = statusPicker(date, true);
    const others = picker ? sts.filter(x => !isMe(x.pid)) : sts;
    sb.hidden = !picker && !sts.length && !canWrite();
    sb.append(h('div',{style:'display:contents'}, h('p',{class:'label'}, 'Wer kann an dem Tag?'),
      picker ? h('div',{class:'strow'}, h('span',{class:'pname'}, S.me ? avatar(S.me.pid) : null, 'Du'), picker) : null,
      others.map(x => h('div',{class:'strow'}, personTag(x.pid), h('span',{class:'stpill '+x.st}, ST[x.st].label + (x.series ? ` · ${seriesLabel(x.series)}` : '')))),
      (() => { const mineSer = S.me ? statuses(date).find(y => y.pid === S.me.pid && y.series) : null;
        return mineSer ? h('p',{class:'vhint'}, h('span',{html:ICON_REPEAT,class:'rep'}), ` Aus deiner Serie „${seriesLabel(mineSer.series)}“ (${rhythmText(mineSer.series)}). Tippe „Kann“, um nur diesen Tag freizugeben.`) : null; })(),
      canWrite() && date >= todayStr ? h('button',{type:'button',class:'linkbtn serlink',onclick:()=>openSeries({day:parse(date).getDay(), kind:'no', start:date})},
        h('span',{html:ICON_REPEAT,style:'display:inline-flex;width:14px;vertical-align:-2px;margin-right:5px'}), 'Regelmäßig belegt? Als Serie eintragen') : null,
      blocked(date) ? h('p',{class:'blocknote'}, `${blockers(date).map(nameOf).join(' & ')} kann an diesem Tag nicht. Neue Terminvorschläge sind hier gesperrt.`
        + (S.sessions[date] ? ' Die feste Session steht noch – sagt sie am besten ab.' : '')) : null));

    /* Fest ausgemacht / Fix machen */
    const fb = $('sheetFix'); fb.textContent = '';
    if (fx){
      const g = sessionGame(date), cd = countdown(fx), who = fx.pids && fx.pids.length ? fx.pids : (m ? m.pids : []);
      const voted = tally(date).filter(t => t.voters.length).map(t => t.g);
      const choices = voted.length ? voted : S.games;
      fb.append(h('div',{class:'fixbox'},
        h('p',{class:'label',style:'color:#cfc6ff'}, 'Fest ausgemacht'),
        h('div',{class:'big'},
          g ? cover(g) : null,
          h('div',null,
            h('div',{class:'when'}, `${fx.from}–${fx.to}`),
            h('div',{class:'what'}, g ? g.name : 'Spiel noch offen – stimmt unten ab', ' · ', cd.text))),
        who.length ? h('div',{class:'erow'}, who.map(p => personTag(p))) : null,
        canWrite() ? h('div',{class:'gpick'}, h('span',{class:'vhint',style:'width:100%'},'Spiel festlegen:'),
          choices.map(cg => h('button',{type:'button',class:'chip','aria-pressed':String(!!g && g.id===cg.id && fx.game===cg.id),onclick:()=>setSessionGame(cg.id)}, cover(cg), cg.name))) : null,
        canWrite() ? h('div',{class:'fixrow'},
          h('span'),
          S.confirmCancel
            ? h('span',{class:'erow'}, h('button',{type:'button',class:'linkbtn',onclick:()=>{S.confirmCancel=false;renderSheet();}},'Doch nicht'), h('button',{type:'button',class:'btn sec',style:'color:var(--danger)',onclick:cancelSession},'Wirklich absagen'))
            : h('button',{type:'button',class:'linkbtn danger',onclick:()=>{S.confirmCancel=true;renderSheet();}},'Session absagen')) : null));
    } else if (m){
      const games = m.games.map(gameById);
      fb.append(h('div',{class:'hitbox'},
        h('div',{class:'hit',style:'width:100%'},
          games.length ? h('span',{class:'stack'}, games.slice(0,3).map(g => cover(g))) : h('span',{class:'noimg'},'✓'),
          h('span',{class:'txt'},
            h('strong',null,'Treffer'),
            h('span',{class:'t'}, `${fmtMin(m.s)}–${fmtMin(m.e)}`),
            h('span',{class:'g'}, `${m.pids.map(nameOf).join(' & ')} · ${games.length ? games.map(g=>g.name).join(', ') : 'noch kein gemeinsames Spiel'}`))),
        canWrite() && !(needsVote(date) && allVoted(date) && leader(date)) ? h('button',{type:'button',class:'btn fix',onclick:()=>fixSession(date)}, h('span',{html:ICON_LOCK,style:'display:inline-flex;width:14px;margin-right:6px;vertical-align:-2px'}), `Fix machen: ${fmtMin(m.s)}–${fmtMin(m.e)}`) : null));
    }

    /* Abstimmung: alle Spiele stehen an jedem Tag zur Wahl */
    const vb = $('sheetVote'); vb.textContent = '';
    const tAll = tally(date), lead = leader(date);
    vb.hidden = !needsVote(date);
    if (!vb.hidden){
      const byId = new Map(tAll.map(x => [x.g.id, x.voters]));
      const myPrefs = S.me ? prefs(S.me.pid, date) : [];
      const state = !lead ? (canWrite() ? 'Für die Zeit ist noch kein Spiel gewählt. Tipp an, worauf du Lust hast – mehrere gehen auch.' : 'Noch keine Stimmen.')
        : lead.tie ? `Gleichstand: ${lead.games.map(g => g.name).join(' & ')} (je ${lead.n} ${lead.n === 1 ? 'Stimme' : 'Stimmen'})`
        : `Vorne: ${lead.games[0].name} mit ${lead.n} ${lead.n === 1 ? 'Stimme' : 'Stimmen'}`;
      const done = lead && allVoted(date);
      let result = null;
      if (done){
        const win = lead.tie ? null : lead.games[0];
        const tm = m ? `${fmtMin(m.s)}–${fmtMin(m.e)}` : '';
        result = h('div',{class:'winner'+(lead.tie?' tie':'')},
          win ? cover(win) : h('div',{class:'wstack'}, lead.games.slice(0,3).map(g => cover(g))),
          h('div',{class:'wtxt'},
            h('span',{class:'wl'}, 'Alle haben abgestimmt'),
            h('strong',null, win ? `Gewinner: ${win.name}` : `Gleichstand: ${lead.games.map(g => g.name).join(' & ')}`),
            !m ? h('span',{class:'wh'}, 'Für einen festen Termin braucht ihr noch eine gemeinsame Zeit – gebt +1 oder tragt eure Zeit ein.') : null),
          m && canWrite() ? (win
            ? h('button',{type:'button',class:'btn fix',onclick:()=>fixSession(date, win.id)}, h('span',{html:ICON_LOCK,style:'display:inline-flex;width:14px;margin-right:6px;vertical-align:-2px'}), `Fix machen: ${tm}`)
            : h('button',{type:'button',class:'btn sec',onclick:()=>{ const pick = lead.games[Math.floor(Math.random()*lead.games.length)]; toast(`Der Zufall sagt: ${pick.name}`); fixSession(date, pick.id); }}, 'Zufall entscheiden & fix machen')) : null);
      }
      vb.append(h('p',{class:'label'},'Was zocken wir?'),
        result || h('p',{class:'vhint' + (lead && !lead.tie ? ' vlead' : '')}, state),
        h('div',{class:'votes'}, S.games.map(g => {
          const voters = byId.get(g.id) || [];
          const mine = myPrefs.includes(g.id);
          const isLead = lead && !lead.tie && lead.games[0].id === g.id;
          const cv = cover(g);
          cv.append(h('span',{class:'count'}, h('span',{html:ICON_THUMB,style:'display:inline-flex'}), voters.length));
          if (isLead) cv.append(h('span',{class:'both'}, voters.length >= 2 && voters.length === votersOn(date).length ? 'Alle' : 'Vorne'));
          return h('button',{type:'button',class:'vtile'+(S.bounce==='v:'+g.id?' boing':''),'aria-pressed':String(mine),disabled:!canWrite(),
            'aria-label':`${g.name}: ${voters.length} Stimmen${mine?', du bist dabei':''}`,onclick:()=>toggleVote(date, g.id)},
            cv, h('span',{class:'vfoot'}, h('span',{class:'tname'}, g.name), h('span',{class:'avs'}, voters.map(p => avatar(p)))));
        })));
    }

    /* Kommentare */
    const nl = $('noteList'); nl.textContent = '';
    const notes = notesOn(date);
    if (!notes.length) nl.append(h('p',{class:'vhint'}, canWrite() ? 'Noch nichts geschrieben. Hier könnt ihr euch kurz absprechen.' : 'Noch keine Kommentare.'));
    for (const n of notes){
      const mine = isMe(n.pid) && canWrite();
      nl.append(h('div',{class:'note'+(isMe(n.pid)?' mine':'')},
        avatar(n.pid),
        h('div',{class:'nbody'},
          h('div',{class:'bubble'}, n.text),
          h('div',{class:'nmeta'}, isMe(n.pid) ? 'Du' : nameOf(n.pid), ' · ', fmtAgo(n.at||0),
            mine ? (S.confirmNote === n.id
              ? h('button',{type:'button',class:'linkbtn danger',onclick:()=>deleteNote(date, n.id)},'Wirklich löschen')
              : h('button',{type:'button',class:'linkbtn',onclick:()=>{S.confirmNote=n.id;renderSheet();}},'Löschen')) : null))));
    }
    $('noteForm').hidden = !canWrite();
    markSeen(date);

    /* Einträge */
    const eb = $('sheetEntries'); eb.textContent = '';
    const list = slotsOn(date), busyList = seriesOn(date, 'busy');
    eb.append(h('p',{class:'label'}, list.length ? 'Wer hat Zeit' : 'Noch niemand eingetragen'));
    for (const x of busyList){
      const mine = isMe(x.pid) && canWrite();
      eb.append(h('div',{class:'sentry'}, busyRow(x),
        mine ? h('div',{class:'acts'},
          h('button',{type:'button',class:'linkbtn',onclick:()=>skipOccurrence(x.id, date)},'Diesmal nicht'),
          h('button',{type:'button',class:'linkbtn',onclick:()=>openSeries({edit:x.id})},'Serie bearbeiten')) : null));
    }
    for (const s of list){
      const mine = isMe(s.pid) && canWrite();
      if (s.series){
        eb.append(h('div',{class:'sentry'}, entryRow(s),
          mine ? h('div',{class:'acts'},
            h('button',{type:'button',class:'linkbtn',onclick:()=>skipOccurrence(s.series.id, date)},'Nur diesmal entfernen'),
            h('button',{type:'button',class:'linkbtn',onclick:()=>openSeries({edit:s.series.id})},'Serie bearbeiten')) : null));
        continue;
      }
      eb.append(h('div',{class:'sentry'},
        entryRow(s),
        mine ? h('div',{class:'acts'},
          h('button',{type:'button',class:'linkbtn',onclick:()=>startEdit(s)},'Bearbeiten'),
          S.confirmSlot === s.sid
            ? h('button',{type:'button',class:'linkbtn danger',onclick:()=>deleteSlot(s.sid)},'Wirklich löschen')
            : h('button',{type:'button',class:'linkbtn danger',onclick:()=>{S.confirmSlot=s.sid;renderSheet();}},'Löschen'))
        : s.legacy && canWrite() ? h('div',{class:'acts'}, h('button',{type:'button',class:'linkbtn',onclick:()=>migrate(s)},'Das bin ich – übernehmen')) : null));
    }

    /* Formular */
    const showForm = canWrite() && !blocked(date) && (S.formOpen || !!S.editingSid);
    $('slotForm').hidden = !showForm;
    $('openForm').hidden = !canWrite() || showForm || blocked(date);
    $('openForm').textContent = S.me && list.some(s => s.pid === S.me.pid) ? '+ Weitere Zeit eintragen' : '+ Meine Zeit eintragen';
    $('formLabel').textContent = S.editingSid ? 'Eintrag bearbeiten' : `Deine Zeit${myName() ? ' · ' + myName() : ''}`;
    $('saveBtn').textContent = S.editingSid ? 'Speichern' : 'Eintragen';
    $('repeatRow').hidden = !!S.editingSid;
    $('cancelEdit').hidden = !S.editingSid;
    const zone = $('zone'); zone.textContent = '';
    const picked = S.picked.map(gameById).filter(Boolean);
    if (!picked.length) zone.append(h('span',{class:'ph'},'Spiel hierher ziehen oder unten antippen'));
    for (const g of picked) zone.append(h('span',{class:'chip'}, cover(g), g.name,
      h('button',{type:'button','aria-label':`${g.name} abwählen`,onclick:()=>togglePick(g.id)},'×')));
    const pl = $('pickList'); pl.textContent = '';
    for (const g of S.games){
      const on = S.picked.includes(g.id);
      const cv = cover(g); if (on) cv.append(h('span',{class:'check'},'✓'));
      pl.append(h('button',{type:'button',class:'ptile','aria-pressed':String(on),draggable:'true',ondragstart:dragGame(g),onclick:()=>togglePick(g.id)},
        cv, h('span',{class:'tname'}, g.name)));
    }
  }

  function togglePick(id){ S.picked = S.picked.includes(id) ? S.picked.filter(x=>x!==id) : [...S.picked, id]; renderSheet(); }
  function bounce(key){ S.bounce = key; clearTimeout(bounce.t); bounce.t = setTimeout(() => { S.bounce = null; }, 600); }
  function startEdit(s){ S.formOpen = true; S.editingSid = s.sid; S.picked = [...s.games]; $('tFrom').value = s.from; $('tTo').value = s.to; renderSheet(); $('tFrom').focus(); }

  /* ---------- Schreiben ---------- */
  function fail(e){
    const code = e && e.code;
    if (code === 'invalid_argument' || code === 'not_granted'){ S.readOnly = true; showBanner('Dein Konto darf hier nur lesen. Prüfe, ob du mit der richtigen Google-Adresse angemeldet bist.'); render(); }
    else if (code === 'quota_exceeded' || code === 'quota_or_state') toast('Speicher voll – lösch alte Einträge oder Bilder.');
    else if (code === 'too_large') toast('Das Bild ist zu groß.');
    else if (code === 'unsupported_type') toast('Bitte ein JPG-, PNG- oder WebP-Bild wählen.');
    else toast('Speichern hat nicht geklappt. Versuch es gleich nochmal.');
  }

  /* Eigene Daten liegen in einem Dokument pro Person; Schreibvorgänge laufen nacheinander */
  function prune(d){
    const cut = ymd(addDays(new Date(), -60));
    for (const [k,s] of Object.entries(d.slots || {})) if (!s || !s.date || s.date < cut) delete d.slots[k];
    for (const k of Object.keys(d.votes || {})) if (k < cut) delete d.votes[k];
    for (const [k,p] of Object.entries(d.plus || {})) if (!p || !p.date || p.date < cut) delete d.plus[k];
    delete d.weekends;
    for (const k of Object.keys(d.days || {})) if (k < cut) delete d.days[k];
    for (const k of Object.keys(d.notes || {})) if (k < cut) delete d.notes[k];
    for (const [k,x] of Object.entries(d.series || {})){
      if (!x || (x.until && x.until < cut)) { delete d.series[k]; continue; }
      if (x.skip) x.skip = x.skip.filter(dt => dt >= cut);
    }
  }
  let wchain = Promise.resolve();
  function myWrite(fn){
    if (!canWrite()){ if (!S.me) toast('Melde dich an, um etwas einzutragen.'); return Promise.resolve(false); }
    const run = async () => {
      const prev = S.myData, base = clone(S.myData);
      fn(base); prune(base); base.updatedAt = Date.now();
      S.myData = base; render();
      try { await S.me.ref.set(base); return true; }
      catch(e){ S.myData = prev; render(); fail(e); return false; }
    };
    const p = wchain.then(run); wchain = p.catch(()=>{}); return p;
  }

  async function saveSlot(e){
    e.preventDefault();
    const from = $('tFrom').value, to = $('tTo').value;
    const err = !from || !to ? 'Bitte trag eine Start- und eine Endzeit ein.' : from === to ? 'Start und Ende sind gleich – wähl eine andere Endzeit.' : '';
    if (err){ $('formErr').textContent = err; $('formErr').hidden = false; return; }
    if (blocked(S.sheetDate)){ $('formErr').textContent = 'An diesem Tag kann jemand nicht – Vorschläge sind gesperrt.'; $('formErr').hidden = false; return; }
    $('formErr').hidden = true;
    const sid = S.editingSid || rid(), date = S.sheetDate, games = [...S.picked], editing = !!S.editingSid;
    if (!editing && S.repeat){
      $('saveBtn').disabled = true;
      const every = S.repeat, wd = parse(date).getDay();
      const ok = await myWrite(dd => { dd.series = dd.series || {}; dd.series[rid()] = { title:'', kind:'free', days:[wd], from, to, games, every, start:date, until:null, skip:[], createdAt:Date.now() }; });
      $('saveBtn').disabled = false;
      if (ok){ toast(`Serie angelegt: ${every === 2 ? 'alle 2 Wochen' : 'jeden'} ${WDLONG[wd]} ${from}–${to}`); resetForm(); S.formOpen = false; if (S.sheetDate) renderSheet(); }
      return;
    }
    $('saveBtn').disabled = true;
    const ok = await myWrite(dd => {
      dd.slots = dd.slots || {};
      const old = dd.slots[sid];
      dd.slots[sid] = { date, from, to, games, createdAt:(old && old.createdAt) || Date.now() };
      dd.days = dd.days || {}; if (!dd.days[date]) dd.days[date] = 'yes';
    });
    $('saveBtn').disabled = false;
    if (ok){
      toast(games.length ? (editing ? 'Eintrag geändert' : 'Eingetragen') : 'Eingetragen – jetzt abstimmen, was ihr zockt');
      resetForm(); S.formOpen = false;
      if (S.sheetDate){ renderSheet(); if (!games.length && !$('sheetVote').hidden) setTimeout(() => $('sheetVote').scrollIntoView({behavior:'smooth', block:'start'}), 80); }
    }
  }
  async function deleteSlot(sid){
    const ok = await myWrite(d => { if (d.slots) delete d.slots[sid]; });
    if (ok){ S.confirmSlot = null; if (S.editingSid === sid) resetForm(); toast('Eintrag gelöscht'); renderSheet(); }
  }
  async function togglePlus(s){
    const was = S.me && s.plus.includes(S.me.pid);
    bounce('p:'+s.key);
    const ok = await myWrite(d => { d.plus = d.plus || {}; if (d.plus[s.key]) delete d.plus[s.key]; else { d.plus[s.key] = {date:s.date}; d.days = d.days || {}; if (!d.days[s.date]) d.days[s.date] = 'yes'; } });
    if (ok) toast(was ? 'Zusage zurückgenommen' : `Bestätigt: ${s.from}–${s.to} mit ${nameOf(s.pid)}`);
  }
  async function setStatus(date, st){
    const cur = myExplicit(date), next = cur === st ? null : st;
    const mine = slotsOn(date).filter(x => S.me && x.pid === S.me.pid);
    bounce('s:'+date+st);
    const ok = await myWrite(d => {
      d.days = d.days || {};
      if (next) d.days[date] = next; else delete d.days[date];
      if (next === 'no'){
        for (const x of mine){
          if (x.series){ const t = d.series && d.series[x.series.id]; if (t) t.skip = [...new Set([...(t.skip || []), date])]; }
          else if (d.slots) delete d.slots[x.sid];
        }
        for (const [k,p] of Object.entries(d.plus || {})) if (p && p.date === date) delete d.plus[k];
      }
    });
    if (ok) toast(!next ? 'Status entfernt'
      : next === 'no' ? (mine.length ? 'Kann nicht – deine Zeiten für den Tag sind entfernt' : 'Kann nicht – der Tag ist gesperrt')
      : next === 'maybe' ? 'Vielleicht – eingetragen' : 'Kann – eingetragen');
  }
  async function addNote(e){
    e.preventDefault();
    const text = $('noteIn').value.trim().slice(0, 300), date = S.sheetDate;
    if (!text || !date) return;
    const ok = await myWrite(d => { d.notes = d.notes || {}; d.notes[date] = [...(d.notes[date] || []), {id:rid(), text, at:Date.now()}].slice(-30); });
    if (ok){ $('noteIn').value = ''; }
  }
  async function deleteNote(date, id){
    const ok = await myWrite(d => { if (d.notes && d.notes[date]){ d.notes[date] = d.notes[date].filter(n => n.id !== id); if (!d.notes[date].length) delete d.notes[date]; } });
    if (ok){ S.confirmNote = null; toast('Kommentar gelöscht'); }
  }
  async function toggleVote(date, gid){
    const cur = prefs(S.me.pid, date);
    const next = cur.includes(gid) ? cur.filter(x => x !== gid) : [...cur, gid];
    bounce('v:'+gid);
    await myWrite(d => { d.votes = d.votes || {}; d.votes[date] = next; });
  }
  async function dropGame(date, gameId){
    const g = gameById(gameId); if (!g) return;
    if (blocked(date)){ toast('An diesem Tag kann jemand nicht'); return; }
    const mine = S.me ? slotsOn(date).filter(s => s.pid === S.me.pid && !s.series && !s.legacy) : [];
    if (mine.length && canWrite()){
      const s = mine[0];
      if (s.games.includes(gameId)){ toast(`${g.name} ist schon drin`); return; }
      const ok = await myWrite(d => { const t = d.slots && d.slots[s.sid]; if (t) t.games = [...(t.games||[]), gameId]; });
      if (ok) toast(`${g.name} → ${fmtShort(parse(date))}`);
    } else openSheet(date, {preGame:gameId});
  }

  /* Feste Sessions: ein gemeinsames Dokument pro Tag */
  async function fixSession(date, gid){
    const m = matchOn(date); if (!m || !canWrite()) return;
    const lead = leader(date);
    const game = gid || m.games[0] || (lead && !lead.tie ? lead.games[0].id : null);
    const data = { date, from:fmtMin(m.s), to:fmtMin(m.e), game, pids:m.pids, by:S.me.pid, at:Date.now() };
    try {
      await S.db.doc('sessions/'+date).set(data);
      if (S.snap){ S.snap.sessions[date] = [data.from, data.to, data.game, data.by]; storeSnap(S.snap); }
      toast(`Fix: ${fmtShort(parse(date))}, ${data.from}–${data.to}${game && gameById(game) ? ' · ' + gameById(game).name : ''}`);
    }
    catch(e){ fail(e); }
  }
  async function setSessionGame(gid){
    const date = S.sheetDate, s = S.sessions[date]; if (!s) return;
    try { await S.db.doc('sessions/'+date).update({game:gid}); } catch(e){ fail(e); }
  }
  async function cancelSession(){
    const date = S.sheetDate;
    try { await S.db.doc('sessions/'+date).delete(); if (S.snap){ delete S.snap.sessions[date]; storeSnap(S.snap); } S.confirmCancel = false; toast('Session abgesagt'); } catch(e){ fail(e); }
  }

  /* Alte Einträge (vor der Konto-Anmeldung) ins eigene Konto übernehmen */
  async function migrate(l){
    if (S.migrating.has(l.sid) || !canWrite()) return;
    S.migrating.add(l.sid);
    const ok = await myWrite(d => { d.slots = d.slots || {}; d.slots[l.sid] = { date:l.date, from:l.from, to:l.to, games:l.games || [], createdAt:l.createdAt || Date.now() }; });
    if (ok){ try { await S.db.doc('slots/'+l.sid).delete(); } catch(e){} }
    else S.migrating.delete(l.sid);
  }
  function autoMigrate(){
    if (!canWrite() || !S.myLoaded || !localName) return;
    for (const l of S.legacy) if (norm(l.name) === norm(localName)) migrate({...l, sid:l.id});
  }

  /* ---------- Bilder ---------- */
  async function shrink(file){
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width*k); c.height = Math.round(bmp.height*k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return (await new Promise(r => c.toBlob(r, 'image/jpeg', .86))) || file;
    } catch(e){ return file; }
  }
  async function uploadImage(file){
    const blob = await shrink(file);
    const type = ['image/jpeg','image/png','image/webp','image/gif'].includes(blob.type) ? blob.type : 'image/jpeg';
    return S.assets.upload(blob, {type});
  }
  function pickImageFor(id){ S.uploadFor = id; $('fileIn').value = ''; $('fileIn').click(); }
  $('newPic').addEventListener('click', () => { S.uploadFor = '__new'; $('fileIn').value = ''; $('fileIn').click(); });
  $('fileIn').addEventListener('change', async () => {
    const file = $('fileIn').files[0]; const target = S.uploadFor; S.uploadFor = null;
    if (!file || !target || !S.assets) return;
    if (target === '__new'){ if (S.newPic) URL.revokeObjectURL(S.newPic.url); S.newPic = { file, url:URL.createObjectURL(file) }; renderGames(); return; }
    const g = gameById(target); if (!g) return;
    S.uploading = target; renderGames();
    try {
      const res = await uploadImage(file); const old = g.image;
      await S.db.doc('games/'+target).update(res.dataUrl ? {img:res.dataUrl} : {image:res.id});
      if (old && !res.dataUrl) S.assets.delete(old).catch(()=>{});
      toast(`Bild für ${g.name} gespeichert`);
    } catch(e){ fail(e); }
    finally { S.uploading = null; renderGames(); }
  });
  async function addGame(e){
    e.preventDefault();
    const name = $('newGame').value.trim();
    if (!name){ $('newGame').focus(); return; }
    if (S.games.some(g => norm(g.name) === norm(name))){ toast(`${name} gibt es schon`); return; }
    if (!S.db) return;
    try {
      const data = {name, createdAt:Date.now()};
      if (S.newPic && S.assets){ const res = await uploadImage(S.newPic.file); if (res.dataUrl) data.img = res.dataUrl; else data.image = res.id; }
      const ref = await S.db.collection('games').add(data);
      if (S.snap && ref && ref.id){ S.snap.games.push(ref.id); storeSnap(S.snap); }
      $('newGame').value = '';
      if (S.newPic){ URL.revokeObjectURL(S.newPic.url); S.newPic = null; }
      renderGames(); toast(`${name} hinzugefügt`);
    } catch(err){ fail(err); }
  }
  async function deleteGame(id){
    const g = gameById(id); S.confirmGame = null;
    try { await S.db.doc('games/'+id).delete(); if (g && g.image && S.assets) S.assets.delete(g.image).catch(()=>{}); } catch(e){ fail(e); }
  }

  /* ---------- Anzeigename ---------- */
  function openGate(auto){
    const acc = S.me && S.profiles[S.me.pid] && S.profiles[S.me.pid].name;
    $('gateTitle').textContent = auto ? 'Wie sollen wir dich nennen?' : 'Anzeigename';
    $('gateText').textContent = acc ? `Leer lassen, um deinen Kontonamen „${acc}“ zu nutzen.` : 'Dieser Name steht bei deinen Zeiten im Kalender.';
    $('gateName').value = personData(S.me ? S.me.pid : '').nick || (acc ? '' : localName);
    $('gateCancel').hidden = !!auto;
    $('gate').hidden = false; setTimeout(()=>$('gateName').focus(),0);
  }
  function maybeGate(){
    if (S.gateAuto || !canWrite() || !S.myLoaded) return;
    if (S.user && !S.profilesAsked) return;
    if (!myName()){ S.gateAuto = true; openGate(true); }
  }
  $('gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const n = $('gateName').value.trim();
    const acc = S.me && S.profiles[S.me.pid] && S.profiles[S.me.pid].name;
    if (!n && !acc){ $('gateName').focus(); return; }
    if (n){ localName = n; try { localStorage.setItem(NAME_KEY, n); } catch(err){} }
    $('gate').hidden = true;
    await myWrite(d => { if (n) d.nick = n; else delete d.nick; });
  });
  $('gateCancel').addEventListener('click', () => { $('gate').hidden = true; });
  $('logoutBtn').addEventListener('click', () => { if (window.zockAuth) window.zockAuth.signOut(); });
  /* Einmaliger Umzug: Datei aus dem Claude-Artefakt einlesen */
  $('importFile').addEventListener('change', async () => {
    const f = $('importFile').files[0]; $('importFile').value = '';
    if (!f || !S.db || !S.me) return;
    let data; try { data = JSON.parse(await f.text()); } catch(e){ toast('Die Datei ist kein gültiger Export.'); return; }
    if (!data || data.format !== 'zockplan-export-1'){ toast('Die Datei ist kein Zockplan-Export.'); return; }
    let n = 0;
    for (const g of (data.games || [])){
      if (!g.id || !g.name) continue;
      const ex = S.games.find(x => x.id === g.id || norm(x.name) === norm(g.name));
      try {
        if (ex){ if (!ex.img && !ex.image && g.img){ await S.db.doc('games/'+ex.id).update({img:g.img}); n++; } }
        else { await S.db.doc('games/'+g.id).set({name:g.name, createdAt:g.createdAt || Date.now(), ...(g.img ? {img:g.img} : {})}); n++; }
      } catch(e){ fail(e); return; }
    }
    const p = data.person || {};
    const ok = await myWrite(d => {
      for (const k of ['days','slots','votes','notes','series']){
        if (!p[k]) continue;
        d[k] = Object.assign({}, p[k], d[k] || {});
      }
    });
    if (ok){ $('gate').hidden = true; toast(`Übernommen: ${n} Spiele und deine Einträge`); }
  });
  $('whoBtn').addEventListener('click', () => { if (canWrite()) openGate(false); });

  /* ---------- Kleinkram ---------- */
  let tt;
  function toast(msg){ const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(()=>t.hidden = true, 2400); }
  function showBanner(msg){ const b = $('banner'); b.textContent = msg; b.hidden = false; }

  $('vWeek').onclick = () => { S.view = 'week'; render(); };
  $('vMonth').onclick = () => { S.view = 'month'; render(); };
  $('prev').onclick = () => { S.anchor = S.view==='week' ? addDays(S.anchor,-7) : new Date(S.anchor.getFullYear(), S.anchor.getMonth()-1, 1); render(); };
  $('next').onclick = () => { S.anchor = S.view==='week' ? addDays(S.anchor,7) : new Date(S.anchor.getFullYear(), S.anchor.getMonth()+1, 1); render(); };
  $('todayBtn').onclick = () => { S.anchor = new Date(now.getFullYear(),now.getMonth(),now.getDate()); render(); };
  $('sheetClose').onclick = closeSheet;
  $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (!$('gate').hidden && !$('gateCancel').hidden) $('gate').hidden = true; else if (!$('sheet').hidden) closeSheet(); } });
  $('slotForm').addEventListener('submit', saveSlot);
  $('cancelEdit').onclick = () => { resetForm(); S.formOpen = false; renderSheet(); };
  $('noteForm').addEventListener('submit', addNote);
  $('popOk').onclick = closePop;
  $('nextPop').addEventListener('click', e => { if (e.target === $('nextPop')) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('nextPop').hidden) closePop(); });
  $('openForm').onclick = () => { S.formOpen = true; renderSheet(); $('tFrom').focus(); };

  /* ---------- Serien verwalten ---------- */
  S.ser = { form:false, edit:null, kind:'no', days:[], every:1, confirmDel:null };
  function openSeries(opts){
    opts = opts || {};
    $('seriesPanel').hidden = false;
    if (opts.edit) editSeries(opts.edit);
    else if (opts.day != null) newSeries({days:[opts.day], kind:opts.kind || 'no', start:opts.start});
    else { S.ser.form = false; }
    renderSeries();
  }
  function closeSeries(){ $('seriesPanel').hidden = true; S.ser.form = false; S.ser.confirmDel = null; }
  function newSeries(pre){
    pre = pre || {};
    Object.assign(S.ser, { form:true, edit:null, kind:pre.kind || 'no', days:pre.days || [], every:1 });
    $('serName').value = ''; $('serFrom').value = ''; $('serTo').value = '';
    $('serStart').value = pre.start && pre.start >= todayStr ? pre.start : todayStr; $('serUntil').value = '';
    $('serErr').hidden = true;
  }
  function editSeries(id){
    const x = S.me && (personData(S.me.pid).series || {})[id]; if (!x) return;
    Object.assign(S.ser, { form:true, edit:id, kind:x.kind, days:[...x.days], every:x.every || 1 });
    $('serName').value = x.title || ''; $('serFrom').value = x.from || ''; $('serTo').value = x.to || '';
    $('serStart').value = x.start || todayStr; $('serUntil').value = x.until || '';
    $('serErr').hidden = true;
  }
  function renderSeries(){
    if ($('seriesPanel').hidden) return;
    const box = $('serList'); box.textContent = '';
    const mine = S.me ? seriesOf(S.me.pid) : [];
    const others = allPids().filter(p => !isMe(p)).flatMap(seriesOf);
    const row = (x, own) => h('div',{class:'serrow'},
      h('span',{class:'serico '+x.kind,html:ICON_REPEAT}),
      h('div',{class:'sertxt'},
        h('strong',null, own ? seriesLabel(x) : `${nameOf(x.pid)}: ${seriesLabel(x)}`),
        h('span',null, `${rhythmText(x)}${x.kind !== 'no' ? ` · ${x.from}–${x.to}` : ''} · ${x.kind === 'no' ? 'kann nicht' : x.kind === 'busy' ? 'belegt' : 'kann'}`),
        h('span',{class:'serdates'}, `ab ${fmtShort(parse(x.start))}${x.until ? ` bis ${fmtShort(parse(x.until))}` : ''}${(x.skip || []).filter(d => d >= todayStr).length ? ` · ${(x.skip || []).filter(d => d >= todayStr).length}× ausgelassen` : ''}`)),
      own && canWrite() ? h('div',{class:'acts'},
        h('button',{type:'button',class:'linkbtn',onclick:()=>{ editSeries(x.id); renderSeries(); }},'Bearbeiten'),
        S.ser.confirmDel === x.id
          ? h('button',{type:'button',class:'linkbtn danger',onclick:()=>deleteSeries(x.id)},'Wirklich löschen')
          : h('button',{type:'button',class:'linkbtn danger',onclick:()=>{ S.ser.confirmDel = x.id; renderSeries(); }},'Löschen')) : null);
    box.append(h('div',{style:'display:contents'}, h('p',{class:'label'}, 'Deine Serien'),
      mine.length ? mine.map(x => row(x, true)) : h('p',{class:'vhint'}, 'Noch keine Serie. Zum Beispiel: „Tanzen“ – jeden Montag – kann nicht.')));
    if (others.length) box.append(h('div',{style:'display:contents'}, h('p',{class:'label',style:'margin-top:6px'}, 'Vom anderen'), others.map(x => row(x, false))));
    /* Formular */
    const f = S.ser;
    $('serForm').hidden = !f.form || !canWrite();
    $('serNew').hidden = f.form || !canWrite();
    $('serFormLabel').textContent = f.edit ? 'Serie bearbeiten' : 'Neue Serie';
    document.querySelectorAll('#serKind button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === f.kind)));
    document.querySelectorAll('#serEvery button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.e === f.every)));
    $('serTimes').hidden = f.kind === 'no';
    const dp = $('serDays'); dp.textContent = '';
    for (const i of WD_ORDER) dp.append(h('button',{type:'button','aria-pressed':String(f.days.includes(i)),'aria-label':WDLONG[i],
      onclick:()=>{ f.days = f.days.includes(i) ? f.days.filter(x => x !== i) : [...f.days, i]; renderSeries(); }}, WDL[i]));
  }
  async function saveSeries(e){
    e.preventDefault();
    const f = S.ser, from = $('serFrom').value, to = $('serTo').value, start = $('serStart').value, until = $('serUntil').value || null;
    const title = $('serName').value.trim().slice(0, 40);
    const err = !f.days.length ? 'Wähl mindestens einen Wochentag.'
      : f.kind !== 'no' && (!from || !to) ? 'Bitte Start- und Endzeit eintragen.'
      : f.kind !== 'no' && from === to ? 'Start und Ende sind gleich.'
      : !start ? 'Bitte ein Startdatum wählen.'
      : until && until < start ? 'Das Enddatum liegt vor dem Start.' : '';
    if (err){ $('serErr').textContent = err; $('serErr').hidden = false; return; }
    const id = f.edit || rid();
    const ok = await myWrite(d => {
      d.series = d.series || {};
      const old = d.series[id] || {};
      d.series[id] = { title, kind:f.kind, days:[...f.days].sort(), from:f.kind === 'no' ? null : from, to:f.kind === 'no' ? null : to,
        games:old.games || [], every:f.every, start, until, skip:old.skip || [], createdAt:old.createdAt || Date.now() };
    });
    if (ok){ toast(f.edit ? 'Serie geändert' : `Serie gespeichert: ${title || SKIND[f.kind]}`); f.form = false; f.edit = null; renderSeries(); }
  }
  async function deleteSeries(id){
    const ok = await myWrite(d => { if (d.series) delete d.series[id]; });
    if (ok){ S.ser.confirmDel = null; toast('Serie gelöscht'); renderSeries(); }
  }
  async function skipOccurrence(id, date){
    const ok = await myWrite(d => { const t = d.series && d.series[id]; if (t) t.skip = [...new Set([...(t.skip || []), date])]; });
    if (ok) toast(`Für ${fmtShort(parse(date))} ausgelassen – die Serie läuft weiter`);
  }
  $('serBtn').innerHTML = ICON_REPEAT;
  $('serBtn').onclick = () => { if (!canWrite() && !allPids().some(p => seriesOf(p).length)) { toast('Serien sind erst nach dem Laden verfügbar'); return; } openSeries(); };
  $('serClose').onclick = closeSeries;
  $('serNew').onclick = () => { newSeries(); renderSeries(); $('serName').focus(); };
  $('serCancel').onclick = () => { S.ser.form = false; S.ser.edit = null; renderSeries(); };
  $('serForm').addEventListener('submit', saveSeries);
  $('seriesPanel').addEventListener('click', e => { if (e.target === $('seriesPanel')) closeSeries(); });
  document.querySelectorAll('#serKind button').forEach(b => b.onclick = () => { S.ser.kind = b.dataset.k; renderSeries(); });
  document.querySelectorAll('#serEvery button').forEach(b => b.onclick = () => { S.ser.every = +b.dataset.e; renderSeries(); });
  document.querySelectorAll('#repeatSeg button').forEach(b => b.onclick = () => setRepeat(+b.dataset.rep));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('seriesPanel').hidden) closeSeries(); });

  /* Gerät erkennen: Breite des Fensters + Art der Bedienung (Maus oder Touch) */
  function detectDevice(){
    const w = window.innerWidth;
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const dev = w >= 1000 ? 'desktop' : w >= 700 ? 'tablet' : 'mobile';
    const root = document.documentElement;
    if (root.dataset.device !== dev){ root.dataset.device = dev; if (dev === 'desktop' && S.tab === 'games') setTab('cal'); }
    root.dataset.input = touch ? 'touch' : 'mouse';
  }
  detectDevice();
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(detectDevice, 120); });
  /* Am PC: Pfeiltasten blättern Woche/Monat */
  document.addEventListener('keydown', e => {
    if (document.documentElement.dataset.device !== 'desktop') return;
    if (!$('sheet').hidden || !$('gate').hidden || !$('nextPop').hidden || !$('seriesPanel').hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'ArrowLeft') $('prev').click();
    else if (e.key === 'ArrowRight') $('next').click();
  });

  /* Hell / Dunkel */
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21.2 15.4a.6.6 0 0 0-.7-.8Z"/></svg>';
  function setLook(l){
    if (l === 'dark') document.documentElement.dataset.look = 'dark'; else delete document.documentElement.dataset.look;
    $('lookBtn').innerHTML = l === 'dark' ? SUN : MOON;
    $('lookBtn').setAttribute('aria-label', l === 'dark' ? 'Helles Design' : 'Dunkles Design');
    try { localStorage.setItem('zockplan-look', l); } catch(e){}
  }
  let look = 'light'; try { look = localStorage.getItem('zockplan-look') || 'light'; } catch(e){}
  setLook(look);
  $('lookBtn').onclick = () => { look = look === 'dark' ? 'light' : 'dark'; setLook(look); };

  /* Tab-Leiste (Handy) */
  function setTab(t){
    S.tab = t; $('app').dataset.tab = t;
    $('tabCal').setAttribute('aria-pressed', t === 'cal'); $('tabGames').setAttribute('aria-pressed', t === 'games');
    try { localStorage.setItem('zockplan-tab', t); } catch(e){}
    window.scrollTo({top:0});
  }
  $('tabCal').onclick = () => setTab('cal');
  $('tabGames').onclick = () => setTab('games');
  try { const t = localStorage.getItem('zockplan-tab'); if (t === 'games') setTab('games'); } catch(e){}
  $('addGame').addEventListener('submit', addGame);
  const zone = $('zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drop'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drop'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); if (id && !S.picked.includes(id)) togglePick(id); });

  /* Countdown aktuell halten (nur Anzeige) */
  setInterval(() => { now = new Date(); todayStr = ymd(now); if (S.C) renderNext(); }, 30000);

  render();

  /* ---------- Gemeinsamer Speicher ---------- */
  (async () => {
    const api = window.claude && window.claude.use ? window.claude : null;
    const db = api ? await api.use('db') : null;
    if (!db){
      S.loaded = {people:true, games:true};
      showBanner('Keine Verbindung zur Datenbank. Prüfe deine Internetverbindung und lade die App neu.');
      render(); return;
    }
    S.db = db;
    let user = null; try { user = await api.use('user'); } catch(e){}
    S.user = user;
    let uid = null; try { uid = user ? await user.id() : null; } catch(e){}
    if (uid) S.me = { pid:uid, ref:db.doc('people/'+uid) };
    else {
      let lid = null; try { lid = localStorage.getItem(GUEST_KEY); if (!lid){ lid = 'g' + rid(); localStorage.setItem(GUEST_KEY, lid); } } catch(e){ lid = 'g' + rid(); }
      S.me = { pid:'g:'+lid, ref:db.doc('guests/'+lid) };
    }
    try { if (user && user.can){ const ok = await user.can('data.write'); if (ok === false){ S.readOnly = true; showBanner('Dein Konto darf hier nur lesen. Prüfe, ob du mit der richtigen Google-Adresse angemeldet bist.'); } } } catch(e){}

    const people = { people:new Map(), guests:new Map() };
    const rebuild = () => { S.persons = new Map([...people.people, ...people.guests]); };
    const onPeople = (kind, prefix) => snap => {
      const m = new Map();
      for (const d of snap.docs) if (d.exists) m.set(prefix + d.id, { pid:prefix + d.id, data:d.data() || {} });
      people[kind] = m; rebuild();
      const mine = m.get(S.me.pid);
      if (mine) S.myData = mine.data;
      if ((kind === 'people') === !S.me.pid.startsWith('g:')){ S.myLoaded = true; S.loaded.people = true; autoMigrate(); }
      render();
    };
    const onErr = () => { S.loaded.people = true; S.myLoaded = true; render(); };
    db.collection('people').onSnapshot(onPeople('people',''), onErr);
    db.collection('guests').onSnapshot(onPeople('guests','g:'), () => {});
    db.collection('slots').onSnapshot(snap => {
      S.legacy = snap.docs.filter(d => d.exists).map(d => ({id:d.id, ...d.data()})).filter(s => s.date && s.from && s.to && s.name && !S.migrating.has(s.id));
      autoMigrate(); render();
    }, () => {});
    db.collection('sessions').onSnapshot(snap => {
      const o = {}; for (const d of snap.docs) if (d.exists){ const v = d.data(); if (v && v.date && v.from && v.to) o[v.date] = v; }
      S.sessions = o; S.loaded.sessions = true; render();
    }, () => { S.loaded.sessions = true; render(); });
    db.collection('games').orderBy('createdAt').onSnapshot(snap => {
      S.games = snap.docs.filter(d => d.exists).map(d => ({id:d.id, ...d.data()})).filter(g => g.name);
      S.loaded.games = true; render();
    }, () => { S.loaded.games = true; render(); });
    try { S.assets = await api.use('assets'); } catch(e){ S.assets = null; }
    render();
  })();
})();
