import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";

const root = process.cwd();
const publicDir = path.join(root, "public", "demo");
const exportDir = path.join(root, "exports", "蝌蚪-发布包");
const imageDir = path.join(exportDir, "images");
await fs.mkdir(publicDir, { recursive: true });
await fs.mkdir(imageDir, { recursive: true });

const cards = [
  {
    kind: "cover", scene: "瓷盆与稻田遥相呼应",
    excerpt: "世间所有的生命，无论伟大还是渺小，\n都有自己存在的意义，\n都不该被随意剥夺自由。",
    guide: "从一只面盆切入生命与自由，先把文章的精神核放在封面。",
    prompt: "丰子恺式简洁水墨意趣，俯瞰一只青花瓷面盆，水中蝌蚪与远处稻田形成自由的呼应，留出上方标题空间，无文字，无水印，竖构图",
    palette: ["#a7b9ad", "#426456", "#e6dfcb", "#2d3e36"], sceneSvg: bowlScene(520, 790, true),
  },
  {
    kind: "body", scene: "庭院花台与青花面盆",
    excerpt: "在灰色而简素的花台的边上，\n许多形式朴陋的瓦质的花盆的旁边，\n配置一个机械制造而施着近代图案的\n精巧的洋磁面盆",
    guide: "不协调的器物组合，是作者观察与故事发生的起点。",
    prompt: "民国江南庭院，灰色花台、朴拙瓦盆与精巧青花洋瓷面盆并置，午后柔光，克制水墨淡彩，留白，无文字，竖构图",
    palette: ["#c1b9a7", "#6d7568", "#e5e1d4", "#434b43"], sceneSvg: courtyardScene(),
  },
  {
    kind: "body", scene: "水面下的蝌蚪群",
    excerpt: "我仔细一看，原来是一群蝌蚪，\n正在里面游泳。",
    guide: "视线贴近水面，谜底揭开：盆中养着一群蝌蚪。",
    prompt: "青花瓷盆清水特写，细小黑色蝌蚪在饭粒间游动，清澈水纹，儿童视角，淡彩插画，右侧留白，无文字",
    palette: ["#789a98", "#264c51", "#d8e1d9", "#20383b"], sceneSvg: tadpoleCloseup(),
  },
  {
    kind: "body", scene: "面盆如小小沙漠",
    excerpt: "我望着这一群在狭小面盆里打转的蝌蚪，\n忽然觉得它们像被关进了一个\n走不出去的小沙漠",
    guide: "孩子的喜爱无意中成了囚禁，温柔里出现了反思。",
    prompt: "狭小瓷盆里的蝌蚪环游，盆外隐约延展为辽阔田野，诗意隐喻而不阴暗，纸本水墨肌理，无文字",
    palette: ["#aa9b7e", "#5b6655", "#ddd2b8", "#3f493c"], sceneSvg: desertBowlScene(),
  },
  {
    kind: "body", scene: "窗外月夜与远处田野",
    excerpt: "明明听见同伴的呼唤，\n却再也不能回到田里，\n和它们一起自由自在地游动、成长。",
    guide: "田野蛙鸣穿过夜色，自由近在耳边，却无法抵达。",
    prompt: "夏夜室内窗边，远处田野月色与蛙鸣意象，近处瓷盆安静倒影，青灰与月白色调，下方留白，无文字",
    palette: ["#526b70", "#182d35", "#c4c8b9", "#18252b"], sceneSvg: nightScene(),
  },
  {
    kind: "ending", scene: "孩子把蝌蚪送回田野",
    excerpt: "孩子们从一开始因为喜爱把蝌蚪“囚禁”起来，\n到后来为了让它们获得自由而开心",
    guide: "孩子们学会把喜爱变成放手，文章在生命平等中收束。",
    prompt: "清晨孩子们捧着瓷盆走向绿色田野，背影轻快，生命被放归自然，温暖淡彩水墨，大面积天空留白，无文字",
    palette: ["#afc0a0", "#4e6f50", "#ece4cd", "#344e38"], sceneSvg: releaseScene(),
  },
];

function bowlScene(x, y, field = false) {
  return `${field ? '<path d="M0 380 Q250 300 520 370 T1080 330 V720 H0Z" fill="#718d69"/><path d="M0 470 Q280 380 550 450 T1080 400" fill="none" stroke="#d2d1aa" stroke-width="24"/>' : ''}
  <ellipse cx="${x}" cy="${y}" rx="335" ry="220" fill="#e7e3d4" stroke="#345d67" stroke-width="18"/>
  <ellipse cx="${x}" cy="${y-15}" rx="288" ry="178" fill="#799d9b" opacity=".9"/>
  ${tadpoles(x-190,y-80,11)}<path d="M260 815 Q520 980 780 815" fill="none" stroke="#315d71" stroke-width="17" opacity=".8"/>`;
}
function tadpoles(x, y, count) { return Array.from({length:count},(_,i)=>{const px=x+(i%4)*105+(i%2)*18, py=y+Math.floor(i/4)*80; return `<g transform="translate(${px} ${py}) rotate(${(i*37)%160-80})"><ellipse rx="17" ry="13" fill="#182a29"/><path d="M13 2 Q44 10 54 34" fill="none" stroke="#182a29" stroke-width="7" stroke-linecap="round"/></g>`}).join(""); }
function courtyardScene(){return `<rect x="0" y="400" width="1080" height="600" fill="#77786f"/><rect x="0" y="920" width="1080" height="520" fill="#a09a89"/><g fill="#706557"><path d="M90 620h180l-25 280H115z"/><path d="M760 590h180l-20 310H785z"/><path d="M580 700h150l-20 210H600z"/></g><g fill="#4d674b"><circle cx="180" cy="560" r="140"/><circle cx="850" cy="520" r="150"/><circle cx="650" cy="655" r="110"/></g>${bowlScene(450,930,false)}`}
function tadpoleCloseup(){return `<circle cx="540" cy="650" r="470" fill="#d8ddd1" stroke="#2c5b68" stroke-width="28"/><circle cx="540" cy="650" r="410" fill="#75a09e"/>${tadpoles(270,410,18)}<g fill="#d9c99e">${Array.from({length:18},(_,i)=>`<circle cx="${300+(i*83)%500}" cy="${370+(i*61)%530}" r="7"/>`).join("")}</g><path d="M150 680 Q540 500 930 680 M190 820 Q540 650 880 820" fill="none" stroke="#d4e2da" stroke-width="9" opacity=".55"/>`}
function desertBowlScene(){return `<path d="M0 550 Q240 420 490 560 T1080 500 V1440 H0Z" fill="#b8aa87"/><path d="M0 780 Q300 630 610 760 T1080 700" fill="none" stroke="#d9ceb2" stroke-width="80"/>${bowlScene(540,650,false)}<path d="M910 410 Q990 320 1060 300" stroke="#50624f" stroke-width="22" fill="none"/>`}
function nightScene(){return `<rect y="0" width="1080" height="1440" fill="#1c3036"/><circle cx="820" cy="270" r="120" fill="#d8dbc8"/><path d="M0 730 Q260 570 520 740 T1080 660 V1050 H0Z" fill="#35554b"/><rect x="120" y="160" width="620" height="670" fill="none" stroke="#172328" stroke-width="32"/><path d="M430 160v670M120 490h620" stroke="#172328" stroke-width="24"/>${bowlScene(760,1060,false)}`}
function releaseScene(){return `<rect width="1080" height="700" fill="#dfe3ce"/><path d="M0 570 Q280 410 550 600 T1080 520 V1440 H0Z" fill="#75916a"/><path d="M0 830 Q320 680 620 850 T1080 760 V1440 H0Z" fill="#496c50"/><path d="M540 1440 Q500 1050 650 720" fill="none" stroke="#c9bc92" stroke-width="140"/><g fill="#34423a"><circle cx="430" cy="720" r="58"/><path d="M386 775h90l40 260H350z"/><circle cx="590" cy="760" r="52"/><path d="M550 805h80l50 230H505z"/></g><ellipse cx="505" cy="855" rx="100" ry="55" fill="#dfded2" stroke="#315b66" stroke-width="12"/>`}
function esc(value){return value.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));}
function textLines(text, x, y, size, lineHeight, anchor="start"){return text.split("\n").map((line,i)=>`<text x="${x}" y="${y+i*lineHeight}" text-anchor="${anchor}" font-family="KaiTi,STKaiti,serif" font-size="${size}" font-weight="600" fill="#fffdf7">${esc(line)}</text>`).join("");}
function backgroundSvg(card){return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440"><rect width="1080" height="1440" fill="${card.palette[0]}"/><g opacity=".96">${card.sceneSvg}</g><filter id="paper"><feTurbulence baseFrequency=".55" numOctaves="3"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .08 0"/></filter><rect width="1080" height="1440" filter="url(#paper)" opacity=".22"/></svg>`;}
function overlaySvg(card,index){const cover=index===0; const ending=index===5; const y=cover?300:ending?875:830; return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"><rect width="1080" height="1440" fill="#122019" opacity="${cover ? .28 : .4}"/><rect x="64" y="1340" width="42" height="5" fill="#d84a37"/><text x="64" y="1390" font-family="Arial" font-size="22" font-weight="700" fill="white">${String(index+1).padStart(2,"0")}</text><g transform="translate(990 65)"><rect x="-42" width="42" height="145" fill="none" stroke="white" stroke-width="2" opacity=".75"/><text x="-22" y="25" text-anchor="middle" writing-mode="tb" font-family="KaiTi" font-size="20" fill="white">一页散文</text></g>${cover?'<text x="540" y="180" text-anchor="middle" font-family="KaiTi,serif" font-size="118" fill="white">蝌蚪</text><line x1="180" y1="230" x2="900" y2="230" stroke="white" stroke-width="3" opacity=".7"/>':''}${textLines(card.excerpt,cover?540:95,y,cover?48:42,cover?78:68,cover?"middle":"start")}<text x="95" y="${y+(card.excerpt.split("\n").length*68)+55}" font-family="Arial,Microsoft YaHei" font-size="22" fill="white" opacity=".9">${esc(card.guide)}</text><text x="95" y="${y+(card.excerpt.split("\n").length*68)+105}" font-family="Arial,Microsoft YaHei" font-size="20" fill="white">文 / 丰子恺</text></svg>`;}

for (let index=0; index<cards.length; index++) {
  const card=cards[index]; const bgPath=path.join(publicDir,`card-${index+1}.png`); const outPath=path.join(imageDir,`${String(index+1).padStart(2,"0")}-${card.kind}.png`);
  await sharp(Buffer.from(backgroundSvg(card))).png().toFile(bgPath);
  await sharp(bgPath).composite([{input:Buffer.from(overlaySvg(card,index)),top:0,left:0}]).png().toFile(outPath);
}

const prompts=`# 《蝌蚪》生图提示词\n\n${cards.map((card,index)=>`## ${String(index+1).padStart(2,"0")} · ${card.kind}\n\n**场景：** ${card.scene}\n\n${card.prompt}`).join("\n\n---\n\n")}\n`;
const publication=`# 《蝌蚪》发布文案\n\n一只不合时宜的洋磁面盆，一群被孩子们喜爱却失去自由的蝌蚪。丰子恺从庭院一角写到万物之心：真正的爱，不是占有，而是让生命回到它应在的天地。\n\n> 仅用于内部产品演示与排版测试，请在正式发布前核验版本及版权状态。\n`;
const manifest={title:"蝌蚪",author:"丰子恺",size:[1080,1440],format:"png",source:"reference/范文.docx",cards:cards.map((card,index)=>({position:index,kind:card.kind,scene:card.scene,prompt:card.prompt}))};
await fs.writeFile(path.join(exportDir,"prompts.md"),prompts,"utf8"); await fs.writeFile(path.join(exportDir,"publication-copy.md"),publication,"utf8"); await fs.writeFile(path.join(exportDir,"manifest.json"),JSON.stringify(manifest,null,2),"utf8");
const zip=new JSZip(); for(const filename of await fs.readdir(imageDir)){zip.file(`蝌蚪/images/${filename}`,await fs.readFile(path.join(imageDir,filename)));} zip.file("蝌蚪/prompts.md",prompts); zip.file("蝌蚪/publication-copy.md",publication); zip.file("蝌蚪/manifest.json",JSON.stringify(manifest,null,2));
await fs.mkdir(path.join(root,"exports"),{recursive:true}); await fs.writeFile(path.join(root,"exports","蝌蚪-微信贴图发布包.zip"),await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE",compressionOptions:{level:8}}));
console.log("Generated 6 demo backgrounds, 6 rendered cards, and export ZIP.");
