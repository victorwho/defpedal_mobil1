
import React, { useState, useEffect, useRef } from 'react';

// Remote Imgur URLs for the onboarding screens (converted to MP4 for animation).
// IDs extracted from provided URLs:
// UfKJ4Hw, yQGHKwP, 9VpdnrR, jNhshPf, wTn2g76, x1g6LGT, Jc3zZ9R, DrS5ZiT, WBD0vtb
const ONBOARDING_STEPS = [
  "https://i.imgur.com/UfKJ4Hw.mp4",
  "https://i.imgur.com/yQGHKwP.mp4",
  "https://i.imgur.com/9VpdnrR.mp4",
  "https://i.imgur.com/jNhshPf.mp4", // Location request step (Index 3)
  "https://i.imgur.com/wTn2g76.mp4",
  "https://i.imgur.com/x1g6LGT.mp4",
  "https://i.imgur.com/Jc3zZ9R.mp4",
  "https://i.imgur.com/DrS5ZiT.mp4",
  "https://i.imgur.com/WBD0vtb.mp4"
];

interface OnboardingProps {
  onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setIsVideoLoaded(false);
    setMediaError(false);
  }, [currentStep]);

  // Check permission status when reaching the location step
  useEffect(() => {
    if (currentStep === 3) {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' as PermissionName })
          .then((result) => {
             setPermissionState(result.state);
             // Update state if user changes it via browser UI while on this screen
             result.onchange = () => {
               setPermissionState(result.state);
             };
          })
          .catch(() => {
             // Fallback for browsers that might not support the query or throw on 'geolocation'
             setPermissionState(null); 
          });
      }
    }
  }, [currentStep]);

  const handleNext = async () => {
    // Step Index 3 corresponds to the Location Request slide (4th screen)
    if (currentStep === 3) {
      setIsRequestingLocation(true);
      if ('geolocation' in navigator) {
        try {
          // Request location access. We wait for the user to accept/deny or for a timeout.
          // This triggers the browser permission prompt if not already granted.
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              () => resolve(),
              (err) => {
                console.warn('Location permission denied or error:', err);
                resolve(); 
              },
              { enableHighAccuracy: true, timeout: 8000 }
            );
          });
        } catch (e) {
          console.error(e);
        }
      }
      setIsRequestingLocation(false);
    }

    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const getButtonText = () => {
    if (isRequestingLocation) return "Enabling...";
    
    // On the 4th screen (index 3), customize text based on permission state
    if (currentStep === 3) {
        // If we know for sure it's granted, just say Next. 
        // If denied or prompt (or unknown), ask to Allow.
        if (permissionState === 'granted') {
            return "Next";
        }
        return "Allow Location Access";
    }

    if (currentStep === ONBOARDING_STEPS.length - 1) return "Start Riding";
    
    return "Next";
  };

  const currentSrc = ONBOARDING_STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-900 flex items-center justify-center overflow-hidden">
      <div className="relative w-full h-full max-w-md mx-auto bg-gray-800 shadow-2xl flex flex-col">
        
        {/* Loading Spinner */}
        {!isVideoLoaded && !mediaError && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
             <div className="flex flex-col items-center gap-4">
               <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
               <span className="text-yellow-400 font-bold tracking-wider text-sm animate-pulse">LOADING...</span>
             </div>
          </div>
        )}

        {mediaError ? (
           <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-900 text-white">
               <div className="text-6xl mb-6">🚲</div>
               <h3 className="text-2xl font-bold text-yellow-400 mb-2">Step {currentStep + 1}</h3>
               <p className="text-gray-400 mb-8 max-w-xs mx-auto">
                   Explore the features of Defensive Pedal.
               </p>
               <button
                   onClick={handleNext}
                   className="bg-yellow-400 text-black px-8 py-3 rounded-full font-bold shadow-lg hover:bg-yellow-500 transition"
               >
                   Next
               </button>
           </div>
        ) : (
            <>
                <video
                    key={currentSrc} // Force re-render on step change to ensure autoplay works reliably
                    ref={videoRef}
                    src={currentSrc}
                    className={`w-full h-full object-cover transition-opacity duration-500 ${isVideoLoaded ? 'opacity-100' : 'opacity-0'}`}
                    autoPlay
                    muted
                    loop
                    playsInline
                    onLoadedData={() => setIsVideoLoaded(true)}
                    onError={() => setMediaError(true)}
                />

                <div className="absolute bottom-6 left-0 right-0 px-4 flex justify-center pb-safe">
                    <button
                        onClick={handleNext}
                        disabled={isRequestingLocation}
                        className="w-full h-20 bg-yellow-400 hover:bg-yellow-500 text-black font-extrabold text-2xl tracking-wide rounded-full shadow-[0_4px_14px_0_rgba(250,204,21,0.5)] transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed border-2 border-black/10 flex items-center justify-center z-50"
                    >
                        {getButtonText()}
                    </button>
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
