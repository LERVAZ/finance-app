// Logika převzatá z Apps Scriptu (Code.gs) – v prohlížeči ji obsluhuje js/shim.js.
// Při změně ve skriptu tabulky stačí sem zkopírovat nový Code.gs.
/** @OnlyCurrentDoc */
/**
 * Finanční dashboard
 *  - webová stránka (doGet) čte data z této tabulky,
 *  - formulář „Zápis za měsíc“ (na listu Dashboard i na webu) ukládá stavy
 *    vždy k poslednímu dni měsíce a zapisuje je do všech listů.
 * Nasazení: Nasadit → Nové nasazení → Webová aplikace, Spustit jako: Já, Kdo má přístup: Pouze já.
 */

// ---------- kde co v tabulce je ----------
var CFG = {
  dash: 'Dashboard', ms: 'Měsíční stavy', fondy: 'Fondy historie', log: 'Historie zápisů', nast: 'Nastavení',
  formTarget: 'C6', formOverride: 'C7', formStatus: 'F6', formFirstRow: 9,
  // pořadí políček ve formuláři (Dashboard C9:C16) → sloupec v listu Měsíční stavy
  fields: [
    { key: 'csBezny', label: 'ČS běžný účet', ms: 2 },
    { key: 'csSporici', label: 'ČS spořicí účet', ms: 3 },
    { key: 'rbSporici', label: 'RB spořicí účet', ms: 5 },
    { key: 'stavebko', label: 'RB stavební spoření', ms: 6 },
    { key: 'csFondy', label: 'ČS fondy – hodnota', ms: 4, fondy: 3 },
    { key: 'jt', label: 'J&T – hodnota', ms: 7, fondy: 5 },
    { key: 'nn', label: 'NN životní pojištění – hodnota', ms: 8 },
    { key: 'hypoteka', label: 'Hypotéka – zbývá splatit', ms: 10 }
  ],
  msFirstRow: 5, msLastRow: 100, msBiczCol: 9,
  fondyFirstRow: 5, fondyLastRow: 100,
  logFirstRow: 5,
  nastBiczAmt: 'B13', nastBiczEnd: 'B16', nastDum: 'B27'
};

/** Vrátí list podle názvu, nebo vyhodí srozumitelnou chybu. */
function sh_(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) throw new Error('V tabulce chybí list „' + name + '“. Nejspíš je skript ve staré tabulce – vlož ho do nové (z posledního souboru Finance_dashboard.xlsx).');
  return s;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Finance domácnosti')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- zápis ----------

/** Spustí se sám, když v tabulce změníš políčko ve formuláři na Dashboardu. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== CFG.dash) return;
  var r1 = e.range.getRow(), r2 = e.range.getLastRow(), c1 = e.range.getColumn(), c2 = e.range.getLastColumn();
  var first = CFG.formFirstRow, last = CFG.formFirstRow + CFG.fields.length - 1;
  var hitsValues = c1 <= 3 && c2 >= 3 && r1 <= last && r2 >= first;
  var hitsOverride = c1 <= 3 && c2 >= 3 && r1 <= 7 && r2 >= 7;
  if (hitsOverride && !hitsValues) loadMonthIntoForm_(e.source);   // přepnutí měsíce = jen načíst uložené hodnoty
  else if (hitsValues) commit_(e.source);
}

/** Uložené hodnoty měsíce (pole v pořadí CFG.fields) nebo null, když měsíc ještě není uložený. */
function monthValues_(ss, key) {
  var tz = ss.getSpreadsheetTimeZone();
  var ms = sh_(ss, CFG.ms);
  var n = CFG.msLastRow - CFG.msFirstRow + 1;
  var rows = ms.getRange(CFG.msFirstRow, 1, n, 10).getValues();
  for (var i = 0; i < n; i++) {
    var d = rows[i][0];
    if (d instanceof Date && Utilities.formatDate(d, tz, 'yyyyMMdd') === key) {
      var has = false;
      var vals = CFG.fields.map(function (f) { var v = rows[i][f.ms - 1]; if (v !== '') has = true; return v === '' ? null : v; });
      return has ? vals : null;
    }
  }
  return null;
}

function loadMonthIntoForm_(ss) {
  var dash = sh_(ss, CFG.dash);
  var t = targetMonthEnd_(dash.getRange(CFG.formOverride).getValue(), ss.getSpreadsheetTimeZone());
  var vals = monthValues_(ss, t.key);
  if (vals) dash.getRange(CFG.formFirstRow, 3, vals.length, 1).setValues(vals.map(function (v) { return [v === null ? '' : v]; }));
  dash.getRange(CFG.formStatus).setValue(vals ? 'Načten uložený stav k ' + t.d + '. ' + t.m + '. ' + t.y + ' – změny se uloží do tohoto měsíce.'
    : 'Měsíc ' + t.m + '/' + t.y + ' zatím není uložený – po změně se založí.');
}

/** Volá webový formulář. data = { month: 'yyyy-mm' nebo '', values: [čísla v pořadí CFG.fields] } */
function saveEntry(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = sh_(ss, CFG.dash);
  var vals = CFG.fields.map(function (f, i) {
    var v = data.values[i];
    return [v === null || v === '' || v === undefined ? '' : Number(v)];
  });
  dash.getRange(CFG.formFirstRow, 3, vals.length, 1).setValues(vals);
  var tz = ss.getSpreadsheetTimeZone();
  var cur = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  var ovCell = dash.getRange(CFG.formOverride);
  if (data.month && data.month !== cur) {
    var p = data.month.split('-');
    ovCell.setValue(serial_(Number(p[0]), Number(p[1]), 1)).setNumberFormat('d.m.yyyy');
  } else ovCell.clearContent();
  var res = commit_(ss);
  SpreadsheetApp.flush();
  var out = getData();
  out.saved = res;
  return out;
}

// ---------- Archiv: dům a refinancování (jen čte listy „Archiv – Barák“ a „Archiv – Refinanc“) ----------
function numAny_(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /\d/.test(v)) {
    var parts = v.split('+').map(function (x) { return Number(x.replace(/[^\d,.-]/g, '').replace(',', '.')); });
    if (parts.every(function (x) { return !isNaN(x); })) return parts.reduce(function (a, b) { return a + b; }, 0);
  }
  return null;
}
// Rozpis čerpání úvěru Raiffeisen (březen 2026) – podle historie účtu, kterou jsi poslal
var REFI_CERPANI = [
  { name: 'Splacení hypotéky ČS', castka: 2400751, druh: 'cs' },
  { name: 'Splacení úvěru ČS', castka: 490577, druh: 'cs' },
  { name: 'Investice BICZ', castka: 1300000, druh: 'inv' },
  { name: 'Splacení dluhu bratrovi', castka: 46000, druh: 'dluh', pozn: 'součást převodu 1 346 000 Kč' },
  { name: 'Poplatek za odhad nemovitosti', castka: 5900, druh: 'jine' },
  { name: 'Úrok za březen (přepis)', castka: 7785, druh: 'jine' }
];
function archiv_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var out = { barak: null, refinanc: null };
  var b = ss.getSheetByName('Archiv – Barák');
  if (b) {
    var v = b.getRange(1, 1, Math.max(1, b.getLastRow()), Math.max(4, b.getLastColumn())).getValues();
    var sections = [];
    for (var r = 0; r < v.length; r++) {
      var name = String(v[r][0]).trim();
      if (!name || r === 1 && name.indexOf('platby') >= 0 || name === 'Baráček platby') continue;
      var heads = [], totalCol = -1, grandCol = -1;
      for (var c = 3; c < v[r].length; c++) {
        var hd = String(v[r][c]).trim();
        if (!hd) continue;
        if (hd === 'Celkem' && totalCol < 0) totalCol = c;
        else if (hd === 'CELKEM') grandCol = c;
        else if (totalCol < 0) heads.push({ c: c, name: hd });
      }
      if (!heads.length) continue;
      var vr = -1, dr = -1;
      for (var k = r + 1; k <= Math.min(r + 3, v.length - 1); k++) {
        if (String(v[k][0]).trim()) break;
        if (heads.some(function (h) { return v[k][h.c] instanceof Date; })) { dr = k; continue; }
        if (heads.some(function (h) { return numAny_(v[k][h.c]) !== null; }) || (totalCol >= 0 && numAny_(v[k][totalCol]) !== null)) { vr = k; break; }
      }
      if (vr < 0) continue;
      var items = heads.map(function (h) {
        return { name: h.name, value: numAny_(v[vr][h.c]), datum: dr >= 0 && v[dr][h.c] instanceof Date ? Utilities.formatDate(v[dr][h.c], tz, 'd. M. yyyy') : null };
      });
      var tot = totalCol >= 0 ? numAny_(v[vr][totalCol]) : null;
      if (tot === null) tot = items.reduce(function (a, x) { return a + (x.value || 0); }, 0);
      sections.push({ name: name, items: items, total: tot });
    }
    out.barak = { sections: sections };
  }
  var f = ss.getSheetByName('Archiv – Refinanc');
  if (f) {
    var g = f.getRange('A1:I14').getValues();
    var cell = function (a1) { var m = a1.match(/^([A-Z])(\d+)$/); return g[Number(m[2]) - 1][m[1].charCodeAt(0) - 65]; };
    out.refinanc = {
      csHypo: numAny_(cell('E4')), csUver: numAny_(cell('F4')), csCelkem: (numAny_(cell('E4')) || 0) + (numAny_(cell('F4')) || 0),
      rbUver: numAny_(cell('D8')), rbInvestice: numAny_(cell('E8')), splatkaJa: numAny_(cell('G8')), splatkaInv: numAny_(cell('H8')),
      cerpanoDatum: cell('A11') instanceof Date ? Utilities.formatDate(cell('A11'), tz, 'd. M. yyyy') : null, cerpano: numAny_(cell('D11')),
      zbyvaDatum: cell('A14') instanceof Date ? Utilities.formatDate(cell('A14'), tz, 'd. M. yyyy') : null, zbyva: numAny_(cell('D14'))
    };
    out.refinanc.cerpani = REFI_CERPANI;
  }
  var n = sh_(ss, CFG.nast).getRange('B1:B30').getValues();
  out.nast = { rPre: num_(n[4][0]), rPost: num_(n[5][0]), biczAmt: num_(n[12][0]), biczYield: num_(n[13][0]), dum: num_(n[26][0]) };
  return out;
}

// ---------- Měsíční přehled (listy „Trvalé platby“ a „Pohyby“ – založí se samy, nic jiného nemění) ----------
var MP = { trvale: 'Trvalé platby', pohyby: 'Pohyby', vyplataDen: 20 };

function ensureMesic_(ss) {
  var t = ss.getSheetByName(MP.trvale);
  if (!t) {
    t = ss.insertSheet(MP.trvale);
    var rows = [
      ['Den', 'Položka', 'Částka', 'Kategorie', 'Účet', 'Typ', 'Poznámka'],
      [20, 'ČEZ – elektřina (zálohy)', 5000, 'Bydlení', 'ČS', 'Výdaj', ''],
      [22, 'J&T investice', 2100, 'Investice', 'ČS', 'Investice', ''],
      [22, 'ČS fondy', 2000, 'Investice', 'ČS', 'Investice', ''],
      [22, 'NN pojistka (moje)', 1793, 'Pojištění', 'ČS', 'Výdaj', ''],
      [22, 'Pojistka dcera', 622, 'Pojištění', 'ČS', 'Výdaj', ''],
      [22, 'Výživné', 3000, 'Rodina', 'ČS', 'Výdaj', ''],
      [22, 'Převod na účet Raiffeisen (hypotéka)', 18000, 'Bydlení', 'ČS', 'Převod', 'Z toho jde 17 170 Kč do hypotéky, zbytek zůstává na účtu.'],
      [10, 'VS Chrudim – voda (zálohy)', 1000, 'Bydlení', 'ČS', 'Výdaj', ''],
      [10, 'Obědy dítě', 800, 'Rodina', 'ČS', 'Výdaj', ''],
      ['', 'Výnos BICZ', 7366, 'Investice', 'Raiffeisen', 'Příjem', 'Chodí cca 15.–17.'],
      ['', 'Splátka hypotéky', 17170, 'Bydlení', 'Raiffeisen', 'Výdaj', ''],
      ['', 'Stavební spoření', 7200, 'Bydlení', 'Raiffeisen', 'Výdaj', '']
    ];
    t.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    t.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#E3E8ED');
    t.getRange(2, 3, rows.length, 1).setNumberFormat('#,##0 "Kč"');
    t.setFrozenRows(1);
    t.setColumnWidth(2, 260); t.setColumnWidth(7, 320);
    t.getRange(rows.length + 2, 1).setValue('Den = den v měsíci, kdy platba odchází (prázdný = jednou měsíčně). Účet: ČS = z výplaty, Raiffeisen = pohyby na účtu u Raiffky. Řádky můžeš upravovat, přidávat i mazat.');
  }
  var p = ss.getSheetByName(MP.pohyby);
  if (!p) {
    p = ss.insertSheet(MP.pohyby);
    p.getRange(1, 1, 1, 7).setValues([['Datum', 'Popis', 'Částka', 'Typ', 'Kategorie', 'Poznámka', 'ID']])
      .setFontWeight('bold').setBackground('#E3E8ED');
    p.setFrozenRows(1);
    p.setColumnWidth(2, 260);
  }
  return { t: t, p: p };
}

function mesicData_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var sh = ensureMesic_(ss);
  var tv = sh.t.getLastRow() > 1 ? sh.t.getRange(2, 1, sh.t.getLastRow() - 1, 7).getValues() : [];
  var trvale = tv.filter(function (x) { return x[1] !== '' && num_(x[2]) !== null; }).map(function (x) {
    return { den: num_(x[0]), name: x[1], castka: x[2], kategorie: x[3] || 'Ostatní', ucet: x[4] || 'ČS', typ: x[5] || 'Výdaj', poznamka: x[6] || '' };
  });
  var pv = sh.p.getLastRow() > 1 ? sh.p.getRange(2, 1, sh.p.getLastRow() - 1, 7).getValues() : [];
  var pohyby = pv.filter(function (x) { return x[0] instanceof Date && num_(x[2]) !== null; }).map(function (x) {
    return { datum: Utilities.formatDate(x[0], tz, 'yyyy-MM-dd'), popis: x[1], castka: x[2], typ: x[3] || 'Výdaj', kategorie: x[4] || 'Ostatní', poznamka: x[5] || '', id: String(x[6]) };
  });
  var vyp = null;
  var pp = sh_(ss, 'Pravidelné platby').getRange('A5:D60').getValues();
  pp.forEach(function (x) { if (String(x[0]).indexOf('Výplata') === 0 && num_(x[3]) !== null) vyp = x[3]; });
  var spor = num_(sh_(ss, CFG.dash).getRange(CFG.formFirstRow + 1, 3).getValue());
  return { trvale: trvale, pohyby: pohyby, vyplataOcekavana: vyp, vyplataDen: MP.vyplataDen, sporici: spor,
           dnes: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') };
}

/** Jak pohyb mění zůstatek spořicího účtu ČS: Na spořicí = +, Ze spořicího = −, ostatní 0. */
function sporiciDelta_(typ, castka) {
  if (typ === 'Na spořicí') return castka;
  if (typ === 'Ze spořicího' || typ === 'Převod ze spořicího') return -castka;
  return 0;
}
/** Upraví „ČS spořicí účet“ ve formuláři na Dashboardu a uloží stav měsíce (stejně jako ruční zápis). */
function adjustSporici_(ss, delta) {
  var dash = sh_(ss, CFG.dash);
  var cell = dash.getRange(CFG.formFirstRow + 1, 3);   // C10 = ČS spořicí účet
  var old = Number(cell.getValue()) || 0;
  cell.setValue(old + delta);
  commit_(ss);
}

/** Webový formulář: přidá pohyb. data = { datum: 'yyyy-mm-dd', popis, castka, typ, kategorie, poznamka } */
function addPohyb(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var p = ensureMesic_(ss).p;
  var d = String(data.datum).split('-');
  var c = Number(data.castka);
  if (!d[0] || isNaN(c)) throw new Error('Chybí datum nebo částka.');
  var lock = LockService.getDocumentLock(); lock.waitLock(20000);
  try {
    var r = p.getLastRow() + 1;
    p.getRange(r, 1, 1, 7).setValues([[serial_(Number(d[0]), Number(d[1]), Number(d[2])), data.popis || '', Math.abs(c),
      data.typ || 'Výdaj', data.kategorie || 'Ostatní', data.poznamka || '', Utilities.getUuid()]]);
    p.getRange(r, 1).setNumberFormat('d.m.yyyy');
    p.getRange(r, 3).setNumberFormat('#,##0 "Kč"');
  } finally { lock.releaseLock(); }
  var zm = sporiciDelta_(data.typ, Math.abs(c));
  if (zm) adjustSporici_(ss, zm);
  SpreadsheetApp.flush();
  var out = getData(); out.savedPohyb = 'Přidáno: ' + (data.popis || data.typ) + '.' + (zm ? ' Spořicí účet ČS ' + (zm > 0 ? '+' : '−') + Math.abs(zm) + ' Kč.' : '');
  return out;
}

/** Webový formulář: smaže pohyb podle ID. */
function deletePohyb(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var undo = 0;
  var p = ensureMesic_(ss).p;
  var lock = LockService.getDocumentLock(); lock.waitLock(20000);
  try {
    var n = p.getLastRow() - 1;
    if (n > 0) {
      var ids = p.getRange(2, 7, n, 1).getValues();
      for (var i = 0; i < n; i++) if (String(ids[i][0]) === String(id)) {
        var row = p.getRange(2 + i, 1, 1, 4).getValues()[0];
        var back = -sporiciDelta_(row[3], Math.abs(Number(row[2]) || 0));
        p.deleteRow(2 + i);
        if (back) undo = back;
        break;
      }
    }
  } finally { lock.releaseLock(); }
  if (undo) adjustSporici_(ss, undo);
  SpreadsheetApp.flush();
  var out = getData(); out.savedPohyb = 'Smazáno.' + (undo ? ' Spořicí účet ČS vrácen o ' + (undo > 0 ? '+' : '−') + Math.abs(undo) + ' Kč.' : '');
  return out;
}

/** Volá webový formulář „Roční zdroje“. data = { rok: '2026', values: [vratka, voda, elektřina, bonus] } (null = nechat prázdné) */
function saveZdroje(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rz = sh_(ss, 'Roční zdroje');
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var years = rz.getRange('A13:A27').getValues();
    var row = -1;
    for (var i = 0; i < years.length; i++) if (String(years[i][0]).trim() === String(data.rok)) { row = 13 + i; break; }
    if (row < 0) throw new Error('Rok ' + data.rok + ' v listu Roční zdroje nenašel.');
    var vals = data.values.map(function (v) { return v === null || v === '' || v === undefined || isNaN(v) ? '' : Number(v); });
    rz.getRange(row, 2, 1, 4).setValues([vals]);
  } finally { lock.releaseLock(); }
  SpreadsheetApp.flush();
  var out = getData();
  out.savedZdroje = 'Uloženo za rok ' + data.rok + '.';
  return out;
}

function commit_(ss) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var tz = ss.getSpreadsheetTimeZone();
    var dash = sh_(ss, CFG.dash);
    var values = dash.getRange(CFG.formFirstRow, 3, CFG.fields.length, 1).getValues().map(function (r) {
      return typeof r[0] === 'number' ? r[0] : (r[0] === '' ? '' : Number(String(r[0]).replace(/\s/g, '').replace(',', '.')));
    });
    var target = targetMonthEnd_(dash.getRange(CFG.formOverride).getValue(), tz);
    var nast = sh_(ss, CFG.nast);
    var biczAmt = Number(nast.getRange(CFG.nastBiczAmt).getValue()) || 0;
    var biczEnd = nast.getRange(CFG.nastBiczEnd).getValue();
    var dum = Number(nast.getRange(CFG.nastDum).getValue()) || 0;
    var bicz = (biczEnd instanceof Date && target.key > Utilities.formatDate(biczEnd, tz, 'yyyyMMdd')) ? 0 : biczAmt;

    // 1) Měsíční stavy – řádek k poslednímu dni měsíce
    var ms = sh_(ss, CFG.ms);
    var n = CFG.msLastRow - CFG.msFirstRow + 1;
    var dates = ms.getRange(CFG.msFirstRow, 1, n, 1).getValues();
    var row = -1, firstEmpty = -1, templateRow = -1;
    for (var i = 0; i < n; i++) {
      var d = dates[i][0];
      if (d instanceof Date && Utilities.formatDate(d, tz, 'yyyyMMdd') === target.key) row = CFG.msFirstRow + i;
      if (firstEmpty < 0 && d === '') firstEmpty = CFG.msFirstRow + i;
    }
    if (row < 0) {
      if (firstEmpty < 0) throw new Error('V listu Měsíční stavy došly připravené řádky.');
      row = firstEmpty;
    }
    var line = [];
    for (var c = 2; c <= 10; c++) line.push('');
    CFG.fields.forEach(function (f, k) { line[f.ms - 2] = values[k]; });
    line[CFG.msBiczCol - 2] = bicz;
    ms.getRange(row, 1).setValue(target.serial).setNumberFormat('d.m.yyyy');
    ms.getRange(row, 2, 1, 9).setValues([line]);
    // starší řádek bez vzorců (převzatá historie) → doplnit vzorce K–M podle řádku pod ním
    if (!ms.getRange(row, 11).getFormula()) {
      var f = ms.getRange(CFG.msLastRow, 11, 1, 3).getFormulasR1C1()[0];
      ms.getRange(row, 11, 1, 3).setFormulasR1C1([f]);
    }

    // 2) Fondy historie – hodnota ČS a J&T v řádku daného měsíce
    var fh = sh_(ss, CFG.fondy);
    var fn = CFG.fondyLastRow - CFG.fondyFirstRow + 1;
    var fd = fh.getRange(CFG.fondyFirstRow, 1, fn, 1).getValues();
    for (var j = 0; j < fn; j++) {
      var m = fd[j][0];
      if (m instanceof Date && Utilities.formatDate(m, tz, 'yyyyMM') === target.key.slice(0, 6)) {
        CFG.fields.forEach(function (f, k) {
          if (f.fondy && values[k] !== '') fh.getRange(CFG.fondyFirstRow + j, f.fondy).setValue(values[k]);
        });
        break;
      }
    }

    // 3) Historie zápisů – jeden řádek za den (víc změn v jednom dni = poslední stav)
    var lg = sh_(ss, CFG.log);
    var now = new Date();
    var colA = lg.getRange(CFG.logFirstRow, 1, Math.max(1, lg.getMaxRows() - CFG.logFirstRow + 1), 1).getValues();
    var lastRow = CFG.logFirstRow - 1;
    for (var q = 0; q < colA.length; q++) if (colA[q][0] !== '') lastRow = CFG.logFirstRow + q;
    var lr = lastRow + 1;
    if (lastRow >= CFG.logFirstRow) {
      var prev = lg.getRange(lastRow, 1, 1, 2).getValues()[0];
      if (prev[0] instanceof Date && sameDay_(prev[0], now, tz) && prev[1] instanceof Date &&
          Utilities.formatDate(prev[1], tz, 'yyyyMMdd') === target.key) lr = lastRow;
    }
    var v = function (k) { return Number(values[k]) || 0; };
    var sporeni = v(1) + v(2) + v(4) + v(5) + v(6);
    var majetek = v(0) + v(1) + v(2) + v(3) + v(4) + v(5) + v(6) + bicz;
    lg.getRange(lr, 1, 1, 14).setValues([[now, ''].concat(values, [sporeni, majetek, majetek - v(7) + dum,
      Utilities.formatDate(now, tz, 'd.M.')])]);
    lg.getRange(lr, 2).setValue(target.serial);
    lg.getRange(lr, 1).setNumberFormat('d.m.yyyy h:mm');
    lg.getRange(lr, 2).setNumberFormat('d.m.yyyy');

    var msg = 'Uloženo ' + Utilities.formatDate(now, tz, 'd. M. H:mm') + ' → stav k ' + target.d + '. ' + target.m + '. ' + target.y;
    dash.getRange(CFG.formStatus).setValue(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

function targetMonthEnd_(override, tz) {
  var base;
  if (override instanceof Date) base = override;
  else if (override !== '' && override !== null) {
    var mm = String(override).match(/(\d{1,2})\s*[\/.]\s*(\d{4})/);
    base = mm ? new Date(Number(mm[2]), Number(mm[1]) - 1, 1) : new Date();
  } else base = new Date();
  var y = Number(Utilities.formatDate(base, tz, 'yyyy')), m = Number(Utilities.formatDate(base, tz, 'M'));
  var d = new Date(Date.UTC(y, m, 0)).getUTCDate(); // poslední den měsíce
  var pad = function (x) { return (x < 10 ? '0' : '') + x; };
  return { y: y, m: m, d: d, key: '' + y + pad(m) + pad(d), serial: serial_(y, m, d) };
}
/** Datum jako pořadové číslo dne (tak ho tabulka ukládá) – nezávislé na časovém pásmu i jazyku tabulky. */
function serial_(y, m, d) { return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; }

/**
 * JEDNORÁZOVÁ OPRAVA po chybě #ERROR! (15. 10. 2026).
 * V editoru Apps Script nahoře vyber funkci „opravitData“ a klikni na Spustit.
 */
function opravitData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  // 1) Měsíční stavy: řádky s chybným datem → jeden řádek k poslednímu dni měsíce
  var ms = sh_(ss, CFG.ms);
  var n = CFG.msLastRow - CFG.msFirstRow + 1;
  var disp = ms.getRange(CFG.msFirstRow, 1, n, 1).getDisplayValues();
  var bad = [];
  for (var i = 0; i < n; i++) if (String(disp[i][0]).charAt(0) === '#') bad.push(CFG.msFirstRow + i);
  if (bad.length) {
    var keep = bad[0], lastVals = ms.getRange(bad[bad.length - 1], 2, 1, 9).getValues();
    var y = Number(Utilities.formatDate(new Date(), tz, 'yyyy')), m = Number(Utilities.formatDate(new Date(), tz, 'M'));
    var d = new Date(Date.UTC(y, m, 0)).getUTCDate();
    ms.getRange(keep, 1).setValue(serial_(y, m, d)).setNumberFormat('d.m.yyyy');
    ms.getRange(keep, 2, 1, 9).setValues(lastVals);
    for (var b = 1; b < bad.length; b++) ms.getRange(bad[b], 1, 1, 10).clearContent();
  }
  // 2) Historie zápisů: opravit datum „za měsíc“ a nechat jen poslední zápis za den
  var lg = sh_(ss, CFG.log);
  var last = lg.getLastRow();
  if (last >= CFG.logFirstRow) {
    var rng = lg.getRange(CFG.logFirstRow, 1, last - CFG.logFirstRow + 1, 2);
    var v = rng.getValues(), dv = rng.getDisplayValues();
    for (var j = 0; j < v.length; j++) {
      if (String(dv[j][1]).charAt(0) === '#' && v[j][0] instanceof Date) {
        var yy = Number(Utilities.formatDate(v[j][0], tz, 'yyyy')), mm = Number(Utilities.formatDate(v[j][0], tz, 'M'));
        lg.getRange(CFG.logFirstRow + j, 2).setValue(serial_(yy, mm, new Date(Date.UTC(yy, mm, 0)).getUTCDate())).setNumberFormat('d.m.yyyy');
      }
    }
    v = lg.getRange(CFG.logFirstRow, 1, last - CFG.logFirstRow + 1, 1).getValues();
    for (var k = v.length - 2; k >= 0; k--) {
      if (v[k][0] instanceof Date && v[k + 1][0] instanceof Date && sameDay_(v[k][0], v[k + 1][0], tz)) lg.deleteRow(CFG.logFirstRow + k);
    }
  }
  SpreadsheetApp.flush();
  Logger.log('Hotovo: opraveno ' + bad.length + ' řádků v Měsíčních stavech.');
}

/**
 * JEDNORÁZOVĚ po importu listu „Roční platby“: přidá do Pravidelných plateb řádek
 * s průměrem ročních plateb na měsíc. V editoru vyber „nastavitRocniPlatby“ a klikni na Spustit.
 */
function nastavitRocniPlatby() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  sh_(ss, 'Roční platby');
  var pp = sh_(ss, 'Pravidelné platby');
  var a = pp.getRange('A5:A60').getValues();
  var r = -1;
  for (var i = 0; i < a.length; i++) if (String(a[i][0]).indexOf('Roční platby') === 0) { r = 5 + i; break; }
  if (r < 0) for (var j = 0; j < a.length; j++) if (a[j][0] === '') { r = 5 + j; break; }
  if (r < 0) throw new Error('V Pravidelných platbách není volný řádek.');
  pp.getRange(r, 1, 1, 3).setValues([['Roční platby z běžného účtu', 'Výdaj', 'Roční platby']]);
  pp.getRange(r, 4).setFormula("='Roční platby'!$O$9");
  pp.getRange(r, 5).setValue('Jen roční platby hrazené z běžného účtu (ostatní kryjí vratky a bonus – list Roční zdroje).');
  Logger.log('Nastaveno v řádku ' + r + '.');
}

function sameDay_(a, b, tz) {
  return Utilities.formatDate(a, tz, 'yyyyMMdd') === Utilities.formatDate(b, tz, 'yyyyMMdd');
}

// ---------- čtení pro webovou stránku ----------
function fmtDate_(v, monthOnly) {
  if (!(v instanceof Date)) return v === '' ? null : v;
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(v, tz, monthOnly ? 'MM/yyyy' : 'd. M. yyyy');
}
function num_(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

function getData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var d = sh_(ss, CFG.dash).getRange('A1:N70').getValues();
  var c = function (a1) {
    var m = a1.match(/^([A-Z])(\d+)$/);
    return d[parseInt(m[2], 10) - 1][m[1].charCodeAt(0) - 65];
  };
  var out = {};
  out.updated = fmtDate_(c('C3'));
  out.previous = fmtDate_(c('E3'));

  // formulář
  var target = c('C6');
  out.form = {
    target: fmtDate_(target), targetKey: target instanceof Date ? Utilities.formatDate(target, tz, 'yyyy-MM') : '',
    status: c('F6') || '',
    fields: CFG.fields.map(function (f, i) {
      var r = CFG.formFirstRow + i;
      return { label: c('B' + r), value: num_(c('C' + r)), prev: num_(c('D' + r)), change: num_(c('E' + r)), key: f.key };
    })
  };
  var ny = Number(Utilities.formatDate(new Date(), tz, 'yyyy')), nm = Number(Utilities.formatDate(new Date(), tz, 'M'));
  out.form.months = [0, 1, 2].map(function (k) {
    var y = ny, m = nm - k;
    if (m < 1) { m += 12; y -= 1; }
    var mm = (m < 10 ? '0' : '') + m;
    var t = targetMonthEnd_(new Date(Date.UTC(y, m - 1, 15)), 'UTC');
    return { key: y + '-' + mm, label: mm + '/' + y + (k === 0 ? ' (aktuální)' : ''), values: monthValues_(ss, t.key) };
  });

  out.kpi = {
    majetek: num_(c('B19')), hypoteka: num_(c('C19')), hypotekaSub: c('C20'),
    cisteJmeni: num_(c('E19')), cisteJmeniSub: c('E20'),
    sporeni: num_(c('N2')), sporeniPredtim: num_(c('N3')),
    zbyva: num_(c('C23')), miraUspor: num_(c('E23')), miraUsporSub: c('E24')
  };
  out.stavebko = {
    nasporeno: num_(c('C27')), cil: num_(c('C28')), splneno: num_(c('C29')),
    zbyva: num_(c('C31')), vklad: num_(c('C32')), poplatkyRok: num_(c('C33'))
  };
  out.sporici = [28, 29].map(function (r) {
    return { name: c('E' + r), zustatek: num_(c('F' + r)), urok: num_(c('G' + r)), mesicne: num_(c('H' + r)) };
  });
  var scen = function (col) {
    return {
      prevod: fmtDate_(c(col + '37'), true), dluhPo: num_(c(col + '38')), splatkaPo: num_(c(col + '39')),
      splaceno: fmtDate_(c(col + '40'), true), uroky: num_(c(col + '41')), pozice: num_(c(col + '42'))
    };
  };
  out.scenare = { A: scen('C'), B: scen('D'), rozdil: num_(c('C43')) };
  out.investice = [47, 48, 49, 50, 51].map(function (r) {
    return {
      name: c('B' + r), vlozeno: num_(c('C' + r)), hodnota: num_(c('D' + r)), zisk: num_(c('E' + r)),
      ziskPct: num_(c('F' + r)), mesic: num_(c('G' + r)), letos: num_(c('H' + r))
    };
  });
  out.rocne = []; out.alokace = [];
  for (var r = 56; r <= 63; r++) {
    if (num_(c('C' + r)) !== null || num_(c('D' + r)) !== null)
      out.rocne.push({ rok: String(c('B' + r)), cs: num_(c('C' + r)), jt: num_(c('D' + r)), portfolio: num_(c('E' + r)) });
    if (num_(c('H' + r))) out.alokace.push({ name: c('F' + r), value: num_(c('H' + r)) });
  }

  // BICZ
  var bz = sh_(ss, 'BICZ').getRange('K5:K19').getValues().map(function (x) { return x[0]; });
  out.bicz = { vlozeno: num_(bz[0]), splatnost: fmtDate_(bz[3]), prubeh: num_(bz[4]), zbyvaMes: num_(bz[5]),
    pocet: num_(bz[6]), pripsano: num_(bz[7]), vydelano: num_(bz[8]), vydelanoPct: num_(bz[9]),
    letos: num_(bz[10]), zbyva: num_(bz[11]), celkem: num_(bz[12]), pa: num_(bz[14]) };

  var pp = sh_(ss, 'Pravidelné platby').getRange('A5:D60').getValues();
  out.platby = pp.filter(function (x) { return x[0] !== '' && num_(x[3]); })
    .map(function (x) { return { name: x[0], typ: x[1], kategorie: x[2], castka: x[3] }; });
  var sum = sh_(ss, 'Pravidelné platby').getRange('H5:H9').getValues();
  out.cashflow = { prijmy: num_(sum[0][0]), vydaje: num_(sum[1][0]), sporeni: num_(sum[2][0]), zbyva: num_(sum[3][0]) };

  var ms = sh_(ss, CFG.ms).getRange('A5:K' + CFG.msLastRow).getValues();
  out.vyvoj = ms.filter(function (x) { return x[0] instanceof Date && num_(x[10]) !== null; })
    .map(function (x) { return { label: fmtDate_(x[0]), value: x[10] }; });

  var lg = sh_(ss, CFG.log);
  var lgN = Math.max(1, lg.getLastRow() - CFG.logFirstRow + 1);
  out.zapisy = lg.getRange(CFG.logFirstRow, 1, lgN, 13).getValues()
    .filter(function (x) { return x[0] instanceof Date; })
    .map(function (x) { return { label: Utilities.formatDate(x[0], tz, 'd. M.'), sporeni: num_(x[10]), hypoteka: num_(x[9]) }; });

  // Roční platby (list je volitelný)
  var rp = ss.getSheetByName('Roční platby');
  out.rocni = null;
  if (rp) {
    var rv = rp.getRange('A6:M40').getValues();
    var sumr = rp.getRange('O6:O8').getValues();
    out.rocni = {
      mesicne: num_(sumr[0][0]), rocne: num_(sumr[1][0]), blizi: num_(sumr[2][0]),
      polozky: rv.filter(function (x) { return x[0] !== ''; }).map(function (x) {
        return { name: x[0], komu: x[1], castka: num_(x[2]), dalsi: fmtDate_(x[7], true), zaMes: num_(x[8]),
                 stav: x[9], upozornit: num_(x[6]), poznamka: x[11], zdroj: x[12] || 'Běžný účet' };
      }).sort(function (a, b) { return (a.zaMes === null ? 999 : a.zaMes) - (b.zaMes === null ? 999 : b.zaMes); })
    };
  }

  // Roční zdroje (vratky, přeplatky, bonus) – list je volitelný
  var rz = ss.getSheetByName('Roční zdroje');
  out.zdroje = null;
  if (rz) {
    var zv = rz.getRange('A5:H9').getValues();
    var hist = rz.getRange('A13:E27').getValues();
    out.zdroje = {
      polozky: zv.slice(0, 4).map(function (x) {
        return { name: x[0], kdy: x[1], ocekavam: num_(x[3]), platim: num_(x[4]), zbude: num_(x[5]), stav: x[6], pristi: fmtDate_(x[7], true) };
      }),
      celkem: { ocekavam: num_(zv[4][3]), platim: num_(zv[4][4]), zbude: num_(zv[4][5]) },
      roky: hist.filter(function (x) { return x[0] !== ''; })
        .map(function (x) { return { rok: String(x[0]), hodnoty: [num_(x[1]), num_(x[2]), num_(x[3]), num_(x[4])] }; }),
      historie: hist.filter(function (x) { return num_(x[1]) !== null || num_(x[2]) !== null || num_(x[3]) !== null || num_(x[4]) !== null; })
        .map(function (x) { return { rok: String(x[0]), hodnoty: [num_(x[1]), num_(x[2]), num_(x[3]), num_(x[4])] }; })
    };
  }

  var fh = sh_(ss, CFG.fondy).getRange('A5:M' + CFG.fondyLastRow).getValues();
  var last = -1;
  fh.forEach(function (x, i) { if (num_(x[2]) !== null || num_(x[4]) !== null) last = i; });
  out.fondy = fh.slice(0, last + 1).map(function (x) {
    return { label: fmtDate_(x[0], true), mesic: num_(x[11]), cs: num_(x[6]), jt: num_(x[9]), portfolio: num_(x[12]) };
  });

  var plan = function (name) {
    var v = sh_(ss, name).getRange('A6:I426').getValues();
    var pts = [];
    for (var i = 0; i < v.length; i += 12) {
      pts.push({ label: fmtDate_(v[i][0], true), dluh: num_(v[i][8]) || 0 });
      if (!v[i][8]) break;
    }
    return pts;
  };
  out.dluhA = plan('Plán A');
  out.dluhB = plan('Plán B');
  out.mesic = mesicData_(ss);
  try { out.archiv = archiv_(ss); } catch (err) { out.archiv = null; }
  return out;
}
