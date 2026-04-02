import Mapbox from '@rnmapbox/maps';
import React from 'react';

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
      <Mapbox.ShapeSource
        key="bicycle-parking-visible"
        id="bicycle-parking"
        shape={bicycleParkingFeatureCollection}
      >
        <Mapbox.CircleLayer
          id="bicycle-parking-bg"
          minZoomLevel={12}
          style={{
            circleColor: '#D4A843',
            circleRadius: parkingVisible ? 10 : 0,
            circleStrokeColor: '#FFFFFF',
            circleStrokeWidth: parkingVisible ? 1.5 : 0,
            circleOpacity: parkingVisible ? 0.9 : 0,
            circleEmissiveStrength: 1,
          }}
        />
        <Mapbox.SymbolLayer
          id="bicycle-parking-label"
          minZoomLevel={12}
          style={{
            textField: 'P',
            textSize: 11,
            textColor: '#1A1A1A',
            textOpacity: parkingVisible ? 1 : 0,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            textEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}

    {rentalVisible && bicycleRentalFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource
        key="bicycle-rental-visible"
        id="bicycle-rental"
        shape={bicycleRentalFeatureCollection}
      >
        <Mapbox.CircleLayer
          id="bicycle-rental-bg"
          minZoomLevel={12}
          style={{
            circleColor: '#D4A843',
            circleRadius: rentalVisible ? 10 : 0,
            circleStrokeColor: '#FFFFFF',
            circleStrokeWidth: rentalVisible ? 1.5 : 0,
            circleOpacity: rentalVisible ? 0.9 : 0,
            circleEmissiveStrength: 1,
          }}
        />
        <Mapbox.SymbolLayer
          id="bicycle-rental-label"
          minZoomLevel={12}
          style={{
            textField: 'R',
            textSize: 11,
            textColor: '#1A1A1A',
            textOpacity: rentalVisible ? 1 : 0,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            textEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}

    {repairVisible && bikeShopFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource key="bike-shops-visible" id="bike-shops" shape={bikeShopFeatureCollection}>
        <Mapbox.CircleLayer
          id="bike-shop-bg"
          minZoomLevel={12}
          style={{
            circleColor: '#D4A843',
            circleRadius: repairVisible ? 10 : 0,
            circleStrokeColor: '#FFFFFF',
            circleStrokeWidth: repairVisible ? 1.5 : 0,
            circleOpacity: repairVisible ? 0.9 : 0,
            circleEmissiveStrength: 1,
          }}
        />
        <Mapbox.SymbolLayer
          id="bike-shop-label"
          minZoomLevel={12}
          style={{
            textField: 'B',
            textSize: 11,
            textColor: '#1A1A1A',
            textOpacity: repairVisible ? 1 : 0,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            textEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}
  </>
));

OverpassPoiLayers.displayName = 'OverpassPoiLayers';
