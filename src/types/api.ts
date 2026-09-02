import type {
  AnalysisRun,
  Asset,
  CardKind,
  Essay,
  EssayCard,
  ImageCrop,
  TemplateSettings,
  TextPosition,
} from "./domain";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    fieldErrors?: Record<string, string[]>;
    details?: unknown;
  };
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_AMBIGUOUS"
  | "SOURCE_MISMATCH"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "IMAGE_TOO_LARGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "API_UNAVAILABLE"
  | "DEEPSEEK_TIMEOUT"
  | "DEEPSEEK_NOT_CONFIGURED"
  | "DEEPSEEK_REJECTED"
  | "DEEPSEEK_INVALID_JSON"
  | "R2_WRITE_FAILED"
  | "INTERNAL_ERROR";

export interface CreateEssayRequest {
  title: string;
  author: string;
  originalText: string;
  sourceName: string;
  sourceUrl?: string;
  copyrightNotice: string;
}

export type CreateEssayResponse = Essay;

export interface UpdateEssayRequest {
  version: number;
  title?: string;
  author?: string;
  originalText?: string;
  sourceName?: string;
  copyrightNotice?: string;
  publicationCopy?: string;
}

export interface StartAnalysisRequest {
  cardCount?: 6;
}

export type StartAnalysisResponse = AnalysisRun;

export interface UpdateCardRequest {
  version: number;
  kind?: CardKind;
  sourceExcerpt?: string;
  editorGuide?: string;
  sceneDescription?: string;
  imagePrompt?: string;
  textPosition?: TextPosition;
  crop?: ImageCrop;
  templateSettings?: TemplateSettings;
  sourceAssetId?: string | null;
  renderedAssetId?: string | null;
}

export interface ReorderCardsRequest {
  orderedCardIds: string[];
}

export interface RegenerateCardRequest {
  instruction?: string;
  preserveExcerpt: boolean;
}

export interface MatchAssetRequest {
  cardId: string;
  cardVersion: number;
}

export interface UploadAssetResponse {
  asset: Asset;
}

export interface PromptItem {
  cardId: string;
  position: number;
  kind: CardKind;
  prompt: string;
}

export interface ExportManifest {
  essay: Pick<Essay, "id" | "title" | "author" | "publicationCopy">;
  cards: Array<
    Pick<
      EssayCard,
      "id" | "kind" | "position" | "sourceExcerpt" | "imagePrompt"
    > & { renderedAsset: Asset }
  >;
  promptsMarkdown: string;
}
