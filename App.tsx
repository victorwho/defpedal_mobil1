
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Route, Step } from './types';
import { useGeolocation } from './hooks/useGeolocation';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { useWakeLock } from './hooks/useWakeLock';
import { usePWAUpdate } from './hooks/usePWAUpdate';
import { getRoute } from './services/osrm';
import { getElevationProfile } from './services/elevation';
import { reportHazard, submitFeedback, startTrip, endTrip, getCurrentSession, onAuthStateChange, signOut, getSegmentedRiskRoute } from './services/supabase';
import { reverseGeocode } from './services/nominatim';
import { formatInstruction, formatDistance, formatDuration } from './utils/formatters';
import { analyzeRoute, getAdjustedDuration, type RouteAnalysis } from './utils/routeAnalysis';
import MapWrapper, { type MapWrapperHandles } from './components/MapWrapper';
import Search from './components/Search';
import NavigationUI, { NavigationFooter } from './components/NavigationUI';
import RouteAlternatives from './components/RouteAlternatives';
import RouteSummary from './components/RouteSummary';
import FeedbackForm from './components/FeedbackForm';
import Onboarding from './components/Onboarding';
import Menu from './components/Menu';
import Auth from './components/Auth';
import FAQ from './components/FAQ';
import RiskLegend from './components/RiskLegend';
import { haversineDistance, findClosestPointIndex } from './utils/distance';
import { downloadRegion } from './services/offlineMaps';
import { SpeakerOnIcon, SpeakerOffIcon, CrosshairIcon, HazardIcon, XIcon, MoonIcon, MenuIcon, HelpIcon, ShieldIcon, LightningIcon } from './components/Icons';
import { Logo } from './components/Logo';  

type AppState = 'IDLE' | 'ROUTE_PREVIEW' | 'NAVIGATING' | 'AWAITING_FEEDBACK';
type NotificationType = { message: string; type: 'success' | 'error' };

const OFF_ROUTE_THRESHOLD_METERS = 50;
const REROUTE_TIMEOUT_MS = 60000; // 60 seconds

// Approximate bounding box for Romania (Widened to include border areas)
const isLocationInRomania = (lat: number, lon: number) => {
  return lat >= 43.0 && lat <= 49.0 && lon >= 20.0 && lon <= 30.0;
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [destinationName, setDestinationName] = useState<string>('');
  const [customStart, setCustomStart] = useState<{coords: [number, number], name: string} | null>(null);
  const [showStartSearch, setShowStartSearch] = useState(false);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  // Changed from single profile to array of profiles for all alternatives
  const [elevationProfiles, setElevationProfiles] = useState<(number[] | null)[]>([]);
  const [riskRoutes, setRiskRoutes] = useState<(any | null)[]>([]);
  const [routeAnalysis, setRouteAnalysis] = useState<RouteAnalysis | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showRerouteButton, setShowRerouteButton] = useState(false);
  const [offRouteDetails, setOffRouteDetails] = useState<{ user: [number, number]; closest: [number, number] } | null>(null);
  const [notification, setNotification] = useState<NotificationType | null>(null);
  const [routeInfoForFeedback, setRouteInfoForFeedback] = useState<{ start: [number, number]; distance: number; duration: number } | null>(null);
  const [hasAnnouncedApproach, setHasAnnouncedApproach] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFAQOpen, setIsFAQOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [routingPreference, setRoutingPreference] = useState<'safe' | 'fast'>('safe');
  const [avoidUnpaved, setAvoidUnpaved] = useState(false);
  const [session, setSession] = useState<any>(null);
  
  // Initialize state based on localStorage to prevent flash of content
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
        return !localStorage.getItem('onboarding_completed');
    } catch {
        return true;
    }
  });

  const sessionIdRef = useRef<string | null>(null);
  const tripIdRef = useRef<string | null>(null);
  const offRouteTimerRef = useRef<number | null>(null);
  const notificationTimerRef = useRef<number | null>(null);
  const mapWrapperRef = useRef<MapWrapperHandles>(null);


  const route: Route | null = useMemo(() => routes?.[selectedRouteIndex] ?? null, [routes, selectedRouteIndex]);
  const isNavigating = appState === 'NAVIGATING';
  const { location, error: locationError } = useGeolocation(isNavigating);
  const { speak, cancel } = useSpeechSynthesis();
  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const { updateAvailable, updateApp } = usePWAUpdate();

  const handleOnboardingComplete = () => {
    localStorage.setItem('onboarding_completed', 'true');
    setShowOnboarding(false);
  };

  useEffect(() => {
      // Check initial session
      getCurrentSession().then(({ session }) => {
          setSession(session);
      });

      // Subscribe to auth changes
      const { data: { subscription } } = onAuthStateChange((_event, session) => {
          setSession(session);
      });

      return () => {
          subscription.unsubscribe();
      };
  }, []);

  useEffect(() => {
    if (appState === 'AWAITING_FEEDBACK') {
      releaseWakeLock();
    }
  }, [appState, releaseWakeLock]);

  const handleStartSelect = useCallback((coords: [number, number], name: string) => {
    setCustomStart({ coords, name });
    setError(null);
  }, []);

  const handleDestinationSelect = useCallback((coords: [number, number], name: string) => {
    setDestination(coords);
    setDestinationName(name);
    setAppState('ROUTE_PREVIEW');
    setError(null);
  }, []);

  const handleMapClick = useCallback(async (coords: [number, number]) => {
    // Immediate feedback on UI
    setDestination(coords);
    setDestinationName("Dropped Pin...");
    setAppState('ROUTE_PREVIEW');
    setError(null);

    // Fetch address in background
    const addressName = await reverseGeocode(coords[0], coords[1]);
    if (addressName) {
        setDestinationName(addressName);
    } else {
        setDestinationName(`${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`);
    }
  }, []);

  const fetchRoute = useCallback(async () => {
    // If we are navigating, we always route from the current GPS location to ensure valid navigation.
    // If we are just previewing, we respect the custom start point if provided.
    const startCoords = (isNavigating && location) 
        ? [location.longitude, location.latitude] 
        : (customStart ? [customStart.coords[1], customStart.coords[0]] : (location ? [location.longitude, location.latitude] : null));

    // Note: startCoords is [lon, lat]
    if (!startCoords || !destination) return;

    // Check if start and destination are in Romania
    // startCoords is [lon, lat], destination is [lat, lon]
    const startInRomania = isLocationInRomania(startCoords[1], startCoords[0]);
    const destInRomania = isLocationInRomania(destination[0], destination[1]);
    
    const errorMessageSuffix = "Currently we create safe routes only within Romania. Sign-up on defensivepedal.com to find out when we launch our service in your country.";

    if (!startInRomania) {
        setError(`Start location is outside Romania. ${errorMessageSuffix}`);
        setAppState('IDLE');
        setRoutes(null);
        setElevationProfiles([]);
        setRouteAnalysis(null);
        return;
    }

    if (!destInRomania) {
        setError(`Destination is outside Romania. ${errorMessageSuffix}`);
        setAppState('IDLE');
        setRoutes(null);
        setElevationProfiles([]);
        setRouteAnalysis(null);
        return;
    }

    setIsLoading(true);
    setError(null);
    setRoutes(null);
    setElevationProfiles([]);
    setRiskRoutes([]);
    setRouteAnalysis(null);

    try {
      const routeData = await getRoute(
        startCoords as [number, number],
        [destination[1], destination[0]],
        routingPreference,
        avoidUnpaved
      );
      if (routeData && routeData.routes.length > 0) {
        setRoutes(routeData.routes);
        setSelectedRouteIndex(0);
        const primaryRoute = routeData.routes[0];

         if (appState === 'NAVIGATING') {
            setCurrentStepIndex(0);
            setHasAnnouncedApproach(false);
            if (!isMuted) {
              speak(`Rerouting. ${formatInstruction(primaryRoute.legs[0].steps[0])}`);
            }
        }

        // Show route immediately — analyze without elevation for now
        const initialAnalysis = analyzeRoute(primaryRoute, null);
        setRouteAnalysis(initialAnalysis);
        setIsLoading(false);

        // Fetch elevation and risk data in background (non-blocking)
        try {
            const profilePromises = routeData.routes.map(r =>
                getElevationProfile(r.geometry.coordinates).catch(e => {
                    console.error("Elevation fetch failed for a route", e);
                    return null;
                })
            );
            const riskPromises = routeData.routes.map(r =>
                getSegmentedRiskRoute(r.geometry).catch(e => {
                    console.error("Risk route fetch failed", e);
                    return null;
                })
            );

            const [profiles, risks] = await Promise.all([
                Promise.all(profilePromises),
                Promise.all(riskPromises)
            ]);

            setElevationProfiles(profiles);
            setRiskRoutes(risks);

            // Re-analyze with elevation data if available
            const hasElevation = profiles.some(p => p !== null);
            if (hasElevation) {
                const analysis = analyzeRoute(primaryRoute, profiles[0]);
                setRouteAnalysis(analysis);
            } else {
                showNotification('Elevation data unavailable. Route times are approximate.', 'error');
            }
        } catch (e) {
            console.error("Failed to fetch additional route data", e);
            showNotification('Elevation data unavailable. Route times are approximate.', 'error');
        }

      } else {
        setError('Could not find a route to the destination.');
        setAppState('IDLE');
      }
    } catch (err) {
      setError('Failed to fetch the route. Please try again.');
      setAppState('IDLE');
    } finally {
      setIsLoading(false);
    }
  }, [location, destination, appState, isMuted, speak, customStart, isNavigating, routingPreference, avoidUnpaved]);

  useEffect(() => {
    if (appState === 'ROUTE_PREVIEW' && (location || customStart) && destination) {
      fetchRoute();
    }
  }, [appState, location, destination, customStart, fetchRoute]);

  // Update analysis when selected route changes
  useEffect(() => {
    if (routes && routes[selectedRouteIndex]) {
        // Use the profile corresponding to the selected index
        const profile = elevationProfiles?.[selectedRouteIndex] || null;
        const analysis = analyzeRoute(routes[selectedRouteIndex], profile);
        setRouteAnalysis(analysis);
    }
  }, [selectedRouteIndex, routes, elevationProfiles]);

  const maneuverIndices = useMemo(() => {
    if (!route) return [];
    const routeCoords = route.geometry.coordinates;
    return route.legs[0].steps.map(step => {
        const maneuverLoc: [number, number] = [step.maneuver.location[1], step.maneuver.location[0]];
        return findClosestPointIndex(maneuverLoc, routeCoords);
    });
  }, [route]);

  useEffect(() => {
    if (!isNavigating || !location || !route) return;

    const currentStep = route.legs[0].steps[currentStepIndex];
    if (!currentStep) return;

    const nextManeuverLocation = [...currentStep.maneuver.location].reverse() as [number, number];
    const distanceToManeuver = haversineDistance([location.latitude, location.longitude], nextManeuverLocation);
    
    if (distanceToManeuver <= 50 && distanceToManeuver > 25 && !hasAnnouncedApproach) {
        if (!isMuted) {
            speak(`In 50 meters, ${formatInstruction(currentStep)}`);
        }
        setHasAnnouncedApproach(true);
    }

    if (distanceToManeuver < 25) { 
      const nextStepIndex = currentStepIndex + 1;
      if (nextStepIndex < route.legs[0].steps.length) {
        if (!isMuted) {
          // Speak instruction for the step being completed (acting as "Do this NOW")
          speak(formatInstruction(currentStep));
        }
        setCurrentStepIndex(nextStepIndex);
        setHasAnnouncedApproach(false);
      } else {
        setAppState('AWAITING_FEEDBACK');
        // Record trip completion
        if (tripIdRef.current) {
            endTrip(tripIdRef.current, 'completed');
            tripIdRef.current = null;
        }
        if (!isMuted) {
          speak("You have arrived at your destination.");
        }
      }
    }

    const routeCoords = route.geometry.coordinates;
    const closestPointIndex = findClosestPointIndex([location.latitude, location.longitude], routeCoords);
    if (closestPointIndex === -1) return;

    const closestPoint = routeCoords[closestPointIndex];
    const distanceToRoute = haversineDistance(
        [location.latitude, location.longitude],
        [closestPoint[1], closestPoint[0]]
    );

    if (distanceToRoute > OFF_ROUTE_THRESHOLD_METERS) {
        setOffRouteDetails({
          user: [location.latitude, location.longitude],
          closest: [closestPoint[1], closestPoint[0]]
        });
        if (offRouteTimerRef.current === null) {
            const timerId = window.setTimeout(() => {
                setShowRerouteButton(true);
            }, REROUTE_TIMEOUT_MS);
            offRouteTimerRef.current = timerId;
        }
    } else {
        if (offRouteDetails) {
            let newStepIndex: number;
            const upcomingManeuverStepIndex = maneuverIndices.findIndex(idx => idx >= closestPointIndex);
            
            if (upcomingManeuverStepIndex !== -1) {
                newStepIndex = upcomingManeuverStepIndex;
            } else {
                newStepIndex = route.legs[0].steps.length > 0 ? route.legs[0].steps.length - 1 : 0;
            }
            
            if (newStepIndex !== currentStepIndex) {
                setCurrentStepIndex(newStepIndex);
                setHasAnnouncedApproach(false);
                if (!isMuted) {
                    const newStep = route.legs[0].steps[newStepIndex];
                    speak(`Back on route. ${formatInstruction(newStep)}`);
                }
            }
        }
        
        setOffRouteDetails(null);
        if (offRouteTimerRef.current !== null) {
            clearTimeout(offRouteTimerRef.current);
            offRouteTimerRef.current = null;
        }
        setShowRerouteButton(false);
    }
  }, [isNavigating, location, route, currentStepIndex, isMuted, speak, maneuverIndices, offRouteDetails, hasAnnouncedApproach]);

  const startNavigation = async () => {
    if (route && (location || customStart)) {
      requestWakeLock();
      sessionIdRef.current = crypto.randomUUID();
      // We use the location we routed from for the feedback
      const startLoc = customStart ? customStart.coords : (location ? [location.latitude, location.longitude] : [0,0]);
      
      const currentProfile = elevationProfiles?.[selectedRouteIndex] || null;
      const { adjustedDuration } = getAdjustedDuration(route.duration, currentProfile);

      setRouteInfoForFeedback({
          start: [startLoc[0], startLoc[1]] as [number, number],
          distance: route.distance,
          duration: adjustedDuration,
      });

      // Record Trip Start
      const startName = customStart ? customStart.name : "Current Location";
      
      // Ensure coordinates are strictly numbers to prevent "invalid geometry" errors
      // GeoJSON expects [lon, lat]
      let startLonLat: [number, number];
      if (customStart) {
          startLonLat = [Number(customStart.coords[1]), Number(customStart.coords[0])];
      } else if (location) {
          startLonLat = [Number(location.longitude), Number(location.latitude)];
      } else {
          startLonLat = [0, 0];
      }
      
      const destLonLat: [number, number] = destination 
          ? [Number(destination[1]), Number(destination[0])] 
          : [0,0];

      // Async trip recording, don't block navigation start
      startTrip({
          start_location_text: startName,
          start_location: { type: 'Point', coordinates: startLonLat },
          destination_text: destinationName,
          destination_location: { type: 'Point', coordinates: destLonLat },
          distance_meters: route.distance
      }).then(id => {
          tripIdRef.current = id;
      }).catch(err => console.error("Failed to start trip recording", err));

      setCurrentStepIndex(0);
      setHasAnnouncedApproach(false);
      setAppState('NAVIGATING');
      if (!isMuted) {
          const firstStep = route.legs[0].steps[0];
          speak(formatInstruction(firstStep));
      }
    }
  };

  const reset = () => {
    releaseWakeLock();
    cancel();
    if (offRouteTimerRef.current !== null) {
        clearTimeout(offRouteTimerRef.current);
        offRouteTimerRef.current = null;
    }
    setShowRerouteButton(false);
    setOffRouteDetails(null);
    setAppState('IDLE');
    setDestination(null);
    setDestinationName('');
    setCustomStart(null);
    setShowStartSearch(false);
    setRoutes(null);
    setSelectedRouteIndex(0);
    setElevationProfiles([]);
    setRiskRoutes([]);
    setRouteAnalysis(null);
    setCurrentStepIndex(0);
    setError(null);
    setRouteInfoForFeedback(null);
    setHasAnnouncedApproach(false);
    sessionIdRef.current = null;
    tripIdRef.current = null;
  };

  const handleCancelNavigation = () => {
    releaseWakeLock();
    cancel();
    if (offRouteTimerRef.current !== null) {
        clearTimeout(offRouteTimerRef.current);
        offRouteTimerRef.current = null;
    }
    
    // Record Trip Stop
    if (tripIdRef.current) {
        endTrip(tripIdRef.current, 'stopped');
        tripIdRef.current = null;
    }

    setShowRerouteButton(false);
    setOffRouteDetails(null);
    setAppState('AWAITING_FEEDBACK');
  };

  const handleReroute = () => {
    setShowRerouteButton(false);
    setOffRouteDetails(null);
    if (offRouteTimerRef.current !== null) {
        clearTimeout(offRouteTimerRef.current);
        offRouteTimerRef.current = null;
    }
    // When rerouting, we force navigation from the current location, not the custom start point.
    setCustomStart(null);
    fetchRoute();
  };

  const handleRecenter = () => {
    mapWrapperRef.current?.recenter();
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
    }
    setNotification({ message, type });
    notificationTimerRef.current = window.setTimeout(() => {
        setNotification(null);
    }, 5000); // Increased duration for error messages
  };

  const handleReportHazard = async () => {
    if (!location) {
      showNotification('Cannot report hazard: location unavailable.', 'error');
      return;
    }
    try {
      await reportHazard(location.latitude, location.longitude);
      showNotification('Hazard reported successfully!', 'success');
    } catch (error) {
      // Improved error handling to show a more specific message
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error('Failed to report hazard:', error);
      showNotification(`Failed to report hazard: ${errorMessage}`, 'error');
    }
  };

  const handleFeedbackSubmit = async ({ rating, comments }: { rating: number; comments: string }) => {
    if (!routeInfoForFeedback || !destination || !sessionIdRef.current) {
        showNotification('Could not submit feedback: missing session data.', 'error');
        reset();
        return;
    }
    try {
        await submitFeedback({
            session_id: sessionIdRef.current,
            start_location: `${routeInfoForFeedback.start[0]},${routeInfoForFeedback.start[1]}`,
            destination: `${destination[0]},${destination[1]}`,
            distance_km: routeInfoForFeedback.distance / 1000,
            duration_minutes: Math.round(routeInfoForFeedback.duration / 60),
            rating,
            feedback_text: comments,
        });
        showNotification('Thank you for your feedback!', 'success');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        console.error('Failed to submit feedback:', error);
        showNotification(`Failed to submit feedback: ${errorMessage}`, 'error');
    } finally {
        reset();
    }
  };

  const handleDownloadMap = async (onProgress: (current: number, total: number) => void) => {
      const bounds = mapWrapperRef.current?.getBounds();
      if (!bounds) {
          throw new Error("Could not determine map bounds. Please try again.");
      }

      // We'll download for the current zoom level and up to 2 levels deeper for detail
      // Cap at 18 to prevent massive downloads
      const minZoom = Math.floor(bounds.zoom);
      const maxZoom = Math.min(minZoom + 2, 18);

      await downloadRegion(bounds, minZoom, maxZoom, onProgress);
  };


  const currentStep: Step | null = useMemo(() => {
    if (!route || !isNavigating) return null;
    return route.legs[0].steps[currentStepIndex];
  }, [route, isNavigating, currentStepIndex]);
  
  const nextStep: Step | null = useMemo(() => {
    if (!route || !isNavigating || currentStepIndex >= route.legs[0].steps.length - 1) {
        return null;
    }
    return route.legs[0].steps[currentStepIndex + 1];
  }, [route, isNavigating, currentStepIndex]);

  const remainingDistanceMeters = useMemo(() => {
    if (!isNavigating || !route || !location) return 0;

    const allRemainingSteps = route.legs[0].steps.slice(currentStepIndex);
    const currentStep = allRemainingSteps[0];
    const futureSteps = allRemainingSteps.slice(1);

    if (!currentStep) return 0;

    const nextManeuverLocation = [...currentStep.maneuver.location].reverse() as [number, number];
    const distanceToManeuver = haversineDistance([location.latitude, location.longitude], nextManeuverLocation);
    const futureStepsDistance = futureSteps.reduce((total, step) => total + step.distance, 0);

    return distanceToManeuver + futureStepsDistance;
  }, [route, isNavigating, currentStepIndex, location]);

  const remainingElevationProfile = useMemo(() => {
    // Get the profile for the selected route
    const currentProfile = elevationProfiles?.[selectedRouteIndex];
    if (!isNavigating || !route || !currentProfile || currentStepIndex >= route.legs[0].steps.length) {
        return null;
    }

    const routeCoords = route.geometry.coordinates;
    if (routeCoords.length !== currentProfile.length) {
        return null;
    }
    
    const currentManeuverLoc = route.legs[0].steps[currentStepIndex].maneuver.location;
    const currentManeuverLatLon: [number, number] = [currentManeuverLoc[1], currentManeuverLoc[0]];

    const startIndex = findClosestPointIndex(currentManeuverLatLon, routeCoords);
    if (startIndex === -1) return null;
    
    return currentProfile.slice(startIndex);
  }, [isNavigating, route, elevationProfiles, selectedRouteIndex, currentStepIndex]);

  const remainingDurationSeconds = useMemo(() => {
    if (!isNavigating || !route || !location) return 0;

    const allRemainingSteps = route.legs[0].steps.slice(currentStepIndex);
    const currentStepItem = allRemainingSteps[0];
    const futureSteps = allRemainingSteps.slice(1);

    if (!currentStepItem) return 0;

    const distanceToManeuver = haversineDistance(
        [location.latitude, location.longitude],
        [...currentStepItem.maneuver.location].reverse() as [number, number]
    );
    
    const progressThroughStep = 1 - (distanceToManeuver / currentStepItem.distance);
    const clampedProgress = Math.max(0, Math.min(1, progressThroughStep));
    const flatTimeRemainingInStep = currentStepItem.distance > 0 ? currentStepItem.duration * (1 - clampedProgress) : 0;
    const flatFutureStepsDuration = futureSteps.reduce((total, step) => total + step.duration, 0);
    const totalFlatRemaining = flatTimeRemainingInStep + flatFutureStepsDuration;
    
    // Apply elevation adjustment for the remaining part
    const { adjustedDuration } = getAdjustedDuration(totalFlatRemaining, remainingElevationProfile);
    
    return adjustedDuration;
  }, [route, isNavigating, currentStepIndex, location, remainingElevationProfile]);

  const remainingClimbMeters = useMemo(() => {
    const currentProfile = elevationProfiles?.[selectedRouteIndex];
    if (!isNavigating || !route || !currentProfile || currentStepIndex >= route.legs[0].steps.length) {
        return 0;
    }

    const routeCoords = route.geometry.coordinates;
    if (routeCoords.length !== currentProfile.length) {
        console.warn("Route coordinates and elevation profile lengths do not match.");
        return 0;
    }
    
    const currentManeuverLoc = route.legs[0].steps[currentStepIndex].maneuver.location;
    const currentManeuverLatLon: [number, number] = [currentManeuverLoc[1], currentManeuverLoc[0]];

    const startIndex = findClosestPointIndex(currentManeuverLatLon, routeCoords);
    if (startIndex === -1) return 0;
    
    const remainingElevations = currentProfile.slice(startIndex);
    let climb = 0;
    for (let i = 1; i < remainingElevations.length; i++) {
        const diff = remainingElevations[i] - remainingElevations[i - 1];
        if (diff > 0) {
            climb += diff;
        }
    }
    return climb;
  }, [isNavigating, route, elevationProfiles, selectedRouteIndex, currentStepIndex]);

  const currentStepElevationProfile = useMemo(() => {
    const currentProfile = elevationProfiles?.[selectedRouteIndex];
    if (!isNavigating || !route || !currentProfile || currentStepIndex >= route.legs[0].steps.length) {
        return null;
    }
    const routeCoords = route.geometry.coordinates;
    if (routeCoords.length !== currentProfile.length) return null;

    const currentManeuverLoc = route.legs[0].steps[currentStepIndex].maneuver.location;
    const currentManeuverLatLon: [number, number] = [currentManeuverLoc[1], currentManeuverLoc[0]];
    const startIndex = findClosestPointIndex(currentManeuverLatLon, routeCoords);
    if (startIndex === -1) return null;

    let endIndex = routeCoords.length;
    const nextStepIndex = currentStepIndex + 1;
    if (nextStepIndex < route.legs[0].steps.length) {
        const nextManeuverLoc = route.legs[0].steps[nextStepIndex].maneuver.location;
        const nextManeuverLatLon: [number, number] = [nextManeuverLoc[1], nextManeuverLoc[0]];
        const foundEndIndex = findClosestPointIndex(nextManeuverLatLon, routeCoords);
        if (foundEndIndex !== -1) {
            endIndex = foundEndIndex + 1;
        }
    }
    
    if (startIndex >= endIndex) return null;

    return currentProfile.slice(startIndex, endIndex);
  }, [isNavigating, route, elevationProfiles, selectedRouteIndex, currentStepIndex]);


  const mapCenter: [number, number] | undefined = useMemo(() => {
      if(isNavigating && location) return [location.latitude, location.longitude];
      if(location) return [location.latitude, location.longitude];
      return [51.505, -0.09];
  }, [isNavigating, location]);

  return (
    <div className="relative w-screen h-screen h-[100dvh] bg-gray-800">
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      
      <Menu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        preference={routingPreference}
        onPreferenceChange={setRoutingPreference}
        avoidUnpaved={avoidUnpaved}
        onAvoidUnpavedChange={setAvoidUnpaved}
        onDownloadMap={handleDownloadMap as any}
        session={session}
        onLogin={() => setIsAuthOpen(true)}
        onLogout={signOut}
      />
      
      <FAQ isOpen={isFAQOpen} onClose={() => setIsFAQOpen(false)} />

      {isAuthOpen && <Auth onClose={() => setIsAuthOpen(false)} />}

      <MapWrapper
        ref={mapWrapperRef}
        userLocation={location}
        destination={destination}
        startPoint={customStart ? customStart.coords : null}
        routes={routes}
        riskRoutes={riskRoutes}
        selectedIndex={selectedRouteIndex}
        center={mapCenter}
        zoom={isNavigating ? 18 : 13}
        isNavigating={isNavigating}
        offRouteDetails={offRouteDetails}
        darkMode={darkMode}
        onMapClick={handleMapClick}
      />

      <div className="absolute top-0 left-0 right-0 z-[1000] p-4 flex flex-col items-center gap-2">
        {notification && (
            <div className={`w-full max-w-md ${notification.type === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'} px-4 py-3 rounded-lg shadow-lg relative mb-2`} role="alert">
                <span className="block sm:inline">{notification.message}</span>
            </div>
        )}
        {appState === 'IDLE' && (
          <div className="w-full max-w-md flex flex-col gap-3">
             <div className="flex items-center gap-3">
                <Logo className="w-10 h-10 flex-shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                     
                     {/* Collapsible Start Input */}
                     {showStartSearch ? (
                        <div className="flex gap-2 items-center animate-fade-in">
                             <div className="flex-1">
                                 <Search 
                                    placeholder="Start Location" 
                                    initialValue={customStart?.name || ''}
                                    onSelect={(coords, name) => {
                                        handleStartSelect(coords, name);
                                    }} 
                                    onClear={() => setCustomStart(null)}
                                    userLocation={location}
                                    className="shadow-md"
                                    onInputChange={() => setError(null)}
                                 />
                             </div>
                             <button
                                onClick={() => {
                                    setShowStartSearch(false);
                                    setCustomStart(null);
                                }}
                                className="p-3 bg-white rounded-lg shadow-md text-gray-500 hover:text-red-500 hover:bg-gray-50 transition flex-shrink-0"
                                title="Use Current Location"
                             >
                                <XIcon className="w-5 h-5" />
                             </button>
                        </div>
                     ) : (
                        <button 
                           onClick={() => setShowStartSearch(true)}
                           className="w-full flex items-center justify-between bg-gray-800/80 hover:bg-gray-700/90 backdrop-blur-sm text-gray-200 px-4 py-3 rounded-lg transition shadow-md border border-gray-700 group"
                        >
                           <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`w-2.5 h-2.5 flex-shrink-0 rounded-full ${customStart ? 'bg-yellow-400' : 'bg-blue-500'} shadow-[0_0_5px_rgba(59,130,246,0.5)]`} />
                                <span className="truncate text-sm font-medium">
                                    {customStart ? `From: ${customStart.name}` : 'From: Current Location'}
                                </span>
                           </div>
                           <span className="text-xs text-gray-400 group-hover:text-white font-bold uppercase tracking-wide flex-shrink-0">Edit</span>
                        </button>
                     )}

                     <Search 
                        placeholder="Where to?" 
                        initialValue={destinationName}
                        onSelect={handleDestinationSelect} 
                        userLocation={location} 
                        className="shadow-md"
                        onInputChange={() => setError(null)}
                     />
                </div>
             </div>
          </div>
        )}
        {isNavigating && currentStep && location && (
            <>
              <NavigationUI
                step={currentStep}
                userLocation={location}
                currentStepElevationProfile={currentStepElevationProfile}
              />
              <div className="flex items-center mt-2 gap-4">
                 {showRerouteButton && (
                  <button
                    onClick={handleReroute}
                    className="bg-amber-500 text-white font-semibold py-2 px-5 rounded-full shadow-lg hover:bg-amber-600 transition"
                  >
                    Reroute
                  </button>
                )}
              </div>
            </>
        )}
        {(isLoading || locationError) && (
            <div className="w-full max-w-md bg-white/90 backdrop-blur-sm shadow-lg rounded-lg p-3 text-center text-gray-700">
                {isLoading ? 'Calculating route...' : locationError}
            </div>
        )}
        {error && (
            <div className="w-full max-w-md bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg relative" role="alert">
                <span className="block sm:inline">{error}</span>
            </div>
        )}
      </div>

      <div className={`absolute right-4 z-[1000] flex flex-col gap-3 ${isNavigating ? 'bottom-56' : 'top-1/2 -translate-y-1/2'}`}>
        
        {!isNavigating && appState !== 'AWAITING_FEEDBACK' && (
            <button
                onClick={() => setIsMenuOpen(true)}
                className="bg-white p-3 rounded-full shadow-lg text-gray-700 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Open menu"
            >
                <MenuIcon className="w-6 h-6" />
            </button>
        )}

        <button
            onClick={() => setDarkMode(prev => !prev)}
            className={`p-3 rounded-full shadow-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                darkMode ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            aria-label="Toggle dark mode"
        >
            <MoonIcon className="w-6 h-6" />
        </button>
        
        <button
            onClick={() => setIsFAQOpen(true)}
            className="bg-white p-3 rounded-full shadow-lg text-gray-700 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="FAQ"
        >
            <HelpIcon className="w-6 h-6" />
        </button>

        {isNavigating && (
            <button
                onClick={() => setIsMuted(prev => !prev)}
                className="bg-white p-3 rounded-full shadow-lg text-gray-700 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={isMuted ? "Unmute" : "Mute"}
            >
                {isMuted ? <SpeakerOffIcon className="w-6 h-6" /> : <SpeakerOnIcon className="w-6 h-6" />}
            </button>
        )}
        {isNavigating && (
            <button
                onClick={handleCancelNavigation}
                className="bg-white p-3 rounded-full shadow-lg text-gray-700 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label="Cancel navigation"
            >
                <XIcon className="w-6 h-6" />
            </button>
        )}
        {isNavigating && (
            <button
                onClick={handleReportHazard}
                className="p-3 rounded-full shadow-lg text-gray-700 transition focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white hover:bg-gray-100"
                aria-label="Report hazard"
            >
                <HazardIcon className="w-6 h-6" />
            </button>
        )}
        <button
            onClick={handleRecenter}
            className="bg-white p-3 rounded-full shadow-lg text-gray-700 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Recenter map on your location"
        >
            <CrosshairIcon className="w-6 h-6" />
        </button>

        {isNavigating && (
            <div className="bg-white p-3 rounded-full shadow-lg flex items-center justify-center pointer-events-none" aria-label={`Current routing mode: ${routingPreference}`}>
                {routingPreference === 'safe' ? (
                    <ShieldIcon className="w-6 h-6 text-yellow-500" />
                ) : (
                    <LightningIcon className="w-6 h-6 text-red-600" />
                )}
            </div>
        )}
      </div>

      {appState === 'ROUTE_PREVIEW' && (
        <div className="absolute right-4 top-24 z-[1000]">
          <RiskLegend />
        </div>
      )}

      <div className="absolute bottom-10 left-0 right-0 z-[1000] px-4 flex flex-col items-center">
        
        {isNavigating && currentStep && location && (
          <NavigationFooter
            nextStep={nextStep}
            remainingDurationSeconds={remainingDurationSeconds}
            remainingClimbMeters={remainingClimbMeters}
            remainingDistanceMeters={remainingDistanceMeters}
            remainingElevationProfile={remainingElevationProfile}
            currentSpeed={location.speed}
          />
        )}

        {appState === 'ROUTE_PREVIEW' && routes && !isLoading && (
          <div className="w-full max-w-md">
            <RouteAlternatives 
              routes={routes} 
              selectedIndex={selectedRouteIndex} 
              onSelect={setSelectedRouteIndex}
            />
             
             {/* New Route Summary Component */}
             <RouteSummary analysis={routeAnalysis} mode={routingPreference} />

             <div className="bg-white/90 backdrop-blur-sm shadow-lg rounded-lg p-3 text-center mb-3 text-gray-900">
                <p>Selected Route: <span className="font-bold">{formatDuration(routeAnalysis?.adjustedDuration || routes[selectedRouteIndex].duration)}</span> ({formatDistance(routes[selectedRouteIndex].distance)})</p>
                <p className="text-xs text-gray-600 mt-1">ETA is based on typical conditions adjusted for terrain and does not account for live traffic.</p>
            </div>
            <button
              onClick={startNavigation}
              className="w-full bg-blue-600 text-white font-bold py-4 px-6 rounded-lg shadow-2xl hover:bg-blue-700 transition-transform transform hover:scale-105"
            >
              Start Navigation
            </button>
             <button
                onClick={reset}
                className="w-full mt-3 bg-gray-200 text-gray-700 font-semibold py-3 px-5 rounded-lg shadow-lg hover:bg-gray-300 transition"
             >
                 Cancel
             </button>
          </div>
        )}
        
        {appState === 'AWAITING_FEEDBACK' && (
          <FeedbackForm
            onSubmit={handleFeedbackSubmit}
            onCancel={reset}
          />
        )}
      </div>

      {/* PWA Update Prompt */}
      {updateAvailable && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 z-[9999] border border-gray-700 w-[90%] max-w-sm">
          <span className="text-sm font-medium flex-1">A new version is available!</span>
          <button 
            onClick={updateApp}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap"
          >
            Update Now
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
