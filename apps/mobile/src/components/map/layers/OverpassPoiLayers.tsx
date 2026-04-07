import Mapbox from '@rnmapbox/maps';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted styles for Mapbox layer performance (avoid recreation on every render)
// Since we use conditional rendering (visible && ...), the visible check
// inside styles is redundant — we can use static values.
// ---------------------------------------------------------------------------

const poiCircleStyle = {
  circleColor: '#D4A843',
  circleRadius: 10,
  circleStrokeColor: '#FFFFFF',
  circleStrokeWidth: 1.5,
  circleOpacity: 0.9,
  circleEmissiveStrength: 1,
};

const parkingLabelStyle = {
  textField: 'P',
  textSize: 11,
  textColor: '#1A1A1A',
  textOpacity: 1,
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

const rentalLabelStyle = {
  textField: 'R',
  textSize: 11,
  textColor: '#1A1A1A',
  textOpacity: 1,
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

const repairLabelStyle = {
  textField: 'B',
  textSize: 11,
  textColor: '#1A1A1A',
  textOpacity: 1,
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type OverpassPoiLayersProps = {
  parkingVisible: boolean;
  rentalVisible: boolean;
  repairVisible: boolean;
  bicycleParkingFeatureCollection: any;
  bicycleRentalFeatureCollection: any;
  bikeShopFeatureCollection: any;
};

/**
 * Overpass API-sourced POI layers: bicycle parking, rental, and bike shops.
 * Uses `key` prop to force remount when visibility changes (Mapbox caching workaround).
 */
export const OverpassPoiLayers = React.memo(({
  parkingVisible,
  rentalVisible,
  repairVisible,
  bicycleParkingFeatureCollection,
  bicycleRentalFeatureCollection,
  bikeShopFeatureCollection,
}: OverpassPoiLayersProps) => (
  <>
    {parkingVisible && bicycleParkingFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource key="bicycle-parking-visible" id="bicycle-parking" shape={bicycleParkingFeatureCollection}>
        <Mapbox.CircleLayer id="bicycle-parking-bg" minZoomLevel={12} style={poiCircleStyle} />
        <Mapbox.SymbolLayer id="bicycle-parking-label" minZoomLevel={12} style={parkingLabelStyle} />
      </Mapbox.ShapeSource>
    ) : null}

    {rentalVisible && bicycleRentalFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource key="bicycle-rental-visible" id="bicycle-rental" shape={bicycleRentalFeatureCollection}>
        <Mapbox.CircleLayer id="bicycle-rental-bg" minZoomLevel={12} style={poiCircleStyle} />
        <Mapbox.SymbolLayer id="bicycle-rental-label" minZoomLevel={12} style={rentalLabelStyle} />
      </Mapbox.ShapeSource>
    ) : null}

    {repairVisible && bikeShopFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource key="bike-shops-visible" id="bike-shops" shape={bikeShopFeatureCollection}>
        <Mapbox.CircleLayer id="bike-shop-bg" minZoomLevel={12} style={poiCircleStyle} />
        <Mapbox.SymbolLayer id="bike-shop-label" minZoomLevel={12} style={repairLabelStyle} />
      </Mapbox.ShapeSource>
    ) : null}
  </>
));

OverpassPoiLayers.displayName = 'OverpassPoiLayers';
