import type { Step } from '../types';

export const formatManeuver = (step: Step): string => {
    const { type, modifier } = step.maneuver;
    let instruction = type.replace(/_/g, ' ');

    if (modifier) {
        instruction = `${modifier.replace(/_/g, ' ')}`;
    }
    
    // Capitalize first letter
    return instruction.charAt(0).toUpperCase() + instruction.slice(1);
};

export const formatInstruction = (step: Step): string => {
    const maneuver = formatManeuver(step);

    if (step.name && step.name.trim() !== '') {
        return `${maneuver} onto ${step.name}`;
    }
    return maneuver;
}

export const formatDistance = (distanceMeters: number): string => {
    if (distanceMeters < 1000) {
        return `${Math.round(distanceMeters)} m`;
    }
    return `${(distanceMeters / 1000).toFixed(1)} km`;
};

export const formatDuration = (totalSeconds: number): string => {
    if (totalSeconds < 60) {
        return `< 1 min`;
    }
    const minutes = Math.round(totalSeconds / 60);
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
        return `${hours} hr`;
    }
    return `${hours} hr ${remainingMinutes} min`;
};

export const formatSpeed = (speedMetersPerSecond: number | null): string | null => {
    // Threshold (e.g., ~1.8 km/h) to avoid showing "0 km/h" when stationary or moving very slowly.
    if (speedMetersPerSecond === null || speedMetersPerSecond < 0.5) {
        return null;
    }
    const speedKmh = Math.round(speedMetersPerSecond * 3.6);
    return `${speedKmh} km/h`;
};
