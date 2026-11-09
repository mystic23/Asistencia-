/**
 * Asistencia Oficina — backend en tu cuenta de Google (Apps Script).
 *
 * Guarda el historial en esta hoja de cálculo (Google Sheets) y envía correos
 * desde tu Gmail. Permite marcar "oficina" automáticamente cuando el celular
 * entra a la geocerca de la oficina (MacroDroid / Atajos de iPhone), sin abrir la app.
 *
 * Instalación: ver README.md del repositorio (sección "Conectar con Gmail").
 */

// ======== Ajustes ========
const ZONA = 'America/Bogota';
const PORCENTAJE_OFICINA = 60;        // 60/40
const CORREO_AL_MARCAR = true;        // te avisa por Gmail cuando se marca oficina automáticamente
const CORREO_RESUMEN_MENSUAL = true;  // el día 1 de cada mes te envía el resumen del mes anterior
const HOJA = 'Registros';
// =========================

/** Ejecútala UNA vez desde el editor: crea la hoja, el token y el envío mensual. */
function configurar() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  hoja_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'resumenMensual')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (CORREO_RESUMEN_MENSUAL) {
    ScriptApp.newTrigger('resumenMensual').timeBased().onMonthDay(1).atHour(7).inTimezone(ZONA).create();
  }
  Logger.log('Listo. Copia este TOKEN en la app (Ajustes → Gmail): ' + token);
  return token;
}

// ---------- API web ----------
function doGet(e) {
  return responder_(() => {
    const p = (e && e.parameter) || {};
    validar_(p.token);
    switch (p.action || 'list') {
      case 'checkin': return checkin_(p);
      case 'set':
        aplicar_([{ date: p.date, rec: { type: p.type, source: p.source || 'manual', place: p.place || '', time: ahoraIso_() } }]);
        return listar_();
      case 'delete':
        aplicar_([{ date: p.date, rec: null }]);
        return listar_();
      case 'resumen': {
        const mes = p.month ? parseMes_(p.month) : hoyFecha_();
        enviarResumen_(mes.getFullYear(), mes.getMonth());
        return { ok: true, sent: true };
      }
      case 'list':
      default:
        return listar_();
    }
  });
}

function doPost(e) {
  return responder_(() => {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    validar_(body.token);
    aplicar_(body.ops || []);
    return listar_();
  });
}

function responder_(fn) {
  let out;
  try { out = fn(); }
  catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function validar_(token) {
  const real = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!real) throw new Error('Falta ejecutar configurar() en el editor de Apps Script');
  if (token !== real) throw new Error('Token inválido');
}

function checkin_(p) {
  const fecha = p.date || clave_(hoyFecha_());
  const lugar = p.place || 'Oficina';
  const actual = leer_()[fecha];
  if (actual && actual.type === 'office') return { ok: true, already: true, date: fecha };
  aplicar_([{ date: fecha, rec: { type: 'office', source: 'auto', place: lugar, time: ahoraIso_() } }]);
  if (CORREO_AL_MARCAR) {
    const s = estadisticas_(fecha.slice(0, 4) * 1, fecha.slice(5, 7) - 1);
    MailApp.sendEmail(correo_(), '🏢 Asistencia: oficina marcada (' + fecha + ')',
      'Se registró tu asistencia en ' + lugar + ' el ' + fecha + ' a las ' +
      Utilities.formatDate(new Date(), ZONA, 'HH:mm') + '.\n\n' +
      'Este mes: ' + s.officeTotal + ' de ' + s.required + ' días de oficina' +
      (s.missing ? ' (faltan ' + s.missing + ').' : ' ✅ meta cumplida.'));
  }
  return { ok: true, marked: true, date: fecha };
}

function listar_() {
  return { ok: true, email: correo_(), records: leer_() };
}

// ---------- Hoja ----------
function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HOJA);
  if (!sh) {
    sh = ss.insertSheet(HOJA);
    sh.getRange(1, 1, 1, 5).setValues([['fecha', 'tipo', 'origen', 'lugar', 'hora']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('E:E').setNumberFormat('@');
  }
  return sh;
}

function leer_() {
  const sh = hoja_();
  const n = sh.getLastRow() - 1;
  const map = {};
  if (n <= 0) return map;
  sh.getRange(2, 1, n, 5).getValues().forEach(r => {
    const fecha = r[0] instanceof Date ? Utilities.formatDate(r[0], ZONA, 'yyyy-MM-dd') : String(r[0]).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !r[1]) return;
    map[fecha] = { type: String(r[1]), source: String(r[2] || ''), place: String(r[3] || ''), time: String(r[4] || '') };
  });
  return map;
}

/** ops: [{ date: 'YYYY-MM-DD', rec: {type, source, place, time} | null }] */
function aplicar_(ops) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = hoja_();
    const tipos = { office: 1, home: 1, vacation: 1 };
    ops.forEach(op => {
      if (!op || !/^\d{4}-\d{2}-\d{2}$/.test(op.date)) return;
      const fila = buscarFila_(sh, op.date);
      if (!op.rec || !tipos[op.rec.type]) {
        if (fila) sh.deleteRow(fila);
        return;
      }
      const valores = [[op.date, op.rec.type, op.rec.source || '', op.rec.place || '', op.rec.time || ahoraIso_()]];
      if (fila) sh.getRange(fila, 1, 1, 5).setValues(valores);
      else sh.getRange(sh.getLastRow() + 1, 1, 1, 5).setNumberFormat('@').setValues(valores);
    });
    const n = sh.getLastRow() - 1;
    if (n > 1) sh.getRange(2, 1, n, 5).sort(1);
  } finally {
    lock.releaseLock();
  }
}

function buscarFila_(sh, fecha) {
  const n = sh.getLastRow() - 1;
  if (n <= 0) return 0;
  const col = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < col.length; i++) {
    const v = col[i][0] instanceof Date ? Utilities.formatDate(col[i][0], ZONA, 'yyyy-MM-dd') : String(col[i][0]).trim();
    if (v === fecha) return i + 2;
  }
  return 0;
}

// ---------- Resumen por correo ----------
function resumenMensual() {
  const hoy = hoyFecha_();
  const prev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  enviarResumen_(prev.getFullYear(), prev.getMonth());
}

function enviarResumen_(y, m) {
  const s = estadisticas_(y, m);
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombres = { office: 'Oficina', home: 'Casa', vacation: 'Vacaciones', pending: 'Pendiente' };
  const lineas = [
    'Resumen de asistencia — ' + meses[m] + ' ' + y, '',
    'Días hábiles (sin festivos ni vacaciones): ' + s.workdays,
    'Meta oficina (' + PORCENTAJE_OFICINA + '%): ' + s.required,
    'Días en oficina: ' + s.officeTotal,
    'Días en casa: ' + s.home,
    'Vacaciones: ' + s.vacation,
    'Días hábiles por venir: ' + s.pending,
    s.missing ? 'Faltan ' + s.missing + ' días de oficina.' : 'Meta cumplida ✅', '',
    'Detalle:'
  ].concat(s.detail.map(d => d.date + '  ' + (d.holiday ? 'Festivo (' + d.holiday + ')' : nombres[d.kind] || d.kind) + (d.place ? ' — ' + d.place : '')));
  MailApp.sendEmail(correo_(), '📊 Asistencia ' + meses[m] + ' ' + y + ': ' + s.officeTotal + '/' + s.required + ' días en oficina', lineas.join('\n'));
}

function estadisticas_(y, m) {
  const recs = leer_();
  const hoy = clave_(hoyFecha_());
  const fest = festivos_(y);
  const dias = new Date(y, m + 1, 0).getDate();
  const s = { workdays: 0, vacation: 0, office: 0, officeExtra: 0, home: 0, pending: 0, detail: [] };
  for (let i = 1; i <= dias; i++) {
    const d = new Date(y, m, i);
    const k = clave_(d);
    const r = recs[k];
    const finde = d.getDay() === 0 || d.getDay() === 6;
    if (fest[k]) { if (!finde) s.detail.push({ date: k, holiday: fest[k] }); continue; }
    if (finde) {
      if (r && r.type === 'office') { s.officeExtra++; s.detail.push({ date: k, kind: 'office', place: r.place }); }
      continue;
    }
    let kind = r ? r.type : (k >= hoy ? 'pending' : 'home');
    if (kind === 'vacation') { s.vacation++; s.detail.push({ date: k, kind }); continue; }
    s.workdays++;
    if (kind === 'office') s.office++;
    else if (kind === 'home') s.home++;
    else s.pending++;
    if (k <= hoy) s.detail.push({ date: k, kind, place: r && r.place });
  }
  s.officeTotal = s.office + s.officeExtra;
  s.required = Math.ceil(Math.round(s.workdays * PORCENTAJE_OFICINA * 1e4) / 1e6);
  s.missing = Math.max(0, s.required - s.officeTotal);
  return s;
}

// ---------- Fechas y festivos de Colombia ----------
function correo_() { return Session.getEffectiveUser().getEmail(); }
function ahoraIso_() { return new Date().toISOString(); }
function hoyFecha_() { return parseMes_(Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd')); }
function parseMes_(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2] || 1); }
function clave_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function festivos_(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const pascua = new Date(year, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  const mas = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
  const lunes = dt => { const w = dt.getDay(); return w === 1 ? dt : mas(dt, w === 0 ? 1 : 8 - w); };
  const map = {};
  const add = (dt, n) => { const key = clave_(dt); map[key] = map[key] ? map[key] + ' / ' + n : n; };
  add(new Date(year, 0, 1), 'Año Nuevo');
  add(new Date(year, 4, 1), 'Día del Trabajo');
  add(new Date(year, 6, 20), 'Día de la Independencia');
  add(new Date(year, 7, 7), 'Batalla de Boyacá');
  add(new Date(year, 11, 8), 'Inmaculada Concepción');
  add(new Date(year, 11, 25), 'Navidad');
  add(lunes(new Date(year, 0, 6)), 'Reyes Magos');
  add(lunes(new Date(year, 2, 19)), 'San José');
  add(lunes(new Date(year, 5, 29)), 'San Pedro y San Pablo');
  add(lunes(new Date(year, 7, 15)), 'Asunción de la Virgen');
  add(lunes(new Date(year, 9, 12)), 'Día de la Raza');
  add(lunes(new Date(year, 10, 1)), 'Todos los Santos');
  add(lunes(new Date(year, 10, 11)), 'Independencia de Cartagena');
  add(mas(pascua, -3), 'Jueves Santo');
  add(mas(pascua, -2), 'Viernes Santo');
  add(mas(pascua, 43), 'Ascensión del Señor');
  add(mas(pascua, 64), 'Corpus Christi');
  add(mas(pascua, 71), 'Sagrado Corazón');
  return map;
}
