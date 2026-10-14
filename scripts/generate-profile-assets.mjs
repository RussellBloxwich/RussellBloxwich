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
  return String(Math.round(v * 100) / 100);
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

const arrowRight = (x, y, size = 18, stroke = "#151515", strokeWidth = 2.5) => {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${num(s)})" fill="none" stroke="${stroke}" stroke-width="${num(strokeWidth / s)}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14"/>
    <path d="m12 5 7 7-7 7"/>
  </g>`;
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
  const blueBtn = "#304bff";
  const lime = "#dfff00";
  const pink = "#ff7ad9";
  const enoughBlue = "#3b4fe4";

  const header = `
  <rect x="0" y="0" width="1200" height="86" fill="${isDark ? "#171b24" : "#ffffff"}"/>
  <line x1="0" y1="86" x2="1200" y2="86" stroke="${outerBorder}" stroke-width="2.5"/>
  ${monogram(48, 19, 48, 3.5, "#151515", isDark ? "#07080c" : "#151515")}
  ${textEl("Russell Bloxwich", 112, 41, 17, ink, fonts.extraBold, -0.4)}
  ${textEl("Engineer & maker", 112, 60, 12.5, mutedInk, fonts.semiBold, 0.2)}

  ${textEl("Projects", 690, 48, 14.5, ink, fonts.bold)}
  ${textEl("Writing", 785, 48, 14.5, ink, fonts.bold)}
  ${textEl("Experience", 874, 48, 14.5, ink, fonts.bold)}

  <!-- Work with me button -->
  <g transform="translate(992 22)">
    <rect x="3.5" y="3.5" width="160" height="42" fill="${cardShadow}"/>
    <rect x="0" y="0" width="160" height="42" fill="${isDark ? lime : "#ffffff"}" stroke="#151515" stroke-width="2.2"/>
    ${textEl("Work with me", 18, 26, 13.5, "#151515", fonts.extraBold, -0.2)}
    ${arrowRight(126, 12.5, 17, "#151515", 2.5)}
  </g>`;

  const heroCopy = `
  <!-- Eyebrow -->
  <rect x="48" y="128" width="9" height="9" fill="${accent}"/>
  ${textEl("FULL-STACK ENGINEER  ·  MELBOURNE & REMOTE", 66, 137, 12, mutedInk, fonts.extraBold, 0.9)}

  <!-- Big 3-line display title -->
  ${textEl("Product Engineering.", 48, 202, 60, ink, fonts.extraBold, -3.2)}
  ${textEl("Side Projects.", 48, 268, 60, ink, fonts.extraBold, -3.2)}
  ${textEl("A little chaos.", 48, 334, 60, accent, fonts.extraBold, -3.2)}

  <!-- Bio paragraph -->
  ${paragraphEl(
    "I'm Russell, a full-stack engineer. I build things for the web, make tools when I want them, and run events when I can. I've also done weird things, like making a microwave serve cocktails.",
    48,
    382,
    560,
    18.5,
    31,
    subInk,
    fonts.medium,
    -0.1
  )}

  <!-- Hero CTA buttons -->
  <g transform="translate(48 492)">
    <rect x="4" y="4" width="184" height="48" fill="${cardShadow}"/>
    <rect x="0" y="0" width="184" height="48" fill="${blueBtn}" stroke="#151515" stroke-width="2.2"/>
    ${textEl("Explore russ.dev", 20, 29, 14, "#ffffff", fonts.extraBold, -0.2)}
    ${arrowRight(148, 15, 18, "#ffffff", 2.5)}
  </g>
  <g transform="translate(250 492)">
    <rect x="4" y="4" width="196" height="48" fill="${cardShadow}"/>
    <rect x="0" y="0" width="196" height="48" fill="#ffffff" stroke="#151515" stroke-width="2.2"/>
    ${textEl("EnoughTools.com", 20, 29, 14, "#151515", fonts.extraBold, -0.2)}
    ${arrowRight(160, 15, 18, "#151515", 2.5)}
  </g>
  ${textEl("Read my writing", 472, 521, 14, ink, fonts.extraBold, -0.2)}
  ${arrowRight(588, 507, 18, accent, 2.5)}`;

  const enoughWordmarkWhite = enoughToolsPaths
    .map((d) => `<path d="${d}" fill="#ffffff"/>`)
    .join("");

  const webscavLogo = `
    <path fill="#1648e7" transform="translate(0 10) scale(0.72)" d="${webscavMarkMatch[1]}"/>
    <path fill="#20221c" transform="translate(61 53) scale(0.067 -0.067)" d="${webscavWordMatch[1]}"/>`;

  const heroArt = `
  <g transform="translate(720 112)">
    <!-- Orbit ring -->
    <circle cx="268" cy="215" r="148" fill="none" stroke="${isDark ? "#384152" : "#151515"}" stroke-width="2.2"/>
    <circle cx="131" cy="156" r="8.5" fill="${accent}" stroke="#151515" stroke-width="2.2"/>

    <!-- Tilted note -->
    <g transform="translate(10 18) rotate(-6)">
      ${textEl("A few of my projects", 0, 14, 13, mutedInk, fonts.bold, -0.1)}
    </g>

    <!-- Tile 1: EnoughTools (indigo, rotated -6deg) -->
    <g transform="translate(26 62) rotate(-6)">
      <rect x="6" y="6" width="336" height="104" fill="${cardShadow}"/>
      <rect x="0" y="0" width="336" height="104" fill="${enoughBlue}" stroke="#151515" stroke-width="2.5"/>
      <g transform="translate(22 14) scale(0.68)">
        ${enoughWordmarkWhite}
      </g>
      ${textEl("Mail, repos, agents & interfaces.", 22, 78, 12.5, "#ffffff", fonts.semiBold)}
      ${arrowRight(296, 42, 20, "#ffffff", 2.5)}
    </g>

    <!-- Tile 2: Webscav (white, rotated 4.5deg) -->
    <g transform="translate(92 164) rotate(4.5)">
      <rect x="6" y="6" width="336" height="104" fill="${cardShadow}"/>
      <rect x="0" y="0" width="336" height="104" fill="#ffffff" stroke="#151515" stroke-width="2.5"/>
      <g transform="translate(22 14) scale(0.64)">
        ${webscavLogo}
      </g>
      ${textEl("Go make a scene.", 22, 78, 12.5, "#151515", fonts.semiBold)}
      ${arrowRight(296, 42, 20, "#151515", 2.5)}
    </g>

    <!-- Tile 3: H&A Play (pink, rotated -3.5deg) -->
    <g transform="translate(14 276) rotate(-3.5)">
      <rect x="6" y="6" width="336" height="104" fill="${cardShadow}"/>
      <rect x="0" y="0" width="336" height="104" fill="${pink}" stroke="#151515" stroke-width="2.5"/>
      <g transform="translate(22 25)">
        <rect x="0" y="0" width="48" height="52" fill="#151515"/>
        <path d="M24 10 C17 19 10 24 10 31 C10 35.5 13.5 38.5 17.5 38.5 C20 38.5 22 37.2 23 35.5 L20.5 43 L27.5 43 L25 35.5 C26 37.2 28 38.5 30.5 38.5 C34.5 38.5 38 35.5 38 31 C38 24 31 19 24 10 Z" fill="${lime}"/>
      </g>
      ${textEl("H&A Play", 86, 50, 24, "#151515", fonts.extraBold, -0.8)}
      ${textEl("Eight games, one private club for iPhone.", 86, 74, 12, "#151515", fonts.semiBold)}
      ${arrowRight(296, 42, 20, "#151515", 2.5)}
    </g>
  </g>`;

  const careerStrip = `
  <line x1="0" y1="572" x2="1200" y2="572" stroke="${outerBorder}" stroke-width="2.5"/>
  <rect x="0" y="573.5" width="1200" height="66.5" fill="${isDark ? "#171b24" : "#f8f9fc"}"/>
  <rect x="48" y="590" width="102" height="32" fill="${lime}" stroke="#151515" stroke-width="2"/>
  ${textEl("6+ YEARS", 61, 611, 14, "#151515", fonts.extraBold, 0.4)}
  ${textEl("Frontend, backend & the systems that connect them:", 166, 611, 14.5, subInk, fonts.bold, -0.1)}

  <g transform="translate(558 589)">
    <rect x="2.5" y="2.5" width="136" height="34" fill="${cardShadow}"/>
    <rect x="0" y="0" width="136" height="34" fill="#ffffff" stroke="#151515" stroke-width="2"/>
    <circle cx="18" cy="17" r="5" fill="#304bff"/>
    ${textEl("ThreatSabre", 31, 22, 13.5, "#151515", fonts.extraBold, -0.2)}
  </g>
  <g transform="translate(706 589)">
    <rect x="2.5" y="2.5" width="116" height="34" fill="${cardShadow}"/>
    <rect x="0" y="0" width="116" height="34" fill="#ffffff" stroke="#151515" stroke-width="2"/>
    <circle cx="18" cy="17" r="5" fill="#ff6d3a"/>
    ${textEl("Coalesce", 31, 22, 13.5, "#151515", fonts.extraBold, -0.2)}
  </g>
  <g transform="translate(834 589)">
    <rect x="2.5" y="2.5" width="102" height="34" fill="${cardShadow}"/>
    <rect x="0" y="0" width="102" height="34" fill="#ffffff" stroke="#151515" stroke-width="2"/>
    <circle cx="18" cy="17" r="5" fill="#b999ff"/>
    ${textEl("MATTR", 31, 22, 13.5, "#151515", fonts.extraBold, -0.2)}
  </g>
  <g transform="translate(948 589)">
    <rect x="2.5" y="2.5" width="136" height="34" fill="${cardShadow}"/>
    <rect x="0" y="0" width="136" height="34" fill="#ffffff" stroke="#151515" stroke-width="2"/>
    <circle cx="18" cy="17" r="5" fill="#151515"/>
    ${textEl("Spidertracks", 31, 22, 13.5, "#151515", fonts.extraBold, -0.2)}
  </g>
  ${textEl("russ.dev ↗", 1104, 611, 13.5, accent, fonts.extraBold, -0.2)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 1200 640" role="img" aria-labelledby="title desc">
  <title id="title">Russell Bloxwich — Product Engineering. Side Projects. A little chaos.</title>
  <desc id="desc">Full-stack software engineer and maker. Explore EnoughTools, Webscav, H&amp;A Play, writing, and engineering experience on russ.dev.</desc>
  <rect x="0" y="0" width="1200" height="640" fill="${bg}"/>
  ${header}
  ${heroCopy}
  ${heroArt}
  ${careerStrip}
  <rect x="1.25" y="1.25" width="1197.5" height="637.5" fill="none" stroke="${outerBorder}" stroke-width="2.5"/>
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
    ${arrowRight(285, 5, 18, isDark ? "#8b9dff" : accent, 2.5)}
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="290" viewBox="0 0 1200 290" role="img" aria-labelledby="title desc">
  <title id="title">Enough. Open-source tools for email, repositories, coding agents, and interfaces.</title>
  <desc id="desc">EnoughMail, EnoughRepos, EnoughFactory, and EnoughUI — built by Russell Bloxwich.</desc>
  <rect x="7" y="7" width="1184" height="274" fill="${shadow}"/>
  <rect x="1.5" y="1.5" width="1184" height="274" fill="${bg}" stroke="${border}" stroke-width="2.5"/>
  <rect x="1.5" y="1.5" width="1184" height="7" fill="${accent}"/>

  ${textEl("Enough", 38, 62, 38, ink, fonts.extraBold, -1.8)}
  ${textEl(".", 169, 62, 38, isDark ? "#dfff00" : accent, fonts.extraBold)}
  <g transform="translate(204 37)">
    <rect x="0" y="0" width="152" height="30" fill="${isDark ? "#232938" : "#eef0fb"}" stroke="${border}" stroke-width="1.8"/>
    ${textEl("enoughtools.com ↗", 14, 20, 12.5, isDark ? "#dfff00" : accent, fonts.extraBold)}
  </g>

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
    192,
    430,
    15,
    24,
    subInk,
    fonts.medium
  )}

  <line x1="504" y1="32" x2="504" y2="248" stroke="${divider}" stroke-width="1.5"/>

  ${productCell(536, 36, mailIcon, "EnoughMail", "Email for your domains, in your own Cloudflare account.")}
  ${productCell(866, 36, reposIcon, "EnoughRepos", "Browse Git in Finder. Download a checkout to work.")}
  ${productCell(536, 152, factoryIcon, "EnoughFactory", "Plan and run coding agents across Mac and Linux.")}
  ${productCell(866, 152, uiIcon, "EnoughUI", "Neobrutalist components for React, Astro, and SwiftUI.")}
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
  const lime = "#dfff00";

  const roleCard = (x, y, w, h, tagBg, tagText, company, role, desc, stack) => `
  <g transform="translate(${x} ${y})">
    <rect x="4.5" y="4.5" width="${w}" height="${h}" fill="${shadow}"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="${cardBg}" stroke="${border}" stroke-width="2.2"/>
    <rect x="18" y="16" width="${measureText(tagText, 11, fonts.extraBold, 0.4) + 18}" height="22" fill="${tagBg}" stroke="#151515" stroke-width="1.6"/>
    ${textEl(tagText, 27, 31, 11, "#151515", fonts.extraBold, 0.4)}
    ${textEl(company, 18, 64, 21, ink, fonts.extraBold, -0.6)}
    ${textEl(role, 18, 84, 13, mutedInk, fonts.bold)}
    ${paragraphEl(desc, 18, 109, w - 36, 13.5, 20, subInk, fonts.medium)}
    ${textEl(stack, 18, h - 16, 11.5, isDark ? "#8b9dff" : "#304bff", fonts.extraBold, 0.2)}
  </g>`;

  const stackPills = [
    ["TypeScript", "#dfff00"],
    ["React", "#ffffff"],
    ["Node.js", "#ffffff"],
    ["Go", "#76e5c2"],
    ["Swift / macOS / iOS", "#ff7ad9"],
    ["PostgreSQL", "#ffffff"],
    ["Cloudflare Workers", "#ff6d3a"],
    ["Kafka & Eventing", "#b999ff"],
    ["Local-First / CRDTs", "#dfff00"],
    ["On-Device AI", "#ffffff"],
  ];

  let pillX = 38;
  const renderedPills = stackPills
    .map(([label, color]) => {
      const pw = Math.round(measureText(label, 12.5, fonts.extraBold, -0.1) + 24);
      const svg = `<g transform="translate(${pillX} 312)">
      <rect x="2.5" y="2.5" width="${pw}" height="32" fill="${shadow}"/>
      <rect x="0" y="0" width="${pw}" height="32" fill="${color}" stroke="#151515" stroke-width="1.8"/>
      ${textEl(label, 12, 20.5, 12.5, "#151515", fonts.extraBold, -0.1)}
    </g>`;
      pillX += pw + 10;
      return svg;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="368" viewBox="0 0 1200 368" role="img" aria-labelledby="title desc">
  <title id="title">6+ years in software engineering — ThreatSabre, Coalesce, MATTR, Spidertracks</title>
  <desc id="desc">Career highlights and core stack across TypeScript, React, Node.js, Go, Swift, PostgreSQL, and Cloudflare.</desc>
  <rect x="7" y="7" width="1184" height="352" fill="${shadow}"/>
  <rect x="1.5" y="1.5" width="1184" height="352" fill="${bg}" stroke="${border}" stroke-width="2.5"/>

  <rect x="38" y="30" width="9" height="9" fill="${accent}"/>
  ${textEl("EXPERIENCE & ARCHITECTURE", 56, 39, 12, mutedInk, fonts.extraBold, 0.9)}
  ${textEl("6+ years in software engineering.", 38, 76, 34, ink, fonts.extraBold, -1.5)}

  <!-- Open to work badge on top right -->
  <g transform="translate(830 32)">
    <rect x="3.5" y="3.5" width="324" height="44" fill="${shadow}"/>
    <rect x="0" y="0" width="324" height="44" fill="${lime}" stroke="#151515" stroke-width="2"/>
    <circle cx="20" cy="22" r="5.5" fill="#304bff" stroke="#151515" stroke-width="1.5"/>
    ${textEl("Open to Senior, Staff & Tech Lead roles ↗", 34, 27, 13.5, "#151515", fonts.extraBold, -0.2)}
  </g>

  ${roleCard(
    38,
    98,
    266,
    194,
    "#dfff00",
    "NETWORK SECURITY",
    "ThreatSabre",
    "Senior Software Engineer",
    "Architecture and product development from the ground up.",
    "TypeScript · React · Node.js"
  )}
  ${roleCard(
    319,
    98,
    266,
    194,
    "#ff6d3a",
    "DATA TRANSFORMATION",
    "Coalesce",
    "Senior Software Engineer",
    "Zero-downtime Firestore→Postgres migration & 3–20× faster SQL parser.",
    "TypeScript · React · PostgreSQL · Go"
  )}
  ${roleCard(
    600,
    98,
    266,
    194,
    "#b999ff",
    "DIGITAL TRUST & ID",
    "MATTR",
    "Senior Software Engineer",
    "Event-driven platform architecture, Protobuf codegen & global auth.",
    "TypeScript · Node.js · Kafka · Auth0"
  )}
  ${roleCard(
    881,
    98,
    273,
    194,
    "#76e5c2",
    "AVIATION & TELEMETRY",
    "Spidertracks",
    "Senior Software Engineer",
    "Real-time aircraft tracking, frontend modernisation & core APIs.",
    "React · TypeScript · Node.js · AWS"
  )}

  ${renderedPills}
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
  const lime = "#dfff00";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="156" viewBox="0 0 1200 156" role="img" aria-labelledby="title desc">
  <title id="title">Engineer by trade. Maker by default. Have a good problem? Let's make something.</title>
  <desc id="desc">Get in touch with Russell Bloxwich at russ.dev or contact@reb.nz.</desc>
  <rect x="7" y="7" width="1184" height="140" fill="${shadow}"/>
  <rect x="1.5" y="1.5" width="1184" height="140" fill="${bg}" stroke="${border}" stroke-width="2.5"/>
  <rect x="1.5" y="1.5" width="10" height="140" fill="#304bff"/>

  ${monogram(38, 36, 56, 4, "#151515", shadow)}

  ${textEl("Engineer by trade. Maker by default.", 116, 62, 26, ink, fonts.extraBold, -1.1)}
  ${textEl("Have a good problem?", 546, 62, 26, accent, fonts.extraBold, -1.1)}
  ${textEl(
    "Melbourne or remote  ·  Senior, Staff & Tech Lead roles  ·  russ.dev  ·  contact@reb.nz",
    116,
    94,
    15,
    subInk,
    fonts.semiBold
  )}

  <g transform="translate(944 46)">
    <rect x="4" y="4" width="208" height="50" fill="${shadow}"/>
    <rect x="0" y="0" width="208" height="50" fill="${lime}" stroke="#151515" stroke-width="2.2"/>
    ${textEl("Work with me", 24, 31, 15.5, "#151515", fonts.extraBold, -0.3)}
    ${arrowRight(166, 16, 19, "#151515", 2.5)}
  </g>
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

for (const mode of ["light", "dark"]) {
  const heroSvg = renderHero(mode);
  writeFileSync(join(assetsDir, `hero-${mode}.svg`), heroSvg);
  writeFileSync(join(previewsDir, `hero-${mode}.png`), new Resvg(heroSvg).render().asPng());

  const enoughSvg = renderEnoughBanner(mode);
  writeFileSync(join(assetsDir, `enough-${mode}.svg`), enoughSvg);
  writeFileSync(join(previewsDir, `enough-${mode}.png`), new Resvg(enoughSvg).render().asPng());

  const expSvg = renderExperienceBanner(mode);
  writeFileSync(join(assetsDir, `experience-${mode}.svg`), expSvg);
  writeFileSync(join(previewsDir, `experience-${mode}.png`), new Resvg(expSvg).render().asPng());

  const footerSvg = renderFooterBanner(mode);
  writeFileSync(join(assetsDir, `footer-${mode}.svg`), footerSvg);
  writeFileSync(join(previewsDir, `footer-${mode}.png`), new Resvg(footerSvg).render().asPng());
}

const badges = [
  ["badge-enough.svg", "ENOUGH TOOLS", "#3b4fe4", "#ffffff"],
  ["badge-apps.svg", "APPS & GAMES", "#ff7ad9", "#151515"],
  ["badge-oss.svg", "OPEN SOURCE & CLI", "#dfff00", "#151515"],
  ["badge-chaos.svg", "HARDWARE & CHAOS", "#ff6d3a", "#151515"],
  ["badge-writing.svg", "THINKING OUT LOUD", "#b999ff", "#151515"],
  ["badge-work.svg", "WORK WITH ME", "#76e5c2", "#151515"],
];

for (const [filename, label, bg, fg] of badges) {
  writeFileSync(join(assetsDir, filename), renderBadge(label, bg, fg));
}

console.log("Generated all profile SVGs and PNG previews.");
