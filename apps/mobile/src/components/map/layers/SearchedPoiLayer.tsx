import Mapbox from '@rnmapbox/maps';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted styles for Mapbox layer performance (avoid recreation on every render)
// ---------------------------------------------------------------------------

const searchedPoiBgStyle = {
  circleColor: '#D4A843',
  circleRadius: 10,
  circleStrokeColor: '#FFFFFF',
  circleStrokeWidth: 1.5,
  circleOpacity: 0.9,
  circleEmissiveStrength: 1,
};

const searchedPoiLabelStyle = {
  textField: ['get', 'label'] as any,
  textSize: 11,
  textColor: '#1A1A1A',
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type SearchedPoiLayerProps = {
  searchedPoiFeatureCollection: any;
  onPoiPress: (event: any) => void;
};

/**
 * Renders POIs found via Mapbox Search Box API (cafes, convenience stores, etc.).
 * Uses key prop to force remount when feature count changes.
 */
export const SearchedPoiLayer = React.memo(({
  searchedPoiFeatureCollection,
  onPoiPress,
}: SearchedPoiLayerProps) => {
  if (searchedPoiFeatureCollection.features.length === 0) return null;

  return (
    <Mapbox.ShapeSource
      key={`searched-pois-${searchedPoiFeatureCollection.features.length}`}
      id="searched-pois"
      shape={searchedPoiFeatureCollection}
      onPress={onPoiPress}
    >
      <Mapbox.CircleLayer id="searched-poi-bg" minZoomLevel={11} style={searchedPoiBgStyle} />
      <Mapbox.SymbolLayer id="searched-poi-label" minZoomLevel={11} style={searchedPoiLabelStyle} />
    </Mapbox.ShapeSource>
  );
});

SearchedPoiLayer.displayName = 'SearchedPoiLayer';
