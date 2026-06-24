// Popup script — renders saved tweets and handles CSV / JSON / XLSX export.

const listEl = document.getElementById("list");
const countEl = document.querySelector('[data-testid="tweet-count"]');
const cardTpl = document.getElementById("cardTpl");

async function loadTweets() {
  const { tweets = [] } = await chrome.storage.local.get("tweets");
  return tweets;
}

async function saveTweets(tweets) {
  await chrome.storage.local.set({ tweets });
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString();
}

function render(tweets) {
  countEl.textContent = String(tweets.length);
  listEl.innerHTML = "";

  if (!tweets.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = "Belum ada tweet. Klik kanan tweet di Twitter/X untuk mulai.";
    listEl.appendChild(div);
    return;
  }

  tweets.forEach((t, idx) => {
    const node = cardTpl.content.cloneNode(true);
    const handle = node.querySelector(".handle");
    handle.textContent = t.author?.handle || t.author?.name || "(unknown)";
    handle.href = t.tweetUrl || "#";

    node.querySelector(".ts").textContent = fmtDate(t.tweetTime || t.capturedAt);
    node.querySelector(".text").textContent = t.text || "";

    const linksEl = node.querySelector(".links");
    (t.links || []).forEach((l) => {
      const a = document.createElement("a");
      a.href = l.tco;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = `${l.display}  →  ${l.tco}`;
      linksEl.appendChild(a);
    });

    const imgsEl = node.querySelector(".imgs");
    (t.images || []).forEach((src) => {
      const a = document.createElement("a");
      a.href = src;
      a.target = "_blank";
      a.rel = "noopener";
      const img = document.createElement("img");
      img.src = src;
      img.loading = "lazy";
      a.appendChild(img);
      imgsEl.appendChild(a);
    });

    const article = node.querySelector(".card");
    article.dataset.testid = `tweet-card-${idx}`;

    node.querySelector(".copy-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(t.text || "");
    });

    node.querySelector(".del-btn").addEventListener("click", async () => {
      const all = await loadTweets();
      await saveTweets(all.filter((x) => x.id !== t.id));
      refresh();
    });

    listEl.appendChild(node);
  });
}

async function refresh() {
  render(await loadTweets());
}

// ------------- Export logic -------------

function flattenForTable(tweets) {
  return tweets.map((t) => ({
    id: t.id,
    capturedAt: t.capturedAt,
    name: t.author?.name || "",
    handle: t.author?.handle || "",
    tweetUrl: t.tweetUrl || "",
    tweetTime: t.tweetTime || "",
    text: t.text || "",
    links_display: (t.links || []).map((l) => l.display).join(" | "),
    links_tco: (t.links || []).map((l) => l.tco).join(" | "),
    images: (t.images || []).join(" | ")
  }));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  rows.forEach((r) => lines.push(headers.map((h) => escape(r[h])).join(",")));
  return lines.join("\r\n");
}

function toTXT(tweets) {
  const sep = "\n\n" + "─".repeat(40) + "\n\n";
  return tweets.map((t) => (t.text || "").trim()).filter(Boolean).join(sep);
}

async function doExport(format) {
  const tweets = await loadTweets();
  if (!tweets.length) {
    alert("Belum ada data untuk diekspor.");
    return;
  }
  const rows = flattenForTable(tweets);
  const stamp = timestamp();

  if (format === "json") {
    const blob = new Blob([JSON.stringify(tweets, null, 2)], { type: "application/json" });
    downloadBlob(blob, `tweets_${stamp}.json`);
    return;
  }

  if (format === "csv") {
    const csv = toCSV(rows);
    // BOM for Excel UTF-8 compatibility
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `tweets_${stamp}.csv`);
    return;
  }

  if (format === "txt") {
    const blob = new Blob([toTXT(tweets)], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `tweets_${stamp}.txt`);
    return;
  }

  if (format === "xlsx") {
    if (typeof XLSX === "undefined") {
      alert("Library XLSX gagal dimuat.");
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Tweets");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    downloadBlob(blob, `tweets_${stamp}.xlsx`);
  }
}

document.querySelectorAll("[data-format]").forEach((btn) => {
  btn.addEventListener("click", () => doExport(btn.dataset.format));
});

// ------------- ZIP images export -------------

const progressBox = document.getElementById("progress");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

function setProgress(done, total, label) {
  progressBox.hidden = false;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = pct + "%";
  progressLabel.textContent = label || `${done} / ${total} (${pct}%)`;
}

function hideProgress() {
  setTimeout(() => {
    progressBox.hidden = true;
    progressFill.style.width = "0%";
  }, 600);
}

function sanitize(name) {
  return (name || "tweet").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 60) || "tweet";
}

function guessExt(url, contentType) {
  if (contentType) {
    if (/jpeg|jpg/i.test(contentType)) return "jpg";
    if (/png/i.test(contentType)) return "png";
    if (/webp/i.test(contentType)) return "webp";
    if (/gif/i.test(contentType)) return "gif";
  }
  try {
    const u = new URL(url);
    const fmt = u.searchParams.get("format");
    if (fmt) return fmt.toLowerCase();
    const m = u.pathname.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
  } catch (_) {}
  return "jpg";
}

async function fetchAsBlob(url) {
  const res = await fetch(url, { credentials: "omit", cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const blob = await res.blob();
  return { blob, contentType: res.headers.get("content-type") || "" };
}

async function exportZipImages() {
  if (typeof JSZip === "undefined") {
    alert("Library JSZip gagal dimuat.");
    return;
  }
  const tweets = await loadTweets();

  // Build job list: each unique image with its tweet's folder name.
  const jobs = [];
  const seen = new Set();
  tweets.forEach((t) => {
    const folder = sanitize((t.author?.handle || "tweet").replace(/^@/, "") + "_" + (t.id || ""));
    (t.images || []).forEach((src, i) => {
      const key = folder + "|" + src;
      if (seen.has(key)) return;
      seen.add(key);
      jobs.push({ folder, src, index: i + 1 });
    });
  });

  if (!jobs.length) {
    alert("Tidak ada gambar untuk diunduh.");
    return;
  }

  const zip = new JSZip();
  let done = 0;
  let failed = 0;
  setProgress(0, jobs.length, `Mengunduh 0 / ${jobs.length} gambar…`);

  // Limit concurrency to avoid hammering CDN
  const CONCURRENCY = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        const { blob, contentType } = await fetchAsBlob(job.src);
        const ext = guessExt(job.src, contentType);
        const pad = String(job.index).padStart(2, "0");
        zip.folder(job.folder).file(`${pad}.${ext}`, blob);
      } catch (e) {
        failed++;
        zip
          .folder(job.folder)
          .file(`_failed_${job.index}.txt`, `URL: ${job.src}\nError: ${e.message}`);
      }
      done++;
      setProgress(done, jobs.length, `Mengunduh ${done} / ${jobs.length} gambar…`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Manifest file for traceability
  const manifest = tweets.map((t) => ({
    id: t.id,
    handle: t.author?.handle || "",
    folder: sanitize((t.author?.handle || "tweet").replace(/^@/, "") + "_" + (t.id || "")),
    tweetUrl: t.tweetUrl || "",
    text: t.text || "",
    images: t.images || []
  }));
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  setProgress(done, jobs.length, "Membuat file ZIP…");
  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => {
      progressFill.style.width = Math.round(meta.percent) + "%";
      progressLabel.textContent = `Zipping… ${Math.round(meta.percent)}%`;
    }
  );

  const stamp = timestamp();
  downloadBlob(blob, `tweet_images_${stamp}.zip`);
  setProgress(done, jobs.length, failed ? `Selesai (${failed} gagal).` : "Selesai.");
  hideProgress();
}

document.getElementById("zipImagesBtn").addEventListener("click", () => {
  exportZipImages().catch((e) => {
    alert("Gagal membuat ZIP: " + e.message);
    hideProgress();
  });
});

document.getElementById("clearBtn").addEventListener("click", async () => {
  if (!confirm("Hapus semua tweet tersimpan?")) return;
  await saveTweets([]);
  refresh();
});

// React to background updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.tweets) refresh();
});

refresh();
