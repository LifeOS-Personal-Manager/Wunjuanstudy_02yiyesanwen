import { describe, expect, it } from "vitest";
import { DEMO_CARDS, ORIGINAL_TEXT } from "./demo";

describe("《蝌蚪》案例数据", () => {
  it("包含封面、四张正文和结尾", () => {
    expect(DEMO_CARDS.map((card) => card.kind)).toEqual([
      "cover", "body", "body", "body", "body", "ending",
    ]);
  });

  it("每条原文短摘都能按 UTF-16 位置逐字还原", () => {
    for (const card of DEMO_CARDS) {
      expect(card.sourceRange.start).toBeGreaterThanOrEqual(0);
      expect(ORIGINAL_TEXT.slice(card.sourceRange.start, card.sourceRange.end)).toBe(card.sourceExcerpt);
    }
  });
});
