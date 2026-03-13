import React from 'react';

export const Logo = ({ className = "w-12 h-12" }: { className?: string }) => (
    <div className={`shadow-lg rounded-full ${className} overflow-hidden bg-white flex items-center justify-center`}>
        <img 
            src="https://i.ibb.co/RkpnNLM0/notext-yellow.png" 
            alt="Defensive Pedal logo" 
            className="w-full h-full object-contain"
            onError={(e) => {
                const target = e.target as HTMLImageElement;
                console.error('Logo failed to load from:', target.src);
                
            }}
        />
    </div>
);