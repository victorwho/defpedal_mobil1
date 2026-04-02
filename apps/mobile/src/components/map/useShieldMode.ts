import { useEffect, useMemo, useState } from 'react';
import { getLightPreset, LIGHT_REFRESH_MS } from './constants';

/**
 * Manages Mapbox Standard style Shield Mode configuration.
 * Refreshes the light preset every 30 minutes to track day/night cycle.
 */
export const useShieldMode = () => {
  const [lightPreset, setLightPreset] = useState(getLightPreset);

  useEffect(() => {
    const interval = setInterval(() => {
      setLightPreset(getLightPreset());
    }, LIGHT_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const shieldModeConfig = useMemo(() => ({
    lightPreset,
    font: 'Montserrat',
    showPointOfInterestLabels: 'false',
    showTransitLabels: 'false',
    show3dObjects: 'false',
    showPedestrianRoads: 'false',
    showRoadLabels: 'true',
    showPlaceLabels: 'true',
    colorLand: '#E8E4DE',
    colorWater: '#B8C5CC',
    colorGreenspace: '#8DB580',
    colorMotorways: '#A0695A',
    colorTrunks: '#B8917E',
    colorRoads: '#D4C9A8',
    colorIndustrial: '#DDD8D0',
    colorCommercial: '#DDD8D0',
    colorEducation: '#DDD8D0',
    colorMedical: '#DDD8D0',
  }), [lightPreset]);

  return shieldModeConfig;
};
