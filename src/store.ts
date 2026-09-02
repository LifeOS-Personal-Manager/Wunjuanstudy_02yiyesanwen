import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEMO_CARDS, DEMO_ESSAY } from "./data/demo";
import type { GeneratedWorkspace } from "./data/generator";
import { apiClient, ApiClientError, isServerEssay } from "./lib/apiClient";
import { createDraftSketch } from "./lib/draftSketch";
import type { Essay, EssayCard } from "./types";

interface Workspace { essay: Essay; cards: EssayCard[] }
interface StoredState { currentId: string; workspaces: Workspace[] }
export type PersistenceMode = "connecting" | "server" | "local";
export type SyncStatus = "idle" | "saving" | "saved" | "error";

interface StudioContextValue extends Workspace {
  projects: Essay[];
  persistenceMode: PersistenceMode;
  syncStatus: SyncStatus;
  syncMessage: string;
  updateEssay: (patch: Partial<Essay>) => void;
  updateCard: (id: string, patch: Partial<EssayCard>) => void;
  removeCard: (id: string) => void;
  moveCard: (id: string, direction: -1 | 1) => void;
  createWorkspace: (workspace: GeneratedWorkspace) => string;
  openProject: (id: string) => void;
  deleteCurrentProject: () => Promise<string | null>;
  uploadCardImages: (files: File[]) => Promise<number>;
  uploadCardImage: (cardId: string, file: File) => Promise<void>;
  generateDraftImages: () => Promise<number>;
  uploadRenderedImage: (cardId: string, blob: Blob, extension: "png" | "jpg") => Promise<void>;
  analyzeCurrentEssay: () => Promise<void>;
  regenerateCard: (cardId: string, instruction?: string) => Promise<void>;
  promoteCurrentEssay: () => Promise<string>;
  resetDemo: () => void;
}

const STORAGE_KEY = "essay-studio-library-v2";
const LEGACY_KEY = "essay-studio-demo-v1";
const demoWorkspace = { essay: DEMO_ESSAY, cards: DEMO_CARDS };
const StudioContext = createContext<StudioContextValue | null>(null);

function loadState(): StoredState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as StoredState;
    const legacy = localStorage.getItem(LEGACY_KEY);
    const workspace = legacy ? JSON.parse(legacy) as Workspace : demoWorkspace;
    return { currentId: workspace.essay.id, workspaces: [workspace] };
  } catch {
    return { currentId: DEMO_ESSAY.id, workspaces: [demoWorkspace] };
  }
}

function notify(message: string) {
  window.dispatchEvent(new CustomEvent("studio-toast", { detail: message }));
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(loadState);
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("connecting");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState("正在连接服务端");
  const stateRef = useRef(state);
  const essayTimer = useRef<number | null>(null);
  const cardTimers = useRef(new Map<string, number>());
  const pendingCardPatches = useRef(new Map<string, Partial<EssayCard>>());

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    const localWorkspaces = state.workspaces.filter((workspace) => !isServerEssay(workspace.essay));
    const localCurrent = localWorkspaces.some((workspace) => workspace.essay.id === state.currentId) ? state.currentId : localWorkspaces[0]?.essay.id || DEMO_ESSAY.id;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentId: localCurrent, workspaces: localWorkspaces }));
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await apiClient.health();
        const summaries = await apiClient.listEssays();
        // One legacy or damaged project must not make the whole studio silently
        // switch to local mode. Keep every readable cloud project available.
        const loaded = await Promise.allSettled(summaries.map((essay) => apiClient.getWorkspace(essay.id)));
        const serverWorkspaces = loaded.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        if (cancelled) return;
        setState((previous) => {
          const local = previous.workspaces.filter((workspace) => !isServerEssay(workspace.essay));
          const merged = [...serverWorkspaces.map(({ essay, cards }) => ({ essay, cards })), ...local];
          return { currentId: merged.some((workspace) => workspace.essay.id === previous.currentId) ? previous.currentId : merged[0]?.essay.id || DEMO_ESSAY.id, workspaces: merged.length ? merged : [demoWorkspace] };
        });
        setPersistenceMode("server"); setSyncStatus("saved"); setSyncMessage("已连接 D1 / R2");
      } catch {
        if (cancelled) return;
        setPersistenceMode("local"); setSyncStatus("saved"); setSyncMessage("本地演示模式");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const current = state.workspaces.find((item) => item.essay.id === state.currentId) || state.workspaces[0] || demoWorkspace;
  const updateWorkspace = (essayId: string, updater: (workspace: Workspace) => Workspace) => setState((previous) => ({ ...previous, workspaces: previous.workspaces.map((workspace) => workspace.essay.id === essayId ? updater(workspace) : workspace) }));

  async function recoverWorkspace(essayId: string, message: string) {
    try {
      const workspace = await apiClient.getWorkspace(essayId);
      updateWorkspace(essayId, () => ({ essay: workspace.essay, cards: workspace.cards }));
    } finally {
      setSyncStatus("error"); setSyncMessage(message); notify(message);
    }
  }

  function saveEssay(essayId: string, patch: Partial<Essay>) {
    if (essayTimer.current) window.clearTimeout(essayTimer.current);
    essayTimer.current = window.setTimeout(async () => {
      const live = stateRef.current.workspaces.find((workspace) => workspace.essay.id === essayId);
      if (!live || !isServerEssay(live.essay)) return;
      setSyncStatus("saving"); setSyncMessage("正在保存");
      try {
        const saved = await apiClient.updateEssay(essayId, { ...patch, version: live.essay.version });
        updateWorkspace(essayId, (workspace) => ({ ...workspace, essay: saved }));
        setSyncStatus("saved"); setSyncMessage("已保存到 D1");
      } catch (error) {
        await recoverWorkspace(essayId, error instanceof ApiClientError && error.code === "VERSION_CONFLICT" ? "检测到并发修改，已加载服务器版本" : "保存失败，请检查网络");
      }
    }, 500);
  }

  function saveCard(essayId: string, cardId: string) {
    const existing = cardTimers.current.get(cardId); if (existing) window.clearTimeout(existing);
    cardTimers.current.set(cardId, window.setTimeout(async () => {
      const live = stateRef.current.workspaces.find((workspace) => workspace.essay.id === essayId);
      const card = live?.cards.find((item) => item.id === cardId); const patch = pendingCardPatches.current.get(cardId);
      if (!live || !card || !patch || !isServerEssay(live.essay)) return;
      pendingCardPatches.current.delete(cardId); setSyncStatus("saving"); setSyncMessage("正在保存图卡");
      try {
        const saved = await apiClient.updateCard(essayId, cardId, { ...patch, version: card.version });
        updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: workspace.cards.map((item) => item.id === cardId ? saved : item) }));
        setSyncStatus("saved"); setSyncMessage("图卡已保存");
      } catch (error) {
        await recoverWorkspace(essayId, error instanceof ApiClientError && error.code === "VERSION_CONFLICT" ? "图卡发生并发修改，已加载服务器版本" : "图卡保存失败");
      }
    }, 600));
  }

  async function localDataUrl(file: File) {
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
  }

  const value = useMemo<StudioContextValue>(() => ({
    ...current,
    projects: state.workspaces.map((workspace) => workspace.essay).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    persistenceMode, syncStatus, syncMessage,
    updateEssay: (patch) => {
      const essayId = current.essay.id; const server = isServerEssay(current.essay);
      updateWorkspace(essayId, (workspace) => ({ ...workspace, essay: { ...workspace.essay, ...patch, updatedAt: new Date().toISOString(), version: server ? workspace.essay.version : workspace.essay.version + 1 } }));
      if (server) saveEssay(essayId, patch);
    },
    updateCard: (cardId, patch) => {
      const essayId = current.essay.id; const server = isServerEssay(current.essay);
      updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: workspace.cards.map((card) => card.id === cardId ? { ...card, ...patch, updatedAt: new Date().toISOString(), version: server ? card.version : card.version + 1 } : card) }));
      if (server) { pendingCardPatches.current.set(cardId, { ...pendingCardPatches.current.get(cardId), ...patch }); saveCard(essayId, cardId); }
    },
    removeCard: (cardId) => {
      const essayId = current.essay.id; updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: workspace.cards.filter((card) => card.id !== cardId).map((card, position) => ({ ...card, position })) }));
      if (isServerEssay(current.essay)) apiClient.deleteCard(essayId, cardId).then(() => apiClient.getWorkspace(essayId)).then((workspace) => updateWorkspace(essayId, () => ({ essay: workspace.essay, cards: workspace.cards }))).catch(() => recoverWorkspace(essayId, "删除失败，已恢复服务器版本"));
    },
    moveCard: (cardId, direction) => {
      const essayId = current.essay.id; const cards = [...current.cards].sort((a, b) => a.position - b.position); const from = cards.findIndex((card) => card.id === cardId); const to = from + direction;
      if (from < 0 || to < 0 || to >= cards.length) return; [cards[from], cards[to]] = [cards[to], cards[from]]; const ordered = cards.map((card, position) => ({ ...card, position })); updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: ordered }));
      if (isServerEssay(current.essay)) apiClient.reorderCards(essayId, ordered.map((card) => card.id)).then((saved) => updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: saved }))).catch(() => recoverWorkspace(essayId, "排序保存失败，已恢复服务器版本"));
    },
    createWorkspace: (workspace) => { setState((previous) => ({ currentId: workspace.essay.id, workspaces: [workspace, ...previous.workspaces.filter((item) => item.essay.id !== workspace.essay.id)] })); return workspace.essay.id; },
    openProject: (projectId) => setState((previous) => previous.workspaces.some((item) => item.essay.id === projectId) ? { ...previous, currentId: projectId } : previous),
    deleteCurrentProject: async () => {
      const target = current;
      if (target.essay.id === DEMO_ESSAY.id) { notify("示例《蝌蚪》不可删除，可通过恢复案例重新生成"); return null; }
      setSyncStatus("saving"); setSyncMessage("正在清理散文与图片");
      try {
        if (isServerEssay(target.essay)) await apiClient.purgeEssay(target.essay.id);
        const nextId = stateRef.current.workspaces.find((workspace) => workspace.essay.id !== target.essay.id)?.essay.id || DEMO_ESSAY.id;
        setState((previous) => {
          const remaining = previous.workspaces.filter((workspace) => workspace.essay.id !== target.essay.id);
          return { currentId: remaining[0]?.essay.id || DEMO_ESSAY.id, workspaces: remaining.length ? remaining : [demoWorkspace] };
        });
        setSyncStatus("saved"); setSyncMessage("散文项目及关联图片已删除");
        return nextId;
      } catch (error) {
        setSyncStatus("error"); setSyncMessage("删除失败，项目未被移除"); throw error;
      }
    },
    uploadCardImages: async (files) => {
      const essayId = current.essay.id; const cards = [...current.cards].sort((a, b) => a.position - b.position); const count = Math.min(files.length, cards.length);
      const orderedFiles = files.map((file, index) => ({ file, index, position: Number(file.name.match(/(?:^|\D)(0?[1-6])(?:\D|$)/)?.[1] || 99) })).sort((a, b) => a.position - b.position || a.index - b.index).map((item) => item.file);
      setSyncStatus("saving"); setSyncMessage("正在上传图片");
      if (isServerEssay(current.essay)) {
        for (let index = 0; index < count; index++) {
          const { asset } = await apiClient.uploadAsset(essayId, orderedFiles[index], "source_image"); const live = stateRef.current.workspaces.find((workspace) => workspace.essay.id === essayId)?.cards.find((card) => card.id === cards[index].id) || cards[index];
          try { const saved = await apiClient.updateCard(essayId, cards[index].id, { sourceAssetId: asset.id, crop: { focalX: 50, focalY: 50, zoom: 1 }, version: live.version }); updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: workspace.cards.map((card) => card.id === saved.id ? saved : card) })); if (live.sourceAssetId && live.sourceAssetId !== asset.id) await apiClient.deleteAsset(live.sourceAssetId).catch(() => undefined); }
          catch (error) { await apiClient.deleteAsset(asset.id).catch(() => undefined); throw error; }
        }
        setSyncStatus("saved"); setSyncMessage("图片已保存到 R2");
      } else {
        for (let index = 0; index < count; index++) { const dataUrl = await localDataUrl(orderedFiles[index]); updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: workspace.cards.map((card) => card.id === cards[index].id ? { ...card, sourceAssetId: dataUrl, crop: { focalX: 50, focalY: 50, zoom: 1 }, version: card.version + 1 } : card) })); }
        setSyncStatus("saved"); setSyncMessage("图片保存在本浏览器");
      }
      return count;
    },
    uploadCardImage: async (cardId, file) => {
      const essayId = current.essay.id; const card = stateRef.current.workspaces.find((workspace) => workspace.essay.id === essayId)?.cards.find((item) => item.id === cardId); if (!card) throw new Error("CARD_NOT_FOUND");
      setSyncStatus("saving"); setSyncMessage("正在替换图片");
      if (isServerEssay(current.essay)) {
        const { asset } = await apiClient.uploadAsset(essayId, file, "source_image");
        try { const saved = await apiClient.updateCard(essayId, cardId, { sourceAssetId: asset.id, crop: { focalX: 50, focalY: 50, zoom: 1 }, version: card.version }); updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: workspace.cards.map((item) => item.id === cardId ? saved : item) })); if (card.sourceAssetId && card.sourceAssetId !== asset.id) await apiClient.deleteAsset(card.sourceAssetId).catch(() => undefined); }
        catch (error) { await apiClient.deleteAsset(asset.id).catch(() => undefined); throw error; }
      } else {
        const dataUrl = await localDataUrl(file); updateWorkspace(essayId, (workspace) => ({ ...workspace, cards: workspace.cards.map((item) => item.id === cardId ? { ...item, sourceAssetId: dataUrl, crop: { focalX: 50, focalY: 50, zoom: 1 }, version: item.version + 1 } : item) }));
      }
      setSyncStatus("saved"); setSyncMessage(isServerEssay(current.essay) ? "图片已保存到 R2" : "图片保存在本浏览器");
    },
    generateDraftImages: async () => {
      const missing = [...current.cards].sort((a, b) => a.position - b.position).filter((card) => !card.sourceAssetId);
      if (!missing.length) return 0;
      setSyncStatus("saving"); setSyncMessage("正在生成草图");
      try {
        for (const card of missing) {
          const file = await createDraftSketch(current.essay, card);
          if (isServerEssay(current.essay)) {
            const { asset } = await apiClient.uploadAsset(current.essay.id, file, "source_image");
            const live = stateRef.current.workspaces.find((workspace) => workspace.essay.id === current.essay.id)?.cards.find((item) => item.id === card.id) || card;
            const saved = await apiClient.updateCard(current.essay.id, card.id, { sourceAssetId: asset.id, crop: { focalX: 50, focalY: 50, zoom: 1 }, version: live.version });
            updateWorkspace(current.essay.id, (workspace) => ({ ...workspace, cards: workspace.cards.map((item) => item.id === saved.id ? saved : item) }));
          } else {
            const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
            updateWorkspace(current.essay.id, (workspace) => ({ ...workspace, cards: workspace.cards.map((item) => item.id === card.id ? { ...item, sourceAssetId: dataUrl, version: item.version + 1 } : item) }));
          }
        }
        setSyncStatus("saved"); setSyncMessage(isServerEssay(current.essay) ? "草图已保存到 R2" : "草图保存在本浏览器");
        return missing.length;
      } catch (error) {
        setSyncStatus("error"); setSyncMessage("草图生成失败"); throw error;
      }
    },
    uploadRenderedImage: async (cardId, blob, extension) => {
      if (!isServerEssay(current.essay)) return;
      const card = stateRef.current.workspaces.find((workspace) => workspace.essay.id === current.essay.id)?.cards.find((item) => item.id === cardId); if (!card) return;
      const file = new File([blob], `${String(card.position + 1).padStart(2, "0")}.${extension}`, { type: extension === "png" ? "image/png" : "image/jpeg" });
      const { asset } = await apiClient.uploadAsset(current.essay.id, file, "rendered_image");
      try { const saved = await apiClient.updateCard(current.essay.id, cardId, { renderedAssetId: asset.id, version: card.version }); updateWorkspace(current.essay.id, (workspace) => ({ ...workspace, cards: workspace.cards.map((item) => item.id === cardId ? saved : item) })); if (card.renderedAssetId && card.renderedAssetId !== asset.id) await apiClient.deleteAsset(card.renderedAssetId).catch(() => undefined); }
      catch (error) { await apiClient.deleteAsset(asset.id).catch(() => undefined); throw error; }
    },
    analyzeCurrentEssay: async () => {
      if (!isServerEssay(current.essay)) { notify("本地演示模式不会调用 DeepSeek"); return; }
      setSyncStatus("saving"); setSyncMessage("DeepSeek 正在分析");
      try { await apiClient.analyzeEssay(current.essay.id); const workspace = await apiClient.getWorkspace(current.essay.id); updateWorkspace(current.essay.id, () => ({ essay: workspace.essay, cards: workspace.cards })); setSyncStatus("saved"); setSyncMessage("分析结果已保存到 D1"); }
      catch (error) { setSyncStatus("error"); setSyncMessage("AI 分析失败"); throw error; }
    },
    regenerateCard: async (cardId, instruction = "") => {
      if (!isServerEssay(current.essay)) { notify("本地演示模式不能重新调用 DeepSeek"); return; }
      const card = stateRef.current.workspaces.find((workspace) => workspace.essay.id === current.essay.id)?.cards.find((item) => item.id === cardId); if (!card) return;
      setSyncStatus("saving"); setSyncMessage("正在重新生成单卡");
      try { const saved = await apiClient.regenerateCard(current.essay.id, cardId, card.version, instruction); updateWorkspace(current.essay.id, (workspace) => ({ ...workspace, cards: workspace.cards.map((item) => item.id === cardId ? saved : item) })); setSyncStatus("saved"); setSyncMessage("单卡已重新生成"); }
      catch (error) { await recoverWorkspace(current.essay.id, "单卡重新生成失败"); throw error; }
    },
    promoteCurrentEssay: async () => {
      if (isServerEssay(current.essay)) return current.essay.id;
      if (persistenceMode !== "server") throw new Error("服务端尚未连接");
      setSyncStatus("saving"); setSyncMessage("正在创建云端项目并分析");
      let createdId = "";
      try {
        const created = await apiClient.createEssay({
          title: current.essay.title, author: current.essay.author,
          originalText: current.essay.originalText, sourceName: current.essay.sourceName,
          sourceUrl: current.essay.sourceUrl || "https://essay-image-studio.pages.dev/",
          copyrightNotice: current.essay.copyrightNotice,
        });
        createdId = created.id; await apiClient.analyzeEssay(created.id);
        const saved = await apiClient.getWorkspace(created.id);
        setState((previous) => ({ currentId: saved.essay.id, workspaces: [{ essay: saved.essay, cards: saved.cards }, ...previous.workspaces.filter((item) => item.essay.id !== saved.essay.id)] }));
        setSyncStatus("saved"); setSyncMessage("已创建云端项目并完成分析");
        return saved.essay.id;
      } catch (error) {
        if (createdId) await apiClient.archiveEssay(createdId).catch(() => undefined);
        setSyncStatus("error"); setSyncMessage("云端分析失败"); throw error;
      }
    },
    resetDemo: () => setState((previous) => ({ currentId: DEMO_ESSAY.id, workspaces: [demoWorkspace, ...previous.workspaces.filter((item) => item.essay.id !== DEMO_ESSAY.id)] })),
  }), [current, state.workspaces, persistenceMode, syncStatus, syncMessage]);

  return createElement(StudioContext.Provider, { value }, children);
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}
