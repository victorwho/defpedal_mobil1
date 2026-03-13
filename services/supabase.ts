
import { createClient } from '@supabase/supabase-js';

// --- IMPORTANT ---
// CHECK YOUR SUPABASE PROJECT URL AND ANON KEY
// The "Invalid API key" error means that the URL or the Key below is incorrect.
// 1. Go to your Supabase project dashboard.
// 2. Go to Project Settings (the gear icon).
// 3. Click on "API".
// 4. Copy the "Project URL" and the "anon" "public" key.
// 5. Paste them below.
// --- IMPORTANT ---

// Replace with your Supabase project URL and anon key
const SUPABASE_URL = 'https://uobubaulcdcuggnetzei.supabase.co';
// IMPORTANT: This key is public and safe to use in a browser.
// For more security, you would implement Row Level Security (RLS) in your Supabase dashboard.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvYnViYXVsY2RjdWdnbmV0emVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMjAxMDUsImV4cCI6MjA3MTc5NjEwNX0.oujNe4x-SYH0MCGC-KtWR_e1pgmCyiqjBC9faynNW48';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Auth Helpers ---

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
};

export const onAuthStateChange = (callback: (event: any, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
};

// --- Database Helpers ---

/**
 * Inserts a new hazard report into the database.
 * @param lat - The latitude of the hazard.
 * @param lng - The longitude of the hazard.
 */
export const reportHazard = async (lat: number, lng: number) => {
  // Attempt to get the current user session.
  const { data: { user } } = await supabase.auth.getUser();

  const now = new Date();

  // Construct the hazard data according to the new schema.
  const hazardData = {
    // If a user is logged in, their ID is stored. Otherwise, it's null.
    // This requires the 'user_id' column in Supabase to be nullable.
    user_id: user?.id || null,
    // Store location as a GeoJSON-like object in the jsonb column.
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    // Store the full timestamp with time zone.
    reported_at: now.toISOString(),
    // Store just the date part.
    day: now.toISOString().substring(0, 10), // YYYY-MM-DD
    // Store just the time part.
    time_of_day: now.toTimeString().substring(0, 8), // HH:MM:SS
  };

  const { error } = await supabase
    .from('hazards')
    .insert([hazardData]);

  if (error) {
    // Log a more descriptive error to the console to avoid "[object Object]"
    console.error('Supabase error:', error.message || error);
    // Throw a new error with the message from Supabase for better debugging.
    throw new Error(error.message);
  }
};

interface FeedbackPayload {
  session_id: string;
  start_location: string;
  destination: string;
  distance_km: number;
  duration_minutes: number;
  rating: number;
  feedback_text: string;
}

/**
 * Inserts navigation feedback into the database.
 * @param feedbackData - The feedback data to be submitted.
 */
export const submitFeedback = async (feedbackData: FeedbackPayload) => {
    const { error } = await supabase
        .from('navigation_feedback')
        .insert([feedbackData]);

    if (error) {
        console.error('Supabase feedback error:', error.message || error);
        throw new Error(error.message);
    }
};

interface TripStartData {
  start_location_text: string;
  start_location: { type: 'Point'; coordinates: number[] };
  destination_text: string;
  destination_location: { type: 'Point'; coordinates: number[] };
  distance_meters: number;
}

/**
 * Starts a new trip recording.
 */
export const startTrip = async (tripData: TripStartData) => {
  const { data: { user } } = await supabase.auth.getUser();

  // Extract coordinates
  const startLon = tripData.start_location.coordinates[0];
  const startLat = tripData.start_location.coordinates[1];
  const destLon = tripData.destination_location.coordinates[0];
  const destLat = tripData.destination_location.coordinates[1];

  // Validate coordinates to prevent DB errors
  if (
    typeof startLon !== 'number' || isNaN(startLon) ||
    typeof startLat !== 'number' || isNaN(startLat) ||
    typeof destLon !== 'number' || isNaN(destLon) ||
    typeof destLat !== 'number' || isNaN(destLat)
  ) {
    console.error("Invalid coordinates provided to startTrip:", tripData);
    return null;
  }

  // Use WKT (Well-Known Text) format for Geography columns: POINT(lon lat)
  // This avoids "invalid geometry" errors that can occur with JSON parsing
  const startWkt = `POINT(${startLon} ${startLat})`;
  const destWkt = `POINT(${destLon} ${destLat})`;

  const { data, error } = await supabase
    .from('trips')
    .insert([{
      user_id: user?.id || null,
      start_location_text: tripData.start_location_text,
      start_location: startWkt,
      destination_text: tripData.destination_text,
      destination_location: destWkt,
      distance_meters: tripData.distance_meters,
      started_at: new Date().toISOString(),
      end_reason: 'in_progress'
    }])
    .select()
    .single();

  if (error) {
    console.error('Error starting trip:', error.message);
    return null;
  }
  return data.id;
};

/**
 * Fetches the segmented risk route from Supabase given an OSRM route geometry.
 * @param routeGeojson - The GeoJSON LineString of the OSRM route.
 * @returns A GeoJSON FeatureCollection with risk scores.
 */
export const getSegmentedRiskRoute = async (routeGeojson: any) => {
  const { data, error } = await supabase.rpc('get_segmented_risk_route', {
    route_geojson: routeGeojson
  });

  if (error) {
    console.error('Error fetching segmented risk route:', error.message);
    return null;
  }

  return data;
};
export const endTrip = async (tripId: string, reason: 'completed' | 'stopped') => {
  const { error } = await supabase
    .from('trips')
    .update({
      end_reason: reason,
      ended_at: new Date().toISOString()
    })
    .eq('id', tripId);

  if (error) {
    console.error('Error ending trip:', error.message);
  }
};
