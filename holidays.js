// Festivos de Colombia (Ley 51 de 1983 "Ley Emiliani").
// Se calculan para cualquier año, sin depender de internet.
(function (global) {
  'use strict';

  function easterSunday(year) {
    // Algoritmo anónimo gregoriano (Meeus/Jones/Butcher)
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function addDays(date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  // Traslada al lunes siguiente si no cae en lunes.
  function nextMonday(date) {
    const dow = date.getDay(); // 0 domingo, 1 lunes
    if (dow === 1) return date;
    return addDays(date, dow === 0 ? 1 : 8 - dow);
  }

  function key(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const cache = {};

  function colombianHolidays(year) {
    if (cache[year]) return cache[year];
    const list = [];
    const add = (date, name) => list.push({ date: key(date), name });

    // Fijos (no se trasladan)
    add(new Date(year, 0, 1), 'Año Nuevo');
    add(new Date(year, 4, 1), 'Día del Trabajo');
    add(new Date(year, 6, 20), 'Día de la Independencia');
    add(new Date(year, 7, 7), 'Batalla de Boyacá');
    add(new Date(year, 11, 8), 'Inmaculada Concepción');
    add(new Date(year, 11, 25), 'Navidad');

    // Trasladables al lunes (Ley Emiliani)
    add(nextMonday(new Date(year, 0, 6)), 'Reyes Magos');
    add(nextMonday(new Date(year, 2, 19)), 'San José');
    add(nextMonday(new Date(year, 5, 29)), 'San Pedro y San Pablo');
    add(nextMonday(new Date(year, 7, 15)), 'Asunción de la Virgen');
    add(nextMonday(new Date(year, 9, 12)), 'Día de la Raza');
    add(nextMonday(new Date(year, 10, 1)), 'Todos los Santos');
    add(nextMonday(new Date(year, 10, 11)), 'Independencia de Cartagena');

    // Dependientes de la Pascua
    const easter = easterSunday(year);
    add(addDays(easter, -3), 'Jueves Santo');
    add(addDays(easter, -2), 'Viernes Santo');
    add(addDays(easter, 43), 'Ascensión del Señor');
    add(addDays(easter, 64), 'Corpus Christi');
    add(addDays(easter, 71), 'Sagrado Corazón');

    list.sort((a, b) => a.date.localeCompare(b.date));
    const map = {};
    list.forEach(h => { map[h.date] = map[h.date] ? map[h.date] + ' / ' + h.name : h.name; });
    cache[year] = { list, map };
    return cache[year];
  }

  global.ColombiaHolidays = { colombianHolidays, easterSunday };
  if (typeof module !== 'undefined') module.exports = global.ColombiaHolidays;
})(typeof window !== 'undefined' ? window : globalThis);
