import { describe, expect, it } from "vitest";
import { readImageInfo } from "../../functions/_shared/image";

describe("image upload inspection", () => {
  it("reads PNG dimensions from a valid signature and IHDR", () => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(bytes.buffer).setUint32(16, 1080);
    new DataView(bytes.buffer).setUint32(20, 1440);
    expect(readImageInfo(bytes.buffer)).toEqual({ mimeType: "image/png", width: 1080, height: 1440 });
  });

  it("rejects an extension-only PNG spoof", () => {
    const bytes = new TextEncoder().encode("not an image despite its filename.png");
    expect(readImageInfo(bytes.buffer)).toBeNull();
  });

  it("reads JPEG SOF dimensions", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0xa0, 0x04, 0x38]);
    expect(readImageInfo(bytes.buffer)).toEqual({ mimeType: "image/jpeg", width: 1080, height: 1440 });
  });
});
