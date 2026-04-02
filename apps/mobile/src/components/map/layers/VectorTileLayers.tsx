import Mapbox from '@rnmapbox/maps';
import React from 'react';
import type { PoiVisibility } from '../types';

type VectorTileLayersProps = {
  showBicycleLanes: boolean;
  poiVisibility?: PoiVisibility;
  onPoiPress: (event: any) => void;
};

/**
 * Single VectorSource for bike lanes + all 6 POI pairs from mapbox-streets-v8.
 * All POI layers must be children of one VectorSource — do NOT split further.
 */
export const VectorTileLayers = React.memo(({
  showBicycleLanes,
  poiVisibility,
  onPoiPress,
}: VectorTileLayersProps) => (
  <Mapbox.VectorSource
    id="mapbox-streets-overlay"
    url="mapbox://mapbox.mapbox-streets-v8"
    onPress={onPoiPress}
  >
    <Mapbox.LineLayer
      id="bike-lanes-cycleway"
      sourceLayerID="road"
      filter={showBicycleLanes ? ['all',
        ['==', ['get', 'class'], 'path'],
        ['==', ['get', 'type'], 'cycleway'],
      ] : ['==', ['get', 'class'], '__off__']}
      style={{
        lineColor: '#4A9EAF',
        lineWidth: 3,
        lineOpacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
        lineEmissiveStrength: 1,
      }}
    />
    <Mapbox.LineLayer
      id="bike-lanes-onroad"
      sourceLayerID="road"
      filter={showBicycleLanes ? ['==', ['get', 'bike_lane'], 'yes'] : ['==', ['get', 'class'], '__off__']}
      style={{
        lineColor: '#4A9EAF',
        lineWidth: 2,
        lineOpacity: 0.7,
        lineJoin: 'round',
        lineCap: 'round',
        lineDasharray: [2, 1],
        lineEmissiveStrength: 1,
      }}
    />
    <Mapbox.CircleLayer
      id="poi-hydration"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.hydration ? ['in', ['get', 'maki'], ['literal', ['drinking-water', 'cafe']]] : ['==', ['get', 'maki'], '__off__']}
      style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
    />
    <Mapbox.SymbolLayer
      id="poi-hydration-icon"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.hydration ? ['in', ['get', 'maki'], ['literal', ['drinking-water', 'cafe']]] : ['==', ['get', 'maki'], '__off__']}
      style={{ textField: 'W', textSize: 11, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
    />
    <Mapbox.CircleLayer
      id="poi-repair"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.repair ? ['any',
        ['==', ['get', 'maki'], 'bicycle'],
        ['all', ['==', ['get', 'maki'], 'shop'], ['match', ['get', 'type'], ['Bicycle', 'Bicycle Shop', 'Bike', 'Bike Shop', 'Bicycle Repair'], true, false]],
      ] : ['==', ['get', 'maki'], '__off__']}
      style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
    />
    <Mapbox.SymbolLayer
      id="poi-repair-icon"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.repair ? ['any',
        ['==', ['get', 'maki'], 'bicycle'],
        ['all', ['==', ['get', 'maki'], 'shop'], ['match', ['get', 'type'], ['Bicycle', 'Bicycle Shop', 'Bike', 'Bike Shop', 'Bicycle Repair'], true, false]],
      ] : ['==', ['get', 'maki'], '__off__']}
      style={{ textField: 'B', textSize: 11, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
    />
    <Mapbox.CircleLayer
      id="poi-restroom"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.restroom ? ['==', ['get', 'maki'], 'toilet'] : ['==', ['get', 'maki'], '__off__']}
      style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
    />
    <Mapbox.SymbolLayer
      id="poi-restroom-icon"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.restroom ? ['==', ['get', 'maki'], 'toilet'] : ['==', ['get', 'maki'], '__off__']}
      style={{ textField: 'WC', textSize: 9, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
    />
    <Mapbox.CircleLayer
      id="poi-bike-rental-vt"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.bikeRental ? ['==', ['get', 'maki'], 'bicycle-share'] : ['==', ['get', 'maki'], '__off__']}
      style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
    />
    <Mapbox.SymbolLayer
      id="poi-bike-rental-vt-icon"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.bikeRental ? ['==', ['get', 'maki'], 'bicycle-share'] : ['==', ['get', 'maki'], '__off__']}
      style={{ textField: 'R', textSize: 11, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
    />
    <Mapbox.CircleLayer
      id="poi-supplies"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.supplies ? ['in', ['get', 'maki'], ['literal', ['convenience', 'grocery']]] : ['==', ['get', 'maki'], '__off__']}
      style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
    />
    <Mapbox.SymbolLayer
      id="poi-supplies-icon"
      sourceLayerID="poi_label"
      minZoomLevel={14}
      filter={poiVisibility?.supplies ? ['in', ['get', 'maki'], ['literal', ['convenience', 'grocery']]] : ['==', ['get', 'maki'], '__off__']}
      style={{ textField: 'S', textSize: 11, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
    />
  </Mapbox.VectorSource>
));

VectorTileLayers.displayName = 'VectorTileLayers';
