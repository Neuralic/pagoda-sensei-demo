
export type Activity = {
  id: string;
  title: string;
  location: string;
  duration: string;
  groupSize: string;
  date: string;
  languages: string[];
  image: string;
  bidsCount: number;
  postedDaysAgo: number;
  /** Tour Library line owned by the logged-in guide (guide job board only). */
  isOwnTour?: boolean;
  job_available?: boolean;
  bid_available_at?: string | null;
};
export type CardItinerary = {
  id: string;
  title: string;
  location: string;
  image?: string | undefined;
  signedProfileUrl?: string;
  startDate: string;
  endDate: string;
  duration: string;
  jobsCount: number;
  unassignedCount: number;
  activities: Activity[];
  status?: "draft" | "published" | "banned" | "archived";
  bookingSummary?: ItineraryBookingSummary;
  /** ISO date when itinerary was created/posted; used for sorting by posted date */
  created_at?: string | null;
};

export type ItineraryBookingSummary = {
  open: number;
  bidsReceived: number;
  inProgress: number;
  booked: number;
  closed: number;
  quotedTotal: number;
  bookedTotal: number;
};

export type TourItinerary = {
  id: string;
  name?: string;
  title?: string;
  country: string;
  image?: string;
  location: string;
  tourDate?: string;
  duration?: string;
  description: string;
  notes: string;
  languages: string;
  jobsCount: number;
  unassignedCount: number;
  startTime: string;
  endTime: string;
  start_time?: string;
  end_time?: string;
  activityType: string;
  activity_type?: string;
  children?: number;
  adults?: number;
  imagePath?: string;
  activities: Activity[];
  status?: "draft" | "published" | "banned";
  onItineraryCreated?: () => void;
};

export type ApiItinerary = {
  id: string
  name: string
  location: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  image?: string | null
  description?: string | null
  status?: "draft" | "published" | "banned" | "archived";
  booking_summary?: ItineraryBookingSummary;
  highlights?: string[] | null
  created_at?: string | null
  updated_at?: string | null
  // Airport transfer fields (optional)
  arrival_transfer?: boolean
  arrival_flight_number?: string | null
  arrival_flight_time?: string | null // time (HH:MM[:SS])
  departure_transfer?: boolean
  departure_flight_number?: string | null
  departure_flight_time?: string | null
  arrival_location: Record<string, string>
  trips_summary: Record<string, { summary: string[]; }>
  arrival_heading?: Record<string, string>
  pdf_title?: string | null
  pdf_subtitle?: string | null
  build_mode?: "self" | "pagoda_build" | string | null
  intake_data?: import("@/lib/itinerary-intake").ItineraryIntakeData | null
  markup_pct?: number | null
  margin_strategy?: "keep" | "share" | "split" | string | null
  /** Owning advisor/agency user id — used for PDF “Organized by” when admin edits. */
  user_id?: string | null
  /** Populated by GET /api/itineraries/[id] for admin tooling / PDF owner display. */
  owner?: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
}

export type JobApplicationProfile = {
  profile_picture_path?: string | null
  bio?: string | null
  intro_video_path?: string | null
  profile_slug?: string | null
}

export type JobApplicationRow = {
  offer_status?: string | null
  is_finalist?: boolean
  is_candidate?: boolean
  applicant_id?: string
  guide_price?: number | null
  price_per_adult?: number | null
  price_per_child?: number | null
  price_per_infant?: number | null
  profiles?: JobApplicationProfile | JobApplicationProfile[] | null
}

export type JobRow = {
  id: string
  name: string
  activity_type: string
  start_time: string // ISO
  end_time: string // ISO
  location: string
  description?: string | null
  status?: "draft" | "publish"
  images?: string[] | null
  min_price?: number | null
  max_price?: number | null
  languages?: string | null
  group_size?: number | null
  adults?: number | null
  children?: number | null
  infants?: number | null
  notes?: string | null
  advisor_comments?: string | null
  job_applications?: JobApplicationRow[] | null
  supplier_price?: number | null
  client_price?: number | null
  line_markup_pct?: number | null
  baseDisplayPrice?: number | null
  /** Pagoda's cut for this line's guide, from guide_commission_settings. */
  pagodaMarkupPct?: number | null
  /** The guide's agent commission — a floor on the advisor markup, never removable. */
  commissionAgentPct?: number | null
  displayPrice?: number | null
  advisorProfit?: number | null
  markupPct?: number | null
  tour_id?: string | null
  guide_id?: string | null
  guide_name?: string | null
  tour?: {
    user_id?: string
    pricing_model?: string | null
    price_per_adult?: number | null
    price_per_child?: number | null
    price_per_infant?: number | null
    base_rate?: number | null
    base_group_size?: number | null
    max_group_size?: number | null
    additional_per_person_rate?: number | null
  } | null
  price_confirmation_status?: string | null
}

export type SidebarActivity = {
  guideId?: string | null; // Guide ID for tour-based chats
  tourId?: string | null; // Tour ID if created from tour library
  offerStatus?: string | null;
  priceConfirmationStatus?: string | null;
  hasCommittedGuide?: boolean | null;
  id?: string
  title?: string
  subtitle?: string
  image?: string
  time?: string
  location?: string
  duration?: string
  activityType?: string
  description?: string
  activityDateISO?: string
  images?: string[] | null
  languages?: string[] | null
  groupSize?: number | null
  adults?: number | null
  children?: number | null
  infants?: number | null
  notes?: string | null
  /** Notes/ideas shared with the travel advisor for this activity. */
  advisorComments?: string | null
  /** Advisor-entered supplier/partner net cost for this line. */
  supplierPrice?: number | null
  /** Optional fixed client sell price (skips itinerary markup for this line). */
  clientPrice?: number | null
  /** Per-line commission % override (null = use itinerary default). */
  lineMarkupPct?: number | null
  displayPrice?: number | null
  baseDisplayPrice?: number | null
  /** Pagoda's cut for this line's guide, from guide_commission_settings. */
  pagodaMarkupPct?: number | null
  /** The guide's agent commission — a floor on the advisor markup, never removable. */
  commissionAgentPct?: number | null
  /** Wall-clock pickup window at origin (24h HH:mm) — set for Transferz rows; avoids UTC display skew. */
  pickupStartLocalHHMM?: string | null
  pickupEndLocalHHMM?: string | null
  start_time?: string | null
  end_time?: string | null
  /** Transfer row: full provider payload for preview modal (not shown as raw guide notes). */
  transferPayload?: Record<string, unknown> | null
}

export interface UpdateJobData {
  // From your form data
  id?: string;
  name?: string;
  activity_type?: string;
  location?: string;
  description?: string | null;
  activityType?: string | null;
  start_time?: string;
  end_time?: string;
  updated_at?: string;
  activityDateISO?: string;

  // Additional fields from your JobRow that might be updated
  min_price?: number | null;
  max_price?: number | null;
  languages?: string | null;
  group_size?: number | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  notes?: string | null;
  images?: string[] | null;
  is_active?: boolean;
  status?: 'draft' | 'publish';
  startTime?: string | null;
  endTime?: string | null;
  imagePaths?: string[] | null;
}


export type Tour = {
  id: string;
  title?: string;
  name?: string;
  image: string;
  country: string;
  location: string;
  start_time?: string | undefined;
  end_time?: string;
  duration: string;
  description: string;
  jobsCount: number;
  group_size: number;
  people: number;
  stops: number;
  tour_date: string;
  highlights: string;
  imagePath?: string;
  notes?: string;
  languages?: string | string[];
  startTime?: string;
  endTime?: string;
  activityType?: string;
  postedDate: string;
  created_at: string;
  unassignedCount: number;
  activities: Activity[];
  activity_type: string;
  signedProfileUrl?: string;
  status?: "draft" | "published" | "banned";
  /** Role-based: guide sees guide price, agent sees total (incl. commissions & VAT). */
  displayPrice?: number | null;
  /** Shown to guide: "Your price". */
  priceLabel?: string;
  /** Only returned for admin. */
  guidePrice?: number | null;
  /** Per-person pricing (¥). When set, used with participants to compute total. */
  pricePerAdult?: number | null;
  pricePerChild?: number | null;
  pricePerInfant?: number | null;
  /** `per_person` | `group_rate` (API may return snake_case only). */
  pricing_model?: string | null;
  /** Group rate: guide base price for up to `base_group_size` people. */
  base_rate?: number | null;
  base_group_size?: number | null;
  max_group_size?: number | null;
  additional_per_person_rate?: number | null;
  /** Agent-facing: per-person total incl. commissions & VAT (from /api/tour/all). */
  displayPricePerAdult?: number | null;
  displayPricePerChild?: number | null;
  displayPricePerInfant?: number | null;
  /** From /api/tour/all: guide’s commission + VAT rates used for agent display totals. */
  priceDisplayCommissions?: {
    commissionMarketplacePct: number;
    commissionAgentPct: number;
    vatRatePct: number;
  } | null;
  /** Guides assigned to lead this tour (agent catalog). */
  assignedGuides?: Array<{
    id: string;
    name: string;
    guideTier: string;
    guideTierLabel: string;
    rating: number | null;
    reviewCount: number;
    marketplaceAvailable: boolean;
    avatarUrl: string | null;
    guideNumber?: string | null;
    profileSlug?: string | null;
  }>;
  /** Owner library: true when no guide profile is linked yet. */
  needsGuideProfile?: boolean;
  /** How many times this catalog tour has been hired. */
  bookingCount?: number;
  /** Advisor starred this tour in Tour Library. */
  isFavorite?: boolean;
  agent: {
    id: string;
    name: string;
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    profile?: {
      id: string;
      userId: string;
      avatarPath: string;
      avatarUrl: string | null;
    } | null;
  };
};

export interface Day {
  dayNumber: number;
  dayOfWeek: string;
  id: string;
  iso: string;
  label: string;
  title: string;
  arrivalLocation?: string
  summary: string[];
  arrivalHeading?: string;
}

export type UserType = {
  id: number;               // User ID
  email: string;            // Email address
  role: "guide" | "agent"; // Role type
  first_name: string;       // First name
  last_name: string;        // Last name
  is_verified: boolean;     // Verified status
  is_active: boolean;
  created_at: string;
  country: string;
  city?: string;
  phone?: string;
  profile_image?: string;
  signedProfileUrl?: string | null;
  last_active?: string | null;
  alert_count?: number;
  /** When true, admins have enabled full platform activity (`guide_approved` in DB; applies to agents and guides). */
  guide_approved?: boolean;
  /** Computed on /api/admin/user from presence + heartbeat; not stored in DB as a single field. */
  presence_display?: "online" | "idle" | "offline";
  presence_state?: string | null;
  presence_updated_at?: string | null;
  /** Tour company / DMC (role guide + is_operator). */
  is_operator?: boolean;
  /** Set when profile was created by an operator. */
  managed_by_operator_id?: string | null;
  /** Resolved account subtype for admin UI. */
  account_type?: "agent" | "operator" | "guide" | "managed_guide";
  account_type_label?: string;
  /** Operator name when account_type is managed_guide. */
  managed_by_operator_name?: string | null;
  /** Number of managed guides (operators only). */
  managed_guide_count?: number;
};
export type Role = "agent" | "guide";

export type PanicType = {
  id: number;
  email: string;
  role: "guide" | "agent";
  name: string;
  message: string[];
  is_solved: boolean;
  created_at: string;
  response: string;
  mark_solved: boolean;
  phone: string;
  user_id?: number;
  messages?: PanicMessage[];
  first_message_time: string | null;
  last_message_time: string | null;
  total_messages: number;
  ticket_id?: string;
  is_all_active: boolean;
  is_all_solved: boolean;
  sender_image: string;
  sender_name: string;
  sender_id: string;
  user_image?: string;
};


// -------------------------- Types --------------------------
export type MiniUser = {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  message?: string;
  created_at?: string;
  user_image?: string;
  sender_image?: string;
  role?: string | null;
  signedProfileUrl?: string | null;
};

export interface PanicMessage {
  id?: string | number;
  message: string | null;
  created_at: string;
  sender: MiniUser & { signedProfileUrl?: string | null } | null;
  status: boolean | null;
  is_read: boolean | null;
}

export type GroupedTicket = {
  ticket_id: number;
  mark_solved: boolean;
  is_read: boolean;
  messages: PanicMessage[];
  sender_name?: string | null;
};

export type TicketMessage = {
  id: number;
  message: string | null;
  created_at: string;
  sender: (MiniUser & { signedProfileUrl?: string | null }) | null;
  status: boolean | null;
  is_read: boolean | null;
};

export type TicketWithMessages = {
  ticket_id: string;
  messages: TicketMessage[];
  is_all_active?: boolean;
  sender_image?: string;
  sender_name?: string;
  is_all_solved?: boolean;
  last_message_time?: string;
  total_messages?: number;
  signedProfileUrl?: string;
  sender_id?: string;
  first_message_time?: string;
  role?: string | null;
  last_message?: string | null;
  created_at?:string | null;
  message?:string | null;
  job_name?: string | null;
  job_location?: string | null;
  mark_solved?: boolean | null;
  sender_email?: string | null;
   sender_phone?: string | null;
  chat_id?: string | null;
  /** True when admin has unread incoming messages on this ticket */
  has_unread?: boolean;
  unread_count?: number;
};


export type SignedUrlResult = {
  bucket: string;
  path: string;
  signedUrl: string | null;
  publicUrl: string | null;
};

export type EnrichedPanic = {
  id: number;
  ticket_id: string;
  message: string;
  created_at: string;
  mark_solved: boolean;
  is_read: boolean;
  sender_id: string | null;
  receiver_id: string | null;
  sender_name: string | null;
  receiver_name: string | null;
  job_name: string | null;
};
export interface Booking {
  id: string;
  job_id: string;
  applicant_id: string;
  applicant_profile_id: string | null;
  job_title: string;
  location: string;
  duration: string;
  group_size: string;
  date: string; // ISO date string
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  availability_confirmed: boolean;
  availability_notes: string;
  languages: string[];      // array of languages
  why: string;
  certification: string[];  // array of certifications
  file_paths: string[];      // array of uploaded file paths
  status: string;           // e.g., "pending", "completed"
  submitted_at: string;     // ISO timestamp string
  hire_id: string | null;
  guide_price: number | null;
  issueCount?: number | null;
  issueExists?: boolean;
  created_by_name?: string | null;
  /** Present on admin job list when API resolves the posting agent. */
  created_by_email?: string | null;
  name?: string | null;
  created_at?: string | null;
  job_status?: string | null;
  listing_status?: string | null;
  booking_status?: string | null;
  booking_status_label?: string | null;
  bids_count?: number;
  customer_price?: number | null;
}
export type PanicGrouped = {
  ticket_id: string;
  mark_solved: boolean | null;
  is_read: boolean | null;
  sender_name: string | null;
  role?: string | null;
  sender_image: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  messages: PanicMessage[];
  first_message_time: string | null;
  last_message_time: string | null;
  total_messages: number;
  is_all_active: boolean;
  is_all_solved: boolean;
  sender_id: string | null;
  last_message?: string | null;
  job_name?: string | null;
  job_location?: string | null;
};