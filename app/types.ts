import {
  ImageIcon,
  BoxIcon,
  Paintbrush,
  CircleDot,
  Wrench,
  Shield,
} from "lucide-react";

export interface FileSizes {
  raw?: number;
  png?: number;
  jpeg?: number;
  webp?: number;
}
export type BrushMode = "brush" | "lasso" | "polygon" | "spline";

export interface FileToolbarSettings {
  imageVisibility: boolean;
  maskVisibility: boolean;
  brushMode: BrushMode;
  brushSize: number;
  brushHardness: number;
  brushOpacity: number;
  brushColor: string;
  swapMouseClicks: boolean;
  maskOpacity: number;
  thresholdValue: number;
  thresholdValueEnabled: boolean;
  traceMinBlobPixels: number;
  traceMinBlobPixelsEnabled: boolean;
  simplifyEpsilon: number;
  simplifyEpsilonEnabled: boolean;
  smoothIterations: number;
  smoothIterationsEnabled: boolean;
  contourOffset: number;
  contourOffsetEnabled: boolean;
  feather: number;
  featherEnabled: boolean;
  imageOpacity: number;
  splineCurviness?: number;
}

export type TaskStatus = "unassigned" | "assigned" | "progressing" | "commented" | "completed";
export type UserRole = "admin" | "annotator" | "reviewer" | string;

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  color?: string; // e.g. "purple", "blue", "emerald", "amber"
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  password?: string;
  disabled?: boolean;
  isArchived?: boolean;
}

export interface FastApiWorkerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status?: "online" | "offline" | "checking";
}

export interface TaskAssignment {
  id: string;
  folder: string;
  basename: string;
  assignedTo?: string; // User ID
  assignedToName?: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  updatedAt: string;
}

export interface MetaFile {
  id?: string;
  name: string;
  folder?: string;
  metafolder?: string; // Relation ID referencing metafolders collection
  width: number;
  height: number;
  issues: string[];
  comment: string;
  thumbnail: string;

  // Destructured File Sizes
  sizeRaw?: number;
  sizePng?: number;
  sizeJpeg?: number;
  sizeWebp?: number;
  filesizes?: FileSizes;

  // Destructured Toolbar Settings (prop_* prefixed in PocketBase DB)
  prop_imageVisibility?: boolean;
  prop_maskVisibility?: boolean;
  prop_brushMode?: BrushMode;
  prop_brushSize?: number;
  prop_brushHardness?: number;
  prop_brushOpacity?: number;
  prop_brushColor?: string;
  prop_swapMouseClicks?: boolean;
  prop_maskOpacity?: number;
  prop_thresholdValue?: number;
  prop_thresholdValueEnabled?: boolean;
  prop_traceMinBlobPixels?: number;
  prop_traceMinBlobPixelsEnabled?: boolean;
  prop_simplifyEpsilon?: number;
  prop_simplifyEpsilonEnabled?: boolean;
  prop_smoothIterations?: number;
  prop_smoothIterationsEnabled?: boolean;
  prop_contourOffset?: number;
  prop_contourOffsetEnabled?: boolean;
  prop_feather?: number;
  prop_featherEnabled?: boolean;
  prop_imageOpacity?: number;
  prop_splineCurviness?: number;

  imageVisibility?: boolean;
  maskVisibility?: boolean;
  brushMode?: BrushMode;
  brushSize?: number;
  brushHardness?: number;
  brushOpacity?: number;
  brushColor?: string;
  swapMouseClicks?: boolean;
  maskOpacity?: number;
  thresholdValue?: number;
  thresholdValueEnabled?: boolean;
  traceMinBlobPixels?: number;
  traceMinBlobPixelsEnabled?: boolean;
  simplifyEpsilon?: number;
  simplifyEpsilonEnabled?: boolean;
  smoothIterations?: number;
  smoothIterationsEnabled?: boolean;
  contourOffset?: number;
  contourOffsetEnabled?: boolean;
  feather?: number;
  featherEnabled?: boolean;
  imageOpacity?: number;
  toolbar?: Partial<FileToolbarSettings>;

  // Assignment (Relation to users) & Status
  assignedTo?: string; // User ID (relation)
  assignedToName?: string; // Resolved via expand.assignedTo
  status?: TaskStatus;
  priority?: "low" | "medium" | "high";

  // Timestamps & Auditing
  createdAt: string;
  updatedAt: string;
  exportedAt?: string;
  lastIngestedAt?: string;
  hasSidecar?: boolean;
}

export interface ImgJsonBlob {
  image: string;
  object: string;
  repair: string;
  color: string;
}

export interface ImgData {
  folder: string;
  metadata: MetaFile;
  jsonblob: ImgJsonBlob;
}

export interface MetaFolder {
  id?: string;
  name: string;
  folderPath?: string;
  filesCount: number;
  foldersCount: number;
  assignedTo?: string; // User ID (relation)
  assignedToName?: string; // Resolved via expand.assignedTo
  status?: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

type MetaFiles = Record<string, MetaFile>;
type MetaFolders = Record<string, MetaFolder>;

export interface FolderJson {
  metafiles: MetaFiles;
  metafolders?: MetaFolders;
}

export interface GlobalMetaJson {
  metafiles: Record<string, MetaFile>;
  metafolders: Record<string, MetaFolder>;
  generatedAt: string;
}

export interface PathData { basename: string; parent: string; }
export type ApiRequest_file = PathData;
export type ApiRequest_object = PathData;

export interface ApiRequest_export {
  folder: string;
  basename: string;
  new_erase: string;
  new_paint: string;
  metadata: MetaFile;
}

export interface ApiResponse_folder {
  metafiles: MetaFiles;
  metafolders?: MetaFolders;
  parentFolder: PathData;
  currentFolder: PathData;
  siblingFolders: PathData[];
  childrenFolders: PathData[];
  globalMeta?: GlobalMetaJson;
}

export interface PersonaDefinition {
  id: PERSONA;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export enum PERSONA {
  IMAGE,
  OBJECT,
  REPAIR,
  VECTOR,
  COLOR,
  ADMIN,
}
export const PERSONALSIT: PersonaDefinition[] = [
  {
    id: PERSONA.ADMIN,
    label: "Admin",
    description: "Manage team accounts and assign batch tasks",
    icon: Shield,
  },
  {
    id: PERSONA.IMAGE,
    label: "Image",
    description: "Inspect base source imagery",
    icon: ImageIcon,
  },
  {
    id: PERSONA.OBJECT,
    label: "Object",
    description: "Generate bounding boxes and object layers",
    icon: BoxIcon,
  },
  {
    id: PERSONA.REPAIR,
    label: "Repair",
    description: "Refine segmentation and erase masks",
    icon: Wrench,
  },
  {
    id: PERSONA.VECTOR,
    label: "Vector",
    description: "Generate vectors and edit masks",
    icon: CircleDot,
  },
  {
    id: PERSONA.COLOR,
    label: "Color",
    description: "Apply inpainting",
    icon: Paintbrush,
  },
];


export const DEFAULT_INSPECTOR_ISSUE_TAGS: string[] = [
  "bg-noise",
  "part-excess",
  "bg-uneven",
  "part-deform",
  "bg-residue",
  "part-absent",
  "waiting",
  "revisit"
];


export const STORAGE_PATH: string = process.env.STORAGE_PATH || "__storage__";

export const PACKAGE_NAME: string = process.env.PACKAGE_NAME || "Image Workspace";
export const PACKAGE_DESC: string = process.env.PACKAGE_DESC || "A premium image refining and quality auditing workspace.";


export const ENABLE_DEMO_ACCOUNTS: boolean =
  process.env.NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS !== undefined
    ? process.env.NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS === "true"
    : false;

export const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8099";

export const FASTAPI_PORT: string = process.env.FASTAPI_PORT || "5678";
export const FASTAPI_PATH: string = process.env.FASTAPI_PATH || ".";
export const FASTAPI_WORKER_URLS: string[] = Object.entries(process.env)
  .filter(([key]) => key.startsWith("FASTAPI_WORKER_URL_"))
  .map(([, value]) => {
    let url = (value || "").trim();
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }
    return url.replace(/\/+$/, "");
  })
  .filter(Boolean);

// Environment configuration for auto ingestion interval (in minutes)
export const NEXT_AUTO_INGEST_INTERVAL: number = process.env.NEXT_AUTO_INGEST_INTERVAL
  ? parseInt(process.env.NEXT_AUTO_INGEST_INTERVAL, 10)
  : 60;
export const RESOLVED_AUTO_INGEST_INTERVAL_MINS: number = Math.min(
  60, isNaN(NEXT_AUTO_INGEST_INTERVAL) ? 60 : NEXT_AUTO_INGEST_INTERVAL
);