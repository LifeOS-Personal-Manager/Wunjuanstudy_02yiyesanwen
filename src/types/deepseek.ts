import type { CardKind, HorizontalAlign, VerticalAlign } from "./domain";

/**
 * Raw JSON expected from DeepSeek. This is a proposal only; the server must
 * resolve and verify every excerpt against the user-provided original text.
 */
export interface DeepSeekCardProposal {
  kind: CardKind;
  sourceExcerpt: string;
  sourceStartHint: number | null;
  editorGuide: string;
  sceneDescription: string;
  imagePrompt: string;
  textPlacement: {
    horizontalAlign: HorizontalAlign;
    verticalAlign: VerticalAlign;
    widthPercent: number;
  };
}

export interface DeepSeekEssayAnalysis {
  schemaVersion: "1.0";
  cards: [
    DeepSeekCardProposal,
    DeepSeekCardProposal,
    DeepSeekCardProposal,
    DeepSeekCardProposal,
    DeepSeekCardProposal,
    DeepSeekCardProposal,
  ];
  publicationCopy: string;
}

export interface ResolvedCardProposal extends DeepSeekCardProposal {
  sourceStart: number;
  sourceEnd: number;
}

