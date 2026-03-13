const OPEN_ELEVATION_API_URL = 'https://api.open-elevation.com/api/v1/lookup';
const OPEN_METEO_API_URL = 'https://api.open-meteo.com/v1/elevation';

const MAX_POINTS_PER_REQUEST = 50; // Reduced to prevent timeouts
const MAX_RETRIES = 1;
const INITIAL_BACKOFF_MS = 2000;
const REQUEST_TIMEOUT_MS = 10000; // 10-second timeout for requests
const TARGET_POINTS_FOR_PROFILE = 400; // Optimization: We'll downsample to this many points for long routes.

interface ElevationResult {
    latitude: number;
    longitude: number;
    elevation: number;
}

interface ElevationResponse {
    results: ElevationResult[];
}

/**
 * Linearly interpolates a number array to a new, larger length.
 * @param source The original array of numbers.
 * @param newLength The target length for the new array.
 * @returns A new array of numbers with interpolated values.
 */
const interpolate = (source: number[], newLength: number): number[] => {
    // If there's nothing to interpolate from, return an array of zeros.
    if (source.length === 0) {
        return new Array(newLength).fill(0);
    }
    // If there's only one point, create a flat line.
    if (source.length === 1) {
        return new Array(newLength).fill(source[0]);
    }
    // If lengths match, no interpolation needed.
    if (source.length === newLength) {
        return source;
    }

    const result = new Array(newLength);
    const sourceLen = source.length;
    const ratio = (sourceLen - 1) / (newLength - 1);

    for (let i = 0; i < newLength; i++) {
        const sourceIndex = i * ratio;
        const lowIndex = Math.floor(sourceIndex);
        const highIndex = Math.ceil(sourceIndex);
        
        // Handle edge case for the very last element to prevent out-of-bounds.
        if (highIndex >= sourceLen) {
            result[i] = source[sourceLen - 1];
            continue;
        }
        
        if (lowIndex === highIndex) {
            result[i] = source[lowIndex];
        } else {
            // Standard linear interpolation formula
            const weight = sourceIndex - lowIndex;
            const val1 = source[lowIndex];
            const val2 = source[highIndex];
            result[i] = val1 * (1 - weight) + val2 * weight;
        }
    }
    return result;
};

type ElevationFetcher = (locations: {latitude: number, longitude: number}[], signal: AbortSignal) => Promise<number[]>;

const fetchFromOpenElevation: ElevationFetcher = async (locations, signal) => {
    const response = await fetch(OPEN_ELEVATION_API_URL, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json' 
        },
        body: JSON.stringify({ locations }),
        signal,
    });

    if (!response.ok) {
        throw new Error(`Open-Elevation API error with status ${response.status}`);
    }

    const data: ElevationResponse = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
        throw new Error("Invalid response format from Open-Elevation API");
    }
    return data.results.map(result => result.elevation);
};

const fetchFromOpenMeteo: ElevationFetcher = async (locations, signal) => {
    const lats = locations.map(l => l.latitude).join(',');
    const longs = locations.map(l => l.longitude).join(',');
    const url = `${OPEN_METEO_API_URL}?latitude=${lats}&longitude=${longs}`;

    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(`Open-Meteo API error with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.elevation || !Array.isArray(data.elevation)) {
        throw new Error("Invalid response format from Open-Meteo API");
    }
    return data.elevation;
};

// Mapbox Tile Math
const lon2tile = (lon: number, zoom: number) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
const lat2tile = (lat: number, zoom: number) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
const lon2pixel = (lon: number, zoom: number, tileX: number) => Math.floor(((lon + 180) / 360 * Math.pow(2, zoom) - tileX) * 256);
const lat2pixel = (lat: number, zoom: number, tileY: number) => Math.floor(((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom) - tileY) * 256);

const fetchFromMapbox: ElevationFetcher = async (locations, signal) => {
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
        throw new Error("VITE_MAPBOX_ACCESS_TOKEN is not defined");
    }

    const zoom = 14;
    
    // Group locations by tile to minimize requests
    const tilesToFetch = new Map<string, { x: number, y: number, z: number }>();
    locations.forEach(loc => {
        const tx = lon2tile(loc.longitude, zoom);
        const ty = lat2tile(loc.latitude, zoom);
        const key = `${zoom}/${tx}/${ty}`;
        if (!tilesToFetch.has(key)) {
            tilesToFetch.set(key, { x: tx, y: ty, z: zoom });
        }
    });

    const tileData = new Map<string, ImageData>();
    
    // Fetch all required tiles in parallel
    const fetchResults = await Promise.allSettled(
        Array.from(tilesToFetch.values()).map(async (tile) => {
        const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tile.z}/${tile.x}/${tile.y}.pngraw?access_token=${token}`;
        
        const response = await fetch(url, { signal });
        if (!response.ok) {
            throw new Error(`Mapbox API error: ${response.status}`);
        }
        
        const blob = await response.blob();
        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, 256, 256);
        URL.revokeObjectURL(img.src);
        
        tileData.set(`${tile.z}/${tile.x}/${tile.y}`, imageData);
        })
    );

    // If any tile failed, throw so the caller falls through to the next provider
    const failed = fetchResults.find(r => r.status === 'rejected');
    if (failed) {
        throw (failed as PromiseRejectedResult).reason;
    }

    // Decode elevation from RGB values
    return locations.map(loc => {
        const tx = lon2tile(loc.longitude, zoom);
        const ty = lat2tile(loc.latitude, zoom);
        const key = `${zoom}/${tx}/${ty}`;
        
        const imageData = tileData.get(key);
        if (!imageData) return 0; // Fallback if tile data is missing
        
        let px = lon2pixel(loc.longitude, zoom, tx);
        let py = lat2pixel(loc.latitude, zoom, ty);
        
        // Clamp to 0-255 to ensure we don't read out of bounds
        px = Math.max(0, Math.min(255, px));
        py = Math.max(0, Math.min(255, py));
        
        const index = (py * 256 + px) * 4;
        const r = imageData.data[index];
        const g = imageData.data[index + 1];
        const b = imageData.data[index + 2];
        
        return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
    });
};

const PROVIDERS = [
    { name: 'Open-Meteo', fetcher: fetchFromOpenMeteo },
    { name: 'Open-Elevation', fetcher: fetchFromOpenElevation },
    { name: 'Mapbox-Terrain-RGB', fetcher: fetchFromMapbox }
];

/**
 * Fetches the elevation profile for a given array of coordinates.
 * For performance, if the route has more than TARGET_POINTS_FOR_PROFILE coordinates,
 * it fetches a downsampled version and interpolates the results.
 * @param coordinates An array of [longitude, latitude] pairs.
 * @returns A promise that resolves to an array of elevation values in meters.
 */
export const getElevationProfile = async (coordinates: [number, number][]): Promise<number[]> => {
    const originalLength = coordinates.length;
    if (originalLength === 0) return [];

    let coordsToFetch = coordinates;
    const needsInterpolation = originalLength > TARGET_POINTS_FOR_PROFILE;

    if (needsInterpolation) {
        const step = Math.ceil(originalLength / TARGET_POINTS_FOR_PROFILE);
        coordsToFetch = coordinates.filter((_, i) => i % step === 0);
        // Ensure the last point is always included for accurate interpolation range.
        if ((originalLength - 1) % step !== 0) {
            coordsToFetch.push(coordinates[originalLength - 1]);
        }
    }

    const fetchedElevations: number[] = [];
    
    // Process coordinates in chunks to avoid exceeding API limits
    for (let i = 0; i < coordsToFetch.length; i += MAX_POINTS_PER_REQUEST) {
        const chunk = coordsToFetch.slice(i, i + MAX_POINTS_PER_REQUEST);
        const locations = chunk.map(coord => ({ latitude: coord[1], longitude: coord[0] }));

        let chunkSuccess = false;

        // Try providers in order
        for (const provider of PROVIDERS) {
            if (chunkSuccess) break;

            // Retry logic for the current provider
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    try {
        const elevations = await provider.fetcher(locations, signal);
        fetchedElevations.push(...elevations);
        chunkSuccess = true;
        break;
    } catch (error: any) {
        const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
        const errorMessage = error.message || error;

        console.warn(`[${provider.name}] Attempt ${attempt + 1} failed: ${isTimeout ? 'Timeout' : errorMessage}`);

        if (attempt < MAX_RETRIES - 1) {
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

        }
        
        if (!chunkSuccess) {
            console.error(`Could not fetch elevation data for chunk starting at ${i} after trying all providers.`);
            // Use last known elevation for fallback to avoid sharp drops to 0.
            const lastKnownElevation = fetchedElevations.length > 0 ? fetchedElevations[fetchedElevations.length - 1] : 0;
            const fallbackElevations = new Array(chunk.length).fill(lastKnownElevation);
            fetchedElevations.push(...fallbackElevations);
        }
    }
    
    if (needsInterpolation) {
        return interpolate(fetchedElevations, originalLength);
    }
    
    return fetchedElevations;
};
