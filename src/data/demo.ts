import type { Essay, EssayCard } from "../types";

export const ORIGINAL_TEXT = `每度放笔，凭在楼窗上小憩的时候，望下去看见庭中的花台的边上，许多花盆的旁边，并放着一只印着蓝色图案模样的洋磁面盆。我起初看见的时候，以为是洗衣物的人偶然寄存着的。在灰色而简素的花台的边上，许多形式朴陋的瓦质的花盆的旁边，配置一个机械制造而施着近代图案的精巧的洋磁面盆，绘画地看来，很不调和，假如眼底展开着的是一张画纸，我颇想找块橡皮来揩去它。

一天，三天，十天，它同洋磁面盆尽管放在花台的边上。这表示不是它偶然寄存，而惯在这里了。洋磁面盆里面没有盛别的东西，盛的只是清水。我摸不清它的来由，也不暇查问。有一天，我看见一个孩子拿了些饭粒，向洋磁面盆里撒下。我走近一看，水面上浮着一层细粒，许多黑色的小东西在水里游来游去。我仔细一看，原来是一群蝌蚪，正在里面游泳。

孩子们得意地告诉我，这些蝌蚪是从大井头的田里捉来的，他们用手捧了回来，养在这面盆里。他们天天来喂饭粒，看它们长大。我望着这一群在狭小面盆里打转的蝌蚪，忽然觉得它们像被关进了一个走不出去的小沙漠，再也回不到原来的田里，再也听不到田野里同类的叫声了。

到了晚上，我躺在床上，听见远处田野里传来阵阵蛙鸣，心里不由得想起盆里的蝌蚪。它们如果听见这熟悉的声音，一定也会暗暗悲伤吧？明明听见同伴的呼唤，却再也不能回到田里，和它们一起自由自在地游动、成长。

第二天我便和孩子们说：“这些蝌蚪天天在田里和同伴们一起生活，有它们爱的家人和朋友，现在被关在这小小的面盆里，什么喜欢的东西都没有，连自由都被剥夺了，这样它们不会快乐的。”孩子们似懂非懂地点点头，问我该怎么办。我告诉他们，现在天色已晚，先去花台里挖些泥土放进盆里，给蝌蚪一点熟悉的东西，第二天一早就把它们送回田里去。

孩子们听了高兴得拍起手，小心翼翼地把泥土放进盆里，还不停地互相叮嘱“轻点，别把蝌蚪压坏了”。没过多久，所有的蝌蚪都钻进了泥土里，不见了踪影。有个孩子轻轻拨动水面，就看见蝌蚪的小尾巴露出来，几只蝌蚪挤在一个泥洞里，偶尔有一两只游出来，又马上跟着同伴钻回去，看起来比之前快活了不少。

第二天，孩子们捧着这盆蝌蚪，蹦蹦跳跳地往大井头的田里走去。我站在窗边望着他们的背影，心里满是欣慰。孩子们从一开始因为喜爱把蝌蚪“囚禁”起来，到后来为了让它们获得自由而开心，他们终于懂得了：世间所有的生命，无论伟大还是渺小，都有自己存在的意义，都不该被随意剥夺自由。`;

const excerpts = [
  "世间所有的生命，无论伟大还是渺小，都有自己存在的意义，都不该被随意剥夺自由。",
  "在灰色而简素的花台的边上，许多形式朴陋的瓦质的花盆的旁边，配置一个机械制造而施着近代图案的精巧的洋磁面盆",
  "我仔细一看，原来是一群蝌蚪，正在里面游泳。",
  "我望着这一群在狭小面盆里打转的蝌蚪，忽然觉得它们像被关进了一个走不出去的小沙漠",
  "明明听见同伴的呼唤，却再也不能回到田里，和它们一起自由自在地游动、成长。",
  "孩子们从一开始因为喜爱把蝌蚪“囚禁”起来，到后来为了让它们获得自由而开心",
];

const prompts = [
  "丰子恺式简洁水墨意趣，俯瞰一只青花瓷面盆，水中蝌蚪与远处稻田形成自由的呼应，留出上方标题空间，无文字，无水印，竖构图",
  "民国江南庭院，灰色花台、朴拙瓦盆与精巧青花洋瓷面盆并置，午后柔光，克制水墨淡彩，留白，无文字，竖构图",
  "青花瓷盆清水特写，细小黑色蝌蚪在饭粒间游动，清澈水纹，儿童视角，淡彩插画，右侧留白，无文字",
  "狭小瓷盆里的蝌蚪环游，盆外隐约延展为辽阔田野，诗意隐喻而不阴暗，纸本水墨肌理，无文字",
  "夏夜室内窗边，远处田野月色与蛙鸣意象，近处瓷盆安静倒影，青灰与月白色调，下方留白，无文字",
  "清晨孩子们捧着瓷盆走向绿色田野，背影轻快，生命被放归自然，温暖淡彩水墨，大面积天空留白，无文字",
];

const now = "2026-09-01T04:00:00.000Z";

export const DEMO_ESSAY: Essay = {
  id: "demo-tadpoles",
  title: "蝌蚪",
  author: "丰子恺",
  originalText: ORIGINAL_TEXT,
  originalTextSha256: "demo",
  sourceName: "《缘缘堂随笔》整理稿；案例原文来自 reference/范文.docx",
  copyrightNotice: "仅用于内部产品演示与排版测试，请在正式发布前核验版本及版权状态。",
  status: "editing",
  publicationCopy: "一只不合时宜的洋磁面盆，一群被孩子们喜爱却失去自由的蝌蚪。丰子恺从庭院一角写到万物之心：真正的爱，不是占有，而是让生命回到它应在的天地。",
  version: 1,
  createdAt: now,
  updatedAt: now,
};

export const DEMO_CARDS: EssayCard[] = excerpts.map((sourceExcerpt, index) => {
  const start = ORIGINAL_TEXT.indexOf(sourceExcerpt);
  const kind = index === 0 ? "cover" : index === 5 ? "ending" : "body";
  return {
    id: `demo-card-${index + 1}`,
    essayId: DEMO_ESSAY.id,
    kind,
    position: index,
    sourceRange: { start, end: start + sourceExcerpt.length },
    sourceExcerpt,
    editorGuide: [
      "从一只面盆切入生命与自由，先把文章的精神核放在封面。",
      "不协调的器物组合，是作者观察与故事发生的起点。",
      "视线贴近水面，谜底揭开：盆中养着一群蝌蚪。",
      "孩子的喜爱无意中成了囚禁，温柔里出现了反思。",
      "田野蛙鸣穿过夜色，自由近在耳边，却无法抵达。",
      "孩子们学会把喜爱变成放手，文章在生命平等中收束。",
    ][index],
    sceneDescription: ["瓷盆与稻田遥相呼应", "庭院花台与青花面盆", "水面下的蝌蚪群", "面盆如小小沙漠", "窗外月夜与远处田野", "孩子把蝌蚪送回田野"][index],
    imagePrompt: prompts[index],
    textPosition: {
      xPercent: index === 0 ? 10 : 9,
      yPercent: index === 0 ? 13 : index === 5 ? 62 : 57,
      widthPercent: index === 0 ? 78 : 82,
      maxHeightPercent: 29,
      horizontalAlign: index === 0 ? "center" : "left",
      verticalAlign: "top",
      fontSizePx: index === 0 ? 66 : 42,
      lineHeight: 1.55,
    },
    crop: { focalX: 50, focalY: 50, zoom: 1 },
    templateSettings: {
      overlayOpacity: index === 0 ? 0.28 : 0.42,
      textColor: "#fffdf7",
      accentColor: "#d84a37",
      showAuthor: index !== 2,
      showEditorGuide: index > 0 && index < 5,
    },
    sourceAssetId: `/demo/card-${index + 1}.png`,
    renderedAssetId: null,
    sourceStatus: "valid",
    version: 1,
    createdAt: now,
    updatedAt: now,
  } satisfies EssayCard;
});
