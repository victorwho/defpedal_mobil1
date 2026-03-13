import React, { useMemo } from 'react';
import type { Step } from '../types';
import { haversineDistance } from '../utils/distance';
import { formatInstruction, formatManeuver, formatDistance, formatSpeed } from '../utils/formatters';
import {
    ArrowUpIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpLeftIcon, ArrowUpRightIcon,
    MountainIcon, ClockIcon, MapPinIcon, SpeedometerIcon
} from './Icons';

interface NavigationUIProps {
  step: Step;
  userLocation: { latitude: number; longitude: number };
  currentStepElevationProfile: number[] | null;
}

interface NavigationFooterProps {
  nextStep: Step | null;
  remainingDurationSeconds: number;
  remainingClimbMeters: number;
  remainingDistanceMeters: number;
  remainingElevationProfile: number[] | null;
  currentSpeed: number | null;
}

const getManeuverIcon = (type: string, modifier?: string) => {
    switch(type) {
        case 'turn':
        case 'fork':
        case 'off ramp':
            if (modifier?.includes('left')) return <ArrowLeftIcon />;
            if (modifier?.includes('right')) return <ArrowRightIcon />;
            break;
        case 'new name':
        case 'continue':
            if (modifier?.includes('slight left')) return <ArrowUpLeftIcon />;
            if (modifier?.includes('slight right')) return <ArrowUpRightIcon />;
            return <ArrowUpIcon />;
        case 'depart':
            return <ArrowUpIcon />;
    }
    return <ArrowUpIcon />;
}

// Helper to render the icon with a yellow fill and black outline
const renderLayeredIcon = (icon: React.ReactElement<{ className?: string; strokeWidth?: number }>, sizeClass: string, outlineStroke: number, fillStroke: number) => (
    <div className={`relative ${sizeClass}`}>
         {/* Outline Layer */}
         <div className="absolute inset-0 text-black z-0">
             {React.cloneElement(icon, { className: sizeClass, strokeWidth: outlineStroke })}
         </div>
         {/* Fill Layer */}
         <div className="absolute inset-0 text-yellow-400 z-10">
             {React.cloneElement(icon, { className: sizeClass, strokeWidth: fillStroke })}
         </div>
    </div>
);

/**
 * A small component to render a sparkline graph for the elevation profile.
 */
const ElevationProfileGraph: React.FC<{ data: number[], className?: string }> = ({ data, className="w-16 h-4" }) => {
    if (!data || data.length < 2) return null;

    const width = 100;
    const height = 20;
    const strokeWidth = 2;

    const minElevation = Math.min(...data);
    const maxElevation = Math.max(...data);
    const elevationRange = maxElevation - minElevation;
    
    // Handle flat terrain
    if (elevationRange === 0) {
        return (
            <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none">
                <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#6b7280" strokeWidth={strokeWidth} strokeLinecap="round" />
            </svg>
        );
    }

    const points = data.map((elevation, index) => {
        const x = (index / (data.length - 1)) * width;
        // Invert Y coordinate and add padding for stroke width
        const y = (height - strokeWidth) - ((elevation - minElevation) / elevationRange) * (height - strokeWidth) + (strokeWidth / 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none" aria-hidden="true">
            <polyline
                points={points}
                fill="none"
                stroke="#6b7280" // text-gray-500
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};


const NavigationUI: React.FC<NavigationUIProps> = ({ step, userLocation, currentStepElevationProfile }) => {
    const nextManeuverLocation = [...step.maneuver.location].reverse() as [number, number];
    const distanceToNextManeuver = haversineDistance(
        [userLocation.latitude, userLocation.longitude],
        nextManeuverLocation
    );

    const formattedDistance = formatDistance(distanceToNextManeuver);
  
    const maneuverText = formatManeuver(step);
    
    return (
        <div className="w-full max-w-md bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 flex items-center gap-4">
                <div className="flex-shrink-0">
                    {renderLayeredIcon(
                        getManeuverIcon(step.maneuver.type, step.maneuver.modifier),
                        'w-12 h-12',
                        5,
                        2.5
                    )}
                </div>
                <div className="flex-grow min-w-0">
                    <p className="text-3xl font-bold text-gray-800">
                        {formattedDistance}
                    </p>
                    {currentStepElevationProfile && currentStepElevationProfile.length > 1 && (
                        <div className="my-2">
                           <ElevationProfileGraph data={currentStepElevationProfile} className="w-full h-6" />
                        </div>
                    )}
                    {step.name && step.name.trim() !== '' ? (
                        <>
                            <p className="text-xl font-bold text-gray-800 truncate" title={step.name}>
                                {step.name}
                            </p>
                            <div className="flex items-center gap-2 text-gray-600">
                                {React.cloneElement(getManeuverIcon(step.maneuver.type, step.maneuver.modifier), { className: 'w-5 h-5 flex-shrink-0' })}
                                <p className="text-base font-medium truncate">
                                    {maneuverText}
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2 text-gray-700">
                           {React.cloneElement(getManeuverIcon(step.maneuver.type, step.maneuver.modifier), { className: 'w-5 h-5 flex-shrink-0' })}
                           <p className="text-lg font-medium truncate">
                               {maneuverText}
                           </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const NavigationFooter: React.FC<NavigationFooterProps> = ({ nextStep, remainingDurationSeconds, remainingClimbMeters, remainingDistanceMeters, remainingElevationProfile, currentSpeed }) => {
    const formattedETA = useMemo(() => {
        if (remainingDurationSeconds <= 0) return null;
        
        const etaDate = new Date(Date.now() + remainingDurationSeconds * 1000);
        return etaDate.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });
    }, [remainingDurationSeconds]);
    
    const formattedRemainingDistance = (remainingDistanceMeters / 1000).toFixed(1);
    const formattedSpeed = useMemo(() => formatSpeed(currentSpeed), [currentSpeed]);

    if (!nextStep && !formattedETA && !(remainingDistanceMeters > 0) && !(remainingClimbMeters > 0)) {
        return null;
    }

    return (
        <div className="w-full max-w-md bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden">
            {nextStep && (
                <div className="p-2 border-t border-gray-200 flex items-center gap-3 bg-gray-50">
                    <div className="flex-shrink-0">
                        {renderLayeredIcon(
                            getManeuverIcon(nextStep.maneuver.type, nextStep.maneuver.modifier),
                            'w-6 h-6',
                            3.5,
                            2
                        )}
                    </div>
                    <div className="flex-grow min-w-0 flex justify-between items-center gap-2">
                        <p className="text-sm text-gray-600 font-medium truncate">
                           Then: {formatInstruction(nextStep)}
                        </p>
                        <p className="text-sm text-gray-800 font-semibold flex-shrink-0">
                            {formatDistance(nextStep.distance)}
                        </p>
                    </div>
                </div>
            )}

            {(formattedETA || remainingDistanceMeters > 0 || remainingClimbMeters > 0) && (
                <div className="p-2 bg-gray-100 border-t border-gray-200 flex justify-around items-center">
                    {formattedSpeed && (
                        <p className="text-center text-sm text-gray-700 flex items-center gap-1.5">
                            <SpeedometerIcon className="w-4 h-4" />
                            <span className="font-bold">{formattedSpeed}</span>
                        </p>
                    )}
                    {formattedETA && (
                        <p className="text-center text-sm text-gray-700 flex items-center gap-1.5">
                            <ClockIcon className="w-4 h-4" />
                            <span>Arrival: <span className="font-bold">{formattedETA}</span></span>
                        </p>
                    )}
                    {remainingDistanceMeters > 0 && (
                        <p className="text-center text-sm text-gray-700 flex items-center gap-1.5">
                            <MapPinIcon className="w-4 h-4" />
                            <span>Distance: <span className="font-bold">{formattedRemainingDistance} km</span></span>
                        </p>
                    )}
                    {remainingClimbMeters > 0 && (
                         <div className="text-center text-sm text-gray-700 flex items-center gap-1.5">
                            <MountainIcon className="w-4 h-4" />
                            <span>Climb: <span className="font-bold">{Math.round(remainingClimbMeters)} m</span></span>
                            {remainingElevationProfile && <ElevationProfileGraph data={remainingElevationProfile} className="w-10 h-4 ml-1" />}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NavigationUI;