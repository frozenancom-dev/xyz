# Tweet Scraper – Chrome Extension

Ekstrak teks, link Shopee, dan gambar produk dari tweet di Twitter / X dengan
satu klik kanan. Bekerja **100% lokal** — tidak ada server, tidak ada tracking.

## Cara Install (Unpacked)

1. Buka Chrome (atau browser berbasis Chromium: Edge, Brave, Opera).
2. Akses `chrome://extensions`.
3. Aktifkan **Developer mode** (toggle di pojok kanan atas).
4. Klik **Load unpacked** lalu pilih folder `/app/extension` ini.
5. Pastikan ikon "T" kuning sudah muncul di toolbar.

## Cara Pakai

1. Buka `https://twitter.com` atau `https://x.com`.
2. Arahkan kursor ke tweet yang ingin diambil (misal tweet affiliate Shopee).
3. **Klik kanan** pada tweet tersebut → pilih **"Extract Tweet (Tweet Scraper)"**.
4. Notifikasi kuning akan muncul di pojok kanan bawah halaman.
5. Klik ikon extension untuk melihat semua tweet tersimpan.
6. Ekspor ke **CSV**, **JSON**, **XLSX**, **TXT**, atau **ZIP Images** lewat tombol di popup.

### Tentang ZIP Images
Tombol **ZIP Images** mengunduh semua gambar produk dari seluruh tweet tersimpan
dan mengemasnya ke dalam satu file `tweet_images_YYYYMMDD_HHMMSS.zip`.

Struktur isi zip:

```
tweet_images_20260620_103015.zip
├── manifest.json                      ← daftar tweet → folder + URL gambar
├── jungjless_2067991050460000263/
│   ├── 01.jpg
│   └── 02.jpg
└── handle2_<tweetid>/
    └── 01.jpg
```

Unduhan paralel dibatasi 4 koneksi agar tidak overload CDN. Gambar yang gagal
diunduh dicatat sebagai `_failed_<n>.txt` di folder yang sama.

## Data yang Diekstrak

| Field | Sumber DOM |
|---|---|
| `author.name` & `author.handle` | `[data-testid="User-Name"]` |
| `tweetUrl` & `tweetTime` | `<time datetime="…">` & link parent |
| `text` | `[data-testid="tweetText"]` (preserve emoji alt + expanded link text) |
| `links[]` | `<a href^="https://t.co/">` — disertai display URL (mis. `s.shopee.co.id/8KmIEaw4yy`) |
| `images[]` | `[data-testid="tweetPhoto"] img` (upgrade `name=large`) |

## Struktur File

```
extension/
├── manifest.json        Manifest V3
├── background.js        Service worker — context menu
├── content.js           Injected ke Twitter/X — ekstraksi DOM
├── popup.html           UI popup
├── popup.css            Styling (dark, kuning aksen)
├── popup.js             Render + export (CSV/JSON/XLSX)
├── lib/xlsx.full.min.js SheetJS untuk export XLSX
├── lib/jszip.min.js     JSZip untuk export ZIP gambar
├── icons/               Ikon 16/32/48/128
└── README.md
```

## Catatan

- **CSV** ditulis dengan UTF-8 BOM agar emoji & karakter non-ASCII tampil benar di Excel.
- **XLSX** menggunakan SheetJS (`xlsx-0.20.3`).
- Data tersimpan di `chrome.storage.local` (per-browser, tidak sync). Klik **Clear** untuk reset.
- Twitter/X sering ganti class CSS, tapi `data-testid` relatif stabil — extension menggunakan attribute ini sebagai anchor.
