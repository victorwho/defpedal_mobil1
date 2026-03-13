
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import L from 'leaflet';
import { Logo } from './Logo';

const userIcon = L.divIcon({
  html: '<div class="w-5 h-5 bg-yellow-400 rounded-full border-4 border-black shadow-md"></div>',
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const destinationIcon = L.divIcon({
  html: '<div class="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-md"></div>',
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const startIcon = L.divIcon({
  html: '<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md"></div>',
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface MapWrapperProps {
  userLocation: { latitude: number; longitude: number; heading?: number | null } | null;
  destination: [number, number] | null;
  startPoint?: [number, number] | null;
  routes: { geometry: any }[] | null;
  riskRoutes?: any[] | null;
  selectedIndex: number;
  center: [number, number];
  zoom: number;
  isNavigating: boolean;
  offRouteDetails: { user: [number, number]; closest: [number, number] } | null;
  darkMode: boolean;
  onMapClick?: (coords: [number, number]) => void;
}

export interface MapWrapperHandles {
  recenter: () => void;
  getBounds: () => { north: number; south: number; east: number; west: number; zoom: number } | null;
}

const MapWrapper = forwardRef<MapWrapperHandles, MapWrapperProps>(({
  userLocation,
  destination,
  startPoint,
  routes,
  riskRoutes,
  selectedIndex,
  center,
  zoom,
  isNavigating,
  offRouteDetails,
  darkMode,
  onMapClick,
}, ref) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const destinationMarker = useRef<L.Marker | null>(null);
  const startMarker = useRef<L.Marker | null>(null);
  const routeLayers = useRef<L.GeoJSON[]>([]);
  const offRouteLine = useRef<L.Polyline | null>(null);
  const baseLayer = useRef<L.TileLayer | null>(null);

  // Rotation state for smooth transitions
  const [rotation, setRotation] = useState(0);
  
  // Track if the map should automatically follow the user's location
  const [isFollowing, setIsFollowing] = useState(true);

  // Reset following mode when navigation state changes
  useEffect(() => {
    setIsFollowing(true);
  }, [isNavigating]);

  useEffect(() => {
    // Calculate smooth rotation based on heading
    if (isNavigating && userLocation?.heading !== undefined && userLocation.heading !== null) {
      const targetHeading = userLocation.heading;
      setRotation(prev => {
        // Calculate the shortest path to the target heading
        const delta = (targetHeading - prev + 540) % 360 - 180;
        return prev + delta;
      });
    } else if (!isNavigating) {
        setRotation(0);
    }
  }, [isNavigating, userLocation?.heading]);

  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
          zoomControl: false, 
          attributionControl: false,
      }).setView(center, zoom);

      baseLayer.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapInstance.current);

      L.control.scale({ position: 'bottomright' }).addTo(mapInstance.current);

      // Disable follow mode on manual pan
      mapInstance.current.on('dragstart', () => {
        if (isNavigating) setIsFollowing(false);
      });

      // Disable follow mode on manual zoom (wheel or multi-touch)
      const mapEl = mapRef.current;
      const handleManualInteraction = () => {
          if (isNavigating) setIsFollowing(false);
      };
      
      mapEl.addEventListener('wheel', handleManualInteraction, { passive: true });
      mapEl.addEventListener('touchstart', (e) => {
          if (e.touches.length > 1) handleManualInteraction();
      }, { passive: true });
    }
  }, [isNavigating]);

  // Handle Map Interactions (Click / Long Press)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const handleInteraction = (e: L.LeafletMouseEvent) => {
        if (onMapClick && !isNavigating) {
            onMapClick([e.latlng.lat, e.latlng.lng]);
        }
    };

    const eventType = L.Browser.mobile ? 'contextmenu' : 'click';
    map.on(eventType, handleInteraction);

    return () => {
        map.off(eventType, handleInteraction);
    };
  }, [onMapClick, isNavigating]);

  useEffect(() => {
      if (mapInstance.current) {
          const timeout = setTimeout(() => {
              mapInstance.current?.invalidateSize();
          }, 350);
          return () => clearTimeout(timeout);
      }
  }, [isNavigating]);

  useEffect(() => {
    if (mapInstance.current) {
      if (routes && !isNavigating) {
        return;
      }
      
      // Only auto-update the view if follow mode is active
      if (isFollowing) {
        mapInstance.current.setView(center, zoom, { animate: true, pan: { duration: 1 } });
      }
    }
  }, [center, zoom, routes, isNavigating, isFollowing]);

  useEffect(() => {
    if (mapInstance.current && userLocation) {
      const latLng: [number, number] = [userLocation.latitude, userLocation.longitude];
      if (userMarker.current) {
        userMarker.current.setLatLng(latLng);
      } else {
        userMarker.current = L.marker(latLng, { icon: userIcon }).addTo(mapInstance.current);
      }
    }
  }, [userLocation]);

  useEffect(() => {
    if (mapInstance.current) {
      if (destination) {
        if (destinationMarker.current) {
          destinationMarker.current.setLatLng(destination);
        } else {
          destinationMarker.current = L.marker(destination, { icon: destinationIcon }).addTo(mapInstance.current);
        }
      } else if (destinationMarker.current) {
        mapInstance.current.removeLayer(destinationMarker.current);
        destinationMarker.current = null;
      }
    }
  }, [destination]);

  useEffect(() => {
    if (mapInstance.current) {
      if (startPoint) {
        if (startMarker.current) {
            startMarker.current.setLatLng(startPoint);
        } else {
            startMarker.current = L.marker(startPoint, { icon: startIcon }).addTo(mapInstance.current);
        }
      } else if (startMarker.current) {
        mapInstance.current.removeLayer(startMarker.current);
        startMarker.current = null;
      }
    }
  }, [startPoint]);

  useEffect(() => {
    if (mapInstance.current) {
      routeLayers.current.forEach(layer => mapInstance.current?.removeLayer(layer));
      routeLayers.current = [];

      let boundsTargetLayer: L.GeoJSON | null = null;

      if (routes) {
        routes.forEach((route, index) => {
          const isSelected = index === selectedIndex;
          
          if (isSelected) {
              const outlineLayer = L.geoJSON(route.geometry, { 
                  style: {
                    color: '#000000',
                    weight: 10,
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round'
                  } 
              }).addTo(mapInstance.current!);
              
              routeLayers.current.push(outlineLayer);
              outlineLayer.bringToFront();

              // ALWAYS draw the base fill layer (blue for unknown/no data)
              const baseFillLayer = L.geoJSON(route.geometry, { 
                  style: {
                    color: '#3b82f6',
                    weight: 6, 
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }
              }).addTo(mapInstance.current!);
              
              routeLayers.current.push(baseFillLayer);
              baseFillLayer.bringToFront();
              
              boundsTargetLayer = baseFillLayer;

              if (riskRoutes && riskRoutes[index] && riskRoutes[index].features && riskRoutes[index].features.length > 0) {
                  // Render segmented risk route on top
                  const riskLayer = L.geoJSON(riskRoutes[index], {
                      style: (feature) => {
                          const score = feature?.properties?.risk_score || 0;
                          let color = '#3b82f6'; // Default blue for no data
                          if (score > 0) {
                              if (score < 33) color = '#4CAF50'; // Very Safe
                              else if (score < 43.5) color = '#8BC34A'; // Safe
                              else if (score < 51.8) color = '#FFEB3B'; // Average
                              else if (score < 57.6) color = '#FF9800'; // Elevated
                              else if (score < 69) color = '#FF5722'; // Risky
                              else if (score <= 101.8) color = '#F44336'; // Very Risky
                              else color = '#000000'; // Extreme
                          }
                          return {
                              color: color,
                              weight: 6,
                              opacity: 1,
                              lineCap: 'round',
                              lineJoin: 'round'
                          };
                      }
                  }).addTo(mapInstance.current!);
                  
                  routeLayers.current.push(riskLayer);
                  riskLayer.bringToFront();
              }

          } else {
              const style = {
                color: '#9ca3af',
                weight: 5,
                opacity: 0.6,
                lineCap: 'round',
                lineJoin: 'round'
              };

              const layer = L.geoJSON(route.geometry, { style }).addTo(mapInstance.current!);
              layer.bringToBack();
              routeLayers.current.push(layer);
          }
        });

        if (boundsTargetLayer && !isNavigating) {
            mapInstance.current.fitBounds((boundsTargetLayer as L.GeoJSON).getBounds().pad(0.1));
        }
      }
    }
  }, [routes, riskRoutes, selectedIndex, isNavigating]);
  
    useEffect(() => {
        if (!baseLayer.current) return;

        const newUrl = darkMode
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        
        baseLayer.current.setUrl(newUrl);

    }, [darkMode]);

  useEffect(() => {
    if (mapInstance.current) {
      if (offRouteLine.current) {
        mapInstance.current.removeLayer(offRouteLine.current);
        offRouteLine.current = null;
      }

      if (offRouteDetails) {
        const latlngs: [number, number][] = [offRouteDetails.user, offRouteDetails.closest];
        offRouteLine.current = L.polyline(latlngs, {
          color: '#f59e0b',
          weight: 3,
          opacity: 0.8,
          dashArray: '5, 10',
        }).addTo(mapInstance.current);
      }
    }
  }, [offRouteDetails]);

  useImperativeHandle(ref, () => ({
    recenter: () => {
      setIsFollowing(true); // Re-enable following on recenter
      if (mapInstance.current && userLocation) {
          mapInstance.current.setView(
              [userLocation.latitude, userLocation.longitude],
              18,
              { animate: true, pan: { duration: 1 } }
          );
      }
    },
    getBounds: () => {
        if (!mapInstance.current) return null;
        const bounds = mapInstance.current.getBounds();
        const zoom = mapInstance.current.getZoom();
        return {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
            zoom: zoom
        };
    }
  }));

  const containerStyle: React.CSSProperties = isNavigating ? {
      width: '150vmax', 
      height: '150vmax',
      left: '50%',
      top: '65%', 
      position: 'absolute',
      transform: `translate(-50%, -50%) rotate(${-rotation}deg)`, 
      transition: 'transform 500ms linear' 
  } : {
      width: '100%',
      height: '100%',
      left: '0',
      top: '0',
      position: 'relative',
      transform: 'none',
      transition: 'all 300ms ease-in-out'
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-800">
        <div ref={mapRef} style={containerStyle} />
        
        <div className="absolute bottom-1 right-1 text-[10px] text-gray-400 bg-gray-900/60 backdrop-blur-sm px-1.5 py-0.5 rounded pointer-events-auto z-[400]">
           {darkMode ? 
               <span>&copy; <a href="https://www.openstreetmap.org/copyright" className="hover:text-white">OSM</a> &copy; <a href="https://carto.com/attributions" className="hover:text-white">CARTO</a></span>
             : <span>&copy; <a href="https://www.openstreetmap.org/copyright" className="hover:text-gray-200">OpenStreetMap</a></span>
           }
        </div>
    </div>
  );
});

export default MapWrapper;
