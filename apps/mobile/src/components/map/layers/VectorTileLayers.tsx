import Mapbox from '@rnmapbox/maps';
import React, { useMemo } from 'react';
import type { PoiVisibility } from '../types';

// ---------------------------------------------------------------------------
// Hoisted styles for Mapbox layer performance (avoid recreation on every render)
// ---------------------------------------------------------------------------

const bikeLaneCyclewayStyle = {
  lineColor: '#4A9EAF',
  lineWidth: 3,
  lineOpacity: 0.85,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

const bikeLaneOnroadStyle = {
  lineColor: '#4A9EAF',
  lineWidth: 2,
  lineOpacity: 0.7,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineDasharray: [2, 1],
  lineEmissiveStrength: 1,
};

const poiCircleStyle = {
  circleColor: '#D4A843',
  circleRadius: 10,
  circleStrokeColor: '#FFFFFF',
  circleStrokeWidth: 1.5,
  circleEmissiveStrength: 1,
};

const createPoiLabelStyle = (textField: string, textSize = 11) => ({
  textField,
  textSize,
  textColor: '#1A1A1A',
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
});

// Pre-create label styles at module level
const hydrationLabelStyle = createPoiLabelStyle('W');
const repairLabelStyle = createPoiLabelStyle('B');
const restroomLabelStyle = createPoiLabelStyle('WC', 9);
const rentalLabelStyle = createPoiLabelStyle('R');
const suppliesLabelStyle = createPoiLabelStyle('S');

// ---------------------------------------------------------------------------
// Static filters
// ---------------------------------------------------------------------------

const bikeLaneCyclewayOnFilter: any = ['all', ['==', ['get', 'class'], 'path'], ['==', ['get', 'type'], 'cycleway']];
const bikeLaneOnroadOnFilter: any = ['==', ['get', 'bike_lane'], 'yes'];
const offFilter: any = ['==', ['get', 'class'], '__off__'];
const makiOffFilter: any = ['==', ['get', 'maki'], '__off__'];

const hydrationOnFilter: any = ['in', ['get', 'maki'], ['literal', ['drinking-water', 'cafe']]];
const repairOnFilter: any = ['any', ['==', ['get', 'maki'], 'bicycle'], ['all', ['==', ['get', 'maki'], 'shop'], ['match', ['get', 'type'], ['Bicycle', 'Bicycle Shop', 'Bike', 'Bike Shop', 'Bicycle Repair'], true, false]]];
const restroomOnFilter: any = ['==', ['get', 'maki'], 'toilet'];
const bikeRentalOnFilter: any = ['==', ['get', 'maki'], 'bicycle-share'];
const suppliesOnFilter: any = ['in', ['get', 'maki'], ['literal', ['convenience', 'grocery']]];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
}: VectorTileLayersProps) => {
  // Memoize dynamic filters to prevent recreation on every render
  const bikeLaneCyclewayFilter = useMemo(
    () => (showBicycleLanes ? bikeLaneCyclewayOnFilter : offFilter),
    [showBicycleLanes],
  );
  const bikeLaneOnroadFilter = useMemo(
    () => (showBicycleLanes ? bikeLaneOnroadOnFilter : offFilter),
    [showBicycleLanes],
  );
  const hydrationFilter = useMemo(
    () => (poiVisibility?.hydration ? hydrationOnFilter : makiOffFilter),
    [poiVisibility?.hydration],
  );
  const repairFilter = useMemo(
    () => (poiVisibility?.repair ? repairOnFilter : makiOffFilter),
    [poiVisibility?.repair],
  );
  const restroomFilter = useMemo(
    () => (poiVisibility?.restroom ? restroomOnFilter : makiOffFilter),
    [poiVisibility?.restroom],
  );
  const bikeRentalFilter = useMemo(
    () => (poiVisibility?.bikeRental ? bikeRentalOnFilter : makiOffFilter),
    [poiVisibility?.bikeRental],
  );
  const suppliesFilter = useMemo(
    () => (poiVisibility?.supplies ? suppliesOnFilter : makiOffFilter),
    [poiVisibility?.supplies],
  );

  return (
    <Mapbox.VectorSource
      id="mapbox-streets-overlay"
      url="mapbox://mapbox.mapbox-streets-v8"
      onPress={onPoiPress}
    >
      <Mapbox.LineLayer id="bike-lanes-cycleway" sourceLayerID="road" filter={bikeLaneCyclewayFilter} style={bikeLaneCyclewayStyle} />
      <Mapbox.LineLayer id="bike-lanes-onroad" sourceLayerID="road" filter={bikeLaneOnroadFilter} style={bikeLaneOnroadStyle} />
      <Mapbox.CircleLayer id="poi-hydration" sourceLayerID="poi_label" minZoomLevel={14} filter={hydrationFilter} style={poiCircleStyle} />
      <Mapbox.SymbolLayer id="poi-hydration-icon" sourceLayerID="poi_label" minZoomLevel={14} filter={hydrationFilter} style={hydrationLabelStyle} />
      <Mapbox.CircleLayer id="poi-repair" sourceLayerID="poi_label" minZoomLevel={14} filter={repairFilter} style={poiCircleStyle} />
      <Mapbox.SymbolLayer id="poi-repair-icon" sourceLayerID="poi_label" minZoomLevel={14} filter={repairFilter} style={repairLabelStyle} />
      <Mapbox.CircleLayer id="poi-restroom" sourceLayerID="poi_label" minZoomLevel={14} filter={restroomFilter} style={poiCircleStyle} />
      <Mapbox.SymbolLayer id="poi-restroom-icon" sourceLayerID="poi_label" minZoomLevel={14} filter={restroomFilter} style={restroomLabelStyle} />
      <Mapbox.CircleLayer id="poi-bike-rental-vt" sourceLayerID="poi_label" minZoomLevel={14} filter={bikeRentalFilter} style={poiCircleStyle} />
      <Mapbox.SymbolLayer id="poi-bike-rental-vt-icon" sourceLayerID="poi_label" minZoomLevel={14} filter={bikeRentalFilter} style={rentalLabelStyle} />
      <Mapbox.CircleLayer id="poi-supplies" sourceLayerID="poi_label" minZoomLevel={14} filter={suppliesFilter} style={poiCircleStyle} />
      <Mapbox.SymbolLayer id="poi-supplies-icon" sourceLayerID="poi_label" minZoomLevel={14} filter={suppliesFilter} style={suppliesLabelStyle} />
    </Mapbox.VectorSource>
  );
});

VectorTileLayers.displayName = 'VectorTileLayers';
