/* Přihlášení Google účtem (Google Identity Services) a zámek otiskem / Windows Hello (WebAuthn). */
(function () {
  'use strict';
  var C = window.FIN_CONFIG;
  var FIN = window.FIN = window.FIN || {};
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  FIN.LS = LS;

  FIN.spreadsheetId = function () { return LS.get('fin-sheet') || C.spreadsheetId; };

  // ---------- Google token ----------
  function NeedLogin() { var e = new Error('Je potřeba se přihlásit.'); e.needLogin = true; return e; }
  FIN.tokenValid = function () {
    var t = LS.get('fin-token'), exp = +LS.get('fin-token-exp') || 0;
    return t && Date.now() < exp - 60000;
  };
  FIN.getToken = async function () {
    if (FIN.tokenValid()) return LS.get('fin-token');
    throw NeedLogin();
  };
  FIN.clearToken = function () { LS.del('fin-token'); LS.del('fin-token-exp'); };

  function gisReady() {
    return new Promise(function (resolve, reject) {
      var n = 0;
      (function wait() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (++n > 100) return reject(new Error('Nepodařilo se načíst přihlášení Google. Zkontroluj připojení.'));
        setTimeout(wait, 100);
      })();
    });
  }

  // Musí být voláno z kliknutí (otevírá okno Googlu).
  FIN.login = function () {
    return gisReady().then(function () {
      return new Promise(function (resolve, reject) {
        var client = google.accounts.oauth2.initTokenClient({
          client_id: C.clientId,
          scope: C.scope + ' openid email',
          hint: LS.get('fin-email') || undefined,
          callback: function (resp) {
            if (resp.error) return reject(new Error('Přihlášení se nepovedlo: ' + resp.error));
            if (!google.accounts.oauth2.hasGrantedAllScopes(resp, C.scope)) {
              LS.del('fin-email'); LS.set('fin-force-consent', '1');
              return reject(new Error('Google nepovolil přístup k tabulkám. Přihlas se znovu a na stránce Googlu zaškrtni políčko „Zobrazit, upravit, vytvořit a smazat tabulky Google“.'));
            }
            LS.del('fin-force-consent');
            LS.set('fin-token', resp.access_token);
            LS.set('fin-token-exp', String(Date.now() + (resp.expires_in || 3600) * 1000));
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + resp.access_token } })
              .then(function (r) { return r.json(); }).then(function (u) { if (u.email) LS.set('fin-email', u.email); }).catch(function () {});
            resolve();
          },
          error_callback: function (err) { reject(new Error(err && err.type === 'popup_closed' ? 'Okno přihlášení bylo zavřeno.' : 'Přihlášení se nepovedlo.')); }
        });
        client.requestAccessToken({ prompt: LS.get('fin-email') && !LS.get('fin-force-consent') ? '' : 'consent' });
      });
    });
  };
  FIN.logout = function () {
    var t = LS.get('fin-token');
    FIN.clearToken();
    try { if (t && window.google && google.accounts) google.accounts.oauth2.revoke(t, function () {}); } catch (e) {}
  };

  // ---------- zámek (WebAuthn: otisk, obličej, PIN zařízení / Windows Hello) ----------
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }

  FIN.lockSupported = async function () {
    try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
    catch (e) { return false; }
  };
  FIN.lockEnabled = function () { return !!LS.get('fin-cred'); };
  FIN.lockEnable = async function () {
    var cred = await navigator.credentials.create({ publicKey: {
      challenge: rand(32),
      rp: { name: 'Finance', id: location.hostname },
      user: { id: rand(16), name: LS.get('fin-email') || 'finance', displayName: 'Finance' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none'
    } });
    LS.set('fin-cred', b64(cred.rawId));
  };
  FIN.lockDisable = function () { LS.del('fin-cred'); };
  FIN.lockVerify = async function () {
    var id = LS.get('fin-cred');
    if (!id) return true;
    await navigator.credentials.get({ publicKey: {
      challenge: rand(32), timeout: 60000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal', 'hybrid'] }]
    } });
    return true;
  };
})();
