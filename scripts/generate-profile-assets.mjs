import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "assets");
const previewsDir = join(root, "previews");
mkdirSync(assetsDir, { recursive: true });
mkdirSync(previewsDir, { recursive: true });

const loadFont = (weight) => {
  const bytes = readFileSync(join(assetsDir, "fonts", `Manrope-${weight}.ttf`));
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

const fonts = {
  regular: loadFont("Regular"),
  medium: loadFont("Medium"),
  semiBold: loadFont("SemiBold"),
  bold: loadFont("Bold"),
  extraBold: loadFont("ExtraBold"),
};

const escapeXml = (val) =>
  String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const num = (v) => {
  if (!Number.isFinite(v)) throw new Error(`Invalid coordinate: ${v}`);
  return String(Math.round(v * 10) / 10);
};

const pathData = (path) =>
  path.commands
    .map((cmd) => {
      if (cmd.type === "M" || cmd.type === "L") return `${cmd.type}${num(cmd.x)} ${num(cmd.y)}`;
      if (cmd.type === "Q") return `Q${num(cmd.x1)} ${num(cmd.y1)} ${num(cmd.x)} ${num(cmd.y)}`;
      if (cmd.type === "C")
        return `C${num(cmd.x1)} ${num(cmd.y1)} ${num(cmd.x2)} ${num(cmd.y2)} ${num(cmd.x)} ${num(cmd.y)}`;
      return "Z";
    })
    .join("");

const getGlyphPath = (text, x, y, size, font = fonts.extraBold, tracking = 0) => {
  if (!tracking) {
    return pathData(font.getPath(text, x, y, size));
  }
  let curX = x;
  let d = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const p = font.getPath(ch, curX, y, size);
    d += pathData(p);
    let adv = font.getAdvanceWidth(ch, size);
    if (i < text.length - 1) {
      const g1 = font.charToGlyph(ch);
      const g2 = font.charToGlyph(text[i + 1]);
      const kern = font.getKerningValue(g1, g2);
      adv += (kern * size) / font.unitsPerEm;
    }
    curX += adv + tracking;
  }
  return d;
};

const measureText = (text, size, font = fonts.extraBold, tracking = 0) => {
  if (!tracking) return font.getAdvanceWidth(text, size);
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += font.getAdvanceWidth(text[i], size);
    if (i < text.length - 1) {
      const g1 = font.charToGlyph(text[i]);
      const g2 = font.charToGlyph(text[i + 1]);
      width += (font.getKerningValue(g1, g2) * size) / font.unitsPerEm + tracking;
    }
  }
  return width;
};

const textEl = (text, x, y, size, fill = "#151515", font = fonts.extraBold, tracking = 0) => {
  const d = getGlyphPath(text, x, y, size, font, tracking);
  return `<path d="${d}" fill="${fill}" aria-label="${escapeXml(text)}"/>`;
};

const wrapLines = (text, maxWidth, size, font = fonts.medium, tracking = 0) => {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (line && measureText(cand, size, font, tracking) > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = cand;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const paragraphEl = (text, x, y, maxWidth, size, lineHeight, fill, font = fonts.medium, tracking = 0) => {
  const lines = wrapLines(text, maxWidth, size, font, tracking);
  return lines.map((line, idx) => textEl(line, x, y + idx * lineHeight, size, fill, font, tracking)).join("\n  ");
};

// Extract inner paths from brand SVGs
const enoughToolsSvg = readFileSync(join(assetsDir, "brand", "enough-tools.svg"), "utf8");
const enoughToolsPaths = [...enoughToolsSvg.matchAll(/<path d="([^"]+)"\/>/g)].map((m) => m[1]);

const webscavSvg = readFileSync(join(assetsDir, "brand", "webscav.svg"), "utf8");
const webscavMarkMatch = webscavSvg.match(/<path fill="#1648e7"[^>]*d="([^"]+)"\/>/);
const webscavWordMatch = webscavSvg.match(/<path fill="#20221c"[^>]*d="([^"]+)"\/>/);

const enoughMarkSvg = readFileSync(join(assetsDir, "brand", "enough-ui-mark.svg"), "utf8");
const enoughMarkPaths = [...enoughMarkSvg.matchAll(/<path d="([^"]+)"\/>/g)].map((m) => m[1]);

const monogram = (x, y, size = 48, shadow = 3.5, stroke = "#151515", shadowColor = "#151515") => {
  const scale = size / 48;
  return `<g transform="translate(${x} ${y}) scale(${num(scale)})">
    <rect x="${shadow}" y="${shadow}" width="48" height="48" fill="${shadowColor}"/>
    <rect x="0" y="0" width="48" height="48" fill="#dfff00" stroke="${stroke}" stroke-width="2.5"/>
    ${textEl("r", 11, 35, 39, "#151515", fonts.extraBold)}
    ${textEl(".", 26.5, 35, 33, "#151515", fonts.extraBold)}
  </g>`;
};

const renderHero = (mode = "light") => {
  const isDark = mode === "dark";
  const bg = isDark ? "#12151c" : "#ffffff";
  const ink = isDark ? "#ffffff" : "#151515";
  const subInk = isDark ? "#c6ccd6" : "#252525";
  const mutedInk = isDark ? "#9aa3b2" : "#585858";
  const outerBorder = isDark ? "#2d3343" : "#151515";
  const cardShadow = isDark ? "#07080c" : "#151515";
  const accent = isDark ? "#5c73ff" : "#304bff";
  const lime = "#dfff00";
  const pink = "#ff7ad9";
  const enoughBlue = "#3b4fe4";

  // Editorial top strip (no fake nav links or fake buttons!)
  const header = `
  <rect x="0" y="0" width="1200" height="82" fill="${isDark ? "#171b24" : "#ffffff"}"/>
  <line x1="0" y1="82" x2="1200" y2="82" stroke="${outerBorder}" stroke-width="2.5"/>
  ${monogram(48, 17, 48, 3.5, "#151515", isDark ? "#07080c" : "#151515")}
  ${textEl("Russell Bloxwich", 112, 39, 17, ink, fonts.extraBold, -0.4)}
  ${textEl("Engineer & maker  ·  russ.dev", 112, 58, 12.5, mutedInk, fonts.semiBold, 0.2)}

  <!-- Editorial location / status tag on right (purely informational, not a fake button) -->
  <rect x="928" y="36" width="9" height="9" fill="${lime}" stroke="#151515" stroke-width="1.5"/>
  ${textEl("MELBOURNE, AU  ·  REMOTE", 948, 45, 12, mutedInk, fonts.extraBold, 0.8)}`;

  const heroCopy = `
  <!-- Eyebrow -->
  <rect x="48" y="124" width="9" height="9" fill="${accent}"/>
  ${textEl("FULL-STACK SOFTWARE ENGINEER  ·  6+ YEARS", 66, 133, 12, mutedInk, fonts.extraBold, 0.9)}

  <!-- Big 3-line display title -->
  ${textEl("Product Engineering.", 48, 200, 62, ink, fonts.extraBold, -3.2)}
  ${textEl("Side Projects.", 48, 268, 62, ink, fonts.extraBold, -3.2)}
  ${textEl("A little chaos.", 48, 336, 62, accent, fonts.extraBold, -3.2)}

  <!-- Bio paragraph -->
  ${paragraphEl(
    "I'm Russell, a full-stack engineer. I build things for the web, make tools when I want them, and run events when I can. I've also done weird things, like making a microwave serve cocktails.",
    48,
    388,
    560,
    18.5,
    31,
    subInk,
    fonts.medium,
    -0.1
  )}`;

  const enoughWordmarkWhite = enoughToolsPaths
    .map((d) => `<path d="${d}" fill="#ffffff"/>`)
    .join("");

  const webscavLogo = `
    <path fill="#1648e7" transform="translate(0 10) scale(0.72)" d="${webscavMarkMatch[1]}"/>
    <path fill="#20221c" transform="translate(61 53) scale(0.067 -0.067)" d="${webscavWordMatch[1]}"/>`;

  // Right-side tilted showcase collage (purely visual art without fake action arrows)
  const heroArt = `
  <g transform="translate(720 104)">
    <!-- Orbit ring -->
    <circle cx="268" cy="205" r="144" fill="none" stroke="${isDark ? "#384152" : "#151515"}" stroke-width="2.2"/>
    <circle cx="133" cy="148" r="8.5" fill="${accent}" stroke="#151515" stroke-width="2.2"/>

    <!-- Tilted note -->
    <g transform="translate(10 14) rotate(-6)">
      ${textEl("A few of my projects", 0, 14, 13, mutedInk, fonts.bold, -0.1)}
    </g>

    <!-- Tile 1: EnoughTools (indigo, rotated -6deg) -->
    <g transform="translate(26 54) rotate(-6)">
      <rect x="6" y="6" width="336" height="98" fill="${cardShadow}"/>
      <rect x="0" y="0" width="336" height="98" fill="${enoughBlue}" stroke="#151515" stroke-width="2.5"/>
      <g transform="translate(22 13) scale(0.66)">
        ${enoughWordmarkWhite}
      </g>
      ${textEl("Mail, repos, agents & interfaces.", 22, 74, 12.5, "#ffffff", fonts.semiBold)}
    </g>

    <!-- Tile 2: Webscav (white, rotated 4.5deg) -->
    <g transform="translate(92 152) rotate(4.5)">
      <rect x="6" y="6" width="336" height="98" fill="${cardShadow}"/>
      <rect x="0" y="0" width="336" height="98" fill="#ffffff" stroke="#151515" stroke-width="2.5"/>
      <g transform="translate(22 12) scale(0.62)">
        ${webscavLogo}
      </g>
      ${textEl("Go make a scene.", 22, 74, 12.5, "#151515", fonts.semiBold)}
    </g>

    <!-- Tile 3: H&A Play (pink, rotated -3.5deg) -->
    <g transform="translate(14 258) rotate(-3.5)">
      <rect x="6" y="6" width="336" height="98" fill="${cardShadow}"/>
      <rect x="0" y="0" width="336" height="98" fill="${pink}" stroke="#151515" stroke-width="2.5"/>
      <g transform="translate(22 22)">
        <rect x="0" y="0" width="48" height="52" fill="#151515"/>
        <path d="M24 10 C17 19 10 24 10 31 C10 35.5 13.5 38.5 17.5 38.5 C20 38.5 22 37.2 23 35.5 L20.5 43 L27.5 43 L25 35.5 C26 37.2 28 38.5 30.5 38.5 C34.5 38.5 38 35.5 38 31 C38 24 31 19 24 10 Z" fill="${lime}"/>
      </g>
      ${textEl("H&A Play", 86, 47, 24, "#151515", fonts.extraBold, -0.8)}
      ${textEl("Eight games, one private club for iPhone.", 86, 71, 12, "#151515", fonts.semiBold)}
    </g>
  </g>`;

  const careerStrip = `
  <line x1="0" y1="504" x2="1200" y2="504" stroke="${outerBorder}" stroke-width="2.5"/>
  <rect x="0" y="505.5" width="1200" height="62.5" fill="${isDark ? "#171b24" : "#f8f9fc"}"/>
  <rect x="48" y="521" width="102" height="32" fill="${lime}" stroke="#151515" stroke-width="2"/>
  ${textEl("6+ YEARS", 61, 542, 14, "#151515", fonts.extraBold, 0.4)}
  ${textEl("Frontend, backend & the systems that connect them:", 166, 542, 14.5, subInk, fonts.bold, -0.1)}

  <circle cx="566" cy="537" r="4.5" fill="#304bff"/>
  ${textEl("ThreatSabre", 580, 542, 14.5, ink, fonts.extraBold, -0.2)}
  <circle cx="700" cy="537" r="4.5" fill="#ff6d3a"/>
  ${textEl("Coalesce", 714, 542, 14.5, ink, fonts.extraBold, -0.2)}
  <circle cx="810" cy="537" r="4.5" fill="#b999ff"/>
  ${textEl("MATTR", 824, 542, 14.5, ink, fonts.extraBold, -0.2)}
  <circle cx="906" cy="537" r="4.5" fill="#76e5c2"/>
  ${textEl("Spidertracks", 920, 542, 14.5, ink, fonts.extraBold, -0.2)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="568" viewBox="0 0 1200 568" role="img" aria-labelledby="title desc">
  <title id="title">Russell Bloxwich — Product Engineering. Side Projects. A little chaos.</title>
  <desc id="desc">Full-stack software engineer and maker. Explore EnoughTools, Webscav, H&amp;A Play, writing, and engineering experience on russ.dev.</desc>
  <rect x="0" y="0" width="1200" height="568" fill="${bg}"/>
  ${header}
  ${heroCopy}
  ${heroArt}
  ${careerStrip}
  <rect x="1.2" y="1.2" width="1197.6" height="565.6" fill="none" stroke="${outerBorder}" stroke-width="2.5"/>
</svg>\n`;
};

const renderEnoughBanner = (mode = "light") => {
  const isDark = mode === "dark";
  const bg = isDark ? "#171b24" : "#ffffff";
  const ink = isDark ? "#ffffff" : "#12151c";
  const subInk = isDark ? "#c6ccd6" : "#252525";
  const border = isDark ? "#2d3343" : "#12151c";
  const shadow = isDark ? "#07080c" : "#12151c";
  const accent = "#3b4fe4";
  const divider = isDark ? "#2d3343" : "#c6ccd6";

  const eMark = enoughMarkPaths.map((d) => `<path d="${d}" fill="#ffffff"/>`).join("");

  const productCell = (x, y, iconSvg, title, desc) => `
  <g transform="translate(${x} ${y})">
    ${iconSvg}
    ${textEl(title, 44, 21, 19, ink, fonts.extraBold, -0.6)}
    ${paragraphEl(desc, 44, 46, 265, 14.5, 22, subInk, fonts.medium)}
  </g>`;

  const mailIcon = `<g transform="translate(0 0)">
    <rect x="0" y="0" width="32" height="32" rx="7" fill="#12151c" stroke="${isDark ? "#3b4fe4" : "none"}" stroke-width="1.5"/>
    <rect x="6.5" y="9.5" width="19" height="13" rx="1.5" fill="none" stroke="#ffffff" stroke-width="2"/>
    <path d="m7.5 10.5 7.5 5.8a1.8 1.8 0 0 0 2 0l7.5-5.8" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
  </g>`;

  const reposIcon = `<g transform="translate(0 0)">
    <rect x="0" y="0" width="32" height="32" rx="7" fill="#304bff"/>
    <path d="M7 11.5h6l2 2.5h10v9.5H7z" fill="#dfff00" stroke="#151515" stroke-width="1.8" stroke-linejoin="miter"/>
  </g>`;

  const factoryIcon = `<g transform="translate(0 0)">
    <rect x="0" y="0" width="32" height="32" fill="#12151c" stroke="${isDark ? "#3b4fe4" : "none"}" stroke-width="1.5"/>
    <g transform="scale(0.5)">${eMark}</g>
  </g>`;

  const uiIcon = `<g transform="translate(0 0)">
    <rect x="0" y="0" width="32" height="32" fill="#dfff00" stroke="#151515" stroke-width="2"/>
    ${textEl("Aa", 5.5, 22, 16, "#151515", fonts.extraBold, -0.5)}
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="284" viewBox="0 0 1200 284" role="img" aria-labelledby="title desc">
  <title id="title">Enough. Open-source tools for email, repositories, coding agents, and interfaces.</title>
  <desc id="desc">EnoughMail, EnoughRepos, EnoughFactory, and EnoughUI — built by Russell Bloxwich.</desc>
  <rect x="7" y="7" width="1184" height="268" fill="${shadow}"/>
  <rect x="1.5" y="1.5" width="1184" height="268" fill="${bg}" stroke="${border}" stroke-width="2.5"/>
  <rect x="1.5" y="1.5" width="1184" height="7" fill="${accent}"/>

  ${textEl("Enough", 38, 62, 38, ink, fonts.extraBold, -1.8)}
  ${textEl(".", 169, 62, 38, isDark ? "#dfff00" : accent, fonts.extraBold)}
  ${textEl("OPEN-SOURCE TOOLING FAMILY", 198, 56, 11.5, isDark ? "#9aa3b2" : "#585858", fonts.extraBold, 0.8)}

  ${paragraphEl(
    "Enough is a family of open-source tools I'm building to solve business problems: managing code, coordinating coding agents, and running email for my own domains.",
    38,
    102,
    430,
    15.5,
    25,
    subInk,
    fonts.medium
  )}
  ${paragraphEl(
    "Each product works independently, sharing EnoughUI as a common neobrutalist interface foundation across React, Astro, and SwiftUI.",
    38,
    190,
    430,
    15,
    24,
    subInk,
    fonts.medium
  )}

  <line x1="504" y1="32" x2="504" y2="244" stroke="${divider}" stroke-width="1.5"/>

  ${productCell(536, 36, mailIcon, "EnoughMail", "Email for your domains, in your own Cloudflare account.")}
  ${productCell(866, 36, reposIcon, "EnoughRepos", "Browse Git in Finder. Download a checkout to work.")}
  ${productCell(536, 150, factoryIcon, "EnoughFactory", "Plan and run coding agents across Mac and Linux.")}
  ${productCell(866, 150, uiIcon, "EnoughUI", "Neobrutalist components for React, Astro, and SwiftUI.")}
</svg>\n`;
};

const renderExperienceBanner = (mode = "light") => {
  const isDark = mode === "dark";
  const bg = isDark ? "#12151c" : "#ffffff";
  const cardBg = isDark ? "#171b24" : "#ffffff";
  const ink = isDark ? "#ffffff" : "#151515";
  const subInk = isDark ? "#c6ccd6" : "#252525";
  const mutedInk = isDark ? "#9aa3b2" : "#585858";
  const border = isDark ? "#2d3343" : "#151515";
  const shadow = isDark ? "#07080c" : "#151515";
  const accent = isDark ? "#5c73ff" : "#304bff";

  const roleCard = (x, y, w, h, tagBg, tagText, company, role, desc, stack) => `
  <g transform="translate(${x} ${y})">
    <rect x="4.5" y="4.5" width="${w}" height="${h}" fill="${shadow}"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="${cardBg}" stroke="${border}" stroke-width="2.2"/>
    <rect x="18" y="16" width="${Math.round(measureText(tagText, 11, fonts.extraBold, 0.4) + 18)}" height="22" fill="${tagBg}" stroke="#151515" stroke-width="1.6"/>
    ${textEl(tagText, 27, 31, 11, "#151515", fonts.extraBold, 0.4)}
    ${textEl(company, 18, 64, 21, ink, fonts.extraBold, -0.6)}
    ${textEl(role, 18, 84, 13, mutedInk, fonts.bold)}
    ${paragraphEl(desc, 18, 109, w - 36, 13.5, 20, subInk, fonts.medium)}
    ${textEl(stack, 18, h - 18, 11.5, isDark ? "#8b9dff" : "#304bff", fonts.extraBold, 0.2)}
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="348" viewBox="0 0 1200 348" role="img" aria-labelledby="title desc">
  <title id="title">6+ years in software engineering — ThreatSabre, Coalesce, MATTR, Spidertracks</title>
  <desc id="desc">Career highlights across ThreatSabre, Coalesce, MATTR, and Spidertracks in TypeScript, React, Node.js, PostgreSQL, AWS, and event-driven systems.</desc>
  <rect x="7" y="7" width="1184" height="332" fill="${shadow}"/>
  <rect x="1.5" y="1.5" width="1184" height="332" fill="${bg}" stroke="${border}" stroke-width="2.5"/>

  <rect x="38" y="30" width="9" height="9" fill="${accent}"/>
  ${textEl("EXPERIENCE & ARCHITECTURE", 56, 39, 12, mutedInk, fonts.extraBold, 0.9)}
  ${textEl("6+ years in software engineering.", 38, 76, 34, ink, fonts.extraBold, -1.5)}
  ${textEl("Frontend engineering, distributed systems, architecture & the decisions that keep a team moving.", 586, 72, 13.5, mutedInk, fonts.semiBold)}

  ${roleCard(
    38,
    98,
    266,
    210,
    "#dfff00",
    "NETWORK SECURITY",
    "ThreatSabre",
    "Architecture & Product (Contract)",
    "Hands-on architecture, technical review & product development with the founders.",
    "TypeScript · React · Node.js"
  )}
  ${roleCard(
    319,
    98,
    266,
    210,
    "#ff6d3a",
    "DATA TRANSFORMATION",
    "Coalesce",
    "Senior Software Engineer",
    "Zero-downtime Firestore→Postgres migration, React performance & 3–20× faster SQL parser.",
    "TypeScript · React · PostgreSQL · Node.js"
  )}
  ${roleCard(
    600,
    98,
    266,
    210,
    "#b999ff",
    "DIGITAL IDENTITY",
    "MATTR",
    "Senior Software Engineer",
    "Eventing platform, ts-morph & Protobuf codegen, Kafka optimisation & global Auth0 plane.",
    "TypeScript · Kafka · AWS · Postgres · Auth0"
  )}
  ${roleCard(
    881,
    98,
    273,
    210,
    "#76e5c2",
    "AIRCRAFT TRACKING",
    "Spidertracks",
    "Senior Software Engineer",
    "Modernising legacy React & Redux to TypeScript and replacing Java/Spring APIs with Node.js.",
    "TypeScript · React · Redux · Node.js"
  )}
</svg>\n`;
};

const renderFooterBanner = (mode = "light") => {
  const isDark = mode === "dark";
  const bg = isDark ? "#171b24" : "#ffffff";
  const ink = isDark ? "#ffffff" : "#151515";
  const subInk = isDark ? "#c6ccd6" : "#252525";
  const border = isDark ? "#2d3343" : "#151515";
  const shadow = isDark ? "#07080c" : "#151515";
  const accent = isDark ? "#dfff00" : "#304bff";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="142" viewBox="0 0 1200 142" role="img" aria-labelledby="title desc">
  <title id="title">Engineer by trade. Maker by default. Have a good problem? Let's make something.</title>
  <desc id="desc">Get in touch with Russell Bloxwich at russ.dev or contact@reb.nz.</desc>
  <rect x="7" y="7" width="1184" height="126" fill="${shadow}"/>
  <rect x="1.5" y="1.5" width="1184" height="126" fill="${bg}" stroke="${border}" stroke-width="2.5"/>
  <rect x="1.5" y="1.5" width="10" height="126" fill="#304bff"/>

  ${monogram(38, 30, 56, 4, "#151515", shadow)}

  ${textEl("Engineer by trade. Maker by default.", 116, 56, 26, ink, fonts.extraBold, -1.1)}
  ${textEl("Have a good problem? Let's make something.", 546, 56, 26, accent, fonts.extraBold, -1.1)}
  ${textEl(
    "Melbourne or remote  ·  Senior, Staff & Tech Lead roles  ·  russ.dev  ·  contact@reb.nz",
    116,
    88,
    15,
    subInk,
    fonts.semiBold
  )}
</svg>\n`;
};

const renderBadge = (label, bg, textColor = "#151515") => {
  const width = Math.round(measureText(label, 12, fonts.extraBold, 0.5) + 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 4}" height="30" viewBox="0 0 ${width + 4} 30" role="img" aria-label="${escapeXml(label)}">
  <rect x="3" y="3" width="${width}" height="25" fill="#151515"/>
  <rect x="1" y="1" width="${width}" height="25" fill="${bg}" stroke="#151515" stroke-width="1.8"/>
  ${textEl(label, 12, 18, 12, textColor, fonts.extraBold, 0.5)}
</svg>\n`;
};

const render2x = (svg) => new Resvg(svg, { fitTo: { mode: "zoom", value: 2 } }).render().asPng();

for (const mode of ["light", "dark"]) {
  const heroSvg = renderHero(mode);
  const heroPng = render2x(heroSvg);
  writeFileSync(join(assetsDir, `hero-${mode}.svg`), heroSvg);
  writeFileSync(join(assetsDir, `hero-${mode}.png`), heroPng);
  writeFileSync(join(previewsDir, `hero-${mode}.png`), heroPng);

  const enoughSvg = renderEnoughBanner(mode);
  const enoughPng = render2x(enoughSvg);
  writeFileSync(join(assetsDir, `enough-${mode}.svg`), enoughSvg);
  writeFileSync(join(assetsDir, `enough-${mode}.png`), enoughPng);
  writeFileSync(join(previewsDir, `enough-${mode}.png`), enoughPng);

  const expSvg = renderExperienceBanner(mode);
  const expPng = render2x(expSvg);
  writeFileSync(join(assetsDir, `experience-${mode}.svg`), expSvg);
  writeFileSync(join(assetsDir, `experience-${mode}.png`), expPng);
  writeFileSync(join(previewsDir, `experience-${mode}.png`), expPng);

  const footerSvg = renderFooterBanner(mode);
  const footerPng = render2x(footerSvg);
  writeFileSync(join(assetsDir, `footer-${mode}.svg`), footerSvg);
  writeFileSync(join(assetsDir, `footer-${mode}.png`), footerPng);
  writeFileSync(join(previewsDir, `footer-${mode}.png`), footerPng);
}

const badges = [
  ["badge-enough", "ENOUGH TOOLS", "#3b4fe4", "#ffffff"],
  ["badge-apps", "APPS", "#ff7ad9", "#151515"],
  ["badge-games", "GAMES", "#76e5c2", "#151515"],
  ["badge-oss", "TOOLS", "#dfff00", "#151515"],
  ["badge-chaos", "EXPERIMENTS", "#ff6d3a", "#151515"],
  ["badge-writing", "THINKING OUT LOUD", "#b999ff", "#151515"],
  ["badge-work", "WORK WITH ME", "#76e5c2", "#151515"],
];

for (const [baseName, label, bg, fg] of badges) {
  const svg = renderBadge(label, bg, fg);
  writeFileSync(join(assetsDir, `${baseName}.svg`), svg);
  writeFileSync(join(assetsDir, `${baseName}.png`), render2x(svg));
}

console.log("Generated button-free profile SVGs and 2x retina PNGs.");
