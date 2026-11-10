/*
 * Shim: lets the original Apps Script code (logic.js) run in the browser.
 * The whole spreadsheet is loaded into memory through the Google Sheets API,
 * the Apps Script code reads/writes that copy synchronously, and the writes
 * are then sent back to Google in one batch (FIN.flush()).
 */
(function () {
  'use strict';

  var API = 'https://sheets.googleapis.com/v4/spreadsheets/';
  var state = null; // { id, tz, sheets: { title: { id, rows, maxRows, grid: [[...]], formulasK } }, ops: [] }

  // ---------- helpers ----------
  function colToNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function numToCol(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function parseA1(a1) {
    var m = String(a1).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!m) throw new Error('Neznámý rozsah ' + a1);
    var r1 = +m[2], c1 = colToNum(m[1]);
    var r2 = m[4] ? +m[4] : r1, c2 = m[3] ? colToNum(m[3]) : c1;
    return { r: r1, c: c1, nr: r2 - r1 + 1, nc: c2 - c1 + 1 };
  }
  function q(title) { return "'" + String(title).replace(/'/g, "''") + "'"; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var RX_DMY = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
  var RX_MY = /^(\d{1,2})\/(\d{4})$/;
  var RX_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  function toCell(v) {
    if (typeof v !== 'string') return v === undefined || v === null ? '' : v;
    var m = v.match(RX_DMY);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = v.match(RX_MY);
    if (m) return new Date(+m[2], +m[1] - 1, 1);
    m = v.match(RX_ISO);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return v;
  }
  function serialOf(d) {
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    return (utc - Date.UTC(1899, 11, 30)) / 86400000;
  }
  function out(v) { return v instanceof Date ? serialOf(v) : (v === null || v === undefined ? '' : v); }

  async function api(path, opts) {
    var token = await FIN.getToken();
    opts = opts || {};
    var res = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 401) { FIN.clearToken(); throw new Error('Přihlášení vypršelo – přihlas se znovu.'); }
    if (!res.ok) {
      var t = await res.text();
      var msg = t; try { msg = JSON.parse(t).error.message; } catch (e) {}
      throw new Error('Google Tabulky: ' + msg);
    }
    return res.json();
  }

  // ---------- load / flush ----------
  // Sériové číslo Google Tabulek -> Date v místním čase (stejně jako vrací Apps Script).
  function dateOf(serial) {
    var days = Math.floor(serial), secs = Math.round((serial - days) * 86400);
    return new Date(1899, 11, 30 + days, 0, 0, secs);
  }
  function cellOf(c) {
    if (!c || !c.effectiveValue) return '';
    var v = c.effectiveValue;
    if ('numberValue' in v) {
      var t = c.effectiveFormat && c.effectiveFormat.numberFormat && c.effectiveFormat.numberFormat.type;
      return (t === 'DATE' || t === 'DATE_TIME') ? dateOf(v.numberValue) : v.numberValue;
    }
    if ('stringValue' in v) return toCell(v.stringValue);
    if ('boolValue' in v) return v.boolValue;
    if ('errorValue' in v) return '#ERROR!';
    return '';
  }

  async function load() {
    var id = FIN.spreadsheetId();
    var meta = await api(id + '?includeGridData=true&fields=' + encodeURIComponent(
      'properties(timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),data(rowData(values(effectiveValue,effectiveFormat/numberFormat/type))))'));
    var sheets = {};
    meta.sheets.forEach(function (s) {
      var rows = (s.data && s.data[0] && s.data[0].rowData) || [];
      sheets[s.properties.title] = {
        id: s.properties.sheetId, title: s.properties.title, maxRows: s.properties.gridProperties.rowCount,
        grid: rows.map(function (r) { return (r.values || []).map(cellOf); }), formulas: {}
      };
    });
    if (sheets['Měsíční stavy']) {
      try {
        var f = await api(id + '/values/' + encodeURIComponent(q('Měsíční stavy') + '!K1:K300') + '?valueRenderOption=FORMULA');
        (f.values || []).forEach(function (r, i) { sheets['Měsíční stavy'].formulas[(i + 1) + ':11'] = String(r[0] || ''); });
      } catch (e) { /* not critical */ }
    }
    state = { id: id, tz: meta.properties.timeZone, sheets: sheets, ops: [], fmt: [], structural: [], deletes: [], formulasUE: [], copies: [] };
    return state;
  }
  function pending() { return state && (state.ops.length || state.fmt.length || state.structural.length || state.deletes.length || state.formulasUE.length || state.copies.length); }

  async function flush() {
    if (!state) return;
    var id = state.id;
    if (state.structural.length) {
      var r = await api(id + ':batchUpdate', { method: 'POST', body: { requests: state.structural } });
      (r.replies || []).forEach(function (rep) {
        if (rep.addSheet) { var p = rep.addSheet.properties; if (state.sheets[p.title]) state.sheets[p.title].id = p.sheetId; }
      });
    }
    if (state.ops.length) {
      await api(id + '/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'RAW', data: state.ops } });
    }
    if (state.formulasUE.length) {
      await api(id + '/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'USER_ENTERED', data: state.formulasUE } });
    }
    var req = state.copies.slice();
    state.fmt.forEach(function (f) {
      var sh = state.sheets[f.sheet];
      req.push({ repeatCell: { range: { sheetId: sh.id, startRowIndex: f.r - 1, endRowIndex: f.r - 1 + f.nr, startColumnIndex: f.c - 1, endColumnIndex: f.c - 1 + f.nc },
        cell: { userEnteredFormat: { numberFormat: { type: /[dmy]/.test(f.pattern) && !/#|0/.test(f.pattern) ? 'DATE' : 'NUMBER', pattern: f.pattern } } },
        fields: 'userEnteredFormat.numberFormat' } });
    });
    state.deletes.forEach(function (d) {
      var sh = state.sheets[d.sheet];
      req.push({ deleteDimension: { range: { sheetId: sh.id, dimension: 'ROWS', startIndex: d.r - 1, endIndex: d.r } } });
    });
    if (req.length) await api(id + ':batchUpdate', { method: 'POST', body: { requests: req } });
    state.ops = []; state.fmt = []; state.structural = []; state.deletes = []; state.formulasUE = []; state.copies = [];
  }

  // ---------- Apps Script look-alike ----------
  function Range(sheet, r, c, nr, nc) { this.s = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.cell = function (i, j) { var row = this.s.data.grid[this.r - 1 + i]; var v = row ? row[this.c - 1 + j] : ''; return v === undefined ? '' : v; };
  Range.prototype.getValues = function () { var o = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) row.push(this.cell(i, j)); o.push(row); } return o; };
  Range.prototype.getValue = function () { return this.cell(0, 0); };
  Range.prototype.getDisplayValues = function () { return this.getValues().map(function (r) { return r.map(function (v) { return v instanceof Date ? v.toLocaleDateString('cs-CZ') : String(v); }); }); };
  Range.prototype.getFormula = function () { return this.s.data.formulas[this.r + ':' + this.c] || ''; };
  // Kopírování vzorců mezi řádky: místo R1C1 pošleme Googlu copyPaste (relativní odkazy se posunou samy).
  Range.prototype.getFormulasR1C1 = function () { return [{ copyFrom: this }]; };
  Range.prototype.setFormulasR1C1 = function (f) {
    var src = f && f[0] && f[0].copyFrom; if (!src) return this;
    var gr = function (x) { return { sheetId: x.s.data.id, startRowIndex: x.r - 1, endRowIndex: x.r - 1 + x.nr, startColumnIndex: x.c - 1, endColumnIndex: x.c - 1 + x.nc }; };
    state.copies.push({ copyPaste: { source: gr(src), destination: gr(this), pasteType: 'PASTE_FORMULA' } });
    return this;
  };
  Range.prototype.getRow = function () { return this.r; };
  Range.prototype.getColumn = function () { return this.c; };
  Range.prototype.getLastRow = function () { return this.r + this.nr - 1; };
  Range.prototype.getLastColumn = function () { return this.c + this.nc - 1; };
  Range.prototype.getSheet = function () { return this.s; };
  Range.prototype.setValues = function (vals) {
    var g = this.s.data.grid;
    for (var i = 0; i < vals.length; i++) {
      var ri = this.r - 1 + i; while (g.length <= ri) g.push([]);
      for (var j = 0; j < vals[i].length; j++) g[ri][this.c - 1 + j] = vals[i][j];
    }
    state.ops.push({ range: q(this.s.data.title) + '!' + numToCol(this.c) + this.r + ':' + numToCol(this.c + vals[0].length - 1) + (this.r + vals.length - 1),
      values: vals.map(function (row) { return row.map(out); }) });
    return this;
  };
  Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
  Range.prototype.clearContent = function () {
    var vals = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) row.push(''); vals.push(row); }
    return this.setValues(vals);
  };
  Range.prototype.setFormula = function (f) {
    var g = this.s.data.grid; while (g.length < this.r) g.push([]);
    g[this.r - 1][this.c - 1] = '';
    state.formulasUE.push({ range: q(this.s.data.title) + '!' + numToCol(this.c) + this.r, values: [[f]] });
    return this;
  };
  Range.prototype.setNumberFormat = function (p) { state.fmt.push({ sheet: this.s.data.title, r: this.r, c: this.c, nr: this.nr, nc: this.nc, pattern: p }); return this; };
  Range.prototype.setFontWeight = function () { return this; };
  Range.prototype.setBackground = function () { return this; };

  function Sheet(data) { this.data = data; }
  Sheet.prototype.getName = function () { return this.data.title; };
  Sheet.prototype.getRange = function (a, b, c, d) {
    if (typeof a === 'string') { var p = parseA1(a); return new Range(this, p.r, p.c, p.nr, p.nc); }
    return new Range(this, a, b, c || 1, d || 1);
  };
  Sheet.prototype.getLastRow = function () {
    var g = this.data.grid;
    for (var i = g.length - 1; i >= 0; i--) if (g[i] && g[i].some(function (v) { return v !== '' && v !== null && v !== undefined; })) return i + 1;
    return 0;
  };
  Sheet.prototype.getLastColumn = function () { return this.data.grid.reduce(function (m, r) { return Math.max(m, r ? r.length : 0); }, 0); };
  Sheet.prototype.getMaxRows = function () { return Math.max(this.data.maxRows || 0, this.data.grid.length); };
  Sheet.prototype.deleteRow = function (r) { this.data.grid.splice(r - 1, 1); state.deletes.push({ sheet: this.data.title, r: r }); };
  Sheet.prototype.setFrozenRows = function () { return this; };
  Sheet.prototype.setColumnWidth = function () { return this; };

  var SS = {
    getSheetByName: function (n) { return state.sheets[n] ? new Sheet(state.sheets[n]) : null; },
    getSpreadsheetTimeZone: function () { return state.tz; },
    insertSheet: function (n) {
      state.sheets[n] = { id: null, title: n, maxRows: 1000, grid: [], formulas: {} };
      state.structural.push({ addSheet: { properties: { title: n } } });
      return new Sheet(state.sheets[n]);
    }
  };

  window.SpreadsheetApp = { getActiveSpreadsheet: function () { return SS; }, flush: function () {} };
  window.LockService = { getDocumentLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  window.Logger = { log: function () { console.log.apply(console, arguments); } };
  window.Utilities = {
    getUuid: function () { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); },
    formatDate: function (d, tz, fmt) {
      if (!(d instanceof Date)) d = new Date(d);
      return fmt.replace(/yyyy|yy|MM|M|dd|d|HH|H|mm/g, function (t) {
        switch (t) {
          case 'yyyy': return String(d.getFullYear());
          case 'yy': return String(d.getFullYear()).slice(2);
          case 'MM': return pad(d.getMonth() + 1);
          case 'M': return String(d.getMonth() + 1);
          case 'dd': return pad(d.getDate());
          case 'd': return String(d.getDate());
          case 'HH': return pad(d.getHours());
          case 'H': return String(d.getHours());
          case 'mm': return pad(d.getMinutes());
        }
        return t;
      });
    }
  };

  // ---------- server calls (same names as google.script.run) ----------
  async function call(name, arg) {
    await load();
    var res = name === 'getData' ? null : window[name](arg);
    if (pending()) { await flush(); await load(); }   // Google přepočítá vzorce, načteme čerstvé hodnoty
    var data = window.getData();
    if (pending()) await flush();                      // getData si občas založí chybějící řádek měsíce
    if (res && typeof res === 'object') ['saved', 'savedPohyb', 'savedZdroje'].forEach(function (k) { if (res[k]) data[k] = res[k]; });
    return data;
  }

  window.FIN = window.FIN || {};
  window.FIN.call = call;
  window.FIN._state = function () { return state; };
})();
