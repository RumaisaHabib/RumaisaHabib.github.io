// Cloudflare Worker: "Markdown for Agents" content negotiation on the Free plan.
//
// Requests that prefer text/markdown (Accept: text/markdown) get the
// pre-generated markdown copy of the page (built by `npm run build-markdown`
// and served by GitHub Pages at <page>.md / <dir>/index.html.md). Everything
// else, including all browser traffic, is passed straight through to the
// origin, so HTML stays the default.
//
// Deploy (Cloudflare dashboard):
//   1. Workers & Pages > Create > Worker > start from "Hello World", name it
//      e.g. "markdown-for-agents", Deploy, then Edit code: paste this file and
//      Deploy again.
//   2. Worker > Settings > Domains & Routes > Add > Route:
//      zone rumaisahabib.com, route `rumaisahabib.com/*`,
//      failure mode "Fail open (proceed)" so the site keeps working if the
//      Free plan's daily request limit is ever reached.

const MARKDOWN_TYPES = new Set(["text/markdown", "text/x-markdown"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const markdownPath = markdownPathFor(url.pathname);

    if (!markdownPath || (request.method !== "GET" && request.method !== "HEAD")) {
      return fetch(request);
    }

    if (!prefersMarkdown(request.headers.get("Accept"))) {
      return withVaryAccept(await fetch(request));
    }

    // Subrequests to the Worker's own zone go to the origin, not back
    // through this Worker.
    const markdown = await fetch(new URL(markdownPath, url.origin));
    if (!markdown.ok) {
      // No markdown copy of this page: fall back to the normal HTML response.
      return withVaryAccept(await fetch(request));
    }

    const body = await markdown.text();
    const headers = new Headers({
      "Content-Type": "text/markdown; charset=utf-8",
      "Vary": "Accept",
      // Rough estimate (UTF-8 bytes / 4), the same heuristic Cloudflare uses.
      "x-markdown-tokens": String(Math.ceil(new TextEncoder().encode(body).length / 4)),
    });
    const cacheControl = markdown.headers.get("Cache-Control");
    if (cacheControl) headers.set("Cache-Control", cacheControl);

    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  },
};

// Page URL -> path of its markdown copy, or null for non-page assets.
//   /              -> /index.html.md
//   /publications  -> /publications/index.html.md
//   /publications/ -> /publications/index.html.md
//   /foo.html      -> /foo.html.md
function markdownPathFor(pathname) {
  if (pathname.endsWith("/")) return pathname + "index.html.md";
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (lastSegment.endsWith(".html")) return pathname + ".md";
  if (!lastSegment.includes(".")) return pathname + "/index.html.md";
  return null;
}

// True when the client lists a markdown type explicitly, with a quality at
// least as high as text/html. Browsers never list text/markdown, and a bare
// */* does not count, so they always get HTML.
function prefersMarkdown(accept) {
  if (!accept) return false;
  let markdownQ = 0;
  let htmlQ = 0;
  for (const range of accept.toLowerCase().split(",")) {
    const [type, ...params] = range.split(";").map((s) => s.trim());
    const qParam = params.find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (Number.isNaN(q)) continue;
    if (MARKDOWN_TYPES.has(type)) markdownQ = Math.max(markdownQ, q);
    else if (type === "text/html") htmlQ = Math.max(htmlQ, q);
  }
  return markdownQ > 0 && markdownQ >= htmlQ;
}

// The HTML at a negotiable URL also depends on Accept, so tell caches.
function withVaryAccept(response) {
  const out = new Response(response.body, response);
  const vary = out.headers.get("Vary");
  if (!vary || !/(^|,)\s*accept\s*(,|$)/i.test(vary)) {
    out.headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  }
  return out;
}
