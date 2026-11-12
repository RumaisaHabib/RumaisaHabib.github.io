// Generates a markdown copy of every page listed in sitemap.xml, for agents
// that request Accept: text/markdown (see cloudflare/markdown-worker.js).
//
//   /                -> index.html.md
//   /publications/   -> publications/index.html.md
//
// The file names follow the llms.txt convention (page URL + ".md", with
// "index.html.md" for directory URLs), so they also work as direct links.
//
// The output deliberately has no YAML front matter: GitHub Pages runs Jekyll,
// which would turn a .md file that starts with "---" into HTML.
//
// Run after editing any page:  npm run build-markdown

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import domino from "@mixmark-io/domino";
import TurndownService from "turndown";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://rumaisahabib.com";

// Material Icons ligatures used as link text -> readable labels.
const ICON_LABELS = {
  description: "PDF",
  code: "Code",
  co_present: "Talk",
  ondemand_video: "Video",
  folder_shared: "Slides",
};

// domino NodeLists are not iterable, so convert them to arrays.
const $$ = (root, selector) => Array.from(root.querySelectorAll(selector));

function pagesFromSitemap() {
  const xml = readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

function localPaths(pageUrl) {
  let p = new URL(pageUrl).pathname;
  if (p.endsWith("/")) p += "index.html";
  else if (!path.extname(p)) p += "/index.html";
  const html = path.join(ROOT, p);
  return { html, md: html + ".md" };
}

function replaceTag(el, tagName) {
  const out = el.ownerDocument.createElement(tagName);
  while (el.firstChild) out.appendChild(el.firstChild);
  el.replaceWith(out);
  return out;
}

// Honour `white-space: pre-line` rules from the page's own <style> blocks by
// turning source newlines into <br>, so line-separated content (title /
// authors / venue) doesn't collapse into one run-on line.
function applyPreLine(doc) {
  const css = $$(doc, "style").map((s) => s.textContent).join("\n");
  const selectors = [...css.matchAll(/([^{}]+)\{[^}]*white-space\s*:\s*pre-line/g)]
    .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim())
    .filter(Boolean);

  for (const selector of selectors) {
    for (const el of $$(doc, selector)) {
      while (el.firstChild?.nodeType === 3 && !el.firstChild.data.trim()) el.firstChild.remove();
      while (el.lastChild?.nodeType === 3 && !el.lastChild.data.trim()) el.lastChild.remove();
      if (el.firstChild?.nodeType === 3) el.firstChild.data = el.firstChild.data.trimStart();
      if (el.lastChild?.nodeType === 3) el.lastChild.data = el.lastChild.data.trimEnd();

      const walker = doc.createTreeWalker(el, 4 /* SHOW_TEXT */);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      for (const node of textNodes) {
        if (!node.data.includes("\n") || node.parentElement.closest("pre")) continue;
        const parts = node.data.split(/[ \t]*\n\s*/);
        const frag = doc.createDocumentFragment();
        parts.forEach((part, i) => {
          if (i > 0) frag.appendChild(doc.createElement("br"));
          if (part) frag.appendChild(doc.createTextNode(part));
        });
        node.replaceWith(frag);
      }
    }
  }
}

function cleanDocument(doc, pageUrl, canonicalUrls) {
  applyPreLine(doc);

  $$(doc, "nav, script, style, noscript, button, summary").forEach((el) => el.remove());
  $$(doc, "img").forEach((img) => {
    if (!img.getAttribute("src")) img.remove();
  });

  // Absolute URLs, so links still work when the markdown is read elsewhere;
  // "/publications" -> "/publications/" when the sitemap lists the latter.
  $$(doc, "a[href]").forEach((a) => {
    const url = new URL(a.getAttribute("href"), pageUrl);
    if (canonicalUrls.has(url.href + "/")) url.pathname += "/";
    a.setAttribute("href", url.href);
  });
  $$(doc, "img[src]").forEach((img) => {
    img.setAttribute("src", new URL(img.getAttribute("src"), pageUrl).href);
  });

  // Icon-only links ("description", "ondemand_video", ...) -> readable labels.
  $$(doc, "a.material-icons").forEach((a) => {
    const icon = a.textContent.trim();
    a.textContent = ICON_LABELS[icon] ?? icon.replace(/_/g, " ");
  });

  // Section titles are styled <a>/<span> elements, not headings.
  $$(doc, ".title").forEach((el) => {
    if (/^H[1-6]$/.test(el.tagName)) return;
    const h2 = doc.createElement("h2");
    h2.textContent = el.textContent.replace(/^\s*#\s*/, "").trim();
    el.replaceWith(h2);
  });
  $$(doc, ".card-header-title").forEach((el) => replaceTag(el, "h3"));

  // Visual emphasis used for meaning (own name, awards, venues).
  $$(doc, "span.is-underlined, span.has-text-weight-semibold").forEach((el) => replaceTag(el, "strong"));
  $$(doc, "span.is-italic").forEach((el) => replaceTag(el, "em"));

  // BibTeX blocks -> fenced code with a language hint.
  $$(doc, "pre.bibtex > code").forEach((code) => code.setAttribute("class", "language-bibtex"));
}

function toMarkdown(html, pageUrl, canonicalUrls) {
  const doc = domino.createDocument(html, true);
  const title = doc.title.trim();
  cleanDocument(doc, pageUrl, canonicalUrls);

  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  let md = turndown.turndown(doc.body.innerHTML).trim();

  if (!/^# /m.test(md) && title) md = `# ${title}\n\n${md}`;
  return md.replace(/\n{3,}/g, "\n\n") + "\n";
}

const pages = pagesFromSitemap();
const canonicalUrls = new Set(pages);

for (const pageUrl of pages) {
  if (!pageUrl.startsWith(SITE)) {
    console.warn(`skipping ${pageUrl}: not on ${SITE}`);
    continue;
  }
  const { html, md } = localPaths(pageUrl);
  const markdown = toMarkdown(readFileSync(html, "utf8"), pageUrl, canonicalUrls);
  writeFileSync(md, markdown);
  console.log(`${path.relative(ROOT, html)} -> ${path.relative(ROOT, md)} (${markdown.length} chars)`);
}
