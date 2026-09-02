import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Clipboard, Copy, Download,
  FileArchive, FileText, Image, Images, LayoutTemplate, LoaderCircle, Menu, MoreHorizontal,
  PencilLine, Plus, RefreshCw, RotateCcw, Save, Settings2, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import { toJpeg, toPng } from "html-to-image";
import JSZip from "jszip";
import { CardCanvas } from "./components/CardCanvas";
import { Badge, Button, Field, IconButton, Input, Textarea } from "./components/ui";
import { generateWorkspace, type GeneratedWorkspace } from "./data/generator";
import { downloadBlob, slugify } from "./lib/utils";
import { searchPublicSources, type SourceCandidate } from "./lib/sourceSearch";
import { apiClient, assetContentUrl, isServerEssay } from "./lib/apiClient";
import { StudioProvider, useStudio } from "./store";
import type { EssayCard } from "./types";

const navItems = [
  { to: "", label: "图卡", icon: Images },
  { to: "prompts", label: "提示词", icon: Sparkles },
  { to: "assets", label: "图片", icon: Image },
  { to: "layout", label: "排版", icon: LayoutTemplate },
  { to: "export", label: "导出", icon: Download },
];

function toast(message: string) {
  window.dispatchEvent(new CustomEvent("studio-toast", { detail: message }));
}

function ToastHost() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const handler = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail);
      window.setTimeout(() => setMessage(""), 2200);
    };
    window.addEventListener("studio-toast", handler);
    return () => window.removeEventListener("studio-toast", handler);
  }, []);
  return message ? <div className="toast"><Check size={16} />{message}</div> : null;
}

function Shell() {
  const { essay, cards, projects, openProject, resetDemo, persistenceMode, syncStatus, syncMessage } = useStudio();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const requestedEssayId = location.pathname.match(/^\/essays\/([^/]+)/)?.[1] || "";
  useEffect(() => {
    if (persistenceMode !== "connecting" && requestedEssayId && requestedEssayId !== essay.id && projects.some((project) => project.id === requestedEssayId)) openProject(requestedEssayId);
  }, [essay.id, openProject, persistenceMode, projects, requestedEssayId]);
  const displayedSyncMessage = persistenceMode === "server" && !isServerEssay(essay) ? "案例 · 本地保存" : syncMessage;
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate(`/essays/${essay.id}`)}>
          <span className="brand-seal">文</span><span>散文贴图生产台</span>
        </button>
        <div className="topbar-meta"><Badge tone={syncStatus === "error" || persistenceMode === "local" || !isServerEssay(essay) ? "amber" : "green"}>{displayedSyncMessage}</Badge><select className="project-switcher" aria-label="切换散文" value={essay.id} onChange={(event) => { openProject(event.target.value); navigate(`/essays/${event.target.value}`); }}>{projects.map(project => <option value={project.id} key={project.id}>{project.title} · {project.author}</option>)}</select><span>{cards.length} 张图卡</span></div>
        <div className="topbar-actions">
          <IconButton label="新建散文" onClick={() => navigate("/essays/new")}><Plus size={18} /></IconButton>
          <IconButton label="恢复案例" onClick={() => { resetDemo(); navigate("/essays/demo-tadpoles"); toast("已恢复《蝌蚪》案例"); }}><RotateCcw size={18} /></IconButton>
          <IconButton label="菜单" className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={20} /></IconButton>
        </div>
      </header>
      <div className="workspace-grid">
        <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
          <div className="essay-id">
            <span className="eyebrow">当前散文</span>
            <strong>{essay.title}</strong><span>{essay.author}</span>
          </div>
          <nav>{navItems.map(({ to, label, icon: Icon }) => <NavLink key={label} end={to === ""} to={`/essays/${essay.id}${to ? `/${to}` : ""}`} onClick={() => setMobileNav(false)}><Icon size={18} />{label}<ChevronRight size={15} /></NavLink>)}</nav>
          <div className="sidebar-foot"><span>输出规格</span><strong>1080 × 1440</strong><small>微信竖版 · 3:4</small></div>
        </aside>
        <main className="main"><Routes>
          <Route path="/essays/new" element={<NewEssayPage />} />
          <Route path="/essays/:essayId" element={<CardsPage />} />
          <Route path="/essays/:essayId/cards/:cardId" element={<CardEditor />} />
          <Route path="/essays/:essayId/prompts" element={<PromptsPage />} />
          <Route path="/essays/:essayId/assets" element={<AssetsPage />} />
          <Route path="/essays/:essayId/layout" element={<LayoutPage />} />
          <Route path="/essays/:essayId/export" element={<ExportPage />} />
          <Route path="*" element={<Navigate replace to={`/essays/${essay.id}`} />} />
        </Routes></main>
      </div>
      <HiddenExportCanvases />
      <ToastHost />
    </div>
  );
}

function NewEssayPage() {
  const { createWorkspace, persistenceMode } = useStudio();
  const navigate = useNavigate();
  const [title, setTitle] = useState("背影");
  const [author, setAuthor] = useState("朱自清");
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [generatingId, setGeneratingId] = useState("");
  const [error, setError] = useState("");

  const knownAuthors: Record<string, string> = {
    "故都的秋": "郁达夫", "荷塘月色": "朱自清", "背影": "朱自清",
    "济南的冬天": "老舍", "春": "朱自清", "茶馆": "老舍",
  };

  function normalizeAuthor() {
    const normalizedTitle = title.trim().replace(/[《》]/g, "");
    const inferred = knownAuthors[normalizedTitle];
    if (inferred && !author.trim()) { setAuthor(inferred); return inferred; }
    return author.trim();
  }

  async function search() {
    setSearching(true); setError(""); setCandidates([]);
    try {
      const results = await searchPublicSources(title, normalizeAuthor(), persistenceMode === "local");
      setCandidates(results);
      if (!results.length) {
        setError("未能从公开来源或 DeepSeek 补全文中获得可用正文。请确认篇名和作者后重试。");
        return;
      }
      // 自动选择首个通过来源和作者校验的候选，直接进入全文填充与六卡生成。
      await create(results[0]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动索引失败，请稍后重试");
    } finally { setSearching(false); }
  }

  async function create(candidate: SourceCandidate) {
    setGeneratingId(candidate.id); setError("");
    let workspace: GeneratedWorkspace | null = null;
    let createdEssayId = "";
    try {
      if (persistenceMode === "server") {
        const essay = await apiClient.createEssay({ title: candidate.title, author: candidate.author, originalText: candidate.originalText, sourceName: candidate.sourceName, sourceUrl: candidate.sourceUrl, copyrightNotice: candidate.copyrightNotice });
        createdEssayId = essay.id;
        await apiClient.analyzeEssay(essay.id);
        const saved = await apiClient.getWorkspace(essay.id);
        workspace = { essay: saved.essay, cards: saved.cards };
      } else if (persistenceMode === "local") {
        workspace = generateWorkspace(candidate);
      } else {
        throw new Error("服务端仍在连接，请稍后重试");
      }
    } catch (reason) {
      if (createdEssayId) await apiClient.archiveEssay(createdEssayId).catch(() => undefined);
      setError(reason instanceof Error ? reason.message : "生成失败");
    }
    if (workspace) {
      const projectId = createWorkspace(workspace);
      toast(`《${workspace.essay.title}》已自动生成 6 张图卡`);
      navigate(`/essays/${projectId}`);
    }
    setGeneratingId("");
  }

  return <>
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} />返回工作台</button>
    <PageHeader eyebrow="新建散文" title="输入篇名，自动提取与生成" description="输入散文名和作者名，系统会检索公开来源；无结果时由 DeepSeek 补全文并生成六张图卡。" />
    <section className="source-search"><div className="search-form"><Field label="散文名"><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：背影" /></Field><Field label="作者"><Input value={author} onChange={event => setAuthor(event.target.value)} placeholder={knownAuthors[title.trim().replace(/[《》]/g, "")] || "例如：朱自清"} /></Field><Button onClick={search} disabled={searching || persistenceMode === "connecting" || !title.trim()}>{searching ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{searching ? "正在索引全文并生成" : persistenceMode === "connecting" ? "正在连接服务端" : "自动索引并生成六卡"}</Button></div>
      <div className="source-policy"><Check size={17} /><span>优先使用公开来源；无结果时 DeepSeek 会补全文。AI 补全文必须在发布前与授权版本逐字核验。</span></div></section>
    {error && <div className="error-banner">{error}</div>}
    {candidates.length > 0 && <div className="source-results"><div className="results-heading"><h2>找到 {candidates.length} 个候选版本</h2><span>请核对作者、版本与版权说明</span></div>{candidates.map(candidate => <article className="source-candidate" key={candidate.id}><div className="source-main"><div><Badge tone={candidate.sourceName.startsWith("DeepSeek") ? "amber" : "green"}>{candidate.sourceName.startsWith("DeepSeek") ? "AI 补全文" : "公开来源"}</Badge><h2>《{candidate.title}》</h2><strong>{candidate.author}</strong></div><p>{candidate.originalText.slice(0, 230)}……</p></div><dl><div><dt>版本</dt><dd>{candidate.sourceName}</dd></div><div><dt>正文</dt><dd>{candidate.originalText.length} 字 · {candidate.originalText.split(/\n{2,}/).length} 段</dd></div><div><dt>版权</dt><dd>{candidate.copyrightNotice}</dd></div><div><dt>来源</dt><dd><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">查看原页面</a></dd></div></dl><Button onClick={() => create(candidate)} disabled={Boolean(generatingId)}>{generatingId === candidate.id ? <LoaderCircle className="spin" size={17} /> : <ChevronRight size={17} />}{generatingId === candidate.id ? "正在提取并生成" : "确认此版本并生成六卡"}</Button></article>)}</div>}
  </>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function CardsPage() {
  const { essay, cards, moveCard, removeCard, updateEssay, analyzeCurrentEssay, promoteCurrentEssay, deleteCurrentProject } = useStudio();
  const navigate = useNavigate();
  const [editingMeta, setEditingMeta] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ordered = [...cards].sort((a, b) => a.position - b.position);

  async function analyze() {
    setAnalyzing(true);
    try {
      if (!isServerEssay(essay)) { const projectId = await promoteCurrentEssay(); navigate(`/essays/${projectId}`); toast("已复制为云端项目并由 DeepSeek 生成六卡内容"); }
      else { await analyzeCurrentEssay(); toast("已按原文重新分析并生成 6 张图卡"); }
    }
    catch { toast("AI 分析失败，原图卡保持不变"); }
    finally { setAnalyzing(false); }
  }

  async function deleteEssay() {
    if (!confirm(`永久删除《${essay.title}》及其 ${cards.length} 张图卡、图片和分析记录？此操作不可恢复。`)) return;
    setDeleting(true);
    try {
      const nextId = await deleteCurrentProject();
      if (nextId) { navigate(`/essays/${nextId}`); toast("散文项目及关联图片已删除"); }
    } catch { toast("删除失败，请检查网络后重试"); }
    finally { setDeleting(false); }
  }

  return <>
    <PageHeader eyebrow="内容编排" title={`${essay.title} · 图卡结构`} description="原文短摘由源文本逐字定位，编辑导读与画面提示可随时调整。" actions={<><Button variant="secondary" onClick={() => setEditingMeta(!editingMeta)}><PencilLine size={17} />原文信息</Button><Button onClick={analyze} disabled={analyzing}>{analyzing ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{analyzing ? "正在生成六卡内容" : "重新生成六卡内容"}</Button><Button variant="danger" onClick={deleteEssay} disabled={deleting || essay.id === "demo-tadpoles"}>{deleting ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}{deleting ? "正在删除" : "删除当前散文"}</Button></>} />
    {editingMeta && <MetaEditor onClose={() => setEditingMeta(false)} />}
    <section className="status-strip"><div><Check size={18} /><span>原文完整性</span><strong>{cards.filter(c => c.sourceStatus === "valid" && essay.originalText.slice(c.sourceRange.start, c.sourceRange.end) === c.sourceExcerpt).length}/{cards.length} 已验证</strong></div><div><FileText size={18} /><span>原文字数</span><strong>{essay.originalText.length}</strong></div><div><Image size={18} /><span>已匹配底图</span><strong>{cards.filter(c => c.sourceAssetId).length}/{cards.length}</strong></div></section>
    <div className="card-list">{ordered.map((card, index) => <article className="story-card" key={card.id}>
      <div className="story-thumb"><CardPreview card={card} /><span className="card-number">{String(index + 1).padStart(2, "0")}</span></div>
      <div className="story-content"><div className="story-heading"><div><Badge tone={card.kind === "body" ? "neutral" : "amber"}>{card.kind === "cover" ? "封面" : card.kind === "ending" ? "结尾" : "正文"}</Badge><h2>{card.sceneDescription}</h2></div><div className="row-actions"><IconButton label="上移" disabled={index === 0} onClick={() => moveCard(card.id, -1)}><ArrowUp size={16} /></IconButton><IconButton label="下移" disabled={index === ordered.length - 1} onClick={() => moveCard(card.id, 1)}><ArrowDown size={16} /></IconButton><IconButton label="删除" onClick={() => { if (confirm("删除这张图卡及其模板配置？仅由此图卡使用的图片会一并清理。")) removeCard(card.id); }}><Trash2 size={16} /></IconButton></div></div>
        <blockquote>{card.sourceExcerpt}</blockquote><p>{card.editorGuide}</p><button className="text-link" onClick={() => navigate(`cards/${card.id}`)}>编辑图卡 <ChevronRight size={15} /></button>
      </div>
    </article>)}</div>
  </>;
}

function MetaEditor({ onClose }: { onClose: () => void }) {
  const { essay, updateEssay } = useStudio();
  const [draft, setDraft] = useState(essay);
  return <section className="meta-editor"><div className="section-title"><h2>散文信息</h2><IconButton label="关闭" onClick={onClose}><X size={18} /></IconButton></div><div className="form-grid"><Field label="散文名称"><Input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></Field><Field label="作者"><Input value={draft.author} onChange={e => setDraft({ ...draft, author: e.target.value })} /></Field><Field label="版本来源"><Input value={draft.sourceName} onChange={e => setDraft({ ...draft, sourceName: e.target.value })} /></Field><Field label="版权信息"><Input value={draft.copyrightNotice} onChange={e => setDraft({ ...draft, copyrightNotice: e.target.value })} /></Field><Field label="完整原文" hint="修改原文后，生产环境会将已有短摘标记为待重新验证。"><Textarea rows={12} value={draft.originalText} onChange={e => setDraft({ ...draft, originalText: e.target.value })} /></Field></div><div className="align-right"><Button onClick={() => { updateEssay(draft); onClose(); toast("散文信息已保存"); }}><Save size={17} />保存</Button></div></section>;
}

function CardEditor() {
  const { essay, cards, updateCard, regenerateCard, promoteCurrentEssay } = useStudio();
  const { cardId } = useParams();
  const navigate = useNavigate();
  const card = cards.find(c => c.id === cardId);
  const [draft, setDraft] = useState(card);
  const [regenerating, setRegenerating] = useState(false);
  useEffect(() => { setDraft(card); }, [card]);
  if (!card || !draft) return <Navigate to={`/essays/${essay.id}`} replace />;
  const matchAt = essay.originalText.indexOf(draft.sourceExcerpt);
  return <>
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={17} />返回图卡</button>
    <PageHeader eyebrow={`图卡 ${String(card.position + 1).padStart(2, "0")}`} title={card.sceneDescription} description="短摘必须逐字来自原文。重新生成只更新导读、场景和提示词。" actions={<Button onClick={() => { updateCard(card.id, { ...draft, sourceRange: { start: matchAt, end: matchAt + draft.sourceExcerpt.length }, sourceStatus: matchAt >= 0 ? "valid" : "invalid" }); toast("图卡已保存"); }} disabled={matchAt < 0}><Save size={17} />保存</Button>} />
    <div className="editor-split"><div className="editor-fields">
      <Field label="原文短摘" hint={matchAt >= 0 ? `已在原文第 ${matchAt + 1} 字精确命中` : "未在原文中找到，不能保存"}><Textarea rows={5} value={draft.sourceExcerpt} onChange={e => setDraft({ ...draft, sourceExcerpt: e.target.value })} /></Field>
      <Field label="编辑导读"><Textarea rows={4} value={draft.editorGuide} onChange={e => setDraft({ ...draft, editorGuide: e.target.value })} /></Field>
      <Field label="场景描述"><Input value={draft.sceneDescription} onChange={e => setDraft({ ...draft, sceneDescription: e.target.value })} /></Field>
      <Field label="生图提示词"><Textarea rows={7} value={draft.imagePrompt} onChange={e => setDraft({ ...draft, imagePrompt: e.target.value })} /></Field>
      <Button variant="secondary" disabled={regenerating} onClick={async () => { setRegenerating(true); try { if (!isServerEssay(essay)) { const projectId = await promoteCurrentEssay(); navigate(`/essays/${projectId}`); toast("已创建云端项目并由 DeepSeek 生成六卡内容"); } else { await regenerateCard(card.id); toast("单卡已重新生成，原文短摘保持不变"); } } catch { toast("DeepSeek 生成失败，请稍后重试"); } finally { setRegenerating(false); } }}>{regenerating ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}{regenerating ? "正在调用 DeepSeek" : isServerEssay(essay) ? "重新生成单卡" : "创建云端项目并分析"}</Button>
    </div><div className="editor-preview"><div className="preview-shell"><CardCanvas essay={essay} card={draft} /></div></div></div>
  </>;
}

function PromptsPage() {
  const { essay, cards } = useStudio();
  const ordered = [...cards].sort((a, b) => a.position - b.position);
  const markdown = buildPromptsMarkdown(essay.title, ordered);
  async function copy(value: string, label: string) { await navigator.clipboard.writeText(value); toast(`${label}已复制`); }
  return <><PageHeader eyebrow="外部生图" title="提示词清单" description="在外部平台逐条生成竖版底图，图片中不要包含文字。" actions={<><Button variant="secondary" onClick={() => copy(markdown, "全部提示词")}><Copy size={17} />全部复制</Button><Button onClick={() => downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${essay.title}-提示词.md`)}><Download size={17} />下载 Markdown</Button></>} />
    <div className="prompt-list">{ordered.map(card => <article className="prompt-card" key={card.id}><div className="prompt-meta"><span>{String(card.position + 1).padStart(2, "0")}</span><div><Badge>{card.kind === "cover" ? "封面" : card.kind === "ending" ? "结尾" : "正文"}</Badge><strong>{card.sceneDescription}</strong></div><IconButton label="复制提示词" onClick={() => copy(card.imagePrompt, "提示词")}><Clipboard size={18} /></IconButton></div><p>{card.imagePrompt}</p></article>)}</div>
  </>;
}

function AssetsPage() {
  const { cards, uploadCardImages, uploadCardImage, generateDraftImages } = useStudio();
  const inputRef = useRef<HTMLInputElement>(null);
  const [replaceCardId, setReplaceCardId] = useState("");
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    try {
      if (replaceCardId) { await uploadCardImage(replaceCardId, files[0]); toast("图片已替换"); }
      else { const count = await uploadCardImages(Array.from(files)); toast(`已上传并匹配 ${count} 张图片`); }
    }
    catch { toast("上传失败，请检查图片格式、尺寸或网络"); }
    finally { setReplaceCardId(""); if (inputRef.current) inputRef.current.value = ""; }
  }
  function chooseBatch() { setReplaceCardId(""); inputRef.current?.click(); }
  function chooseReplacement(cardId: string) { setReplaceCardId(cardId); inputRef.current?.click(); }
  async function generateDrafts() { setGeneratingDrafts(true); try { const count = await generateDraftImages(); toast(count ? `已生成并匹配 ${count} 张草图` : "所有图卡已有底图"); } catch { toast("草图生成失败，请稍后重试"); } finally { setGeneratingDrafts(false); } }
  return <><PageHeader eyebrow="图片管理" title="上传与匹配" description="可先生成本地草图用于排版，再用外部生成的正式图片替换。" actions={<><Button variant="secondary" onClick={generateDrafts} disabled={generatingDrafts}>{generatingDrafts ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{generatingDrafts ? "正在生成草图" : "生成草图"}</Button><Button onClick={chooseBatch}><Upload size={17} />批量上传</Button></>} /><input hidden ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={!replaceCardId} onChange={e => upload(e.target.files)} />
    <div className="upload-zone" onClick={chooseBatch}><Upload size={28} /><strong>拖入外部生成图片，或点击选择</strong><span>JPEG / PNG / WebP · 单张不超过 10 MB</span></div>
    <div className="asset-grid">{[...cards].sort((a,b) => a.position-b.position).map(card => <article className="asset-card" key={card.id}><div className="asset-image">{card.sourceAssetId ? <img src={assetContentUrl(card.sourceAssetId)} alt={card.sceneDescription} /> : <div className="asset-image-empty">待上传</div>}<Badge tone={card.sourceAssetId ? "green" : "amber"}>{card.sourceAssetId ? "已匹配" : "待上传"}</Badge></div><div><span>{String(card.position + 1).padStart(2, "0")} · {card.kind}</span><strong>{card.sceneDescription}</strong><Button variant="ghost" onClick={() => chooseReplacement(card.id)}><RefreshCw size={15} />替换</Button></div></article>)}</div>
  </>;
}

function LayoutPage() {
  const { essay, cards, updateCard } = useStudio();
  const ordered = [...cards].sort((a,b) => a.position-b.position);
  const [selectedId, setSelectedId] = useState(ordered[0]?.id);
  const card = cards.find(c => c.id === selectedId) || ordered[0];
  if (!card) return null;
  const setPosition = (key: keyof EssayCard["textPosition"], value: number) => updateCard(card.id, { textPosition: { ...card.textPosition, [key]: value } });
  return <><PageHeader eyebrow="自动排版" title="1080 × 1440 排版台" description="预览使用固定逻辑画布缩放，最终输出位置与此处一致。" actions={<Button onClick={() => toast("排版参数已自动保存")}><Save size={17} />保存排版</Button>} />
    <div className="layout-workbench"><aside className="layout-cards">{ordered.map(c => <button key={c.id} className={c.id === card.id ? "active" : ""} onClick={() => setSelectedId(c.id)}>{c.sourceAssetId ? <img src={assetContentUrl(c.sourceAssetId)} alt="" /> : <div className="layout-image-empty" />}<span>{String(c.position + 1).padStart(2,"0")}</span></button>)}</aside>
      <div className="layout-stage"><div className="preview-shell large"><CardCanvas essay={essay} card={card} /></div></div>
      <aside className="controls"><div className="section-title"><h2><Settings2 size={18} />布局参数</h2></div>
        <Range label="图片缩放" value={card.crop.zoom} min={1} max={1.8} step={0.05} onChange={value => updateCard(card.id, { crop: { ...card.crop, zoom: value } })} />
        <Range label="图片焦点 X" value={card.crop.focalX} min={0} max={100} onChange={value => updateCard(card.id, { crop: { ...card.crop, focalX: value } })} />
        <Range label="图片焦点 Y" value={card.crop.focalY} min={0} max={100} onChange={value => updateCard(card.id, { crop: { ...card.crop, focalY: value } })} />
        <Range label="文字横向" value={card.textPosition.xPercent} min={3} max={70} onChange={value => setPosition("xPercent", value)} />
        <Range label="文字纵向" value={card.textPosition.yPercent} min={5} max={78} onChange={value => setPosition("yPercent", value)} />
        <Range label="文字宽度" value={card.textPosition.widthPercent} min={25} max={92} onChange={value => setPosition("widthPercent", value)} />
        <Range label="字号" value={card.textPosition.fontSizePx} min={28} max={76} onChange={value => setPosition("fontSizePx", value)} />
        <Range label="遮罩浓度" value={card.templateSettings.overlayOpacity} min={0} max={0.75} step={0.05} onChange={value => updateCard(card.id, { templateSettings: { ...card.templateSettings, overlayOpacity: value } })} />
      </aside></div>
  </>;
}

function Range({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="range"><span>{label}<output>{Number.isInteger(value) ? value : value.toFixed(2)}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}

function ExportPage() {
  const { essay, cards, updateEssay, uploadRenderedImage, persistenceMode } = useStudio();
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [busy, setBusy] = useState(false);
  const [singleBusy, setSingleBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState("");
  const ordered = [...cards].sort((a,b) => a.position-b.position);
  const selectedCard = ordered.find((card) => card.id === selectedCardId) || ordered[0];
  useEffect(() => { if (selectedCard && selectedCard.id !== selectedCardId) setSelectedCardId(selectedCard.id); }, [selectedCard, selectedCardId]);

  function dataUrlBlob(dataUrl: string) {
    const [header, encoded] = dataUrl.split(",");
    const mimeType = header.match(/data:([^;]+)/)?.[1] || "image/png";
    return new Blob([Uint8Array.from(atob(encoded), character => character.charCodeAt(0))], { type: mimeType });
  }

  async function blobDataUrl(blob: Blob) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
    });
  }

  async function embedProtectedImages(node: HTMLElement) {
    const images = [...node.querySelectorAll<HTMLImageElement>("img.artboard-image")];
    const originals = images.map((image) => image.src);
    await Promise.all(images.map(async (image, index) => {
      if (originals[index].startsWith("data:")) return;
      const response = await fetch(originals[index], { credentials: "same-origin" });
      if (!response.ok) throw new Error(`EXPORT_IMAGE_${response.status}`);
      image.src = await blobDataUrl(await response.blob());
    }));
    return () => images.forEach((image, index) => { image.src = originals[index]; });
  }

  async function renderCard(card: EssayCard) {
    const node = document.querySelector(`[data-export-card="${card.id}"]`) as HTMLElement | null;
    if (!node) throw new Error("EXPORT_CARD_NOT_FOUND");
    const restore = await embedProtectedImages(node);
    try {
      const options = { width: 1080, height: 1440, pixelRatio: 1, skipFonts: true };
      return format === "png" ? await toPng(node, options) : await toJpeg(node, { ...options, quality: 0.94 });
    } finally { restore(); }
  }

  async function saveRenderedCopy(card: EssayCard, dataUrl: string) {
    if (persistenceMode !== "server") return;
    try { await uploadRenderedImage(card.id, dataUrlBlob(dataUrl), format === "jpeg" ? "jpg" : "png"); }
    catch (error) { console.warn("Rendered copy was not saved to R2", error); }
  }

  async function exportSingle() {
    if (!selectedCard) return;
    setSingleBusy(true);
    try {
      const dataUrl = await renderCard(selectedCard);
      await saveRenderedCopy(selectedCard, dataUrl);
      downloadBlob(dataUrlBlob(dataUrl), `${slugify(essay.title)}-${String(selectedCard.position + 1).padStart(2, "0")}-${selectedCard.kind}.${format === "jpeg" ? "jpg" : "png"}`);
      toast("当前图卡已导出");
    } catch (error) { console.error(error); toast("单张导出失败，请刷新页面后重试"); }
    finally { setSingleBusy(false); }
  }

  async function exportZip() {
    setBusy(true); setProgress(0);
    try {
      await document.fonts.ready;
      const zip = new JSZip(); const root = zip.folder(slugify(essay.title))!; const images = root.folder("images")!;
      for (let i = 0; i < ordered.length; i++) {
        const dataUrl = await renderCard(ordered[i]);
        await saveRenderedCopy(ordered[i], dataUrl);
        images.file(`${String(i+1).padStart(2,"0")}-${ordered[i].kind}.${format === "jpeg" ? "jpg" : "png"}`, dataUrl.split(",")[1], { base64: true });
        setProgress(Math.round(((i + 1) / ordered.length) * 80));
      }
      root.file("prompts.md", buildPromptsMarkdown(essay.title, ordered));
      root.file("publication-copy.md", `# ${essay.title}\n\n${essay.publicationCopy}\n\n> ${essay.copyrightNotice}\n`);
      root.file("manifest.json", JSON.stringify({ title: essay.title, author: essay.author, size: [1080,1440], format, cards: ordered.map(c => ({ id: c.id, position: c.position, kind: c.kind, sourceExcerpt: c.sourceExcerpt })) }, null, 2));
      const blob = await zip.generateAsync({ type: "blob" }, meta => setProgress(80 + Math.round(meta.percent * .2)));
      downloadBlob(blob, `${slugify(essay.title)}-微信贴图发布包.zip`); toast("发布包已导出");
    } catch (error) { console.error(error); toast("导出失败，请检查图片是否可访问"); } finally { setBusy(false); }
  }
  const ready = cards.length === 6 && cards.every(c => c.sourceAssetId && c.sourceStatus === "valid");
  return <><PageHeader eyebrow="发布交付" title="导出发布包" description="顺序渲染全部图卡，并打包图片、提示词、发布文案和清单。" />
    <div className="export-grid"><section className="export-main"><div className="section-title"><h2>导出设置</h2><Badge tone={ready ? "green" : "amber"}>{ready ? "可以导出" : "需要检查"}</Badge></div><div className="checklist"><div><Check />6 张图卡均有原文定位</div><div><Check />6 张底图均已匹配</div><div><Check />输出画布为 1080 × 1440</div><div><Check />提示词与发布文案已就绪</div></div><div className="format-picker"><button className={format === "png" ? "active" : ""} onClick={() => setFormat("png")}><Image />PNG<span>无损，文件较大</span></button><button className={format === "jpeg" ? "active" : ""} onClick={() => setFormat("jpeg")}><Image />JPG<span>高质量，适合发布</span></button></div><div className="single-export"><select aria-label="选择单张图卡" value={selectedCard?.id || ""} onChange={event => setSelectedCardId(event.target.value)}>{ordered.map(card => <option key={card.id} value={card.id}>{String(card.position + 1).padStart(2, "0")} · {card.kind}</option>)}</select><Button variant="secondary" disabled={!ready || singleBusy} onClick={exportSingle}>{singleBusy ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}{singleBusy ? "正在导出" : "导出当前图卡"}</Button></div><Field label="发布文案"><Textarea rows={6} value={essay.publicationCopy} onChange={e => updateEssay({ publicationCopy: e.target.value })} /></Field>{busy && <div className="progress"><span style={{ width: `${progress}%` }} /></div>}<Button className="export-button" disabled={!ready || busy} onClick={exportZip}>{busy ? <LoaderCircle className="spin" /> : <FileArchive />} {busy ? `正在生成 ${progress}%` : "一键导出 ZIP 发布包"}</Button></section>
      <aside className="package-tree"><h2>发布包内容</h2><pre>{`${slugify(essay.title)}/\n├─ images/\n│  ├─ 01-cover.${format}\n│  ├─ 02-body.${format}\n│  └─ ...\n├─ prompts.md\n├─ publication-copy.md\n└─ manifest.json`}</pre><div><FileArchive size={32} /><span>预计 12–30 MB</span></div></aside></div>
  </>;
}

function CardPreview({ card }: { card: EssayCard }) { const { essay } = useStudio(); return <div className="mini-canvas"><CardCanvas essay={essay} card={card} /></div>; }
function HiddenExportCanvases() { const { essay, cards } = useStudio(); return <div className="hidden-exports">{cards.map(card => <CardCanvas key={card.id} essay={essay} card={card} exportMode />)}</div>; }

function buildPromptsMarkdown(title: string, cards: EssayCard[]) {
  return `# 《${title}》生图提示词\n\n${cards.map(card => `## ${String(card.position+1).padStart(2,"0")} · ${card.kind}\n\n**场景：** ${card.sceneDescription}\n\n${card.imagePrompt}\n\n**原文短摘：** ${card.sourceExcerpt}`).join("\n\n---\n\n")}\n`;
}

export default function App() { return <StudioProvider><Shell /></StudioProvider>; }
