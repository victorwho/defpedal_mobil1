export interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface SearchResult {
  id: string;
  label: string;
  primaryText: string;
  location: [number, number];
  distance?: number;
}

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface GeoJsonMultiLineString {
  type: 'MultiLineString';
  coordinates: [number, number][][];
}

export type GeoJsonGeometry =
  | GeoJsonPoint
  | GeoJsonLineString
  | GeoJsonMultiLineString;

export interface GeoJsonFeature<
  TGeometry extends GeoJsonGeometry = GeoJsonGeometry,
  TProperties extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'Feature';
  geometry: TGeometry;
  properties: TProperties;
}

export interface GeoJsonFeatureCollection<
  TGeometry extends GeoJsonGeometry = GeoJsonGeometry,
  TProperties extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'FeatureCollection';
  features: Array<GeoJsonFeature<TGeometry, TProperties>>;
}

export interface RouteResponse {
  code: string;
  routes: Route[];
  waypoints: Waypoint[];
}

export interface Annotation {
  distance: number[];
  duration: number[];
  datasources: number[];
  nodes: number[];
  weight: number[];
  speed: number[];
  classes?: string[];
}

export interface Route {
  geometry: GeoJsonLineString;
  legs: Leg[];
  distance: number;
  duration: number;
  weight_name: string;
  weight: number;
}

export interface Leg {
  steps: Step[];
  summary: string;
  weight: number;
  duration: number;
  distance: number;
  annotation?: Annotation;
}

export interface Step {
  intersections: Intersection[];
  maneuver: Maneuver;
  name: string;
  duration: number;
  distance: number;
  driving_side: string;
  weight: number;
  mode: string;
  geometry: GeoJsonLineString;
}

export interface Maneuver {
  bearing_after: number;
  bearing_before: number;
  location: [number, number];
  modifier?: string;
  type: string;
  exit?: number;
}

export interface Intersection {
  out?: number;
  entry: boolean[];
  bearings: number[];
  location: [number, number];
}

export interface Waypoint {
  hint?: string;
  distance: number;
  name: string;
  location: [number, number];
}
