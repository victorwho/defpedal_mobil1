
import { Route } from '../types';

export interface RouteComposition {
    label: string;
    distance: number;
    color: string;
    percentage: number;
}

export interface RouteAnalysis {
    elevationGain: number;
    elevationLoss: number;
    composition: RouteComposition[];
    riskScore: number;
    distance: number;
    numberOfClimbs: number;
    adjustedDuration: number;
}

const HILL_START_PENALTY_SEC = 10;
const ELEVATION_TIME_FACTOR = 0.75; // sec/m
const CLIMB_THRESHOLD_M = 2; // Minimum gain to count as a "climb"

/**
 * Calculates the adjusted duration based on the algorithm:
 * time = flat_time + (elevation_gain_m × 0.75 sec/m) + hill_start_penalty × number_of_climbs
 */
export const getAdjustedDuration = (flatDuration: number, elevationProfile: number[] | null): { adjustedDuration: number, numberOfClimbs: number, elevationGain: number } => {
    let elevationGain = 0;
    let numberOfClimbs = 0;
    let currentClimbGain = 0;

    if (elevationProfile && elevationProfile.length > 1) {
        for (let i = 1; i < elevationProfile.length; i++) {
            const diff = elevationProfile[i] - elevationProfile[i - 1];
            if (diff > 0) {
                elevationGain += diff;
                currentClimbGain += diff;
            } else if (diff < 0) {
                if (currentClimbGain > CLIMB_THRESHOLD_M) {
                    numberOfClimbs++;
                }
                currentClimbGain = 0;
            }
        }
        // Handle the last climb if the profile ends on an incline
        if (currentClimbGain > CLIMB_THRESHOLD_M) {
            numberOfClimbs++;
        }
    }

    const adjustedDuration = flatDuration + (elevationGain * ELEVATION_TIME_FACTOR) + (numberOfClimbs * HILL_START_PENALTY_SEC);
    
    return { adjustedDuration, numberOfClimbs, elevationGain };
};

// Classification helper for OSM highway tags
const classifyHighway = (tag: string): { label: string; color: string } => {
    const t = tag.toLowerCase().trim();
    
    // 1. Cycleways & Dedicated Infra
    if (t.includes('cycleway') || t === 'bicycle') return { label: 'Cycleway', color: '#3b82f6' }; // Blue 500
    
    // 2. Paths & Pedestrian
    if (['path', 'footway', 'pedestrian', 'steps', 'corridor', 'bridleway'].includes(t)) return { label: 'Path', color: '#10b981' }; // Emerald 500
    
    // 3. Low Traffic / Local
    if (['residential', 'living_street', 'service', 'road'].includes(t)) return { label: 'Residential', color: '#9ca3af' }; // Gray 400
    
    // 4. Tracks / Unpaved likely
    if (['track', 'dirt', 'unpaved'].includes(t)) return { label: 'Track', color: '#d97706' }; // Amber 600

    // 5. Main Roads
    if (['tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link', 'trunk', 'trunk_link', 'motorway', 'motorway_link'].includes(t)) {
        return { label: 'Main Road', color: '#f59e0b' }; // Amber 500
    }
    
    // 6. Special
    if (t === 'ferry') return { label: 'Ferry', color: '#0ea5e9' }; // Sky 500
    if (t === 'train') return { label: 'Train', color: '#a855f7' }; // Purple 500
    if (t === 'pushing bike' || t === 'pushing') return { label: 'Pushing', color: '#ef4444' }; // Red 500

    return { label: 'Road', color: '#6b7280' }; // Gray 500
};

export const analyzeRoute = (route: Route, elevationProfile: number[] | null): RouteAnalysis => {
    const { adjustedDuration, numberOfClimbs, elevationGain } = getAdjustedDuration(route.duration, elevationProfile);

    let elevationLoss = 0;
    if (elevationProfile && elevationProfile.length > 1) {
        for (let i = 1; i < elevationProfile.length; i++) {
            const diff = elevationProfile[i] - elevationProfile[i - 1];
            if (diff < 0) {
                elevationLoss += Math.abs(diff);
            }
        }
    }

    // 2. Composition Analysis (Highway Tag Breakdown)
    const categoryMap = new Map<string, { distance: number; color: string }>();
    const totalDist = route.distance;

    const hasClasses = route.legs[0].annotation?.classes && route.legs[0].annotation.classes.length > 0;
    const annotation = route.legs[0].annotation;

    if (hasClasses && annotation?.distance) {
         const classes = annotation.classes!;
         const distances = annotation.distance;
         
         for(let i = 0; i < Math.min(classes.length, distances.length); i++) {
             const rawTag = classes[i] || 'unclassified';
             const { label, color } = classifyHighway(rawTag);
             
             const current = categoryMap.get(label) || { distance: 0, color };
             categoryMap.set(label, { distance: current.distance + distances[i], color });
         }
    } else {
        route.legs.forEach(leg => {
            leg.steps.forEach(step => {
                let rawTag = 'unclassified';
                const mode = step.mode.toLowerCase();
                const name = step.name.toLowerCase();
                
                if (mode === 'cycling') {
                    if (name.includes('path') || name.includes('trail') || name.includes('ravel') || name.includes('greenway')) rawTag = 'path';
                    else if (name.includes('cycle') || name.includes('pista')) rawTag = 'cycleway';
                    else rawTag = 'residential';
                } 
                else if (mode === 'pushing bike') rawTag = 'pushing';
                else if (mode === 'ferry') rawTag = 'ferry';
                else if (mode === 'train') rawTag = 'train';
                else if (mode === 'driving') rawTag = 'primary';
                
                const { label, color } = classifyHighway(rawTag);
                const current = categoryMap.get(label) || { distance: 0, color };
                categoryMap.set(label, { distance: current.distance + step.distance, color });
            });
        });
    }

    const composition: RouteComposition[] = [];
    categoryMap.forEach((val, label) => {
        if (val.distance > 0) {
            composition.push({
                label: label,
                distance: val.distance,
                percentage: totalDist > 0 ? (val.distance / totalDist) * 100 : 0,
                color: val.color
            });
        }
    });

    composition.sort((a, b) => b.distance - a.distance);

    return {
        elevationGain,
        elevationLoss,
        composition,
        riskScore: route.weight || 0,
        distance: route.distance,
        numberOfClimbs,
        adjustedDuration
    };
};
