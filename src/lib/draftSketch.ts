import type { Essay, EssayCard } from "../types";

const WIDTH = 1080;
const HEIGHT = 1440;

function seedFrom(value: string) {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index++) seed = Math.imul(seed ^ value.charCodeAt(index), 16777619);
  return seed >>> 0;
}

function random(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(48271, state) % 2147483647;
    return (state & 2147483647) / 2147483647;
  };
}

function path(ctx: CanvasRenderingContext2D, points: Array<[number, number]>) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

function blobFromCanvas(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("DRAFT_SKETCH_FAILED")), "image/png"));
}

export async function createDraftSketch(essay: Essay, card: EssayCard): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("DRAFT_SKETCH_UNAVAILABLE");
  const next = random(seedFrom(`${essay.title}|${essay.author}|${card.position}|${card.sceneDescription}`));
  const palettes = [
    ["#dce6dc", "#7c9688", "#345c57", "#f3e5bd"],
    ["#e7dfd0", "#8d9b81", "#4b6655", "#d4a65d"],
    ["#dbe4e8", "#7898a0", "#345d68", "#e2c58c"],
    ["#e6e0d5", "#a58e78", "#615f50", "#ba6a50"],
  ];
  const [paper, middle, ink, accent] = palettes[Math.floor(next() * palettes.length)];

  ctx.fillStyle = paper; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 0.16;
  for (let index = 0; index < 540; index++) {
    ctx.fillStyle = ink;
    ctx.fillRect(next() * WIDTH, next() * HEIGHT, 1 + next() * 3, 1 + next() * 3);
  }

  const horizon = 460 + next() * 240;
  ctx.globalAlpha = 0.84; ctx.fillStyle = middle;
  path(ctx, [[0, horizon + 100], [0, horizon - 50], [180, horizon - 130], [360, horizon - 45], [560, horizon - 175], [780, horizon - 70], [1080, horizon - 145], [1080, horizon + 240]]); ctx.fill();
  ctx.globalAlpha = 0.96; ctx.fillStyle = ink;
  path(ctx, [[0, horizon + 170], [0, horizon + 65], [250, horizon - 20], [430, horizon + 78], [670, horizon + 5], [850, horizon + 95], [1080, horizon + 18], [1080, horizon + 330]]); ctx.fill();

  ctx.globalAlpha = 0.65; ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(780 + next() * 150, 260 + next() * 180, 75 + next() * 55, 0, Math.PI * 2); ctx.fill();

  ctx.globalAlpha = 0.52; ctx.strokeStyle = paper; ctx.lineWidth = 16;
  for (let index = 0; index < 9; index++) {
    const y = horizon + 190 + index * 62;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= WIDTH; x += 120) ctx.quadraticCurveTo(x + 45, y - 22 + next() * 34, x + 120, y + next() * 25);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.48; ctx.strokeStyle = ink; ctx.lineWidth = 8;
  for (let index = 0; index < 16; index++) {
    const x = 50 + next() * 980; const bottom = 1160 + next() * 220;
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.quadraticCurveTo(x - 18 + next() * 36, bottom - 170, x + (next() - .5) * 100, bottom - 320 - next() * 130); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const blob = await blobFromCanvas(canvas);
  return new File([blob], `${String(card.position + 1).padStart(2, "0")}-draft.png`, { type: "image/png" });
}
