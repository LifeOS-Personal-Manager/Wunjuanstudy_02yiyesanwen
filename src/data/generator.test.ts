import { describe, expect, it } from "vitest";
import { generateWorkspace } from "./generator";
import { BACK_VIEW_TEXT, type SourceCandidate } from "../lib/sourceSearch";

const source: SourceCandidate = {
  id: "test", title: "背影", author: "朱自清", originalText: BACK_VIEW_TEXT,
  sourceName: "中文维基文库", sourceUrl: "https://zh.wikisource.org/wiki/背影",
  copyrightNotice: "Public domain", note: "1925年版本",
};

describe("公开来源自动生成", () => {
  it("从《背影》原文生成固定六卡且全部逐字命中", () => {
    const workspace = generateWorkspace(source);
    expect(workspace.cards.map((card) => card.kind)).toEqual(["cover", "body", "body", "body", "body", "ending"]);
    for (const card of workspace.cards) {
      expect(BACK_VIEW_TEXT.slice(card.sourceRange.start, card.sourceRange.end)).toBe(card.sourceExcerpt);
    }
  });
});
