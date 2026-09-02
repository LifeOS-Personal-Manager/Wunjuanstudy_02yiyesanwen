import { forwardRef } from "react";
import type { Essay, EssayCard } from "../types";
import { assetContentUrl } from "../lib/apiClient";

interface Props { essay: Essay; card: EssayCard; exportMode?: boolean }

export const CardCanvas = forwardRef<HTMLDivElement, Props>(function CardCanvas({ essay, card, exportMode }, ref) {
  const image = assetContentUrl(card.sourceAssetId);
  const text = card.textPosition;
  const settings = card.templateSettings;
  const objectPosition = `${card.crop.focalX}% ${card.crop.focalY}%`;

  return (
    <div ref={ref} className={`artboard template-${card.kind} ${exportMode ? "export-artboard" : ""}`} data-export-card={card.id}>
      {image ? <img className="artboard-image" src={image} alt="" style={{ objectPosition, transform: `scale(${card.crop.zoom})` }} /> : <div className="artboard-image-empty" aria-label="待上传底图" />}
      <div className="artboard-shade" style={{ opacity: image ? settings.overlayOpacity : 0.08 }} />
      <div className="artboard-grain" />
      <div className="artboard-mark">一页散文</div>
      <div
        className="artboard-copy"
        style={{
          left: `${text.xPercent}%`, top: `${text.yPercent}%`, width: `${text.widthPercent}%`,
          maxHeight: `${text.maxHeightPercent}%`, color: settings.textColor,
          textAlign: text.horizontalAlign, fontSize: text.fontSizePx, lineHeight: text.lineHeight,
        }}
        >
        {card.kind === "cover" && <h2>{essay.title}</h2>}
        <p className="artboard-excerpt">{card.sourceExcerpt}</p>
        {settings.showAuthor && <p className="artboard-author">文 / {essay.author}</p>}
      </div>
      <div className="artboard-index">{String(card.position + 1).padStart(2, "0")}</div>
      <div className="artboard-rule" style={{ background: settings.accentColor }} />
    </div>
  );
});
