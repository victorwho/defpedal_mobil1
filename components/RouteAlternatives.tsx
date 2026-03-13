import React from 'react';
import type { Route } from '../types';
import { formatDistance, formatDuration } from '../utils/formatters';

interface RouteAlternativesProps {
  routes: Route[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const RouteAlternatives: React.FC<RouteAlternativesProps> = ({ routes, selectedIndex, onSelect }) => {
  if (routes.length <= 1) {
    return null;
  }

  return (
    <div className="flex justify-center gap-2 mb-3">
      {routes.map((route, index) => (
        <button
          key={index}
          onClick={() => onSelect(index)}
          className={`px-4 py-2 rounded-lg shadow-md transition-all text-sm ${
            selectedIndex === index
              ? 'bg-blue-600 text-white scale-105'
              : 'bg-white text-gray-800 hover:bg-gray-100'
          }`}
        >
          <div className="font-bold text-base">{formatDuration(route.duration)}</div>
          <div className="text-xs">{formatDistance(route.distance)}</div>
        </button>
      ))}
    </div>
  );
};

export default RouteAlternatives;
