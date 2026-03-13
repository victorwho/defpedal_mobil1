
const CACHE_NAME = 'pedala-nav-v1';
const TILE_CACHE_NAME = 'offline-map-tiles';

self.addEventListener('install', (event) => {
  // Wait for the user to prompt the update
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

/**
 * Helper to normalize tile URLs for cache matching.
 * CartoDB and OSM use subdomains (a.tile, b.tile). 
 * If we downloaded 'a.basemaps...', but Leaflet requests 'b.basemaps...',
 * we want to serve the cached 'a' version.
 */
const normalizeRequest = (request) => {
    const url = new URL(request.url);
    
    // Check for CartoDB Dark Matter
    if (url.hostname.includes('basemaps.cartocdn.com')) {
        // Replace subdomains (a, b, c, d) with 'a' to match our downloader's format
        url.hostname = 'a.basemaps.cartocdn.com';
        return new Request(url.toString(), request);
    }
    
    // Check for OpenStreetMap
    if (url.hostname.includes('tile.openstreetmap.org')) {
        if (url.hostname !== 'tile.openstreetmap.org') {
             url.hostname = 'tile.openstreetmap.org';
             return new Request(url.toString(), request);
        }
    }
    
    return request;
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Handle Map Tiles (Cache First Strategy)
  if (url.hostname.includes('openstreetmap.org') || url.hostname.includes('cartocdn.com')) {
      event.respondWith(
          (async () => {
              const tileCache = await caches.open(TILE_CACHE_NAME);
              const normalizedReq = normalizeRequest(event.request);
              
              // Try cache first
              const cachedResponse = await tileCache.match(normalizedReq);
              if (cachedResponse) {
                  return cachedResponse;
              }

              // If not in cache, fetch from network
              try {
                  const networkResponse = await fetch(event.request);
                  // Cache viewed tiles dynamically to improve offline experience
                  if (networkResponse && networkResponse.status === 200) {
                       tileCache.put(normalizedReq, networkResponse.clone());
                  }
                  return networkResponse;
              } catch (error) {
                  // Offline and not in cache: return 404 (Leaflet handles this gracefully)
                  return new Response('', { status: 404, statusText: 'Not Found' }); 
              }
          })()
      );
      return;
  }

  // 2. Exclude API calls from caching
  if (url.hostname.includes('supabase') || 
      url.hostname.includes('osrm') || 
      url.hostname.includes('nominatim') ||
      url.hostname.includes('mapbox') ||
      url.hostname.includes('open-elevation') ||
      url.hostname.includes('open-meteo') ||
      url.hostname.includes('imgur')) {
      return;
  }

  // 3. Generic App Assets (Network First, fall back to Cache)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors' && response.type !== 'opaque')) {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
