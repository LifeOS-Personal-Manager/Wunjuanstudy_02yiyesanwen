import type { Essay, EssayCard } from "../types";
import type { SourceCandidate } from "../lib/sourceSearch";

export interface GeneratedWorkspace { essay: Essay; cards: EssayCard[] }

export function generateWorkspace(source: SourceCandidate): GeneratedWorkspace {
  const createdAt = new Date().toISOString();
  const essayId = `essay-${crypto.randomUUID()}`;
  const curated = source.title === "背影" && source.author.includes("朱自清") ? backViewPlan : genericPlan(source.originalText);
  const cards = curated.map((item, position) => {
    const start = source.originalText.indexOf(item.excerpt);
    if (start < 0) throw new Error(`原文中未找到短摘：${item.excerpt}`);
    const kind = position === 0 ? "cover" : position === 5 ? "ending" : "body";
    return {
      id: `${essayId}-card-${position + 1}`, essayId, kind, position,
      sourceRange: { start, end: start + item.excerpt.length }, sourceExcerpt: item.excerpt,
      editorGuide: item.guide, sceneDescription: item.scene, imagePrompt: item.prompt,
      textPosition: { xPercent: position === 0 ? 10 : 9, yPercent: position === 0 ? 14 : position === 5 ? 61 : 57, widthPercent: position === 0 ? 78 : 82, maxHeightPercent: 30, horizontalAlign: position === 0 ? "center" : "left", verticalAlign: "top", fontSizePx: position === 0 ? 66 : 42, lineHeight: 1.55 },
      crop: { focalX: 50, focalY: 50, zoom: 1 },
      templateSettings: { overlayOpacity: position === 0 ? .3 : .43, textColor: "#fffdf7", accentColor: "#d84a37", showAuthor: true, showEditorGuide: position > 0 && position < 5 },
      sourceAssetId: source.title === "背影" ? `/demo/back-view-${position + 1}.png` : null,
      renderedAssetId: null, sourceStatus: "valid", version: 1, createdAt, updatedAt: createdAt,
    } satisfies EssayCard;
  });
  return {
    essay: {
      id: essayId, title: source.title, author: source.author, originalText: source.originalText,
      originalTextSha256: "pending-server-hash", sourceName: `${source.sourceName} · ${source.sourceUrl}`,
      copyrightNotice: source.copyrightNotice, status: "editing",
      publicationCopy: source.title === "背影" ? "月台、橘子与一个渐渐远去的背影。多年后才懂得，那些看似笨拙的叮嘱与奔走，正是父亲沉默而深重的爱。重读朱自清《背影》，也重看我们曾经忽略的亲情。" : `重读${source.author}《${source.title}》，从原文细节进入作品的情感与思想。`,
      version: 1, createdAt, updatedAt: createdAt,
    }, cards,
  };
}

const backViewPlan = [
  { excerpt: "我與父親不相見已二年餘了，我最不能忘記的是他的背影。", scene: "月台尽头的父亲背影", guide: "开篇即点题，时间越久，那个背影反而越清晰。", prompt: "1920年代中国火车站月台，远去的父亲背影，黑布小帽与深青布棉袍，朱红橘子作为克制亮色，民国木刻与水墨淡彩结合，沉静留白，竖构图，无文字，无水印" },
  { excerpt: "他躊躇了一會，終於決定還是自己送我去。", scene: "旅馆里的迟疑与决定", guide: "父亲嘴上说不送，最终仍不放心，爱藏在一次迟疑里。", prompt: "民国旅馆清晨，父亲站在行李旁迟疑后决定送行，旧木窗与布包，低饱和灰绿和赭色，叙事插画，上方留白，竖构图，无文字" },
  { excerpt: "我買幾個橘子去。你就在此地，不要走動。", scene: "一句朴素的叮嘱", guide: "最普通的一句话，成为全文最难忘的声音。", prompt: "老式火车车厢内望向月台，父亲回头叮嘱，远处有卖橘子的小摊，焦点在人物动作，朱红与煤灰色对比，水墨淡彩，竖构图，无文字" },
  { excerpt: "他用兩手攀着上面，兩腳再向上縮；他肥胖的身子向左微傾，顯出努力的樣子。", scene: "攀过月台的艰难身影", guide: "一连串动作没有抒情，却让父爱有了重量和形状。", prompt: "1920年代浦口车站，穿深青棉袍的年迈父亲双手攀住月台边缘，身体微倾努力向上，忠实时代服饰与铁路结构，克制而感人，竖构图，无文字" },
  { excerpt: "等他的背影混入來來往往的人裏，再找不着了，我便進來坐下，我的眼淚又來了。", scene: "人群吞没背影", guide: "背影消失在人群里，未说出口的理解化成第二次流泪。", prompt: "民国车站熙攘人群，父亲的黑色背影逐渐被人潮遮没，近景隔着车窗的含泪视线，纪实水墨插画，层次清晰，下方留白，竖构图，无文字" },
  { excerpt: "我讀到此處，在晶瑩的淚光中，又看見那肥胖的，靑布棉袍，黑布馬褂的背影。", scene: "泪光中的重现", guide: "多年后的信，把记忆中的背影再次带回眼前。", prompt: "安静书桌上一封家书，泪光里叠映穿青布棉袍的父亲背影，窗外冬日薄光，含蓄东方叙事，米白、青灰、朱红小面积点色，竖构图，无文字" },
];

function genericPlan(text: string) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const selected = [paragraphs[0], paragraphs[1], paragraphs[Math.floor(paragraphs.length*.35)], paragraphs[Math.floor(paragraphs.length*.55)], paragraphs[Math.floor(paragraphs.length*.75)], paragraphs.at(-1)].map((paragraph) => firstExcerpt(paragraph || text));
  return selected.map((excerpt, index) => ({ excerpt, scene: `原文场景 ${index + 1}`, guide: "从原文关键细节进入作品的情感与思想。", prompt: `中文散文叙事插画，根据原文场景“${excerpt}”构图，克制、真实、含蓄，竖构图，大面积留白，无文字，无水印` }));
}

function firstExcerpt(paragraph: string) {
  const match = paragraph.match(/^.{20,110}?[。！？]/);
  return match?.[0] || paragraph.slice(0, 90);
}
