import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("预生成发布包", () => {
  it.each(["蝌蚪", "背影"])("%s 包含六张 1080×1440 PNG 和三份发布文件", async (title) => {
    const file = await fs.readFile(path.resolve(`exports/${title}-微信贴图发布包.zip`));
    const zip = await JSZip.loadAsync(file);
    const images = Object.keys(zip.files).filter((name) => /\/images\/.*\.png$/.test(name));
    expect(images).toHaveLength(6);
    expect(zip.file(`${title}/prompts.md`)).not.toBeNull();
    expect(zip.file(`${title}/publication-copy.md`)).not.toBeNull();
    expect(zip.file(`${title}/manifest.json`)).not.toBeNull();
    for (const name of images) {
      const data = await zip.file(name)!.async("nodebuffer");
      const metadata = await sharp(data).metadata();
      expect([metadata.width, metadata.height]).toEqual([1080, 1440]);
    }
  });
});
