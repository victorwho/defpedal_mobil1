
// Math for Slippy Map Tiles
// https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames

interface Bounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

const CACHE_NAME = 'offline-map-tiles';
const MAX_TILES_PER_DOWNLOAD = 3000; // Hard limit to prevent browser freeze/storage issues

// Convert Lat/Lon to Tile X
const long2tile = (lon: number, zoom: number) => {
    return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
}

// Convert Lat/Lon to Tile Y
const lat2tile = (lat: number, zoom: number) => {
    return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
}

export const getTileCount = (bounds: Bounds, minZoom: number, maxZoom: number): number => {
    let count = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
        const left = long2tile(bounds.west, z);
        const right = long2tile(bounds.east, z);
        const top = lat2tile(bounds.north, z);
        const bottom = lat2tile(bounds.south, z);
        count += (Math.abs(right - left) + 1) * (Math.abs(bottom - top) + 1);
    }
    return count;
};

export const downloadRegion = async (
    bounds: Bounds, 
    minZoom: number, 
    maxZoom: number, 
    onProgress: (current: number, total: number) => void
): Promise<void> => {
    
    // Check total tiles
    const totalTiles = getTileCount(bounds, minZoom, maxZoom);
    if (totalTiles > MAX_TILES_PER_DOWNLOAD) {
        throw new Error(`Area too large. ${totalTiles} tiles requested (Limit: ${MAX_TILES_PER_DOWNLOAD}). Please zoom in.`);
    }

    const cache = await caches.open(CACHE_NAME);
    let downloaded = 0;

    const tileUrls: string[] = [];

    // Generate all URLs first
    for (let z = minZoom; z <= maxZoom; z++) {
        const left = long2tile(bounds.west, z);
        const right = long2tile(bounds.east, z);
        const top = lat2tile(bounds.north, z);
        const bottom = lat2tile(bounds.south, z);

        for (let x = left; x <= right; x++) {
            for (let y = top; y <= bottom; y++) {
                // OSM URL
                tileUrls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
                
                // Carto Dark URL (We cache the 'a' subdomain variant for consistency)
                tileUrls.push(`https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`);
                tileUrls.push(`https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`);
            }
        }
    }

    const totalRequests = tileUrls.length;

    // Batch requests to avoid overwhelming network
    const BATCH_SIZE = 20;
    
    for (let i = 0; i < tileUrls.length; i += BATCH_SIZE) {
        const batch = tileUrls.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (url) => {
            try {
                // Check if already in cache
                const match = await cache.match(url);
                if (!match) {
                    await cache.add(url);
                }
            } catch (e) {
                console.warn("Failed to download tile:", url);
            } finally {
                downloaded++;
            }
        }));
        
        onProgress(downloaded, totalRequests);
    }
};
