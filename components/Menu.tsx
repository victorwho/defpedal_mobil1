
import React, { useState } from 'react';
import { XIcon, ShieldIcon, LightningIcon, DownloadIcon, CheckCircleIcon, UserIcon, LogOutIcon } from './Icons';

interface MenuProps {
  isOpen: boolean;
  onClose: () => void;
  preference: 'safe' | 'fast';
  onPreferenceChange: (pref: 'safe' | 'fast') => void;
  avoidUnpaved: boolean;
  onAvoidUnpavedChange: (value: boolean) => void;
  onDownloadMap: (callback: (current: number, total: number) => void) => Promise<void>;
  session: any;
  onLogin: () => void;
  onLogout: () => void;
}

const Menu: React.FC<MenuProps> = ({
    isOpen,
    onClose,
    preference,
    onPreferenceChange,
    avoidUnpaved,
    onAvoidUnpavedChange,
    onDownloadMap,
    session,
    onLogin,
    onLogout
}) => {
  const [downloadProgress, setDownloadProgress] = useState<{current: number, total: number} | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleDownloadClick = async () => {
    setDownloadStatus('downloading');
    setErrorMessage('');
    
    try {
        await onDownloadMap((current: number, total: number) => {
            setDownloadProgress({ current, total });
        });
        setDownloadStatus('success');
        setTimeout(() => setDownloadStatus('idle'), 3000);
    } catch (e: any) {
        setDownloadStatus('error');
        setErrorMessage(e.message || "Download failed");
    }
  };

  if (!isOpen) return null;

  const progressPercentage = downloadProgress && downloadProgress.total > 0 
      ? Math.round((downloadProgress.current / downloadProgress.total) * 100) 
      : 0;

  return (
    <div className="fixed inset-0 z-[2000] bg-gray-900 flex flex-col text-white animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900 shadow-sm">
             <h2 className="text-2xl font-bold tracking-tight text-yellow-400">Menu</h2>
             <button 
                onClick={onClose}
                className="p-2 rounded-full bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition"
                aria-label="Close menu"
             >
                 <XIcon className="w-6 h-6" />
             </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">

            {/* Profile Section */}
            {session ? (
                <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 max-w-md mx-auto">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-3 rounded-full shadow-inner">
                            <UserIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Logged in as</p>
                            <p className="text-white font-medium truncate text-lg">{session.user.email}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => {
                            onLogout();
                            onClose();
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 px-4 rounded-lg transition-colors text-sm font-semibold"
                    >
                        <LogOutIcon className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            ) : (
                <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 max-w-md mx-auto text-center">
                    <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3 text-yellow-400">
                        <UserIcon className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">Account</h3>
                    <p className="text-sm text-gray-400 mb-4">
                        Sign in to save your history and sync settings.
                    </p>
                    <button 
                        onClick={() => {
                            onLogin();
                        }}
                        className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 px-4 rounded-lg transition-colors shadow-md"
                    >
                        Log In / Sign Up
                    </button>
                </div>
            )}
            
            {/* Preferences Section */}
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 max-w-md mx-auto">
                <h3 className="text-lg font-medium text-gray-200 mb-6 text-center">
                    Preference for safety vs speed
                </h3>
                
                <div className="px-2">
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="1"
                        value={preference === 'fast' ? 1 : 0}
                        onChange={(e) => onPreferenceChange(parseInt(e.target.value) === 1 ? 'fast' : 'safe')}
                        className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/50"
                    />
                    
                    <div className="flex justify-between mt-5">
                        {/* Safe Option */}
                        <div 
                            className={`flex flex-col items-center gap-2 cursor-pointer transition-all duration-300 ${preference === 'safe' ? 'opacity-100 scale-105' : 'opacity-60 grayscale'}`}
                            onClick={() => onPreferenceChange('safe')}
                        >
                            <ShieldIcon className="w-8 h-8 text-yellow-400" />
                            <span className="text-sm font-bold uppercase tracking-wider text-yellow-400">Safe</span>
                        </div>

                        {/* Fast Option */}
                        <div 
                            className={`flex flex-col items-center gap-2 cursor-pointer transition-all duration-300 ${preference === 'fast' ? 'opacity-100 scale-105' : 'opacity-60 grayscale'}`}
                            onClick={() => onPreferenceChange('fast')}
                        >
                            <LightningIcon className="w-8 h-8 text-red-500" />
                            <span className="text-sm font-bold uppercase tracking-wider text-red-500">Fast</span>
                                        </div>
                            </div>
                        </div>
                {/* Avoid Unpaved toggle — only relevant in Safe mode */}
                <div className={`mt-6 pt-5 border-t border-gray-700 transition-opacity duration-300 ${preference === 'safe' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={avoidUnpaved}
                            onChange={(e) => onAvoidUnpavedChange(e.target.checked)}
                            disabled={preference !== 'safe'}
                            className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-yellow-400 focus:ring-yellow-400/50 focus:ring-2 cursor-pointer accent-yellow-400"
                        />
                        <div>
                            <span className="text-sm font-medium text-gray-200">Avoid unpaved roads</span>
                            <p className="text-xs text-gray-500 mt-0.5">Skip gravel, dirt, and other unpaved surfaces</p>
                        </div>
                    </label>

                </div>
            </div>

            {/* Offline Maps Section */}
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 max-w-md mx-auto">
                <h3 className="text-lg font-medium text-gray-200 mb-4 text-center flex items-center justify-center gap-2">
                    Offline Maps
                </h3>
                
                <p className="text-sm text-gray-400 text-center mb-6">
                    Download the current map area to navigate without an internet connection.
                </p>

                {downloadStatus === 'idle' && (
                    <button
                        onClick={handleDownloadClick}
                        className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        <DownloadIcon className="w-5 h-5" />
                        Download Current Area
                    </button>
                )}

                {downloadStatus === 'downloading' && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>Downloading tiles...</span>
                            <span>{progressPercentage}%</span>
                        </div>
                        <div className="w-full bg-gray-900 rounded-full h-2.5 overflow-hidden">
                            <div 
                                className="bg-yellow-400 h-2.5 rounded-full transition-all duration-300" 
                                style={{ width: `${progressPercentage}%` }}
                            ></div>
                        </div>
                        <p className="text-center text-xs text-gray-500 mt-1">
                            {downloadProgress?.current} / {downloadProgress?.total} tiles
                        </p>
                    </div>
                )}

                {downloadStatus === 'success' && (
                    <div className="flex flex-col items-center text-green-400 animate-fade-in">
                        <CheckCircleIcon className="w-12 h-12 mb-2" />
                        <span className="font-bold">Download Complete!</span>
                    </div>
                )}

                {downloadStatus === 'error' && (
                    <div className="text-center">
                        <p className="text-red-400 text-sm mb-3">{errorMessage}</p>
                        <button
                            onClick={handleDownloadClick}
                            className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-2 px-4 rounded-lg"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default Menu;
