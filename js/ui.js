/* Rozložení aplikace do záložek: Přehled · Účty · Útraty · Zápis · Plány. */
(function () {
  'use strict';
  var LS = FIN.LS;

  // ---------- volání „serveru“ (stejné rozhraní jako google.script.run) ----------
  window.RUN = function () {
    var ok = function () {}, bad = function () {};
    var o = {
      withSuccessHandler: function (f) { ok = f; return o; },
      withFailureHandler: function (f) { bad = f; return o; }
    };
    ['getData', 'saveEntry', 'saveZdroje', 'addPohyb', 'deletePohyb'].forEach(function (n) {
      o[n] = function (arg) {
        if (window.MOCK_DATA) { ok(window.MOCK_DATA); return; }
        setBusy(true);
        FIN.call(n, arg).then(function (d) { setBusy(false); ok(d); }, function (e) {
          setBusy(false);
          if (e && e.needLogin) { showLogin(); return; }
          bad(e);
        });
      };
    });
    return o;
  };
  window.newChart = function (el, cfg) { return el ? new Chart(el, cfg) : { destroy: function () {} }; };

  // ---------- stav UI ----------
  var TABS = [
    { id: 'prehled', name: 'Přehled', title: 'Přehled', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
    { id: 'ucty', name: 'Účty', title: 'Účty', icon: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z' },
    { id: 'utraty', name: 'Útraty', title: 'Útraty za měsíc', icon: 'M12 3v9l7 4M21 12a9 9 0 1 1-9-9' },
    { id: 'zapis', name: 'Zápis', title: 'Zápis', icon: 'M12 5v14M5 12h14' },
    { id: 'plany', name: 'Plány', title: 'Plány a výhledy', icon: 'M4 19V5M4 19h16M8 15l4-5 3 3 5-7' }
  ];
  var UI = {
    tab: LS.get('fin-tab') || 'prehled',
    zsub: 'platby', psub: 'vyhled',
    bank: 'cs', acc: ''
  };
  window.UI = UI;
  window.setTab = function (t) { UI.tab = t; LS.set('fin-tab', t); window.scrollTo(0, 0); if (LAST) render(LAST); renderNav(); };
  window.setSub = function (k, v) { UI[k] = v; if (LAST) render(LAST); };
  window.setBank = function (b) { UI.bank = b; UI.acc = ''; render(LAST); };
  window.toggleAcc = function (a) { UI.acc = UI.acc === a ? '' : a; render(LAST); };

  function icon(d) { return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"></path></svg>'; }
  function renderNav() {
    var h = TABS.map(function (t) {
      return '<button class="tabbtn' + (t.id === UI.tab ? ' on' : '') + '" onclick="setTab(\'' + t.id + '\')"' + (t.id === UI.tab ? ' aria-current="page"' : '') + '>' + icon(t.icon) + '<span>' + t.name + '</span></button>';
    }).join('');
    document.getElementById('navBottom').innerHTML = h;
    document.getElementById('navTop').innerHTML = h;
    var t = TABS.filter(function (x) { return x.id === UI.tab; })[0];
    document.getElementById('hTitle').textContent = t ? t.title : '';
  }
  function seg(key, items) {
    return '<div class="seg" role="tablist">' + items.map(function (x) {
      var on = UI[key] === x[0];
      return '<button role="tab" aria-selected="' + on + '" class="' + (on ? 'on' : '') + '" onclick="setSub(\'' + key + '\',\'' + x[0] + '\')">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  function card(cls, title, body, extra) {
    return '<section class="card ' + (cls || '') + '">' + (title ? '<div class="chead"><h2>' + title + '</h2>' + (extra || '') + '</div>' : '') + body + '</section>';
  }
  function lrow(name, sub, val, val2, val2cls) {
    return '<div class="lrow"><span class="n">' + name + (sub ? '<span class="s">' + sub + '</span>' : '') + '</span>' +
      '<span class="v"><span class="num">' + val + '</span>' + (val2 ? '<span class="num small ' + (val2cls || '') + '">' + val2 + '</span>' : '') + '</span></div>';
  }
  function fieldMap(D) { var m = {}; D.form.fields.forEach(function (f) { m[f.key] = f; }); return m; }
  function invRow(D, start) { return D.investice.filter(function (r) { return String(r.name).indexOf(start) === 0; })[0] || {}; }
  function curPeriod(D) { return D.mesic ? mesicCalc(D.mesic, mPeriodKey(D.mesic.dnes, D.mesic.vyplataDen)) : null; }

  // ---------- render ----------
  window.render = function (D) {
    charts.forEach(function (c) { c.destroy(); }); charts = [];
    LAST = D;
    var h = '';
    try {
      if (UI.tab === 'prehled') h = prehled(D);
      else if (UI.tab === 'ucty') h = ucty(D);
      else if (UI.tab === 'utraty') h = utraty(D);
      else if (UI.tab === 'zapis') h = zapis(D);
      else h = plany(D);
    } catch (e) { console.error(e); h = card('', 'Chyba zobrazení', '<div class="muted">' + esc(e.message) + '</div>'); }
    document.getElementById('content').innerHTML = h;
    document.getElementById('hDate').textContent = D.updated ? 'stav k ' + D.updated : '';
    renderNav();
    drawCharts(D);
  };

  function prehled(D) {
    var k = D.kpi, h = '';
    var R = D.rocni;
    if (R) {
      var soon = R.polozky.filter(function (p) { return p.stav === 'tento měsíc' || p.stav === 'blíží se'; });
      if (soon.length) h += '<div class="alert" role="status"><b>Blíží se platba:</b>' + soon.map(function (p) {
        return esc(p.name) + ' – ' + esc(p.dalsi) + (p.castka ? ', cca ' + kc(p.castka) : '') + (p.zaMes <= 0 ? ' <b>tento měsíc</b>' : ' za ' + p.zaMes + ' měs.');
      }).join(' · ') + '</div>';
    }
    var zm = (k.sporeni || 0) - (k.sporeniPredtim || 0);
    var g = '';
    g += card('c-purple', 'Čisté jmění',
      '<div class="big num ' + cls(k.cisteJmeni) + '">' + kc(k.cisteJmeni) + '</div>' +
      '<div class="split"><span>peníze a investice <b class="num">' + kc(k.majetek) + '</b></span>' + (D.archiv && D.archiv.nast && D.archiv.nast.dum ? '<span>dům <b class="num">' + kc(D.archiv.nast.dum) + '</b></span>' : '') + '<span>hypotéka <b class="num">−' + kc(k.hypoteka) + '</b></span></div>' +
      '<div class="muted small">' + esc(k.cisteJmeniSub || '') + '</div>' +
      '<div class="small">Spoření a investice <b class="num">' + kc(k.sporeni) + '</b> <span class="' + cls(zm) + '">' + sk(zm) + '</span> od ' + esc(D.previous || '') + '</div>');
    var C = curPeriod(D);
    if (C) {
      g += card('c-green', 'Tento měsíc', '<div class="big num ' + cls(C.zbyva) + '">' + sk(C.zbyva) + '</div>' +
        '<div class="muted small">zbývá · ' + esc(C.b.label) + (C.odhad ? ' · výplata odhadem' : '') + '</div>' +
        '<div class="split"><span>útraty <b class="num ' + (C.vydaje ? 'neg' : '') + '">' + (C.vydaje ? '−' : '') + kc(C.vydaje) + '</b></span><span>trvalé <b class="num">−' + kc(C.trvSum) + '</b></span></div>' +
        '<button class="btn2 slim" onclick="setTab(\'utraty\')">Útraty za měsíc →</button>');
    }
    // spořicí účty po položkách
    var F = fieldMap(D), st = D.stavebko;
    var sp = (D.mesic && D.mesic.sporici !== null && D.mesic.sporici !== undefined) ? D.mesic.sporici : (F.csSporici ? F.csSporici.value : 0);
    var s0 = D.sporici[0] || {}, s1 = D.sporici[1] || {};
    var spTot = (sp || 0) + (s1.zustatek || 0) + (st.nasporeno || 0);
    g += card('c-blue', 'Spořicí účty',
      lrow('ČS spořicí účet', 'úrok ' + pct(s0.urok, 1).replace('+', '') + ' · cca ' + kc(s0.mesicne) + '/měs.', kc(sp)) +
      lrow('RB spořicí účet', 'úrok ' + pct(s1.urok, 1).replace('+', '') + ' · cca ' + kc(s1.mesicne) + '/měs.', kc(s1.zustatek)) +
      lrow('Stavební spoření', 'cíl ' + kc(st.cil) + ' · ' + pct(st.splneno, 1).replace('+', ''), kc(st.nasporeno)),
      '<span class="num">' + kc(spTot) + '</span>');
    // investice po položkách
    var bz = D.bicz, cs = invRow(D, 'ČS fondy'), jt = invRow(D, 'J&T'), nn = invRow(D, 'NN');
    var invTot = (bz.vlozeno || 0) + (jt.hodnota || 0) + (cs.hodnota || 0) + (nn.hodnota || 0);
    var gl = function (z, p) { return z === null || z === undefined ? '' : sk(z) + (p === null || p === undefined ? '' : ' · ' + pct(p, 1)); };
    g += card('c-teal', 'Investice',
      lrow('BICZ', 'pevný výnos · splatnost ' + esc(bz.splatnost || ''), kc(bz.vlozeno), gl(bz.vydelano, bz.vydelanoPct), cls(bz.vydelano)) +
      lrow('J&T Banka', 'vloženo ' + kc(jt.vlozeno), kc(jt.hodnota), gl(jt.zisk, jt.ziskPct), cls(jt.zisk)) +
      lrow('ČS fondy', 'vloženo ' + kc(cs.vlozeno), kc(cs.hodnota), gl(cs.zisk, cs.ziskPct), cls(cs.zisk)) +
      lrow('NN životní pojištění', nn.vlozeno ? 'zaplaceno cca ' + kc(nn.vlozeno) : 'odkupné', kc(nn.hodnota), gl(nn.zisk, nn.ziskPct), cls(nn.zisk)),
      '<span class="num">' + kc(invTot) + '</span>');
    // nejbližší platby
    if (C) {
      var up = C.trv.filter(function (x) { return !x.done && x.datum; }).slice(0, 5).map(function (x) {
        return '<div class="mrow"><span class="d">' + fmtD(x.datum) + '</span><span class="n">' + esc(x.name) + '</span><span class="a">−' + kc(x.castka) + '</span></div>';
      });
      up.push('<div class="mrow"><span class="d">' + fmtD(C.b.ny + '-' + pad2(C.b.nm) + '-' + pad2(D.mesic.vyplataDen)) + '</span><span class="n">Výplata</span><span class="a pos">+' + kc(D.mesic.vyplataOcekavana) + '</span></div>');
      g += card('c-amber', 'Nejbližší platby', '<div class="mlist">' + up.join('') + '</div>');
    }
    var p = Math.max(0, Math.min(1, st.splneno || 0));
    g += card('c-green', 'Stavebko → úrok 2,99 %',
      '<div class="bar" role="img" aria-label="Naspořeno ' + Math.round(p * 100) + ' procent"><div style="width:' + (p * 100).toFixed(1) + '%"></div></div>' +
      '<div class="split"><span class="num">' + kc(st.nasporeno) + '</span><span class="num muted">z ' + kc(st.cil) + '</span></div>' +
      '<div class="muted small">Převod: plán A ' + esc(D.scenare.A.prevod) + ' · plán B ' + esc(D.scenare.B.prevod) + '</div>');
    return h + '<div class="pgrid">' + g + '</div>';
  }

  function ucty(D) {
    var F = fieldMap(D), C = curPeriod(D), st = D.stavebko, bz = D.bicz;
    var cs = invRow(D, 'ČS fondy'), jt = invRow(D, 'J&T'), nn = invRow(D, 'NN');
    var sp = (D.mesic && D.mesic.sporici !== null && D.mesic.sporici !== undefined) ? D.mesic.sporici : F.csSporici.value;
    var s0 = D.sporici[0] || {}, s1 = D.sporici[1] || {};
    var N = (D.archiv && D.archiv.nast) || {};
    var hyp = D.kpi.hypoteka || 0;
    var dv = function (l, v) { return { l: l, v: v }; };
    var BANKS = [
      { id: 'cs', name: 'Česká spořitelna', total: (F.csBezny.value || 0) + (sp || 0) + (cs.hodnota || 0), accounts: [
        { id: 'cs-b', name: 'Běžný účet', v: F.csBezny.value, sub: 'výplata ' + (D.mesic ? D.mesic.vyplataDen : 20) + '., trvalé platby 20.–21.',
          d: C ? [dv('Příjmy v období', '+' + kc(C.prijmy)), dv('Trvalé platby', '−' + kc(C.trvSum)), dv('Na spořicí', kc(C.naSp))] : [] },
        { id: 'cs-s', name: 'Spořicí účet', v: sp, sub: 'úrok ' + pct(s0.urok, 1).replace('+', '') + ' · cca ' + kc(s0.mesicne) + '/měs.',
          d: C ? [dv('Z tohoto období', sk(C.naSp - C.zeSp)), dv('Převedeno na spořicí', kc(C.naSp)), dv('Vybráno', kc(C.zeSp)), dv('Minulý měsíc', kc(F.csSporici.prev))] : [] },
        { id: 'cs-f', name: 'Investiční fondy', v: cs.hodnota, sub: 'vloženo ' + kc(cs.vlozeno) + ' · ' + pct(cs.ziskPct, 1), subc: cls(cs.zisk),
          d: [dv('Zisk celkem', sk(cs.zisk)), dv('Poslední měsíc', pct(cs.mesic, 2)), dv('Letos', pct(cs.letos, 1))] }
      ] },
      { id: 'rb', name: 'Raiffeisen', total: (F.rbSporici.value || 0) + (st.nasporeno || 0) - hyp, accounts: [
        { id: 'rb-u', name: 'Účet (hypoteční)', v: C ? C.rbIn - C.rbOut : null, vs: C ? sk(C.rbIn - C.rbOut) + '/měs.' : '–', sub: C ? 'přichází ' + kc(C.rbIn) + ' · odchází ' + kc(C.rbOut) : '',
          d: C ? [dv('Převod z výplaty', '+' + kc(C.rbIn - C.rb.filter(function (x) { return x.typ === 'Příjem'; }).reduce(function (a, x) { return a + x.castka; }, 0)))].concat(
            C.rb.map(function (x) { return dv(x.name, (x.typ === 'Příjem' ? '+' : '−') + kc(x.castka)); })) : [] },
        { id: 'rb-s', name: 'Spořicí účet', v: F.rbSporici.value, sub: 'úrok ' + pct(s1.urok, 1).replace('+', '') + ' · cca ' + kc(s1.mesicne) + '/měs.',
          d: [dv('Minulý měsíc', kc(F.rbSporici.prev))] },
        { id: 'rb-st', name: 'Stavební spoření', v: st.nasporeno, sub: 'cíl ' + kc(st.cil) + ' · ' + pct(st.splneno, 1).replace('+', ''),
          d: [dv('Měsíčně (po poplatku)', kc(st.vklad)), dv('Zbývá naspořit', kc(st.zbyva)), dv('Převod – plán A / B', esc(D.scenare.A.prevod) + ' / ' + esc(D.scenare.B.prevod))] },
        { id: 'rb-h', name: 'Hypotéka', v: -hyp, sub: esc(D.kpi.hypotekaSub || ''),
          d: [dv('Úrok měsíčně cca', N.rPre ? kc(hyp * N.rPre / 12) : '–'), dv('Dluh po převodu (A)', kc(D.scenare.A.dluhPo)), dv('Splaceno – plán A / B', esc(D.scenare.A.splaceno) + ' / ' + esc(D.scenare.B.splaceno))] }
      ] },
      { id: 'inv', name: 'Investice', total: (jt.hodnota || 0) + (bz.vlozeno || 0), accounts: [
        { id: 'jt', name: 'J&T Banka', v: jt.hodnota, sub: 'vloženo ' + kc(jt.vlozeno) + ' · ' + pct(jt.ziskPct, 1), subc: cls(jt.zisk),
          d: [dv('Zisk celkem', sk(jt.zisk)), dv('Poslední měsíc', pct(jt.mesic, 2)), dv('Letos', pct(jt.letos, 1))] },
        { id: 'bicz', name: 'BICZ', v: bz.vlozeno, sub: 'výnos ' + pct(bz.pa, 2).replace('+', '') + ' ročně · splatnost ' + esc(bz.splatnost || ''),
          d: [dv('Vyděláno', sk(bz.vydelano)), dv('Letos', kc(bz.letos)), dv('Ještě přijde', kc(bz.zbyva)), dv('Připsáno výnosů', (bz.pripsano || 0) + ' z ' + (bz.pocet || 0))] }
      ] },
      { id: 'poj', name: 'Pojištění', total: nn.hodnota || 0, accounts: [
        { id: 'nn', name: 'NN životní pojištění', v: nn.hodnota, sub: 'odkupné' + (nn.ziskPct !== null && nn.ziskPct !== undefined ? ' · ' + pct(nn.ziskPct, 1) : ''), subc: cls(nn.zisk),
          d: [dv('Zaplaceno (odhad)', kc(nn.vlozeno)), dv('Zisk', sk(nn.zisk))] }
      ] }
    ];
    var bank = BANKS.filter(function (b) { return b.id === UI.bank; })[0] || BANKS[0];
    var h = '<div class="banks">' + BANKS.map(function (b) {
      return '<button class="bankbtn' + (b.id === bank.id ? ' on' : '') + '" onclick="setBank(\'' + b.id + '\')">' + b.name + '</button>';
    }).join('') + '</div>';
    h += '<section class="card"><div class="chead"><h2>' + bank.name + ' celkem</h2><span class="num big2 ' + (bank.total < 0 ? 'neg' : '') + '">' + kc(bank.total) + '</span></div></section>';
    h += '<div class="accs">' + bank.accounts.map(function (a) {
      var open = UI.acc === a.id;
      var val = a.vs || kc(a.v);
      return '<button class="acc' + (open ? ' on' : '') + '" onclick="toggleAcc(\'' + a.id + '\')" aria-expanded="' + open + '">' +
        '<span class="arow"><span class="an">' + a.name + '</span><span class="num av ' + (a.v < 0 ? 'neg' : '') + '">' + val + '</span></span>' +
        '<span class="as ' + (a.subc || '') + '">' + a.sub + '</span>' +
        (open && a.d.length ? '<span class="ad">' + a.d.map(function (x) { return '<span class="kvl"><span>' + x.l + '</span><span class="num">' + x.v + '</span></span>'; }).join('') + '</span>' : '') +
        '</button>';
    }).join('') + '</div>';
    return h;
  }

  function utraty(D) {
    if (!D.mesic) return card('', 'Útraty', '<div class="muted">Měsíční přehled zatím není k dispozici.</div>');
    return mesicHtml(D.mesic, { noForm: true }) +
      '<div class="center"><button onclick="UI.zsub=\'platby\';setTab(\'zapis\')">+ Zapsat platbu</button></div>';
  }

  function zapis(D) {
    var h = seg('zsub', [['platby', 'Platby'], ['stavy', 'Stavy účtů'], ['rocni', 'Roční']]);
    if (UI.zsub === 'stavy') h += stavyHtml(D);
    else if (UI.zsub === 'rocni') h += rocniZapisHtml(D);
    else h += platbyHtml(D);
    return h;
  }

  function platbyHtml(D) {
    var M = D.mesic;
    if (!M) return '';
    var h = '<section class="card c-teal"><h2>Nová platba nebo převod</h2><div class="form5">' +
      '<div class="field"><label for="pT">Typ</label><select id="pT" onchange="pTypChange()">' + MTYPES.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="pN">Za co</label><input id="pN" autocomplete="off" placeholder="např. Lidl, telefon…"></div>' +
      '<div class="field"><label for="pA">Částka</label><input id="pA" inputmode="decimal" autocomplete="off" placeholder="0"></div>' +
      '<div class="field"><label for="pK">Kategorie</label><select id="pK">' + MCATS.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="pD">Datum</label><input id="pD" type="date" value="' + M.dnes + '"></div>' +
      '<button id="pSave" onclick="addP()">Přidat</button></div>' +
      '<span id="pStatus" class="status">' + esc(LAST_SAVED_P || '') + '</span></section>';
    var poh = M.pohyby.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; }).slice(0, 20);
    h += '<section class="card"><h2>Poslední pohyby</h2><div class="mlist">';
    if (!poh.length) h += '<div class="muted small">Zatím nic zapsaného.</div>';
    poh.forEach(function (x) {
      var isExp = x.typ === 'Výdaj' || x.typ === 'Ze spořicího';
      var sign = x.typ === 'Příjem' ? '+' : x.typ === 'Na spořicí' ? '→ ' : x.typ === 'Převod ze spořicího' ? '← ' : '−';
      h += '<div class="mrow"><span class="d">' + fmtD(x.datum) + '</span><span class="n">' + esc(x.popis || x.typ) +
        ' <span class="st ' + (isExp ? 'st-dopln' : 'st-src') + '" style="font-style:normal">' + (isExp ? esc(x.kategorie) : esc(x.typ)) + '</span></span>' +
        '<span class="a ' + (x.typ === 'Příjem' ? 'pos' : isExp ? 'neg' : '') + '">' + sign + kc(x.castka) + '</span>' +
        '<button class="xbtn" onclick="delP(\'' + esc(x.id) + '\')" aria-label="Smazat ' + esc(x.popis) + '">×</button></div>';
    });
    return h + '</div></section>';
  }

  function stavyHtml(D) {
    var F = D.form, h = '';
    h += '<section class="card c-blue"><div class="formbar"><div><h2>Stavy účtů</h2>' +
      '<div class="muted small">Ukládá se k poslednímu dni měsíce. Během měsíce přepisuj klidně vícekrát, platí poslední stav.</div></div>' +
      '<div class="field" style="min-width:200px"><label for="fMonth">Měsíc</label><select id="fMonth" onchange="pickMonth()">';
    F.months.forEach(function (m) { h += '<option value="' + m.key + '"' + (m.key === F.targetKey ? ' selected' : '') + '>' + esc(m.label) + '</option>'; });
    h += '</select></div></div><div class="form">';
    F.fields.forEach(function (f, i) {
      var ch = f.change, good = f.key === 'hypoteka' ? -ch : ch;
      h += '<div class="field"><label for="f' + i + '">' + esc(f.label) + '</label>' +
        '<input id="f' + i + '" inputmode="decimal" autocomplete="off" value="' + (f.value === null ? '' : nf.format(f.value)) + '">' +
        '<span class="hint">minule ' + (f.prev === null ? '–' : kc(f.prev)) +
        (typeof ch !== 'number' || !isFinite(ch) || ch === 0 ? '' : ' · <span class="' + cls(good) + '">' + sk(ch) + '</span>') + '</span></div>';
    });
    return h + '</div><div class="formbar"><span id="fStatus" class="status">' + esc(F.status) + '</span>' +
      '<button id="fSave" onclick="save()">Uložit stav</button></div></section>';
  }

  function rocniZapisHtml(D) {
    var Z0 = D.zdroje;
    if (!Z0 || !Z0.roky || !Z0.roky.length) return card('', 'Roční zdroje', '<div class="muted">List „Roční zdroje“ v tabulce chybí.</div>');
    var selYear = window.ZROK || String(new Date().getFullYear());
    var h = '<section class="card c-green"><div class="formbar"><div><h2>Roční zdroje</h2>' +
      '<div class="muted small">Vratka daně (duben), přeplatek vody (leden/únor), přeplatek elektřiny (září), bonus (prosinec). Nedoplatek piš s minusem.</div></div>' +
      '<div class="field" style="min-width:140px"><label for="zRok">Rok</label><select id="zRok" onchange="pickYear()">';
    Z0.roky.forEach(function (y) { h += '<option value="' + esc(y.rok) + '"' + (y.rok === selYear ? ' selected' : '') + '>' + esc(y.rok) + '</option>'; });
    h += '</select></div></div><div class="form">';
    var yv = (Z0.roky.filter(function (y) { return y.rok === selYear; })[0] || { hodnoty: [null, null, null, null] }).hodnoty;
    Z0.polozky.forEach(function (z, i) {
      h += '<div class="field"><label for="z' + i + '">' + esc(z.name) + '</label>' +
        '<input id="z' + i + '" inputmode="text" autocomplete="off" placeholder="zatím nepřišlo" value="' + (yv[i] === null ? '' : nf.format(yv[i])) + '">' +
        '<span class="hint">' + esc(z.kdy) + '</span></div>';
    });
    return h + '</div><div class="formbar"><span id="zStatus" class="status">' + esc(D.savedZdroje || '') + '</span>' +
      '<button id="zSave" onclick="saveZ()">Uložit roční zdroje</button></div></section>';
  }

  function plany(D) {
    var h = seg('psub', [['vyhled', 'Výhled'], ['grafy', 'Grafy'], ['kolace', 'Koláče'], ['dum', 'Dům']]);
    if (UI.psub === 'grafy') return h + grafy(D);
    if (UI.psub === 'kolace') return h + '<div class="donuts">' +
      donutCard('dMajetek', 'Rozložení majetku', 'kde máš peníze', 'c-teal') +
      donutCard('dPrijmy', 'Kam jdou příjmy', 'měsíčně podle pravidelných plateb', 'c-green') +
      donutCard('dInvest', 'Investice podle hodnoty', 'ČS, J&amp;T, NN a BICZ', 'c-blue') + '</div>';
    if (UI.psub === 'dum') return h + (D.archiv ? archivHtml(D.archiv) : card('', 'Dům', '<div class="muted">Archiv v tabulce chybí.</div>'));
    return h + vyhled(D);
  }

  function grafy(D) {
    var c = function (cl, t, sub, id, hgt) { return '<div class="card ' + cl + '"><h2>' + t + '</h2>' + (sub ? '<div class="muted small">' + sub + '</div>' : '') + '<div class="chart"' + (hgt ? ' style="height:' + hgt + 'px"' : '') + '><canvas id="' + id + '" role="img" aria-label="' + t + '"></canvas></div></div>'; };
    return '<div class="cgrid">' +
      c('c-amber', 'Dluh hypotéky: A vs. B', 'A: BICZ znovu investuji · B: BICZ do hypotéky', 'cDluh') +
      c('c-teal', 'Fondy – měsíční výkonnost', 'ČS + J&amp;T dohromady, očištěno o vklady', 'cMesic') +
      c('c-teal', 'Fondy – zisk od začátku', 'kolik % jsi vydělal na vložených penězích', 'cStart') +
      c('c-blue', 'Spoření a investice v čase', '', 'cVyvoj') +
      c('c-blue', 'Historie zápisů', 'spoření a investice podle dne zápisu', 'cLog') +
      (D.zdroje && D.zdroje.historie.length ? c('c-green', 'Roční zdroje po letech', 'vratky, přeplatky a bonus', 'cZdroje') : '') +
      '</div>';
  }

  function vyhled(D) {
    var st = D.stavebko, A = D.scenare.A, B = D.scenare.B, bz = D.bicz, h = '';
    var sp = Math.max(0, Math.min(1, st.splneno || 0)), bp = Math.max(0, Math.min(1, bz.prubeh || 0));
    h += '<section class="row">' +
      '<div class="card c-amber"><h2>Hypotéka – výhled</h2><div class="scen">' +
      '<div></div><div class="h v">A: BICZ znovu investuji</div><div class="h v">B: BICZ do hypotéky</div>' +
      srow('Převod na 2,99 %', esc(A.prevod), esc(B.prevod)) + srow('Dluh po odečtení stavebka', kc(A.dluhPo), kc(B.dluhPo)) +
      srow('Splátka po převodu', kc(A.splatkaPo), kc(B.splatkaPo)) + srow('Hypotéka splacena', '<b>' + esc(A.splaceno) + '</b>', '<b>' + esc(B.splaceno) + '</b>') +
      srow('Úroky celkem', kc(A.uroky), kc(B.uroky)) + srow('Čistá pozice na konci', kc(A.pozice), kc(B.pozice)) +
      '</div><div class="small">Rozdíl A − B: <span class="chip ' + cls(D.scenare.rozdil) + '">' + sk(D.scenare.rozdil) + '</span> <span class="muted">' +
      (D.scenare.rozdil > 0 ? '(vychází lépe A)' : D.scenare.rozdil < 0 ? '(vychází lépe B)' : '') + '</span></div></div>' +
      '<div class="card c-green"><h2>Stavební spoření → úrok 2,99 %</h2>' +
      '<div class="num" style="font-size:24px">' + kc(st.nasporeno) + ' <span class="muted" style="font-size:15px">/ ' + kc(st.cil) + '</span></div>' +
      '<div class="bar"><div style="width:' + (sp * 100).toFixed(1) + '%"></div></div><div class="kv">' +
      kv('Splněno', pct(st.splneno, 1).replace('+', '')) + kv('Zbývá naspořit', kc(st.zbyva)) + kv('Měsíčně (po poplatku)', kc(st.vklad)) +
      kv('Poplatky za rok', kc(st.poplatkyRok)) + kv('Převod – plán A', '<b>' + esc(A.prevod) + '</b>') + kv('Převod – plán B', '<b>' + esc(B.prevod) + '</b>') + '</div></div></section>';
    h += '<section class="row"><div class="card c-purple"><h2>BICZ – pevný výnos</h2>' +
      '<div class="num" style="font-size:24px"><span class="pos">' + kc(bz.vydelano) + '</span> <span class="muted" style="font-size:15px">vyděláno z ' + kc(bz.celkem) + '</span></div>' +
      '<div class="bar"><div style="width:' + (bp * 100).toFixed(1) + '%"></div></div><div class="kv">' +
      kv('Vloženo', kc(bz.vlozeno)) + kv('Splatnost', '<b>' + esc(bz.splatnost) + '</b>') + kv('Připsáno výnosů', (bz.pripsano || 0) + ' z ' + (bz.pocet || 0)) +
      kv('Zbývá do splatnosti', (bz.zbyvaMes || 0) + ' měsíců') + kv('Vyděláno letos', kc(bz.letos)) + kv('Ještě přijde', kc(bz.zbyva)) + '</div></div>';
    h += '<div class="card c-blue"><h2>Investice</h2><div class="scroll"><table><thead><tr><th></th><th class="r">Vloženo</th><th class="r">Hodnota</th><th class="r">Zisk</th><th class="r">%</th><th class="r">Letos</th></tr></thead><tbody>';
    D.investice.forEach(function (r, i) {
      h += '<tr' + (i === D.investice.length - 1 ? ' class="total"' : '') + '><td>' + esc(r.name) + '</td><td class="r num">' + kc(r.vlozeno) + '</td><td class="r num">' + kc(r.hodnota) + '</td>' +
        '<td class="r num ' + (r.zisk === null ? '' : cls(r.zisk)) + '">' + (r.zisk === null ? '–' : sk(r.zisk)) + '</td><td class="r">' + chip(r.ziskPct, 1) + '</td><td class="r">' + chip(r.letos, 1) + '</td></tr>';
    });
    h += '</tbody></table></div></div></section>';
    var R = D.rocni;
    if (R) {
      var stc = { 'tento měsíc': 'st-tento', 'blíží se': 'st-blizi', 'v pořádku': 'st-ok', 'doplň měsíc': 'st-dopln' };
      h += '<section class="card c-amber"><div class="chead"><h2>Roční platby</h2><span class="muted small">ročně ' + kc(R.rocne) + '</span></div><div class="mlist">';
      R.polozky.forEach(function (p) {
        var lab = (p.stav === 'blíží se' || p.stav === 'v pořádku') ? 'za ' + p.zaMes + ' měs.' : p.stav;
        h += '<div class="mrow"><span class="n">' + esc(p.name) + '<div class="note">' + esc(p.komu) + ' · z: ' + esc(p.zdroj) + '</div></span>' +
          '<span class="a">' + (p.castka ? kc(p.castka) : '<span class="muted">dle vyúčt.</span>') + '</span><span class="d" style="text-align:right">' + (p.dalsi ? esc(p.dalsi) : '–') + '</span>' +
          '<span class="st ' + (stc[p.stav] || 'st-ok') + '">' + esc(lab) + '</span></div>';
      });
      h += '</div></section>';
    }
    var Z = D.zdroje;
    if (Z) {
      var zc = { 'pokryje': 'st-ok', 'nepokryje': 'st-tento', 'doplň částku': 'st-dopln' };
      h += '<section class="card c-green"><div class="chead"><h2>Roční zdroje</h2><span class="muted small">zbude <b class="num ' + cls(Z.celkem.zbude) + '">' + sk(Z.celkem.zbude || 0) + '</b></span></div><div class="mlist">';
      Z.polozky.forEach(function (z) {
        h += '<div class="mrow"><span class="n">' + esc(z.name) + '<div class="note">' + esc(z.pristi) + ' · platím z toho ' + (z.platim ? kc(z.platim) : '–') + '</div></span>' +
          '<span class="a ' + (z.ocekavam < 0 ? 'neg' : '') + '">' + (z.ocekavam ? sk(z.ocekavam) : '–') + '</span>' +
          '<span class="st ' + (zc[z.stav] || 'st-ok') + '">' + esc(z.stav) + '</span></div>';
      });
      h += '</div></section>';
    }
    return h;
  }

  // ---------- obrazovky: zámek, přihlášení, načítání ----------
  var ov = function () { return document.getElementById('overlay'); };
  function showOverlay(html) { var o = ov(); o.innerHTML = '<div class="ovbox">' + html + '</div>'; o.hidden = false; }
  function hideOverlay() { ov().hidden = true; ov().innerHTML = ''; }
  var lockIcon = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';

  function showLock() {
    showOverlay(lockIcon + '<h1>Finance</h1><p class="muted">Pro otevření se ověř otiskem, obličejem nebo PINem zařízení.</p>' +
      '<button id="unlockBtn" class="wide">Odemknout</button><p id="ovMsg" class="status err"></p>');
    document.getElementById('unlockBtn').onclick = function () {
      FIN.lockVerify().then(function () { locked = false; start(); }, function () { document.getElementById('ovMsg').textContent = 'Ověření se nepovedlo, zkus to znovu.'; });
    };
  }
  function showLogin() {
    showOverlay(lockIcon + '<h1>Finance</h1><p class="muted">Přihlas se Google účtem, pod kterým máš tabulku s financemi.</p>' +
      '<button id="loginBtn" class="wide">Přihlásit přes Google</button><p id="ovMsg" class="status err"></p>');
    document.getElementById('loginBtn').onclick = function () {
      FIN.login().then(function () { hideOverlay(); load(); }, function (e) { document.getElementById('ovMsg').textContent = e.message; });
    };
  }
  window.showLogin = showLogin;
  function setBusy(b) { document.body.classList.toggle('busy', !!b); }

  window.load = function () {
    if (!FIN.tokenValid()) { showLogin(); return; }
    if (!LAST) document.getElementById('content').innerHTML = '<div id="loading">Načítám data z tabulky…</div>';
    RUN().withSuccessHandler(function (d) { hideOverlay(); render(d); offerLock(); }).withFailureHandler(fail).getData();
  };
  window.fail = function (e) {
    document.getElementById('content').innerHTML = card('', 'Data se nepodařilo načíst', '<div class="muted">' + esc(e && e.message ? e.message : e) + '</div>' +
      '<div class="small">Zkontroluj připojení a že jsi přihlášený správným Google účtem.</div><button onclick="load()">Zkusit znovu</button>');
  };

  // nabídnout zapnutí zámku po prvním úspěšném načtení
  function offerLock() {
    if (FIN.lockEnabled() || LS.get('fin-lock-asked')) return;
    FIN.lockSupported().then(function (ok) {
      if (!ok) return;
      LS.set('fin-lock-asked', '1');
      showOverlay(lockIcon + '<h1>Zamykat aplikaci?</h1><p class="muted">Při každém otevření se aplikace zeptá na otisk, obličej nebo PIN zařízení (na PC Windows Hello).</p>' +
        '<button id="lockYes" class="wide">Zapnout zámek</button><button id="lockNo" class="wide btn2">Teď ne</button><p id="ovMsg" class="status err"></p>');
      document.getElementById('lockYes').onclick = function () {
        FIN.lockEnable().then(hideOverlay, function (e) { document.getElementById('ovMsg').textContent = 'Nepovedlo se: ' + (e.message || e); });
      };
      document.getElementById('lockNo').onclick = hideOverlay;
    });
  }
  window.lockSettings = function () {
    FIN.lockSupported().then(function (ok) {
      var on = FIN.lockEnabled();
      showOverlay('<h1>Nastavení</h1>' +
        (ok ? '<button id="lkT" class="wide">' + (on ? 'Vypnout zámek' : 'Zapnout zámek otiskem / PINem') + '</button>' : '<p class="muted">Toto zařízení nepodporuje zámek otiskem ani Windows Hello.</p>') +
        '<button id="lkTheme" class="wide btn2">' + (theme() === 'dark' ? '☀ Světlý režim' : '☾ Tmavý režim') + '</button>' +
        '<button id="lkOut" class="wide btn2">Odhlásit</button><button id="lkClose" class="wide btn2">Zavřít</button><p id="ovMsg" class="status err"></p>' +
        '<p class="muted small">' + esc(LS.get('fin-email') || '') + '</p>');
      if (ok) document.getElementById('lkT').onclick = function () {
        if (on) { FIN.lockDisable(); hideOverlay(); }
        else FIN.lockEnable().then(hideOverlay, function (e) { document.getElementById('ovMsg').textContent = 'Nepovedlo se: ' + (e.message || e); });
      };
      document.getElementById('lkTheme').onclick = function () { hideOverlay(); toggleTheme(); };
      document.getElementById('lkOut').onclick = function () { FIN.logout(); LAST = null; document.getElementById('content').innerHTML = ''; showLogin(); };
      document.getElementById('lkClose').onclick = hideOverlay;
    });
  };

  // zamknout po návratu, pokud byla aplikace na pozadí déle než 2 minuty
  var locked = FIN.lockEnabled(), hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) hiddenAt = Date.now();
    else if (FIN.lockEnabled() && hiddenAt && Date.now() - hiddenAt > 120000) { locked = true; showLock(); }
  });

  function start() {
    if (locked) { showLock(); return; }
    hideOverlay();
    load();
  }
  window.addEventListener('DOMContentLoaded', function () {
    renderNav();
    if (window.MOCK_DATA) { render(window.MOCK_DATA); return; }
    start();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  });
})();
