export type EntityId = string;
export type IsoDateTime = string;

export type EssayStatus =
  | "draft"
  | "analyzing"
  | "editing"
  | "ready"
  | "archived";

export interface Essay {
  id: EntityId;
  title: string;
  author: string;
  originalText: string;
  originalTextSha256: string;
  sourceName: string;
  sourceUrl?: string;
  sourceRetrievedAt?: IsoDateTime | null;
  copyrightNotice: string;
  status: EssayStatus;
  publicationCopy: string;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type CardKind = "cover" | "body" | "ending";
export type SourceStatus = "valid" | "source_stale" | "invalid";

/** UTF-16 code-unit range, matching String.prototype.slice(start, end). */
export interface SourceRange {
  start: number;
  end: number;
}

export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "center" | "bottom";

export interface TextPosition {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  maxHeightPercent: number;
  horizontalAlign: HorizontalAlign;
  verticalAlign: VerticalAlign;
  fontSizePx: number;
  lineHeight: number;
}

export interface ImageCrop {
  focalX: number;
  focalY: number;
  zoom: number;
}

export interface TemplateSettings {
  overlayOpacity: number;
  textColor: string;
  accentColor: string;
  showAuthor: boolean;
  showEditorGuide: boolean;
}

export interface EssayCard {
  id: EntityId;
  essayId: EntityId;
  kind: CardKind;
  position: number;
  sourceRange: SourceRange;
  sourceExcerpt: string;
  editorGuide: string;
  sceneDescription: string;
  imagePrompt: string;
  textPosition: TextPosition;
  crop: ImageCrop;
  templateSettings: TemplateSettings;
  sourceAssetId: EntityId | null;
  renderedAssetId: EntityId | null;
  sourceStatus: SourceStatus;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type AssetPurpose =
  | "source_image"
  | "rendered_image"
  | "export_bundle";

export type AssetMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/zip";

export interface Asset {
  id: EntityId;
  essayId: EntityId;
  purpose: AssetPurpose;
  originalFilename: string;
  mimeType: AssetMimeType;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
  createdAt: IsoDateTime;
}

export type AnalysisScope = "essay" | "card";
export type AnalysisStatus = "queued" | "running" | "succeeded" | "failed";

export interface AnalysisRun {
  id: EntityId;
  essayId: EntityId;
  scope: AnalysisScope;
  targetCardId: EntityId | null;
  model: string;
  promptVersion: string;
  status: AnalysisStatus;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: IsoDateTime;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
}

export interface EssayWorkspace {
  essay: Essay;
  cards: EssayCard[];
  assets: Asset[];
}

export const OUTPUT_SIZE = {
  width: 1080,
  height: 1440,
} as const;
