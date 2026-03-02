/* ============================================================
   SgSL Hub — Configuration
   ============================================================ */

// Supabase
const SUPABASE_URL  = 'https://voiowxoqcjpjoxyvaxgp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvaW93eG9xY2pwam94eXZheGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0Mzg2MDksImV4cCI6MjA4ODAxNDYwOX0.Tqg6GlbqcW284U3-SO94fU3esHy4yoyuJ-xHn7Psosc';

export const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Auth
export const ALLOWED_DOMAIN = '@btyss.moe.edu.sg';

// MediaPipe
export const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands';
export const HAND_OPTIONS = {
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
};
export const CAMERA_SIZE = { width: 640, height: 360 };

// Feature extraction
export const RESAMPLE_FRAMES = 32;
export const TOP_N_RESULTS = 3;

// 3D playback
export const SMOOTHING_ALPHA = 0.6;
export const DEFAULT_PLAYBACK_SPEED = 1;

// DB table
export const TABLE = 'signLibrary';
