
import React from 'react';
import type { RouteAnalysis } from '../utils/routeAnalysis';
import { MountainIcon, ShieldIcon, LightningIcon } from './Icons';

interface RouteSummaryProps {
    analysis: RouteAnalysis | null;
    mode: 'safe' | 'fast';
}

const RouteSummary: React.FC<RouteSummaryProps> = ({ analysis, mode }) => {
    if (!analysis) return null;

    const { elevationGain, riskScore, distance } = analysis;

    // Calculate Risk per Kilometer
    const distanceKm = distance / 1000;
    const riskPerKm = distanceKm > 0 ? riskScore / distanceKm : 0;

    let underlineClass = '';
    if (riskPerKm < 18) {
        underlineClass = 'decoration-green-500/50';
    } else if (riskPerKm < 25) {
        underlineClass = 'decoration-yellow-500/50';
    } else {
        underlineClass = 'decoration-orange-500/50';
    }

    return (
        <div className="w-full bg-white/95 backdrop-blur-sm shadow-lg rounded-xl p-5 mb-4 animate-fade-in border border-gray-100">
            {/* Header / Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                {/* Elevation Stats */}
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 rounded-full text-blue-600 flex-shrink-0">
                        <MountainIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest truncate">Total Climb</p>
                        <p className="text-xl font-extrabold text-gray-800">+{Math.round(elevationGain)} m</p>
                    </div>
                </div>

                {/* Risk Score (Safe Mode) or Fast Mode Indicator */}
                {mode === 'safe' ? (
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-yellow-50 rounded-full text-yellow-600 flex-shrink-0">
                            <ShieldIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest truncate">Risk Score</p>
                            <p className={`text-xl font-extrabold text-gray-800 underline decoration-4 underline-offset-4 ${underlineClass}`}>
                                {Math.round(riskScore).toLocaleString()}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-red-50 rounded-full text-red-600 flex-shrink-0">
                            <LightningIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest truncate">Routing Mode</p>
                            <p className="text-xl font-extrabold text-gray-800">Fast</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RouteSummary;
