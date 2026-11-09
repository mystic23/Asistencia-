(function () {
  'use strict';

  const STORE_KEY = 'asistencia.v1';
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOWS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  // Coordenadas aproximadas: calíbralas en Ajustes estando en cada edificio.
  const DEFAULT_OFFICES = [
    { id: 'q93', name: 'Enel Colombia Q93', lat: 4.6767, lng: -74.0484, radius: 250 },
    { id: 'calle', name: 'Edificio Calle 82', lat: 4.6668, lng: -74.0536, radius: 250 }
  ];

  const DEFAULT_STATE = {
    records: {},           // 'YYYY-MM-DD' -> { type: 'office'|'home'|'vacation', source, place, time }
    settings: {
      pct: 60,
      rounding: 'ceil',
      autoCheck: true,
      email: '',
      emailCc: '',
      syncUrl: '',          // URL del Apps Script (Gmail / Google Sheets)
      syncToken: '',
      offices: DEFAULT_OFFICES
    },
    queue: [],              // cambios pendientes de subir a Google
    account: '',
    lastSync: ''
  };

  // ---------- Estado ----------
  let state = load();
  let viewMonth = startOfMonth(new Date());

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return {
          records: s.records || {},
          settings: Object.assign({}, DEFAULT_STATE.settings, s.settings || {}),
          queue: s.queue || [],
          account: s.account || '',
          lastSync: s.lastSync || ''
        };
      }
    } catch (e) { /* almacenamiento no disponible */ }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('No se pudo guardar en este dispositivo'); }
  }

  // Todo cambio de registros pasa por aquí para sincronizarse con Google.
  function setRecord(k, rec) {
    if (rec) state.records[k] = rec; else delete state.records[k];
    state.queue.push({ date: k, rec: rec || null });
    save();
    scheduleSync();
  }

  // ---------- Sincronización con Google (Apps Script + Sheets + Gmail) ----------
  function connected() { return !!(state.settings.syncUrl && state.settings.syncToken); }
  let syncTimer, syncing = false, syncStatus = '';
  function scheduleSync(delay) {
    if (!connected()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, delay == null ? 800 : delay);
  }

  async function api(params, body) {
    const url = new URL(state.settings.syncUrl);
    url.searchParams.set('token', state.settings.syncToken);
    Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), body
      ? { method: 'POST', body: JSON.stringify(Object.assign({ token: state.settings.syncToken }, body)) }
      : { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error del servidor');
    return data;
  }

  async function sync() {
    if (!connected() || syncing) return;
    if (!navigator.onLine) { syncStatus = 'Sin conexión — se sincroniza al volver'; renderSync(); return; }
    syncing = true; syncStatus = 'Sincronizando…'; renderSync();
    try {
      const sent = state.queue.length;
      const data = sent ? await api({}, { ops: state.queue.slice(0, sent) }) : await api({ action: 'list' });
      state.queue = state.queue.slice(sent);
      state.records = data.records || {};
      state.queue.forEach(op => { if (op.rec) state.records[op.date] = op.rec; else delete state.records[op.date]; });
      state.account = data.email || state.account;
      state.lastSync = new Date().toISOString();
      syncStatus = '';
      save();
      render();
    } catch (err) {
      syncStatus = '⚠️ ' + err.message;
    } finally {
      syncing = false;
      renderSync();
      if (state.queue.length && !syncStatus) scheduleSync(500);
    }
  }

  function renderSync() {
    const box = document.getElementById('syncStatus');
    if (!box) return;
    let txt;
    if (!connected()) txt = 'No conectado: el historial solo está en este celular.';
    else {
      txt = (state.account ? '✅ Conectado a ' + state.account : 'Conectado') +
        (state.lastSync ? ' · última sincronización ' + new Date(state.lastSync).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') +
        (state.queue.length ? ' · ' + state.queue.length + ' cambio(s) pendiente(s)' : '');
      if (syncStatus) txt += '\n' + syncStatus;
    }
    box.textContent = txt;
    const badge = document.getElementById('cloudBadge');
    if (badge) {
      badge.textContent = !connected() ? '' : syncStatus.startsWith('⚠️') ? '☁️⚠️' : state.queue.length ? '☁️…' : '☁️';
      badge.title = txt;
    }
  }

  // ---------- Fechas ----------
  function key(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function todayKey() { return key(new Date()); }
  function holidayName(k) { return ColombiaHolidays.colombianHolidays(+k.slice(0, 4)).map[k] || null; }
  function isWeekend(d) { const w = d.getDay(); return w === 0 || w === 6; }

  // Estado efectivo de un día
  function dayInfo(d) {
    const k = key(d);
    const rec = state.records[k];
    const hol = holidayName(k);
    const weekend = isWeekend(d);
    const isFuture = k > todayKey();
    const isToday = k === todayKey();
    let kind;
    if (hol) kind = 'holiday';
    else if (weekend) kind = rec && rec.type === 'office' ? 'office-extra' : 'weekend';
    else if (rec) kind = rec.type;
    else if (isFuture || isToday) kind = 'pending';
    else kind = 'home'; // día hábil pasado sin registro = casa
    return { k, rec, hol, weekend, isFuture, isToday, kind, business: !hol && !weekend };
  }

  function requiredOffice(workdays) {
    const raw = Math.round(workdays * state.settings.pct * 1e4) / 1e6; // evita errores de coma flotante
    const fn = Math[state.settings.rounding] || Math.ceil;
    return fn(raw);
  }

  function monthStats(monthDate) {
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const s = { business: 0, holidays: 0, vacation: 0, workdays: 0, office: 0, officeExtra: 0, home: 0, pending: 0 };
    for (let i = 1; i <= days; i++) {
      const info = dayInfo(new Date(y, m, i));
      if (info.hol && !info.weekend) s.holidays++;
      if (info.kind === 'office-extra') s.officeExtra++;
      if (!info.business) continue;
      s.business++;
      if (info.kind === 'vacation') { s.vacation++; continue; }
      s.workdays++;
      if (info.kind === 'office') s.office++;
      else if (info.kind === 'home') s.home++;
      else if (info.kind === 'pending') s.pending++;
    }
    s.officeTotal = s.office + s.officeExtra;
    s.required = requiredOffice(s.workdays);
    s.missing = Math.max(0, s.required - s.officeTotal);
    s.homeAllowed = s.workdays - s.required;
    s.pctDone = s.workdays ? Math.round(s.officeTotal / s.workdays * 100) : 0;
    s.feasible = s.missing <= s.pending;
    return s;
  }

  // ---------- Geolocalización ----------
  function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('Este navegador no soporta ubicación'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    });
  }

  function nearestOffice(lat, lng) {
    let best = null;
    for (const o of state.settings.offices) {
      const dist = distanceMeters(lat, lng, o.lat, o.lng);
      if (!best || dist < best.dist) best = { office: o, dist };
    }
    return best;
  }

  let lastCheck = '';
  async function checkLocation(silent) {
    const btn = $('#btnCheck');
    btn.disabled = true; btn.textContent = '📍 Buscando…';
    try {
      handlePosition(await getPosition(), silent);
    } catch (err) {
      lastCheck = err.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación';
      if (!silent) toast(lastCheck);
    } finally {
      btn.disabled = false; btn.textContent = '📍 Verificar ubicación';
      render();
    }
  }

  // Evalúa una posición: si está dentro de una oficina, marca hoy como oficina.
  function handlePosition(pos, silent) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const near = nearestOffice(lat, lng);
    const k = todayKey();
    if (near && near.dist <= near.office.radius) {
      const prev = state.records[k];
      if (!prev || prev.type !== 'office') {
        setRecord(k, { type: 'office', source: 'gps', place: near.office.name, time: new Date().toISOString() });
        toast('✅ Marcado: oficina (' + near.office.name + ')');
      } else if (!silent) toast('Ya estás marcado en oficina hoy');
      lastCheck = 'En ' + near.office.name + ' · a ' + Math.round(near.dist) + ' m';
      return true;
    }
    lastCheck = near
      ? 'Fuera de oficina · ' + near.office.name + ' a ' + fmtDist(near.dist) + ' (±' + Math.round(accuracy) + ' m)'
      : 'No hay oficinas configuradas';
    if (!silent) toast('No estás en una oficina registrada');
    return false;
  }

  // Mientras la app está abierta, vigila la ubicación y marca sola al llegar.
  let watchId = null;
  function startWatch() {
    if (watchId !== null || !state.settings.autoCheck || !('geolocation' in navigator)) return;
    if (officeToday()) return;
    watchId = navigator.geolocation.watchPosition(pos => {
      if (handlePosition(pos, true)) stopWatch();
      render();
    }, err => { if (err.code === 1) stopWatch(); }, { enableHighAccuracy: true, maximumAge: 60000, timeout: 60000 }); // errores pasajeros no detienen la vigilancia
  }
  function stopWatch() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  function officeToday() { const r = state.records[todayKey()]; return !!(r && r.type === 'office'); }

  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; }

  // ---------- UI helpers ----------
  function $(sel) { return document.querySelector(sel); }
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [a, v] of Object.entries(attrs || {})) {
      if (a === 'class') n.className = v;
      else if (a.startsWith('on')) n.addEventListener(a.slice(2), v);
      else n.setAttribute(a, v);
    }
    kids.flat().forEach(k => n.append(k instanceof Node ? k : document.createTextNode(k)));
    return n;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function longDate(d) { return DOWS[d.getDay()] + ' ' + d.getDate() + ' de ' + MONTHS[d.getMonth()]; }
  function monthLabel(d) { return MONTHS[d.getMonth()].replace(/^./, c => c.toUpperCase()) + ' ' + d.getFullYear(); }

  const LABELS = { office: '🏢 Oficina', 'office-extra': '🏢 Oficina (extra)', home: '🏠 Casa', vacation: '🌴 Vacaciones', holiday: '🎉 Festivo', weekend: '😴 Fin de semana', pending: '⏳ Sin marcar (cuenta como casa)' };

  function statsBlock(s) {
    const cells = [
      ['Días hábiles', s.workdays, s.vacation ? '(' + s.vacation + ' de vacaciones)' : ''],
      ['Meta oficina', s.required, state.settings.pct + '%'],
      ['En oficina', s.officeTotal, s.pctDone + '%'],
      ['Te faltan', s.missing, s.missing ? 'días' : '¡cumplido!'],
      ['En casa', s.home, 'de ' + s.homeAllowed + ' permitidos'],
      ['Por venir', s.pending, 'días hábiles']
    ];
    return cells.map(([l, v, sub]) => el('div', { class: 'stat' }, el('b', {}, String(v)), el('span', {}, l), el('small', {}, sub)));
  }

  // ---------- Render ----------
  function render() {
    renderSync();
    renderToday();
    renderCalendar();
    renderVacations();
  }

  function renderToday() {
    const now = new Date();
    const info = dayInfo(now);
    $('#todayDate').textContent = longDate(now);
    $('#todayStatus').textContent = info.hol ? '🎉 Festivo: ' + info.hol : LABELS[info.kind];
    $('#todayStatus').className = 'today-status k-' + info.kind;
    const det = [];
    if (info.rec && info.rec.time) det.push((info.rec.source === 'gps' ? 'Marcado por GPS' : 'Marcado manual') + ' a las ' + new Date(info.rec.time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
    if (lastCheck) det.push(lastCheck);
    $('#todayDetail').textContent = det.join(' — ');

    const s = monthStats(startOfMonth(now));
    $('#monthTitle').textContent = monthLabel(now);
    $('#stats').replaceChildren(...statsBlock(s));
    const pct = s.workdays ? Math.min(100, s.officeTotal / s.workdays * 100) : 0;
    $('#progressBar').style.width = pct + '%';
    $('#progressGoal').style.left = state.settings.pct + '%';
    let hint;
    if (s.missing === 0) hint = '¡Ya cumpliste la meta del mes! 🎯';
    else if (!s.feasible) hint = '⚠️ Aunque vayas todos los días restantes (' + s.pending + '), no alcanzas la meta.';
    else hint = 'Debes ir ' + s.missing + ' de los ' + s.pending + ' días hábiles que quedan.';
    $('#statsHint').textContent = hint;
  }

  function renderCalendar() {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    $('#calTitle').textContent = monthLabel(viewMonth);
    const grid = $('#calGrid');
    const cells = [];
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // lunes primero
    for (let i = 0; i < offset; i++) cells.push(el('span', { class: 'day empty' }));
    const days = new Date(y, m + 1, 0).getDate();
    for (let i = 1; i <= days; i++) {
      const d = new Date(y, m, i);
      const info = dayInfo(d);
      const cls = 'day k-' + info.kind + (info.isToday ? ' today' : '') + (info.rec && info.rec.source === 'gps' ? ' gps' : '');
      cells.push(el('button', {
        class: cls,
        title: info.hol || LABELS[info.kind],
        onclick: () => cycleDay(d)
      }, String(i)));
    }
    grid.replaceChildren(...cells);

    const s = monthStats(viewMonth);
    $('#calStatsTitle').textContent = 'Resumen ' + monthLabel(viewMonth);
    $('#calStats').replaceChildren(...statsBlock(s));

    const hol = ColombiaHolidays.colombianHolidays(y).list;
    $('#holidayList').replaceChildren(...hol.map(h => {
      const d = parseKey(h.date);
      return el('li', { class: h.date < todayKey() ? 'past' : '' }, el('span', {}, h.name), el('small', {}, DOWS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3)));
    }));
  }

  function cycleDay(d) {
    const info = dayInfo(d);
    if (info.hol) return toast('Festivo: ' + info.hol);
    const k = info.k;
    const cur = info.rec ? info.rec.type : null;
    let next;
    if (info.weekend) next = cur === 'office' ? null : 'office';
    else next = { null: 'office', office: 'home', home: 'vacation', vacation: null }[cur];
    setRecord(k, next ? { type: next, source: 'manual', time: new Date().toISOString() } : null);
    render();
    toast(longDate(d) + ': ' + LABELS[dayInfo(d).kind]);
  }

  function setToday(type) {
    const k = todayKey();
    setRecord(k, type ? { type, source: 'manual', time: new Date().toISOString() } : null);
    render();
  }

  // ---------- Vacaciones ----------
  function vacationRanges() {
    const keys = Object.keys(state.records).filter(k => state.records[k].type === 'vacation').sort();
    const ranges = [];
    for (const k of keys) {
      const last = ranges[ranges.length - 1];
      if (last && businessDaysBetween(last.to, k) <= 1) { last.to = k; last.days.push(k); }
      else ranges.push({ from: k, to: k, days: [k] });
    }
    return ranges;
  }
  // Cuántos días hábiles hay después de a hasta b (inclusive b)
  function businessDaysBetween(a, b) {
    let n = 0; const d = parseKey(a); const end = parseKey(b);
    while (d < end) { d.setDate(d.getDate() + 1); const info = dayInfo(d); if (info.business) n++; }
    return n;
  }

  function addVacation() {
    const from = $('#vacFrom').value, to = $('#vacTo').value || from;
    if (!from) return toast('Elige la fecha de inicio');
    if (to < from) return toast('La fecha final es anterior a la inicial');
    const d = parseKey(from), end = parseKey(to);
    let n = 0;
    while (d <= end) {
      const info = dayInfo(d);
      if (info.business) { setRecord(info.k, { type: 'vacation', source: 'manual', time: new Date().toISOString() }); n++; }
      d.setDate(d.getDate() + 1);
    }
    save(); render();
    $('#vacFrom').value = ''; $('#vacTo').value = '';
    toast(n ? n + ' días hábiles de vacaciones agregados 🌴' : 'Ese rango no tiene días hábiles');
  }

  function renderVacations() {
    const ranges = vacationRanges().reverse();
    const fmt = k => { const d = parseKey(k); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); };
    $('#vacList').replaceChildren(...(ranges.length ? ranges.map(r => el('li', {},
      el('span', {}, r.from === r.to ? fmt(r.from) : fmt(r.from) + ' → ' + fmt(r.to)),
      el('small', {}, r.days.length + (r.days.length === 1 ? ' día' : ' días')),
      el('button', { class: 'btn icon danger', 'aria-label': 'Eliminar', onclick: () => {
        r.days.forEach(k => setRecord(k, null)); render(); toast('Vacaciones eliminadas');
      } }, '✕')
    )) : [el('li', { class: 'empty' }, 'Aún no has registrado vacaciones')]));
  }

  // ---------- Ajustes ----------
  function renderSettings() {
    const st = state.settings;
    $('#cfgPct').value = st.pct;
    $('#cfgRound').value = st.rounding;
    $('#cfgAuto').checked = st.autoCheck;
    $('#cfgEmail').value = st.email;
    $('#cfgEmailCc').value = st.emailCc;
    $('#autoUrl').textContent = location.origin + location.pathname + '?checkin=1';
    $('#cfgSyncUrl').value = st.syncUrl;
    $('#cfgSyncToken').value = st.syncToken;
    renderSync();
    renderCheckinUrls();

    $('#officeList').replaceChildren(...st.offices.map((o, idx) => {
      const upd = (field, num) => e => { o[field] = num ? parseFloat(e.target.value) || 0 : e.target.value; save(); render(); };
      return el('div', { class: 'office' },
        el('input', { value: o.name, 'aria-label': 'Nombre', onchange: upd('name') }),
        el('div', { class: 'row three' },
          el('label', {}, 'Lat', el('input', { type: 'number', step: 'any', value: o.lat, onchange: upd('lat', true) })),
          el('label', {}, 'Lng', el('input', { type: 'number', step: 'any', value: o.lng, onchange: upd('lng', true) })),
          el('label', {}, 'Radio m', el('input', { type: 'number', step: '10', value: o.radius, onchange: upd('radius', true) }))
        ),
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: async () => {
            try {
              toast('Obteniendo ubicación…');
              const p = await getPosition();
              o.lat = +p.coords.latitude.toFixed(6); o.lng = +p.coords.longitude.toFixed(6);
              save(); renderSettings(); toast('📍 ' + o.name + ' calibrada (±' + Math.round(p.coords.accuracy) + ' m)');
            } catch (e) { toast('No se pudo obtener la ubicación'); }
          } }, '📍 Usar mi ubicación'),
          el('a', { class: 'btn', href: 'https://www.google.com/maps?q=' + o.lat + ',' + o.lng, target: '_blank', rel: 'noopener' }, '🗺️ Ver'),
          el('button', { class: 'btn icon danger', 'aria-label': 'Eliminar oficina', onclick: () => {
            if (confirm('¿Eliminar ' + o.name + '?')) { st.offices.splice(idx, 1); save(); renderSettings(); }
          } }, '✕')
        )
      );
    }));
  }

  function checkinUrl(o) {
    const u = new URL(state.settings.syncUrl);
    u.searchParams.set('token', state.settings.syncToken);
    u.searchParams.set('action', 'checkin');
    u.searchParams.set('place', o.name);
    return u.toString();
  }

  function renderCheckinUrls() {
    const box = $('#checkinUrls');
    if (!connected()) {
      box.replaceChildren(el('p', { class: 'hint' }, 'Primero conecta tu cuenta de Google (arriba). Luego aquí aparecerá un enlace por oficina para la geocerca.'));
      return;
    }
    box.replaceChildren(...state.settings.offices.map(o => {
      let url;
      try { url = checkinUrl(o); } catch (e) { url = ''; }
      return el('div', { class: 'office' },
        el('b', {}, o.name),
        el('code', {}, url),
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: async () => {
            try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
            catch (e) { prompt('Copia este enlace:', url); }
          } }, '📋 Copiar enlace'),
          el('a', { class: 'btn', href: 'https://www.google.com/maps?q=' + o.lat + ',' + o.lng, target: '_blank', rel: 'noopener' }, '🗺️ Ubicación')
        )
      );
    }));
  }

  async function connectGoogle() {
    const st = state.settings;
    const url = $('#cfgSyncUrl').value.trim();
    const token = $('#cfgSyncToken').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) return toast('La URL debe terminar en /exec (copiada de Apps Script → Implementar)');
    if (!token) return toast('Pega el TOKEN que te dio configurar()');
    st.syncUrl = url; st.syncToken = token;
    // Primera conexión: sube lo que ya tengas en el celular.
    if (!state.lastSync) Object.keys(state.records).forEach(k => state.queue.push({ date: k, rec: state.records[k] }));
    save();
    await sync();
    if (syncStatus) toast(syncStatus);
    else toast('✅ Conectado a ' + (state.account || 'Google'));
    renderSettings();
  }

  function disconnectGoogle() {
    if (!confirm('¿Desconectar? El historial sigue guardado en tu Google Sheets y en este celular.')) return;
    Object.assign(state.settings, { syncUrl: '', syncToken: '' });
    state.queue = []; state.account = ''; state.lastSync = '';
    save(); renderSettings(); render();
  }

  function bindSettings() {
    $('#btnConnect').addEventListener('click', connectGoogle);
    $('#btnDisconnect').addEventListener('click', disconnectGoogle);
    $('#btnSyncNow').addEventListener('click', () => sync().then(() => toast(syncStatus || 'Sincronizado')));
    const st = state.settings;
    $('#cfgPct').addEventListener('change', e => { st.pct = Math.min(100, Math.max(0, +e.target.value || 0)); save(); render(); });
    $('#cfgRound').addEventListener('change', e => { st.rounding = e.target.value; save(); render(); });
    $('#cfgAuto').addEventListener('change', e => { st.autoCheck = e.target.checked; save(); });
    $('#cfgEmail').addEventListener('change', e => { st.email = e.target.value.trim(); save(); });
    $('#cfgEmailCc').addEventListener('change', e => { st.emailCc = e.target.value.trim(); save(); });
    $('#btnAddOffice').addEventListener('click', () => {
      st.offices.push({ id: 'o' + Date.now(), name: 'Nueva oficina', lat: 4.6097, lng: -74.0817, radius: 200 });
      save(); renderSettings();
    });
  }

  // ---------- Correo / exportar ----------
  function summaryText(monthDate) {
    const s = monthStats(monthDate);
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const lines = [
      'Resumen de asistencia — ' + monthLabel(monthDate),
      '',
      'Días hábiles (sin festivos ni vacaciones): ' + s.workdays,
      'Meta oficina (' + state.settings.pct + '%): ' + s.required,
      'Días en oficina: ' + s.officeTotal + ' (' + s.pctDone + '%)',
      'Días en casa: ' + s.home,
      'Vacaciones: ' + s.vacation,
      'Días hábiles por venir: ' + s.pending,
      s.missing ? 'Faltan ' + s.missing + ' días de oficina.' : 'Meta cumplida ✅',
      '',
      'Detalle:'
    ];
    const days = new Date(y, m + 1, 0).getDate();
    for (let i = 1; i <= days; i++) {
      const info = dayInfo(new Date(y, m, i));
      if (info.kind === 'weekend') continue;
      if (info.kind === 'pending' && info.isFuture) continue;
      const lbl = info.hol ? 'Festivo (' + info.hol + ')' : LABELS[info.kind].replace(/^\S+\s/, '');
      lines.push(info.k + '  ' + lbl + (info.rec && info.rec.place ? ' — ' + info.rec.place : ''));
    }
    return lines.join('\n');
  }

  async function sendEmail() {
    const st = state.settings;
    const month = $('#view-cal').classList.contains('active') ? viewMonth : startOfMonth(new Date());
    if (connected()) {
      try {
        toast('Enviando a tu Gmail…');
        await api({ action: 'resumen', month: key(month) });
        return toast('✉️ Resumen enviado a ' + (state.account || 'tu Gmail'));
      } catch (e) { toast('No se pudo enviar por Gmail; abriendo el correo…'); }
    }
    const params = new URLSearchParams();
    params.set('subject', 'Asistencia oficina — ' + monthLabel(month));
    params.set('body', summaryText(month));
    if (st.emailCc) params.set('cc', st.emailCc);
    const qs = params.toString().replace(/\+/g, '%20');
    location.href = 'mailto:' + encodeURIComponent(st.email || '') + '?' + qs;
  }

  async function share() {
    const text = summaryText(startOfMonth(new Date()));
    if (navigator.share) {
      try { await navigator.share({ title: 'Asistencia', text }); } catch (e) { /* cancelado */ }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text); toast('Resumen copiado');
    }
  }

  function download(name, content, type) {
    const a = el('a', { href: URL.createObjectURL(new Blob([content], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }

  function exportCsv() {
    const rows = [['fecha', 'tipo', 'origen', 'lugar']];
    Object.keys(state.records).sort().forEach(k => {
      const r = state.records[k];
      rows.push([k, r.type, r.source || '', (r.place || '').replace(/"/g, '""')]);
    });
    download('asistencia.csv', rows.map(r => r.map(v => '"' + v + '"').join(',')).join('\n'), 'text/csv');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.records || !data.settings) throw new Error();
        state.settings = Object.assign({}, DEFAULT_STATE.settings, data.settings);
        Object.keys(state.records).forEach(k => { if (!data.records[k]) setRecord(k, null); });
        Object.keys(data.records).forEach(k => setRecord(k, data.records[k]));
        save(); renderSettings(); render(); toast('Respaldo restaurado');
      } catch (e) { toast('Archivo no válido'); }
    };
    reader.readAsText(file);
  }

  // ---------- Navegación ----------
  function showView(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'cfg') renderSettings();
    window.scrollTo(0, 0);
  }

  // ---------- Inicio ----------
  function init() {
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
    $('#btnCheck').addEventListener('click', () => checkLocation(false));
    $('#btnOffice').addEventListener('click', () => { setToday('office'); toast('Marcado: oficina'); });
    $('#btnHome').addEventListener('click', () => { setToday('home'); toast('Marcado: casa'); });
    $('#btnClearToday').addEventListener('click', () => { setToday(null); toast('Registro de hoy eliminado'); });
    $('#prevMonth').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderCalendar(); });
    $('#nextMonth').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderCalendar(); });
    $('#btnAddVac').addEventListener('click', addVacation);
    $('#vacFrom').addEventListener('change', e => { if (!$('#vacTo').value) $('#vacTo').value = e.target.value; });
    $('#btnEmail').addEventListener('click', sendEmail);
    $('#btnShare').addEventListener('click', share);
    $('#btnExportCsv').addEventListener('click', exportCsv);
    $('#btnExport').addEventListener('click', () => download('asistencia-respaldo.json', JSON.stringify(state, null, 2), 'application/json'));
    $('#fileImport').addEventListener('change', e => e.target.files[0] && importJson(e.target.files[0]));
    bindSettings();
    render();

    const forced = new URLSearchParams(location.search).has('checkin');
    maybeAutoCheck(forced);
    scheduleSync(0);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { render(); maybeAutoCheck(false); scheduleSync(0); }
      else stopWatch();
    });
    window.addEventListener('online', () => scheduleSync(0));

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  let lastAuto = 0;
  async function maybeAutoCheck(forced) {
    if (officeToday() && !forced) return; // ya está marcado en oficina hoy
    if (!forced && !state.settings.autoCheck) return;
    if (Date.now() - lastAuto < 5 * 60 * 1000 && !forced) { startWatch(); return; }
    lastAuto = Date.now();
    if (!forced && navigator.permissions) {
      try {
        const p = await navigator.permissions.query({ name: 'geolocation' });
        if (p.state === 'denied') return;
      } catch (e) { /* algunos navegadores no soportan la consulta */ }
    }
    await checkLocation(!forced);
    startWatch();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
