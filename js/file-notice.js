// file-notice.js
// Classic (non-module) script loaded by index.html, tests.html and styleguide.html. Browsers block
// ES modules and fetch for pages opened from disk (file://), so those pages would hang silently.
// This replaces the page with instructions to start the local server. The single-file build
// (dist/gym-app.html, phase 11) is the version meant to open from disk.
(function () {
  if (location.protocol !== 'file:') return;
  var page = location.pathname.split('/').pop() || 'index.html';
  var cmd = 'node scripts/dev-server.mjs';
  var url = 'http://localhost:8417/' + page;
  document.addEventListener('DOMContentLoaded', function () {
    document.body.innerHTML =
      '<main style="max-width:640px;margin:0 auto;padding:var(--sp-32) var(--sp-16)" class="stack">' +
      '<span class="eyebrow eyebrow--rule">Gym Plan</span>' +
      '<h1 class="display-32">This page needs the local server</h1>' +
      '<p>It was opened from disk (file://). Browsers block the scripts and data files this page loads when it is opened that way, so nothing can run.</p>' +
      '<p>In a terminal, in the gym-app folder, run:</p>' +
      '<pre style="background:var(--surface-2);padding:var(--sp-12);border-radius:var(--radius);overflow-x:auto"><code>' + cmd + '</code></pre>' +
      '<p>Then open <a href="' + url + '">' + url + '</a></p>' +
      '<p class="muted small">Halaman ini perlu dibuka lewat server lokal. Jalankan perintah di atas di folder gym-app, lalu buka alamat tersebut.</p>' +
      '</main>';
  });
})();
