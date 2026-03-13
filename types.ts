

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
  label: string;       // The full display name / address
  primaryText: string; // The main name (e.g. "Starbucks" or "Main St")
  location: [number, number]; // [latitude, longitude]
  distance?: number;
}

// OSRM API Response Types
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
  geometry: any; // GeoJSON geometry
  legs: Leg[];
  distance: number; // in meters
  duration: number; // in seconds
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
  geometry: any; // GeoJSON geometry
}

export interface Maneuver {
  bearing_after: number;
  bearing_before: number;
  location: [number, number]; // [longitude, latitude]
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
  hint: string;
  distance: number;
  name: string;
  location: [number, number];
}