import type { Coordinate, NearbyHazard, RouteOption } from '@defensivepedal/core';
import type { BicycleParkingLocation } from '../../lib/bicycle-parking';
import type { BicycleRentalLocation } from '../../lib/bicycle-rental';
import type { BikeShopLocation } from '../../lib/bicycle-shops';
import type { SearchedPoi } from '../../lib/poi-search';
import type { StyleProp, ViewStyle } from 'react-native';

export type PoiVisibility = {
  hydration: boolean;
  repair: boolean;
  restroom: boolean;
  bikeRental: boolean;
  bikeParking: boolean;
  supplies: boolean;
};

export type RouteMapProps = {
  routes?: RouteOption[];
  selectedRouteId?: string | null;
  origin?: Coordinate;
  destination?: Coordinate;
  waypoints?: readonly Coordinate[];
  userLocation?: Coordinate | null;
  followUser?: boolean;
  offRouteDetails?: {
    user: Coordinate;
    snapped: Coordinate;
  } | null;
  fullBleed?: boolean;
  showRouteOverlay?: boolean;
  bicycleParkingLocations?: readonly BicycleParkingLocation[];
  bicycleRentalLocations?: readonly BicycleRentalLocation[];
  bikeShopLocations?: readonly BikeShopLocation[];
  searchedPois?: readonly SearchedPoi[];
  showBicycleLanes?: boolean;
  poiVisibility?: PoiVisibility;
  nearbyHazards?: readonly NearbyHazard[];
  /** Bumped to force camera re-center (e.g. when user taps locate button) */
  recenterKey?: number;
  /** GPS trail line (actual ride path) — rendered as a blue line */
  trailCoordinates?: readonly [number, number][];
  /** Planned route line — rendered in the specified color */
  plannedRouteCoordinates?: readonly [number, number][];
  /** Color for the planned route line (default: green) */
  plannedRouteColor?: string;
  /** Called when user taps the map (used for hazard placement) */
  onMapTap?: (coordinate: Coordinate) => void;
  /** Called when user long-presses the map (used for armchair hazard reporting) */
  onMapLongPress?: (coordinate: Coordinate) => void;
  /** When true, shows a crosshair overlay for hazard placement */
  hazardPlacementMode?: boolean;
  /** Called when map center changes (used for crosshair-based hazard placement) */
  onCenterChange?: (coordinate: Coordinate) => void;
  /** Array of past ride GPS trails for personal safety overlay */
  historyTrails?: readonly { coordinates: readonly [number, number][]; mode: 'safe' | 'fast' }[];
  /** GeoJSON FeatureCollection of road risk segments to render as colored overlay */
  riskOverlay?: GeoJSON.FeatureCollection | null;
  containerStyle?: StyleProp<ViewStyle>;
};

export type DecodedRoute = {
  route: RouteOption;
  coordinates: [number, number][];
  isSelected: boolean;
  sortKey: number;
};

export type SelectedPoiState = {
  name: string;
  type: string;
  website?: string;
  screenX: number;
  screenY: number;
} | null;
