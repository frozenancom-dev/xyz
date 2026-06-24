// Content script — runs on Twitter/X pages.
// Tracks the element under the mouse during right-click, and extracts tweet
// data from the closest tweet container when the context-menu item is fired.

(function () {
  "use strict";

  let lastContextTarget = null;

  // Track the element under the cursor whenever a context menu is invoked.
  document.addEventListener(
    "contextmenu",
    (e) => {
      lastContextTarget = e.target;
    },
    true
  );

  /**
   * Walk up the DOM tree to find the tweet container.
   * Twitter wraps each tweet in <article data-testid="tweet">. When unavailable
   * (e.g. inside a thread component), fall back to the User-Name root.
   */
  function findTweetRoot(el) {
    if (!el) return null;
    const article = el.closest('article[data-testid="tweet"], article[role="article"]');
    if (article) return article;
    // Fallback: parent containing tweetText
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.querySelector && cur.querySelector('[data-testid="tweetText"]')) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  /**
   * Reconstruct the displayed tweet text by walking child nodes:
   *   - text nodes contribute their textContent
   *   - <img alt="…"> (emojis) contribute their alt value
   *   - <a> contributes its textContent (already the expanded URL like
   *     "http://s.shopee.co.id/xxxx")
   */
  function extractTweetText(tweetTextEl) {
    if (!tweetTextEl) return "";
    let out = "";
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "img") {
        out += node.getAttribute("alt") || "";
        return;
      }
      if (tag === "a") {
        // <a> contains an aria-hidden "http://" span + visible domain/path text
        out += node.textContent || "";
        return;
      }
      if (tag === "br") {
        out += "\n";
        return;
      }
      node.childNodes.forEach(walk);
    };
    tweetTextEl.childNodes.forEach(walk);
    return out.trim();
  }

  /**
   * Collect all outgoing links (t.co + display URL).
   */
  function extractLinks(tweetTextEl) {
    if (!tweetTextEl) return [];
    const links = [];
    tweetTextEl.querySelectorAll('a[href^="https://t.co/"]').forEach((a) => {
      links.push({
        tco: a.getAttribute("href"),
        display: (a.textContent || "").trim()
      });
    });
    return links;
  }

  /**
   * Collect product image URLs (only tweetPhoto containers, never avatars).
   * Upgrades the format param from 360x360/small to "large" for higher quality.
   */
  function extractImages(tweetRoot) {
    if (!tweetRoot) return [];
    const seen = new Set();
    const imgs = [];
    tweetRoot.querySelectorAll('[data-testid="tweetPhoto"] img').forEach((img) => {
      let src = img.getAttribute("src");
      if (!src) return;
      // Upgrade to largest version when possible
      try {
        const u = new URL(src);
        if (u.searchParams.has("name")) {
          u.searchParams.set("name", "large");
          src = u.toString();
        }
      } catch (_) {
        // keep original
      }
      if (!seen.has(src)) {
        seen.add(src);
        imgs.push(src);
      }
    });
    return imgs;
  }

  /**
   * Extract author info (display name + handle).
   */
  function extractAuthor(tweetRoot) {
    if (!tweetRoot) return { name: "", handle: "" };
    const userNameEl = tweetRoot.querySelector('[data-testid="User-Name"]');
    if (!userNameEl) return { name: "", handle: "" };
    const spans = userNameEl.querySelectorAll("span");
    let name = "";
    let handle = "";
    spans.forEach((s) => {
      const t = (s.textContent || "").trim();
      if (!t) return;
      if (t.startsWith("@") && !handle) handle = t;
      else if (!handle && !name && !t.startsWith("·")) name = t;
    });
    // Prefer link to /username for handle
    const profileLink = userNameEl.querySelector('a[href^="/"]');
    if (profileLink && !handle) {
      const h = profileLink.getAttribute("href");
      if (h && /^\/[A-Za-z0-9_]+$/.test(h)) handle = "@" + h.slice(1);
    }
    return { name, handle };
  }

  /**
   * Extract permalink + timestamp.
   */
  function extractMeta(tweetRoot) {
    if (!tweetRoot) return { url: "", time: "" };
    const timeEl = tweetRoot.querySelector("time");
    const time = timeEl ? timeEl.getAttribute("datetime") || "" : "";
    let url = "";
    const a = timeEl ? timeEl.closest("a") : null;
    if (a) {
      const href = a.getAttribute("href") || "";
      url = href.startsWith("http") ? href : "https://x.com" + href;
    }
    return { url, time };
  }

  function extractTweetData(rootEl) {
    if (!rootEl) return null;
    const tweetTextEl = rootEl.querySelector('[data-testid="tweetText"]');
    const text = extractTweetText(tweetTextEl);
    const links = extractLinks(tweetTextEl);
    const images = extractImages(rootEl);
    const author = extractAuthor(rootEl);
    const meta = extractMeta(rootEl);

    return {
      id: (meta.url.match(/status\/(\d+)/) || [])[1] || crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      author,
      tweetUrl: meta.url,
      tweetTime: meta.time,
      text,
      links,
      images
    };
  }

  function toast(msg, ok = true) {
    const div = document.createElement("div");
    div.textContent = msg;
    div.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "bottom:24px",
      "right:24px",
      "padding:12px 18px",
      "border-radius:10px",
      "font:600 14px/1.3 ui-sans-serif,system-ui",
      "color:#0f1419",
      "background:" + (ok ? "#FFD60A" : "#ff6b6b"),
      "box-shadow:0 8px 24px rgba(0,0,0,.25)",
      "transform:translateY(8px)",
      "opacity:0",
      "transition:opacity .2s, transform .2s"
    ].join(";");
    document.body.appendChild(div);
    requestAnimationFrame(() => {
      div.style.opacity = "1";
      div.style.transform = "translateY(0)";
    });
    setTimeout(() => {
      div.style.opacity = "0";
      div.style.transform = "translateY(8px)";
      setTimeout(() => div.remove(), 250);
    }, 1800);
  }

  async function saveTweet(data) {
    const { tweets = [] } = await chrome.storage.local.get("tweets");
    // Replace if id already exists, else prepend
    const filtered = tweets.filter((t) => t.id !== data.id);
    filtered.unshift(data);
    await chrome.storage.local.set({ tweets: filtered });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "EXTRACT_TWEET_AT_POINT") {
      const root = findTweetRoot(lastContextTarget);
      if (!root) {
        toast("Tidak menemukan tweet di posisi klik kanan.", false);
        sendResponse({ ok: false, error: "no_tweet" });
        return true;
      }
      const data = extractTweetData(root);
      if (!data || (!data.text && data.images.length === 0)) {
        toast("Tweet kosong / tidak dapat diekstrak.", false);
        sendResponse({ ok: false, error: "empty" });
        return true;
      }
      saveTweet(data).then(() => {
        toast(`Tersimpan: ${data.author.handle || "tweet"} (${data.images.length} gbr, ${data.links.length} link)`);
        sendResponse({ ok: true, data });
      });
      return true; // keep channel open for async sendResponse
    }
  });
})();
