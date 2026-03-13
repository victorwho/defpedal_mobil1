import React from 'react';
import { SearchBox } from '@mapbox/search-js-react';
import type { GeolocationCoordinates } from '../types';

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

interface SearchProps {
  onSelect: (coords: [number, number], name: string) => void;
  userLocation: GeolocationCoordinates | null;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
  initialValue?: string;
  onInputChange?: (value: string) => void;
}

const Search: React.FC<SearchProps> = ({ 
    onSelect, 
    userLocation, 
    placeholder = "Where to?",
    className = "",
    onClear,
    initialValue = "",
    onInputChange
}) => {

  const handleChange = (value: string) => {
    if (onInputChange) {
        onInputChange(value);
    }
    // If the box is cleared manually (value becomes empty), notify parent
    if (value === '' && onClear) {
        onClear();
    }
  };

  const handleRetrieve = (res: any) => {
      if (!res || !res.features || res.features.length === 0) return;

      const feature = res.features[0];
      const coords = feature.geometry.coordinates; // [lon, lat]
      // Mapbox returns [lon, lat], but App expects [lat, lon]
      const name = feature.properties.name_preferred || feature.properties.name || feature.properties.place_name;
      
      onSelect([coords[1], coords[0]], name);
  };

  return (
    <div className={`w-full ${className}`}>
        <SearchBox 
            accessToken={MAPBOX_ACCESS_TOKEN}
            options={{
                language: 'ro',
                country: 'ro',
                proximity: userLocation ? { lng: userLocation.longitude, lat: userLocation.latitude } : undefined
            }}
            value={initialValue}
            placeholder={placeholder}
            onChange={handleChange}
            onRetrieve={handleRetrieve}
            theme={{
                variables: {
                    fontFamily: 'inherit',
                    unit: '16px',
                    padding: '0.8em',
                    borderRadius: '0.5em',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                }
            }}
        />
    </div>
  );
};

export default Search;