/* Service worker : rend l'application utilisable hors connexion.
   Bump CACHE_VERSION à chaque déploiement qui change l'un des fichiers ci-dessous
   (sinon les appareils déjà installés continueraient de servir l'ancienne version en cache). */
const CACHE_VERSION = 'v7';
const CACHE_NAME = 'rdv-cache-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logos.js'
];

const CDN_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
];

const PRECACHE_URLS = APP_SHELL.concat(CDN_LIBS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      // Chaque ressource est mise en cache indépendamment : si une seule échoue
      // (ex : CDN temporairement indisponible pendant l'installation), les autres
      // sont tout de même conservées plutôt que de faire échouer toute l'installation.
      PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isCdnLib(url) {
  return CDN_LIBS.indexOf(url) !== -1;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Document principal (navigation) : réseau d'abord pour récupérer les mises à
  // jour déployées rapidement, repli sur le cache si hors connexion.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Bibliothèques CDN versionnées (URL figée par version) : cache d'abord, le
  // réseau ne sert qu'à les récupérer la première fois ou si jamais absentes du cache.
  if (isCdnLib(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  // Reste des ressources (manifest, icônes, logos.js, tuiles de carte si déjà
  // vues, …) : cache d'abord avec mise à jour en arrière-plan
  // (stale-while-revalidate), pour rester à jour sans jamais bloquer
  // l'affichage sur une attente réseau — et sans jamais faire échouer la
  // requête hors connexion si une version est déjà en cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req).then((res) => caches.open(CACHE_NAME).then((cache) => cache.put(req, res))).catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
