# Finance – aplikace

Instalovatelná webová aplikace (PWA) nad Google tabulkou s financemi.

- Data zůstávají jen v Google tabulce. Aplikace je čte a zapisuje přes Google Sheets API pod tvým přihlášením.
- Výpočty jsou stejné jako v Apps Script dashboardu: `js/logic.js` je kopie `Code.gs` a `js/shim.js` ji pouští v prohlížeči.
- Struktura tabulky se nemění. Aplikace zapisuje do stejných buněk jako dashboard.
- Zámek otiskem / obličejem / Windows Hello (WebAuthn) se nastavuje zvlášť na každém zařízení.

Nastavení je v `js/config.js` (OAuth Client ID a ID tabulky).
