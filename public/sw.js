// ═══════════════════════════════════════════════════════════════
// CEM — Service worker do aplicativo (PWA)
//
// Faz cache apenas do "shell" do app, para permitir a instalação
// e o carregamento rápido. NUNCA intercepta /api — dados escolares
// sempre vêm da rede, evitando exibir informação desatualizada.
// ═══════════════════════════════════════════════════════════════
// Ao publicar uma versão nova do app, incremente este número: o activate
// abaixo apaga os caches antigos e o usuário recebe os arquivos atualizados.
const CACHE = 'cem-app-v2';
const ARQUIVOS = [
  '/app',
  '/portal.html',
  '/css/global.css',
  '/js/core.js',
  '/js/portal.js',
  '/manifest.json',
  '/img/icone-cem.svg',
  '/img/LogoMilezi.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(chaves =>
      Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;          // API sempre pela rede
  if (!ARQUIVOS.includes(url.pathname)) return;

  // Rede primeiro (pega atualizações), cache como reserva offline.
  // cache: 'no-cache' força revalidação com o servidor — sem isso o próprio
  // cache HTTP do navegador devolve o arquivo antigo e o deploy "não aparece".
  e.respondWith(
    fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
