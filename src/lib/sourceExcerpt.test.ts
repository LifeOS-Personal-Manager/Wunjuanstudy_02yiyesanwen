import { describe, expect, it } from "vitest";
import { findSourceExcerpt } from "./sourceExcerpt";

describe("findSourceExcerpt", () => {
  const original = "母亲的娘家是北平德胜门外，土城儿外边，通大钟寺的大路上的一个小村里。\n\n村里一共有四五家人家，都姓马。";
  it("returns an original range for an exact excerpt", () => {
    expect(findSourceExcerpt(original, "村里一共有四五家人家，都姓马。")).toMatchObject({ excerpt: "村里一共有四五家人家，都姓马。", normalized: false });
  });
  it("accepts formatting-only edits but saves original text", () => {
    expect(findSourceExcerpt(original, "母亲的娘家是北平德胜门外, 土城儿外边 通大钟寺的大路上的一个小村里")).toMatchObject({ start: 0, excerpt: "母亲的娘家是北平德胜门外，土城儿外边，通大钟寺的大路上的一个小村里。", normalized: true });
  });
  it("rejects rewritten text", () => {
    expect(findSourceExcerpt(original, "北平城外有一个贫穷小村")).toBeNull();
  });
});