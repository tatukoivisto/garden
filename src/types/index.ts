// Zone types
export type ZoneType =
  | 'raised_bed' | 'in_ground_bed' | 'strawberry_bed' | 'three_sisters'
  | 'herb_spiral' | 'perennial_bed' | 'propagation_bed' | 'experimental_bed'
  | 'wildflower_strip' | 'green_manure_strip' | 'container'
  | 'greenhouse' | 'cold_frame' | 'polytunnel' | 'compost_station'
  | 'tool_store' | 'seating_area' | 'water_barrel' | 'path'
  | 'gate' | 'fence' | 'custom';

export type ZoneCategory = 'growing' | 'structure';

export type BedSystem = 'market_30in' | 'biointensive_4ft' | 'sfg_1ft' | 'metric' | 'custom';

export type SouthEdge = 'top' | 'bottom' | 'left' | 'right';

export type UnitSystem = 'metric' | 'imperial';

export type GardenLifecycle = 'designing' | 'planted' | 'active_twin' | 'off_season';

export type SunRequirement = 'full' | 'partial' | 'shade';
export type WaterNeed = 'low' | 'moderate' | 'high';
export type FeederType = 'light' | 'moderate' | 'heavy';
export type CropType = 'annual' | 'biennial' | 'perennial';
export type WindExposure = 'sheltered' | 'moderate' | 'exposed';
export type SoilType = 'sand' | 'sandy_loam' | 'loam' | 'clay_loam' | 'clay' | 'peat';

// Bed system configuration
export interface BedSystemConfig {
  id: BedSystem;
  name: string;
  bedWidth_cm: number;
  pathWidth_cm: number;
  gridSnap_cm: number;
  description: string;
}

// Climate config
export interface ClimateConfig {
  location: string;
  lat: number;
  lng: number;
  usda_zone: string;
  finnish_zone: string;
  soil_type: SoilType;
  soil_ph: number;
  annual_rainfall_mm: number;
  last_frost: string; // MM-DD
  first_frost: string; // MM-DD
  growing_season_days: number;
  wind_exposure: WindExposure;
  slope_facing: string;
  sun_angle_summer_deg: number;
  daylight_hours_solstice: number;
  auto_detected: boolean;
  detection_source: 'gps' | 'ip' | 'manual' | 'photo_exif';
}

// Zone
export interface Zone {
  id: string;
  type: ZoneType;
  category: ZoneCategory;
  name: string;
  x_m: number;
  y_m: number;
  width_m: number;
  depth_m: number;
  rotation_deg: 0 | 90;
  shape: 'rect' | 'ellipse';
  color: string;
  locked: boolean;
  parent_zone_id?: string;
  notes: string;
  latest_snapshot?: ZoneSnapshot;
  health_history: { date: string; score: number }[];
  photos: { date: string; url: string }[];
}

// Zone template for palette
export interface ZoneTemplate {
  type: ZoneType;
  category: ZoneCategory;
  label: string;
  defaultColor: string;
  defaultWidth_m: number;
  defaultDepth_m: number;
  defaultShape: 'rect' | 'ellipse';
  description: string;
}

// Crop database
export interface Crop {
  id: string;
  name_en: string;
  name_fi: string;
  name_latin: string;
  family: string;
  type: CropType;
  zone_types: ZoneType[];
  usda_min: number;
  usda_max: number;
  frost_sensitive: boolean;
  min_soil_temp_c: number;
  ph_min: number;
  ph_max: number;
  sun: SunRequirement;
  water: WaterNeed;
  feeder: FeederType;
  spacing_in_row_cm: number;
  spacing_between_rows_cm: number;
  sow_indoor_weeks_before_last_frost: number;
  transplant_weeks_after_last_frost: number;
  direct_sow: boolean;
  days_to_harvest: [number, number];
  harvest_window_weeks: number;
  yield_kg_per_plant: [number, number];
  companions: string[];
  antagonists: string[];
  rotation_group: string;
  rotation_follows_well: string[];
  rotation_avoid_after: string[];
  pests: string[];
  notes_fi: string;
  emoji: string;
  sfg_per_square?: number; // for square foot gardening mode
}

// Crop assignment
export interface CropAssignment {
  crop_id: string;
  qty: number;
  sow_date?: string;
  harvest_date?: string;
  actual_yield_kg?: number;
  notes?: string;
}

// Season plan
export interface SeasonPlan {
  id: string;
  year: number;
  season: 'spring' | 'autumn' | 'full_year';
  crop_assignments: { zone_id: string; crops: CropAssignment[] }[];
}

// Chat message
export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  actions_taken?: string[];
  source?: 'text' | 'voice';
}

// Voice note
export interface VoiceNote {
  id: string;
  timestamp: Date;
  audio_url: string;
  transcript: string;
  zone_id?: string;
  video_update_id?: string;
  actions_extracted?: string[];
}

// Garden - the main data model
export interface Garden {
  id: string;
  name: string;
  owner_id?: string;
  width_m: number;
  depth_m: number;
  south_edge: SouthEdge;
  bed_system: BedSystem;
  unit_system: UnitSystem;
  climate: ClimateConfig;
  zones: Zone[];
  seasons: SeasonPlan[];
  active_season: string;
  lifecycle: GardenLifecycle;
  share_token?: string;
  collaborators?: string[];
  published?: boolean;
  chat_history: ChatMessage[];
  voice_notes: VoiceNote[];
  created: Date;
  modified: Date;
}

// Digital twin types
export interface VideoUpdate {
  id: string;
  garden_id: string;
  uploaded_at: Date;
  video_url: string;
  duration_s: number;
  frames_extracted: number;
  gps_track?: GpsPoint[];
  weather: WeatherData;
  processing_status: 'uploading' | 'extracting' | 'analyzing' | 'complete' | 'error';
  snapshot_id?: string;
}

export interface GpsPoint {
  lat: number;
  lng: number;
  heading_deg: number;
  timestamp: Date;
}

export interface WeatherData {
  date: string;
  temp_avg_c: number;
  temp_max_c: number;
  temp_min_c: number;
  rain_mm_7d: number;
  rain_mm_today: number;
  humidity_pct: number;
  wind_kmh: number;
  uv_index: number;
  daylight_hours: number;
  gdd_accumulated: number;
}

export interface GardenSnapshot {
  id: string;
  garden_id: string;
  video_update_id: string;
  date: string;
  weather: WeatherData;
  zones: ZoneSnapshot[];
}

export interface ZoneSnapshot {
  zone_id: string;
  health_score: number;
  growth_stage: string;
  growth_vs_expected: 'ahead' | 'on-track' | 'behind' | 'stalled';
  coverage_pct: number;
  crops_detected: CropDetection[];
  weeds: { severity: string; types: string[] };
  pests: PestDetection[];
  diseases: DiseaseDetection[];
  soil: { moisture: string; mulch_pct: number; bare_pct: number };
  action_items: ActionItem[];
  harvest_readiness: { ready: boolean; days_to_harvest: number };
  photo_urls: string[];
  thumbnail_url: string;
  gemini_response: object;
}

export interface CropDetection {
  species: string;
  confidence: number;
  count_estimate: number;
  health: number;
  height_cm: number;
  issues: string[];
}

export interface PestDetection {
  type: string;
  confidence: number;
  severity: 'low' | 'moderate' | 'high';
}

export interface DiseaseDetection {
  type: string;
  confidence: number;
  affected_area_pct: number;
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  action: string;
  zone_id: string;
  auto_generated: boolean;
  completed: boolean;
  completed_at?: Date;
}

// Undo/redo action
export interface UndoAction {
  type: string;
  description: string;
  undo: () => void;
  redo: () => void;
}

// Canvas interaction state
export interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  selectedZoneIds: string[];
  draggingZoneId: string | null;
  resizingZoneId: string | null;
  resizeHandle: string | null;
  dragStartX: number;
  dragStartY: number;
  showGrid: boolean;
  showCompanions: boolean;
  showSunHeatmap: boolean;
  snapToGrid: boolean;
}

// Shopping list item
export interface ShoppingListItem {
  category: 'seeds' | 'seedlings' | 'amendments' | 'infrastructure';
  name: string;
  quantity: string;
  notes?: string;
}

// Template
export interface GardenTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
  garden: Partial<Garden>;
  tags: string[];
}

// AI action (from AI response)
export interface AIAction {
  type: 'add_zone' | 'move_zone' | 'remove_zone' | 'resize_zone' | 'rename_zone' | 'rotate_zone' | 'assign_crops' | 'update_climate' | 'resize_garden' | string;
  description: string;
  payload: Record<string, unknown>;
}

// Pending action (staged for approval)
export interface PendingAction {
  id: string;
  action: AIAction;
  status: 'pending' | 'approved' | 'rejected';
}

// AI structured response
export interface AIStructuredResponse {
  message: string;
  actions: AIAction[];
  suggestions: AISuggestion[];
}

// AI-returned suggestion
export interface AISuggestion {
  label: string;
  prompt: string;
}

// Smart suggestion (computed from garden state)
export interface Suggestion {
  id: string;
  label: string;
  prompt: string;
  icon: string;
  priority: number;
  category: 'layout' | 'crops' | 'maintenance' | 'analysis';
}
