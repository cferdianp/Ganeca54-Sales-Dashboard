# Ganeca54-Sales-Dashboard

Static page that shows a sales summary. The data file in `data/` is encrypted
(PBKDF2-SHA256 + AES-256-CTR + HMAC-SHA256) and is decrypted in the browser with
a password. Nothing readable is stored in this repository.

Chart.js 4.4.1 is included under `vendor/` (MIT license, see `vendor/chart.js-LICENSE.md`).
