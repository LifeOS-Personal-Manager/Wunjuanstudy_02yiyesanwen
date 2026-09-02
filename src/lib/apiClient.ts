import type { ApiResponse, Asset, Essay, EssayCard, EssayWorkspace } from "../types";

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "content-type": "application/json", ...init?.headers },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new ApiClientError("API_UNAVAILABLE", "服务端 API 不可用", response.status);
  const payload = await response.json() as ApiResponse<T>;
  if (!payload.ok) throw new ApiClientError(payload.error.code, payload.error.message, response.status, payload.error.details);
  return payload.data;
}

export interface EssaySummary extends Pick<Essay, "id" | "title" | "author" | "status" | "version" | "createdAt" | "updatedAt"> {}

export const apiClient = {
  health: () => request<{ status: string; database: string; storage: string; user: string }>("/health"),
  listEssays: () => request<EssaySummary[]>("/essays"),
  getWorkspace: (essayId: string) => request<EssayWorkspace>(`/essays/${essayId}`),
  createEssay: (input: { title: string; author: string; originalText: string; sourceName: string; sourceUrl?: string; copyrightNotice: string }) => request<Essay>("/essays", { method: "POST", body: JSON.stringify(input) }),
  archiveEssay: async (essayId: string) => {
    const response = await fetch(`/api/essays/${essayId}`, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) throw new ApiClientError("DELETE_FAILED", "归档散文失败", response.status);
  },
  analyzeEssay: (essayId: string) => request<{ cards: EssayCard[] }>(`/essays/${essayId}/analysis-runs`, { method: "POST", body: JSON.stringify({ cardCount: 6 }) }),
  regenerateCard: (essayId: string, cardId: string, version: number, instruction = "") => request<EssayCard>(`/essays/${essayId}/cards/${cardId}/regenerate`, { method: "POST", body: JSON.stringify({ version, instruction, preserveExcerpt: true }) }),
  updateEssay: (essayId: string, input: Partial<Essay> & { version: number }) => request<Essay>(`/essays/${essayId}`, { method: "PATCH", body: JSON.stringify(input) }),
  updateCard: (essayId: string, cardId: string, input: Partial<EssayCard> & { version: number }) => request<EssayCard>(`/essays/${essayId}/cards/${cardId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteCard: async (essayId: string, cardId: string) => {
    const response = await fetch(`/api/essays/${essayId}/cards/${cardId}`, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) throw new ApiClientError("DELETE_FAILED", "删除图卡失败", response.status);
  },
  reorderCards: (essayId: string, orderedCardIds: string[]) => request<EssayCard[]>(`/essays/${essayId}/cards/order`, { method: "PUT", body: JSON.stringify({ orderedCardIds }) }),
  uploadAsset: (essayId: string, file: File, purpose: "source_image" | "rendered_image" | "export_bundle") => {
    const form = new FormData(); form.set("file", file); form.set("purpose", purpose);
    return request<{ asset: Asset }>(`/essays/${essayId}/assets`, { method: "POST", body: form });
  },
  deleteAsset: (assetId: string) => request<{ deleted: boolean }>(`/assets/${assetId}`, { method: "DELETE" }),
};

export function assetContentUrl(assetId: string | null) {
  if (!assetId) return "";
  if (/^(data:|blob:|https?:|\/)/.test(assetId)) return assetId;
  return `/api/assets/${encodeURIComponent(assetId)}/content`;
}

export function isServerEssay(essay: Essay) {
  return /^[a-f0-9]{64}$/i.test(essay.originalTextSha256);
}
