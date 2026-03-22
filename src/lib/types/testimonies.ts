export interface Testimony {
  id: string;
  date: string; // YYYY-MM-DD format
  service: string; // Service key like "midweek", "1st", "2nd"
  name: string;
  phone?: string;
  email?: string;
  whatDidYouDo?: string;
  description: string;
  status: "pending" | "approved" | "declined";
  createdAt: number; // Unix timestamp
}

export interface LiveTestimony {
  testimonyId: string;
  displayName: string; // Formatted name (e.g., "John D.")
  name: string; // Original full name
  updatedAt: number; // Unix timestamp
}

export interface ServiceType {
  id: string;
  name: string; // Display name (e.g., "Midweek Service")
  key: string; // Key used in database (e.g., "midweek")
  order: number; // Display order
}

export const DEFAULT_SERVICES: Omit<ServiceType, "id">[] = [
  { name: "Midweek Service", key: "midweek", order: 1 },
  { name: "First Service", key: "1st", order: 2 },
  { name: "Second Service", key: "2nd", order: 3 },
];

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export type NameFormattingType = "default" | "regex" | "javascript";

export interface NameFormattingConfig {
  type: NameFormattingType;
  customLogic?: string; // Regex pattern or JavaScript function code
}

export interface LiveTestimonyProPresenterConfig {
  presentationUuid: string;
  slideIndex: number;
  presentationName?: string;
  activationClicks: number; // Number of clicks when going live (default: 1)
  takeOffClicks: number; // Number of clicks when clearing (default: 0)
  clearTextFileOnTakeOff?: boolean; // Whether to clear the text file when taking off live (default: true)
}

export interface LiveTestimoniesSettings {
  firebaseConfig: FirebaseConfig | null;
  liveTestimonyOutputPath: string;
  liveTestimonyFileName: string;
  nameFormatting: NameFormattingConfig;
  proPresenterActivation?: LiveTestimonyProPresenterConfig;
}
