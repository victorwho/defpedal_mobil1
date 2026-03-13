import React from 'react';

const RiskLegend: React.FC = () => {
  return (
    <div className="bg-white/90 backdrop-blur-sm shadow-lg rounded-lg p-3 text-xs text-gray-800 border border-gray-200 pointer-events-auto">
      <h4 className="font-bold mb-2 text-gray-900 border-b pb-1">Risk Level</h4>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#4CAF50] shadow-sm"></div>
          <span>Very Safe</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#8BC34A] shadow-sm"></div>
          <span>Safe</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#FFEB3B] shadow-sm"></div>
          <span>Average</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#FF9800] shadow-sm"></div>
          <span>Elevated</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#FF5722] shadow-sm"></div>
          <span>Risky</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#F44336] shadow-sm"></div>
          <span>Very Risky</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#000000] shadow-sm"></div>
          <span>Extreme</span>
        </div>
      </div>
    </div>
  );
};

export default RiskLegend;
