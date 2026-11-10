/* Pomocné funkce a formuláře převzaté z původního dashboardu (Index.html). */
var COLORS = ['#4C8DF6', '#2EC4B6', '#45C483', '#A78BFA', '#F0B04A', '#F2685C', '#E879A6', '#8FA3B8'];
function cv(n) { return getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim(); }
function theme() { return document.documentElement.getAttribute('data-theme') || 'dark'; }
function toggleTheme() {
  var t = theme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('fin-theme', t); } catch (e) {}
  if (LAST) render(LAST);
}
var nf = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
function kc(n) { return n === null || n === undefined || n === '' ? '–' : nf.format(Math.round(n)) + ' Kč'; }
function sk(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + kc(Math.abs(n)); }
function pct(n, d) {
  if (n === null || n === undefined || n === '') return '–';
  return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n * 100).toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
}
function cls(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero'; }
function chip(n, d) { return n === null || n === undefined || n === '' ? '<span class="muted">–</span>' : '<span class="chip ' + cls(n) + '">' + pct(n, d) + '</span>'; }
function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
var charts = [];

function kpi(l, v, s, c) { return '<div class="card kpi ' + (c || '') + '"><div class="label">' + l + '</div><div class="value num">' + v + '</div><div class="sub">' + s + '</div></div>'; }
function donutCard(id, t, sub, c) {
  return '<div class="card ' + c + '"><h2>' + t + '</h2><div class="muted small">' + sub + '</div>' +
    '<div class="donut"><canvas id="' + id + '" role="img" aria-label="' + t + '"></canvas></div></div>';
}
function kv(l, v) { return '<div><span class="muted">' + l + '</span><span class="num">' + v + '</span></div>'; }
function srow(l, a, b) { return '<div class="muted">' + l + '</div><div class="v num">' + a + '</div><div class="v num">' + b + '</div>'; }

function drawCharts(D) {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
  Chart.defaults.color = cv('muted');
  Chart.defaults.borderColor = cv('line');
  var grid = { color: cv('line') };
  var GREEN = cv('green'), RED = cv('red'), BLUE = cv('c-blue'), INK = cv('ink'), CARD = cv('card');
  var kcTick = function (v) { return nf.format(v / 1000) + ' tis.'; };
  var pctTick = function (v) { return (v * 100).toFixed(0) + ' %'; };

  var centerText = {
    id: 'centerText',
    afterDraw: function (ch) {
      var t = ch.options.plugins.centerText; if (!t) return;
      var a = ch.chartArea, x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2, c = ch.ctx;
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = cv('muted'); c.font = "12px 'IBM Plex Sans', sans-serif"; c.fillText(t.label, x, y - 11);
      c.fillStyle = cv('ink'); c.font = "500 15px 'IBM Plex Mono', monospace"; c.fillText(t.value, x, y + 9);
      c.restore();
    }
  };
  var donut = function (id, items, label, total) {
    var el = document.getElementById(id); if (!el) return;
    charts.push(newChart(el, {
      type: 'doughnut', plugins: [centerText],
      data: { labels: items.map(function (x) { return x.name; }),
        datasets: [{ data: items.map(function (x) { return x.value; }), backgroundColor: items.map(function (x, i) { return x.color || COLORS[i % COLORS.length]; }),
          borderColor: CARD, borderWidth: 2, hoverOffset: 6 }] },
      options: { maintainAspectRatio: false, cutout: '64%', layout: { padding: 4 },
        plugins: { centerText: { label: label, value: kc(total) },
          legend: { position: el.parentNode.clientWidth < 380 ? 'bottom' : 'right', labels: { boxWidth: 10, boxHeight: 10, padding: 8, font: { size: 12 } } },
          tooltip: { callbacks: { label: function (c) { var s = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
            return c.label + ': ' + kc(c.raw) + ' (' + Math.round(c.raw / s * 100) + ' %)'; } } } } }
    }));
  };
  var alloc = D.alokace.slice().sort(function (a, b) { return b.value - a.value; });
  donut('dMajetek', alloc, 'Majetek', alloc.reduce(function (s, a) { return s + a.value; }, 0));
  var groups = {}, order = [];
  D.platby.forEach(function (p) {
    if (p.typ === 'Příjem') return;
    var g = p.typ === 'Spoření' ? 'Spoření a investice' : (p.kategorie || 'Ostatní');
    if (!(g in groups)) { groups[g] = 0; order.push(g); }
    groups[g] += p.castka;
  });
  var prij = order.map(function (g) { return { name: g, value: groups[g], color: g === 'Spoření a investice' ? BLUE : null }; })
    .sort(function (a, b) { return b.value - a.value; });
  var pal = [cv('c-amber'), cv('c-red'), cv('c-purple'), '#E879A6', '#8FA3B8', cv('c-teal')], pi = 0;
  prij.forEach(function (x) { if (!x.color) x.color = pal[pi++ % pal.length]; });
  if (D.cashflow.zbyva > 0) prij.push({ name: 'Zbývá', value: D.cashflow.zbyva, color: GREEN });
  donut('dPrijmy', prij, 'Příjmy', D.cashflow.prijmy);
  var inv = D.investice.filter(function (r) { return r.name.indexOf('celkem') < 0 && r.hodnota; })
    .map(function (r) { return { name: r.name.replace(' investiční pojištění', '').replace(' (pevný výnos)', ''), value: r.hodnota }; })
    .sort(function (a, b) { return b.value - a.value; });
  donut('dInvest', inv, 'Investice', inv.reduce(function (s, a) { return s + a.value; }, 0));

  var m = D.fondy.filter(function (f) { return f.mesic !== null; });
  charts.push(newChart(document.getElementById('cMesic'), {
    type: 'bar',
    data: { labels: m.map(function (f) { return f.label; }),
      datasets: [{ data: m.map(function (f) { return f.mesic; }),
        backgroundColor: m.map(function (f) { return f.mesic >= 0 ? GREEN : RED; }), borderRadius: 3 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: function (c) { return pct(c.raw, 2); } } } },
      scales: { y: { grid: grid, ticks: { callback: pctTick } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } } }
  }));

  var s = D.fondy;
  var line = function (key, color, label) {
    return { label: label, data: s.map(function (f) { return f[key]; }), borderColor: color, backgroundColor: color,
      pointRadius: 0, borderWidth: 2, tension: 0, spanGaps: true };
  };
  charts.push(newChart(document.getElementById('cStart'), {
    type: 'line',
    data: { labels: s.map(function (f) { return f.label; }),
      datasets: [line('portfolio', INK, 'Portfolio'), line('jt', cv('c-amber'), 'J&T'), line('cs', BLUE, 'ČS fondy')] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + pct(c.raw, 1); } } } },
      scales: { y: { grid: grid, ticks: { callback: pctTick } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } } }
  }));

  charts.push(newChart(document.getElementById('cVyvoj'), {
    type: 'line',
    data: { labels: D.vyvoj.map(function (v) { return v.label; }),
      datasets: [{ data: D.vyvoj.map(function (v) { return v.value; }), borderColor: BLUE,
        backgroundColor: cv('accent-soft'), fill: true, pointRadius: 3, pointBackgroundColor: CARD, borderWidth: 2.5, tension: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: function (c) { return kc(c.raw); } } } },
      scales: { y: { grid: grid, ticks: { callback: kcTick } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } } } }
  }));

  charts.push(newChart(document.getElementById('cLog'), {
    type: 'line',
    data: { labels: D.zapisy.map(function (z) { return z.label; }),
      datasets: [{ data: D.zapisy.map(function (z) { return z.sporeni; }), borderColor: GREEN, backgroundColor: GREEN,
        pointRadius: 4, pointBackgroundColor: CARD, borderWidth: 2.5, tension: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: function (c) { return kc(c.raw); } } } },
      scales: { y: { grid: grid, ticks: { callback: kcTick } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } } } }
  }));

  if (D.zdroje && D.zdroje.historie.length && document.getElementById('cZdroje')) {
    var zn = D.zdroje.polozky.map(function (z) { return z.name; });
    var zcol = [cv('c-purple'), BLUE, cv('c-amber'), GREEN];
    charts.push(newChart(document.getElementById('cZdroje'), {
      type: 'bar',
      data: { labels: D.zdroje.historie.map(function (x) { return x.rok; }),
        datasets: zn.map(function (n, i) { return { label: n, data: D.zdroje.historie.map(function (x) { return x.hodnoty[i] || 0; }),
          backgroundColor: zcol[i], borderRadius: 3, stack: 's' }; }) },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + sk(c.raw); } } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: grid, ticks: { callback: kcTick } } } }
    }));
  }

  if (D.archiv && D.archiv.barak && document.getElementById('dDum')) {
    var ds = D.archiv.barak.sections.map(function (s) { return { name: s.name, value: s.total || 0 }; }).filter(function (x) { return x.value > 0; });
    donut('dDum', ds, 'Celkem', ds.reduce(function (a, x) { return a + x.value; }, 0));
  }

  var n = Math.max(D.dluhA.length, D.dluhB.length);
  var labels = (D.dluhA.length >= D.dluhB.length ? D.dluhA : D.dluhB).map(function (p) { return p.label.slice(3); });
  var pad = function (arr) { var o = arr.map(function (p) { return p.dluh; }); while (o.length < n) o.push(null); return o; };
  charts.push(newChart(document.getElementById('cDluh'), {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: 'A: znovu investuji', data: pad(D.dluhA), borderColor: BLUE, pointRadius: 0, borderWidth: 2, tension: 0 },
      { label: 'B: do hypotéky', data: pad(D.dluhB), borderColor: cv('c-amber'), pointRadius: 0, borderWidth: 2, tension: 0, borderDash: [5, 4] }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + kc(c.raw); } } } },
      scales: { y: { grid: grid, ticks: { callback: function (v) { return (v / 1e6).toLocaleString('cs-CZ') + ' mil.'; } } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } } }
  }));
}

var LAST = null;
function parseNum(s) { s = String(s).replace(/\s|\u00a0|Kč/g, '').replace(/[\u2212\u2013]/g, '-').replace(',', '.'); return s === '' ? null : Number(s); }
function pickYear() {
  window.ZROK = document.getElementById('zRok').value;
  var y = LAST.zdroje.roky.filter(function (x) { return x.rok === window.ZROK; })[0];
  (y ? y.hodnoty : [null, null, null, null]).forEach(function (v, i) { document.getElementById('z' + i).value = v === null ? '' : nf.format(v); });
  document.getElementById('zStatus').textContent = '';
}
function saveZ() {
  var vals = [], bad = false;
  LAST.zdroje.polozky.forEach(function (z, i) { var v = parseNum(document.getElementById('z' + i).value); if (v !== null && isNaN(v)) bad = true; vals.push(v); });
  var st = document.getElementById('zStatus'), btn = document.getElementById('zSave');
  if (bad) { st.textContent = 'Některé políčko neobsahuje číslo.'; st.className = 'status err'; return; }
  window.ZROK = document.getElementById('zRok').value;
  btn.disabled = true; st.textContent = 'Ukládám…'; st.className = 'status';
  if (window.MOCK_DATA) { setTimeout(function () { btn.disabled = false; st.textContent = 'Náhled – v tabulce se uloží doopravdy.'; }, 400); return; }
  RUN().withSuccessHandler(function (d) { render(d); })
    .withFailureHandler(function (e) { btn.disabled = false; st.textContent = 'Chyba: ' + (e && e.message ? e.message : e); st.className = 'status err'; })
    .saveZdroje({ rok: window.ZROK, values: vals });
}
function pickMonth() {
  var key = document.getElementById('fMonth').value;
  var m = LAST.form.months.filter(function (x) { return x.key === key; })[0];
  var st = document.getElementById('fStatus');
  if (m && m.values) {
    m.values.forEach(function (v, i) { document.getElementById('f' + i).value = v === null ? '' : nf.format(v); });
    st.textContent = 'Načten uložený stav za ' + m.label + '. Po uložení se přepíše.';
  } else st.textContent = 'Tento měsíc ještě není uložený – uložením se založí.';
  st.className = 'status';
}
function save() {
  var vals = [], bad = false;
  LAST.form.fields.forEach(function (f, i) {
    var v = parseNum(document.getElementById('f' + i).value);
    if (v !== null && isNaN(v)) bad = true;
    vals.push(v);
  });
  var st = document.getElementById('fStatus'), btn = document.getElementById('fSave');
  if (bad) { st.textContent = 'Některé políčko neobsahuje číslo.'; st.className = 'status err'; return; }
  btn.disabled = true; st.textContent = 'Ukládám…'; st.className = 'status';
  if (window.MOCK_DATA) { setTimeout(function () { btn.disabled = false; st.textContent = 'Náhled – v tabulce se uloží doopravdy.'; }, 400); return; }
  RUN().withSuccessHandler(function (d) { render(d); })
    .withFailureHandler(function (e) { btn.disabled = false; st.textContent = 'Chyba: ' + (e && e.message ? e.message : e); st.className = 'status err'; })
    .saveEntry({ month: document.getElementById('fMonth').value, values: vals });
}

// ---------- Dům a refinancování ----------
function archivHtml(A) {
  var h = '';
  var N = A.nast || {};
  if (A.barak && A.barak.sections.length) {
    var secs = A.barak.sections;
    var get = function (n) { return secs.filter(function (s) { return s.name.toLowerCase().indexOf(n) === 0; })[0]; };
    var poz = get('pozemek'), stav = get('stavba');
    var vyb = secs.filter(function (s) { return s !== poz && s !== stav; });
    var vybSum = vyb.reduce(function (a, s) { return a + (s.total || 0); }, 0);
    var total = (poz ? poz.total : 0) + (stav ? stav.total : 0) + vybSum;
    h += '<section class="row"><div class="card c-purple" style="flex:3 1 640px"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><h2>Dům – kolik stál</h2>' +
      '<span class="muted small">archiv z listu „Archiv – Barák“</span></div><div class="mtiles">' +
      mt('Pozemek', kc(poz ? poz.total : 0), 'var(--ink)') + mt('Stavba', kc(stav ? stav.total : 0), 'var(--ink)') +
      mt('Vybavení a úpravy', kc(vybSum), 'var(--ink)') + mt('Celkem', kc(total), 'var(--c-purple)') + '</div>';
    if (N.dum) {
      var zh = N.dum - total;
      h += '<div class="small muted">Odhad hodnoty dnes <b class="num" style="color:var(--ink)">' + kc(N.dum) + '</b> · proti vynaloženým penězům <b class="num ' + cls(zh) + '">' + sk(zh) +
        '</b> (' + pct(total ? zh / total : 0, 0) + ')</div>';
    }
    h += '<div>';
    secs.forEach(function (s) {
      h += '<details class="sec"><summary><span class="n">' + esc(s.name) + '</span><span class="num">' + kc(s.total) + '</span></summary>';
      s.items.forEach(function (it) {
        h += '<div class="mrow"><span class="n">' + esc(it.name) + (it.datum ? ' <span class="muted small">' + esc(it.datum) + '</span>' : '') + '</span>' +
          '<span class="a">' + (it.value === null ? '<span class="muted">–</span>' : kc(it.value)) + '</span></div>';
      });
      h += '</details>';
    });
    h += '</div></div>';
    h += '<div class="card c-purple" style="flex:2 1 360px"><h2>Rozpad nákladů</h2><div class="muted small">kam šly peníze na dům' + (poz ? ' a kdo přispěl na pozemek' : '') + '</div>' +
      '<div class="donut"><canvas id="dDum" role="img" aria-label="Rozpad nákladů na dům"></canvas></div>';
    if (poz) {
      h += '<h2 style="font-size:15px;margin-top:6px">Pozemek – kdo kolik dal</h2><div class="mlist">';
      poz.items.forEach(function (it) {
        h += '<div class="mrow"><span class="n">' + esc(it.name) + '</span><span class="a">' + kc(it.value) + '</span><span class="muted small" style="width:44px;text-align:right">' +
          (poz.total ? Math.round((it.value || 0) / poz.total * 100) + ' %' : '') + '</span></div>';
      });
      h += '</div>';
    }
    h += '</div></section>';
  }
  var R = A.refinanc;
  if (R && R.rbUver) {
    var rPre = N.rPre || 0, rPost = N.rPost || 0, vynos = N.biczYield || 0;
    var CE = R.cerpani || [];
    var sumBy = function (d) { return CE.filter(function (x) { return x.druh === d; }).reduce(function (a2, x) { return a2 + x.castka; }, 0); };
    var csPaid = CE.length ? sumBy('cs') : R.csCelkem;
    var inv = CE.length ? sumBy('inv') : (R.rbInvestice || 0);
    var jine = CE.length ? sumBy('jine') : 0;
    var dluh = CE.length ? sumBy('dluh') : 0;
    var cerp = R.cerpano || (csPaid + inv + jine);
    var nevycerp = R.rbUver - cerp;
    var navyseni = cerp - csPaid;
    var urokInv = inv * rPre / 12;
    h += '<section class="card c-amber"><h2>Refinancování 2026 – ČS → Raiffeisen</h2><div class="ba">' +
      '<div><h3>Původně – Česká spořitelna</h3>' + kvr('Hypotéka (splaceno)', kc(CE.length ? CE[0].castka : R.csHypo)) + kvr('Úvěr (splaceno)', kc(CE.length ? CE[1].castka : R.csUver)) +
        kvr('<b>Celkem dluh u ČS</b>', '<b>' + kc(csPaid) + '</b>') + '</div>' +
      '<div><h3>Nově – Raiffeisen (úvěr ze stavebního spoření)</h3>' + kvr('Schválený úvěr', kc(R.rbUver)) +
        kvr('Vyčerpáno ' + esc(R.cerpanoDatum || ''), kc(cerp)) + (nevycerp > 0 ? kvr('Nevyčerpáno', kc(nevycerp)) : '') +
        kvr('Úrok', pct(rPre, 2).replace('+', '') + ' → ' + pct(rPost, 2).replace('+', '')) + '<div class="note">' + pct(rPost, 2).replace('+', '') + ' po převodu stavebka</div></div>' +
      '<div><h3>Kam šly vyčerpané peníze</h3>';
    if (CE.length) {
      CE.forEach(function (x) { h += kvr(esc(x.name) + (x.pozn ? '<div class="note">' + esc(x.pozn) + '</div>' : ''), kc(x.castka)); });
      var ost = cerp - csPaid - inv - jine - dluh;
      if (Math.abs(ost) >= 1) h += kvr('<span class="muted">zaokrouhlení / ostatní</span>', '<span class="muted">' + kc(ost) + '</span>');
    } else {
      h += kvr('Splacení ČS', kc(csPaid)) + kvr('Investice BICZ', kc(inv));
    }
    h += '</div>' +
      '<div><h3>Měsíční platby</h3>' + kvr('Splátka hypotéky (z výplaty)', kc(R.splatkaJa)) + kvr('Stavební spoření (z výnosu BICZ)', kc(R.splatkaInv)) +
        kvr('<b>Celkem</b>', '<b>' + kc((R.splatkaJa || 0) + (R.splatkaInv || 0)) + '</b>') + '</div></div>' +
      '<h2 style="font-size:15px;margin-top:4px">Co to pro tebe znamená</h2><ul class="means">' +
        '<li>Dluh se zvýšil o <b class="num">' + kc(navyseni) + '</b> (z ' + kc(csPaid) + ' u ČS na ' + kc(cerp) + ' u Raiffky). Z toho <b class="num">' + kc(inv) + '</b> pracuje v BICZ' +
          (dluh ? ', <b class="num">' + kc(dluh) + '</b> šlo na splacení dluhu bratrovi (to není náklad – dluh se jen přesunul do hypotéky)' : '') +
          (jine ? ' a <b class="num">' + kc(jine) + '</b> jsou jednorázové náklady (odhad nemovitosti, úrok za březen).' : '.') + '</li>' +
        '<li>Investiční část stojí na úrocích asi <b class="num">' + kc(urokInv) + '</b> měsíčně, BICZ vynáší <b class="num">' + kc(vynos) + '</b> čistého → ' +
          '<b class="num ' + cls(vynos - urokInv) + '">' + sk(vynos - urokInv) + '</b> měsíčně, tj. asi <b class="num">' + kc((vynos - urokInv) * 12) + '</b> ročně ve tvůj prospěch (do splatnosti BICZ 3/2030).</li>' +
        (jine ? '<li>Jednorázové náklady ' + kc(jine) + ' se z rozdílu výnosu a úroku vrátí zhruba za <b class="num">' + Math.ceil(jine / Math.max(1, vynos - urokInv)) + ' měsíců</b>.</li>' : '') +
        '<li>Po naspoření stavebka (860 000 Kč) klesne úrok na ' + pct(rPost, 2).replace('+', '') + ' – viz výhled hypotéky.</li>' +
        '<li>Výnos BICZ plně pokrývá vklady do stavebka (' + kc(R.splatkaInv) + '), takže stavebko spoříš z investice, ne z výplaty.</li>' +
      '</ul><div class="note">Rozpis čerpání podle historie účtu u Raiffky. Původní úrokovou sazbu a splátku u ČS zatím nemám.</div></section>';
  }
  return h;
}
function kvr(l, v) { return '<div class="kvr"><span>' + l + '</span><span>' + v + '</span></div>'; }

// ---------- Měsíční přehled ----------
var MCATS = ['Jídlo', 'Domácnost', 'Telefon', 'Dítě', 'Auto', 'Zdraví', 'Oblečení', 'Zábava', 'Dárky', 'Bydlení', 'Ostatní'];
var MTYPES = [['Ze spořicího', 'Výdaj ze spořicího'], ['Výdaj', 'Výdaj z běžného účtu'], ['Na spořicí', 'Převod na spořicí'], ['Převod ze spořicího', 'Převod ze spořicího (na trvalé platby)'], ['Příjem', 'Příjem (výplata apod.)']];
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function mPeriodKey(ds, payDay) {
  var p = ds.split('-').map(Number), y = p[0], m = p[1];
  if (p[2] < payDay) { m -= 1; if (m < 1) { m = 12; y -= 1; } }
  return y + '-' + pad2(m);
}
function mPeriodBounds(key, payDay) {
  var p = key.split('-').map(Number), y = p[0], m = p[1];
  var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return { start: y + '-' + pad2(m) + '-' + pad2(payDay), end: ny + '-' + pad2(nm) + '-' + pad2(payDay - 1),
           y: y, m: m, ny: ny, nm: nm, label: payDay + '. ' + m + '. – ' + (payDay - 1) + '. ' + nm + '. ' + ny };
}
var MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
function fmtD(ds) { var p = ds.split('-'); return Number(p[2]) + '. ' + Number(p[1]) + '.'; }
function mesicCalc(M, key) {
  var b = mPeriodBounds(key, M.vyplataDen);
  var trv = M.trvale.filter(function (x) { return x.ucet !== 'Raiffeisen'; }).map(function (x) {
    var ds = null;
    if (x.den) {
      var yy = x.den >= M.vyplataDen ? b.y : b.ny, mm = x.den >= M.vyplataDen ? b.m : b.nm;
      var last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      ds = yy + '-' + pad2(mm) + '-' + pad2(Math.min(x.den, last));
    }
    return { name: x.name, castka: x.castka, kategorie: x.kategorie, typ: x.typ, poznamka: x.poznamka, datum: ds, done: ds ? ds <= M.dnes : key < mPeriodKey(M.dnes, M.vyplataDen) };
  }).sort(function (a, b2) { return (a.datum || '9') < (b2.datum || '9') ? -1 : 1; });
  var poh = M.pohyby.filter(function (p) { return p.datum >= b.start && p.datum <= b.end; }).sort(function (a, b2) { return a.datum < b2.datum ? 1 : -1; });
  var sum = function (arr, f) { return arr.filter(f).reduce(function (s, x) { return s + x.castka; }, 0); };
  var prijmy = sum(poh, function (p) { return p.typ === 'Příjem'; });
  var odhad = false;
  if (!prijmy && M.vyplataOcekavana) { prijmy = M.vyplataOcekavana; odhad = true; }
  var trvSum = sum(trv, function () { return true; });
  var vydaje = sum(poh, function (p) { return p.typ === 'Výdaj' || p.typ === 'Ze spořicího'; });
  var naSp = sum(poh, function (p) { return p.typ === 'Na spořicí'; }), zeSp = sum(poh, function (p) { return p.typ === 'Ze spořicího' || p.typ === 'Převod ze spořicího'; });
  var cats = {};
  trv.forEach(function (x) { cats[x.kategorie] = (cats[x.kategorie] || 0) + x.castka; });
  poh.filter(function (p) { return p.typ === 'Výdaj' || p.typ === 'Ze spořicího'; }).forEach(function (p) { cats[p.kategorie] = (cats[p.kategorie] || 0) + p.castka; });
  var rb = M.trvale.filter(function (x) { return x.ucet === 'Raiffeisen'; });
  var rbIn = sum(rb, function (x) { return x.typ === 'Příjem'; }) + sum(M.trvale.filter(function (x) { return x.ucet !== 'Raiffeisen' && /raiffeisen/i.test(x.name); }), function () { return true; });
  var rbOut = sum(rb, function (x) { return x.typ !== 'Příjem'; });
  return { b: b, trv: trv, poh: poh, prijmy: prijmy, odhad: odhad, trvSum: trvSum, vydaje: vydaje, zbyva: prijmy - trvSum - vydaje,
           naSp: naSp, zeSp: zeSp, cats: cats, rb: rb, rbIn: rbIn, rbOut: rbOut };
}
function mesicHtml(M, opts) {
  var curKey = mPeriodKey(M.dnes, M.vyplataDen);
  var key = window.MPER || curKey;
  var C = mesicCalc(M, key);
  var keys = [];
  var p = curKey.split('-').map(Number);
  for (var i = -1; i < 12; i++) { var y = p[0], m = p[1] - i; while (m < 1) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; } keys.push(y + '-' + pad2(m)); }
  var h = '<section class="card c-teal"><div class="formbar"><div><h2>Měsíční přehled</h2>' +
    '<div class="muted small">Od výplaty do výplaty · ' + esc(C.b.label) + '</div></div>' +
    '<div class="field" style="min-width:220px"><label for="mPer">Období</label><select id="mPer" onchange="pickPeriod()">';
  keys.forEach(function (k) {
    var q = k.split('-').map(Number);
    h += '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + MONTHS[q[1] - 1] + ' ' + q[0] + (k === curKey ? ' (aktuální)' : '') + '</option>';
  });
  h += '</select></div></div>';
  h += '<div class="mtiles">' +
    mt('Výplata / příjmy', kc(C.prijmy) + (C.odhad ? ' <span class="small muted">odhad</span>' : ''), 'var(--green)') +
    mt('Trvalé platby z výplaty', '−' + kc(C.trvSum), 'var(--ink)') +
    mt('Ostatní výdaje', '−' + kc(C.vydaje), C.vydaje ? 'var(--red)' : 'var(--ink)') +
    mt('Spořicí účet ČS teď', kc(M.sporici), 'var(--c-blue)') +
    mt('Zbývá', sk(C.zbyva), C.zbyva >= 0 ? 'var(--green)' : 'var(--red)') + '</div>';
  var naBeznem = C.zbyva - (C.naSp - C.zeSp);
  h += '<div class="small muted">Zbývá ' + sk(C.zbyva) + ' = na spořicím z tohoto období <b class="num ' + cls(C.naSp - C.zeSp) + '">' + sk(C.naSp - C.zeSp) + '</b> + na běžném účtu <b class="num ' + cls(naBeznem) + '">' + sk(naBeznem) + '</b>' +
    (C.odhad ? ' (výplata je zatím jen odhad)' : '') + '.</div>';
  h += '<div class="small muted">Výdaje ze spořicího se počítají do útrat a odečtou se ze spořicího účtu. Převod ze spořicího na trvalé platby jen sníží spořicí účet (platba už je v trvalých). · Na spořicí převedeno <b class="num" style="color:var(--ink)">' + kc(C.naSp) + '</b> · zpět ze spořicího <b class="num" style="color:var(--ink)">' + kc(C.zeSp) +
    '</b> · na spořicím z tohoto období zůstává <b class="num ' + cls(C.naSp - C.zeSp) + '">' + sk(C.naSp - C.zeSp) + '</b>' +
    (C.odhad ? ' · <a href="#" onclick="prefillVyplata();return false;">zapsat skutečnou výplatu</a>' : '') + '</div>';
  h += '<div class="mcols"><div><h2 style="font-size:15px;margin-bottom:6px">Trvalé platby</h2><div class="mlist">';
  C.trv.forEach(function (x) {
    h += '<div class="mrow' + (x.done ? ' done' : '') + '"><span class="d">' + (x.datum ? fmtD(x.datum) : 'měs.') + '</span><span class="n">' + esc(x.name) +
      (x.poznamka ? '<div class="note">' + esc(x.poznamka) + '</div>' : '') + '</span><span class="a">−' + kc(x.castka) + '</span>' +
      '<span class="st ' + (x.done ? 'st-ok' : 'st-blizi') + '">' + (x.done ? 'odešlo' : 'čeká') + '</span></div>';
  });
  h += '</div></div><div><h2 style="font-size:15px;margin-bottom:6px">Další platby a převody</h2><div class="mlist">';
  if (!C.poh.length) h += '<div class="muted small" style="padding:10px 0">Zatím nic – přidej platbu níže.</div>';
  C.poh.forEach(function (x) {
    var plus = x.typ === 'Příjem';
    var isExp = x.typ === 'Výdaj' || x.typ === 'Ze spořicího';
    var tag = isExp ? esc(x.kategorie) + (x.typ === 'Ze spořicího' ? ' · ze spořicího' : '') : x.typ === 'Převod ze spořicího' ? 'převod ze spořicího' : esc(x.typ);
    h += '<div class="mrow"><span class="d">' + fmtD(x.datum) + '</span><span class="n">' + esc(x.popis || x.typ) +
      ' <span class="st ' + (isExp ? 'st-dopln' : 'st-src') + '" style="font-style:normal">' + tag + '</span>' +
      (x.poznamka ? '<div class="note">' + esc(x.poznamka) + '</div>' : '') + '</span>' +
      '<span class="a ' + (x.typ === 'Příjem' ? 'pos' : isExp ? 'neg' : '') + '">' + (plus ? '+' : x.typ === 'Na spořicí' ? '→ ' : x.typ === 'Převod ze spořicího' ? '← ' : '−') + kc(x.castka) + '</span>' +
      '<button class="xbtn" onclick="delP(\'' + esc(x.id) + '\')" aria-label="Smazat ' + esc(x.popis) + '">×</button></div>';
  });
  h += '</div></div></div>';
  // formulář
  if (!(opts && opts.noForm)) {
  var today = M.dnes;
  h += '<div class="form5">' +
    '<div class="field"><label for="pD">Datum</label><input id="pD" type="date" value="' + today + '"></div>' +
    '<div class="field" style="grid-column: span 2"><label for="pN">Popis</label><input id="pN" autocomplete="off" placeholder="např. Lidl, telefon, převod…"></div>' +
    '<div class="field"><label for="pA">Částka</label><input id="pA" inputmode="decimal" autocomplete="off" placeholder="0"></div>' +
    '<div class="field"><label for="pT">Typ</label><select id="pT" onchange="pTypChange()">' + MTYPES.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label for="pK">Kategorie</label><select id="pK">' + MCATS.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div>' +
    '<button id="pSave" onclick="addP()">Přidat</button></div>' +
    '<span id="pStatus" class="status">' + esc((LAST_SAVED_P || '')) + '</span>';
  }
  // kategorie
  var cs = Object.keys(C.cats).map(function (k) { return { k: k, v: C.cats[k] }; }).sort(function (a, b2) { return b2.v - a.v; });
  var mx = cs.length ? cs[0].v : 1;
  h += '<div class="mcols"><div><h2 style="font-size:15px;margin:6px 0">Kam šly peníze v tomto období</h2><div style="display:flex;flex-direction:column;gap:8px">';
  cs.forEach(function (c, i) {
    h += '<div class="hbar"><span>' + esc(c.k) + '</span><span class="track"><div style="width:' + (c.v / mx * 100).toFixed(1) + '%;background:' + COLORS[i % COLORS.length] + '"></div></span><span class="num" style="text-align:right">' + kc(c.v) + '</span></div>';
  });
  h += '</div></div>';
  // Raiffeisen
  h += '<div><h2 style="font-size:15px;margin:6px 0">Účet Raiffeisen (měsíčně)</h2><div class="mlist">';
  h += '<div class="mrow"><span class="n">Převod z výplaty</span><span class="a pos">+' + kc(C.rbIn - C.rb.filter(function (x) { return x.typ === 'Příjem'; }).reduce(function (s, x) { return s + x.castka; }, 0)) + '</span></div>';
  C.rb.forEach(function (x) {
    var inc = x.typ === 'Příjem';
    h += '<div class="mrow"><span class="n">' + esc(x.name) + (x.poznamka ? '<div class="note">' + esc(x.poznamka) + '</div>' : '') + '</span><span class="a ' + (inc ? 'pos' : '') + '">' + (inc ? '+' : '−') + kc(x.castka) + '</span></div>';
  });
  h += '<div class="mrow"><span class="n"><b>Zůstává na účtu</b></span><span class="a ' + cls(C.rbIn - C.rbOut) + '"><b>' + sk(C.rbIn - C.rbOut) + '</b></span></div>';
  h += '</div></div></div>';
  h += '<div class="note">Trvalé platby upravíš v tabulce na listu „Trvalé platby“, zapsané pohyby jsou v listu „Pohyby“.</div></section>';
  return h;
}
function mt(l, v, col) { return '<div class="mtile"><span class="l">' + l + '</span><span class="v" style="color:' + col + '">' + v + '</span></div>'; }
var LAST_SAVED_P = '';
function pTypChange() {
  var t = document.getElementById('pT').value, k = document.getElementById('pK');
  k.disabled = (t === 'Na spořicí' || t === 'Příjem' || t === 'Převod ze spořicího');
}
function pickPeriod() { window.MPER = document.getElementById('mPer').value; render(LAST); }
function prefillVyplata() {
  if (!document.getElementById('pD') && window.UI) { UI.zsub = 'platby'; setTab('zapis'); }
  var b = mPeriodBounds(window.MPER || mPeriodKey(LAST.mesic.dnes, LAST.mesic.vyplataDen), LAST.mesic.vyplataDen);
  document.getElementById('pD').value = b.start; document.getElementById('pN').value = 'Výplata';
  document.getElementById('pA').value = LAST.mesic.vyplataOcekavana ? nf.format(LAST.mesic.vyplataOcekavana) : '';
  document.getElementById('pT').value = 'Příjem'; document.getElementById('pA').focus();
}
function addP() {
  var st = document.getElementById('pStatus'), btn = document.getElementById('pSave');
  var a = parseNum(document.getElementById('pA').value), d = document.getElementById('pD').value;
  if (a === null || isNaN(a) || !d) { st.textContent = 'Vyplň datum a částku.'; st.className = 'status err'; return; }
  var typ = document.getElementById('pT').value;
  if (typ === 'Ze spořicího' && !document.getElementById('pN').value) { st.textContent = 'U výdaje ze spořicího napiš, za co to bylo.'; st.className = 'status err'; return; }
  var data = { datum: d, popis: document.getElementById('pN').value, castka: Math.abs(a), typ: typ,
               kategorie: document.getElementById('pK').value, poznamka: '' };
  window.MPER = mPeriodKey(d, LAST.mesic.vyplataDen);
  btn.disabled = true; st.textContent = 'Ukládám…'; st.className = 'status';
  if (window.MOCK_DATA) {
    LAST.mesic.pohyby.push({ datum: d, popis: data.popis, castka: data.castka, typ: data.typ, kategorie: data.kategorie, poznamka: '', id: String(Math.random()) });
    LAST.mesic.sporici += data.typ === 'Na spořicí' ? data.castka : (data.typ === 'Ze spořicího' || data.typ === 'Převod ze spořicího') ? -data.castka : 0;
    LAST_SAVED_P = 'Náhled – v tabulce se uloží doopravdy.'; render(LAST); return;
  }
  RUN().withSuccessHandler(function (r) { LAST_SAVED_P = r.savedPohyb || ''; render(r); })
    .withFailureHandler(function (e) { btn.disabled = false; st.textContent = 'Chyba: ' + (e && e.message ? e.message : e); st.className = 'status err'; })
    .addPohyb(data);
}
function delP(id) {
  if (window.MOCK_DATA) { LAST.mesic.pohyby = LAST.mesic.pohyby.filter(function (p) { return p.id !== id; }); render(LAST); return; }
  RUN().withSuccessHandler(function (r) { LAST_SAVED_P = r.savedPohyb || ''; render(r); })
    .withFailureHandler(function (e) { alertMsg('Chyba: ' + (e && e.message ? e.message : e)); }).deletePohyb(id);
}
function alertMsg(m) { var st = document.getElementById('pStatus'); if (st) { st.textContent = m; st.className = 'status err'; } }

function fail(e) {
  document.getElementById('app').innerHTML = '<div class="card"><h2>Data se nepodařilo načíst</h2><div class="muted">' + esc(e && e.message ? e.message : e) +
    '</div><div class="small">Zkontroluj, že listy v tabulce mají původní názvy (Dashboard, Měsíční stavy, Fondy historie, Pravidelné platby, Plán A, Plán B).</div></div>';
}
