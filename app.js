/* EMA Lightning Web — tarayici TTS arayuzu (gea-runtime) + cikarim hatti.
 * Model: canberk7/ema-lightning (Apache-2.0). Agirliklar HuggingFace Hub'da.
 */
"use strict";
const ORT_VERSION = "1.30.0"; // index.html'deki CDN script ile AYNI olmali
const HF_REPO = "fr0stb1rd/ema-lightning-web-onnx";
const MODEL_BASE = `https://huggingface.co/${HF_REPO}/resolve/main`;
const MODEL_FILES = ["text_stage.onnx", "sound_stage.onnx", "decoder.onnx"];
const CACHE_NAME = "ema-lightning-web-v1";
const HIST_KEY = "ema-lightning-web-hist";
const RATE = 48000, FPS = 25;
const FIRST_WINDOW = 25, WINDOW = 100, CONTEXT = 8;
const MAX_WORD_FRAMES = 250, MAX_FRAMES = 3000, MAX_LETTERS = 250;

/* ---------- i18n: varsayilan tarayicidan, kullanici degistirebilir (kalici) ---------- */
const BROWSER_TR = (navigator.language || "tr").toLowerCase().startsWith("tr");
const PREFS_KEY = "ema-lightning-web-prefs";
let prefs = { theme: "system", lang: "auto" };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")); } catch { }
if (!["system", "light", "dark"].includes(prefs.theme)) prefs.theme = "system";
if (!["auto", "tr", "en"].includes(prefs.lang)) prefs.lang = "auto";
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { } };
const effLang = () => prefs.lang === "auto" ? (BROWSER_TR ? "tr" : "en") : prefs.lang;
const T = {
  tr: {
    title: "⚡ EMA Lightning ONNX (Tarayıcıda)",
    sub: "Tarayıcıda çevrimdışı Türkçe TTS. Sunucu yok — her şey cihazınızda olur. Sayıları yazıyla yazın (örn. “bin iki yüz elli”).",
    ph: "Okunacak Türkçe metni yazın…",
    ex: "Örnekler:", exN: (i) => `Örnek ${i + 1}`,
    speed: "Hız:", say: "Sesi Üret", busy: "Üretiliyor…",
    playing: "Çalınıyor (kalan üretiliyor…)",
    loading: "Modeller indiriliyor (ilk sefer, ~36 MB)…",
    ready: "Hazır.",
    done: (d) => `Tamamlandı (${d} sn ses).`,
    err: (m) => `Hata: ${m}`,
    empty: "önce metin yazın",
    dl: "İndir", bald: ".wav indir",
    cached: "önbellekten",
    remain: (s) => `~${s} sn kaldı`, elapsed: (s) => `${s} sn geçti`,
    hist: "Geçmiş", emptyHist: "Henüz üretim yok.",
    replay: "Oynat", del: "Sil",
    faq: "Sık sorulanlar",
    faqs: [
      ["İnternet bağlantısı gerekli mi?",
       "Modeller ilk açılışta bir kez iner (35,7 MiB); sonrası çevrimdışı çalışır."],
      ["Sesim veya yazdıklarım bir yere gönderiliyor mu?",
       "Hayır. Üretim dahil her şey tarayıcınızda olur; sunucu yok."],
      ["Hangi model kullanılıyor?",
       "EMA Lightning (8,6M parametre, Apache-2.0): ONNX'e çevrilip WebGPU/WASM ile çalıştırılıyor."],
      ["Sayıları neden yazıyla yazmalıyım?",
       "Orijinal paketteki normalizer-tr sayı/tarih okuyucu tarayıcıda yok; rakamlar rakam rakam okunur."],
      ["İlk açılış neden yavaş?",
       "Modeller ilk seferde iner (35,7 MiB). Sonraki gün içi ziyaretlerde indirme olmaz; bir gün sonra tazelenir."],
      ["Hangi tarayıcılarda çalışıyor?",
       "WebGPU olan Chromium tabanlı tarayıcılarda GPU ile, diğerlerinde (Safari, Firefox dahil) WASM ile çalışır."],
      ["Ürettiğim ses Python çıktısıyla birebir aynı mı?",
       "Hayır. Tarayıcı kendi rastgele sayı üretecini kullanır; konuşma geçerli olur ama bit-bit aynı olmaz."],
      ["Sesi indirebilir miyim?",
       "Evet. Üretim bitince tarih + metin adlı .wav dosyası olarak iner."],
      ["Ticari kullanım serbest mi?",
       "Evet. Model de bu site de Apache-2.0 lisanslı."],
      ["Bir şey bozulursa ne yapmalıyım?",
       "Sayfadaki “Modeli yeniden indir” düğmesi modelleri tazeler; “Önbelleği temizle” depoyu boşaltır."],
      ["Sesin hızını değiştirebilir miyim?",
       "Evet. Hız kutusu 0,25 ile 4 arasında değer alır; varsayılan 1."],
      ["Uzun metinlerde ne oluyor?",
       "Metin parçalara bölünür; ilk parça hemen çalar, kalanı arkada üretilir. Arayüz donmaz."],
      ["Geçmiş kayıtlarım nerede saklanıyor?",
       "Yalnızca tarayıcınızda: ses oturum boyunca bellekte, liste localStorage'da. × ile silebilirsiniz."],
      ["Önbellek ne kadar yer tutuyor?",
       "Modeller 35,7 MiB. Bir gün sonra otomatik tazelenir; “Önbelleği temizle” ile hemen boşaltılır."],
      ["Ekran kilitliyken dinleyebilir miyim?",
       "Evet. Kilit ekranında ve bildirimde oynat/duraklat kontrolleri çıkar."],
      ["Bu modeli kendi sitemde kullanabilir miyim?",
       "Evet. ONNX dosyaları HuggingFace Hub'da, Apache-2.0 lisanslı; indirip onnxruntime-web ile çalıştırabilirsiniz."],
      ["Arayüz hangi teknolojiyle yapıldı?",
       "Gea (@geajs/core) reaktif çalışma ortamı; derleme adımı yok, doğrudan tarayıcıda çalışır."],
      ["ONNX modelleri nasıl üretildi?",
       "PyTorch'un torch.export tabanlı dönüştürücüsüyle, GitHub Actions'ta; her aşama onnxruntime ile sayısal olarak doğrulandı."],
      ["Neden üç ayrı model dosyası var?",
       "Metin, ses ve çözücü ayrı aşamalar; tarayıcı parça parça üretip ilk cümleyi beklemeden çalabilsin diye."],
      ["Bunu kim yaptı?",
       "Site: fr0stb1rd. Model: Canberk Aslan (EMA Lightning). Sayı okuyucu (orijinal): Erdem Tuna."],
      ["Kaynak kod nerede?",
       "GitHub'da açık: ema-lightning-web. Sorun ve öneriler issue olarak bırakılabilir."],
      ["Katkıda bulunabilir miyim?",
       "Evet, repo Apache-2.0; pull request gönderebilirsiniz."],
    ],
    clearCache: "Önbelleği temizle", redownload: "Modeli yeniden indir",
    cacheCleared: "Önbellek temizlendi.", clearHist: "Geçmişi temizle",
    histCleared: "Geçmiş temizlendi.",
    theme: "Tema:", thSystem: "Sistem", thLight: "Açık", thDark: "Koyu",
    lang: "Dil:", langAuto: "Otomatik",
    disc: `Bu yazılım bilgisayarınıza <b>35,7 MiB</b> model indirir ve cihazınızda çalıştırır. Bu yazılımın hiçbir garantisi yoktur. Bu yazılımı kullanarak <a href="https://github.com/fr0stb1rd/ema-lightning-web/blob/main/LICENSE">LICENSE</a>'ı okumuş ve onaylamış sayılırsınız.`,
  },
  en: {
    title: "⚡ EMA Lightning ONNX (in-browser)",
    sub: "Offline Turkish TTS in your browser. No server — everything runs on your device. Write numbers out in Turkish words (e.g. “bin iki yüz elli”).",
    ph: "Type Turkish text to speak…",
    ex: "Examples:", exN: (i) => `Example ${i + 1}`,
    speed: "Speed:", say: "Speak", busy: "Working…",
    playing: "Playing (generating rest…)",
    loading: "Downloading models (first run, ~36 MB)…",
    ready: "Ready.",
    done: (d) => `Done (${d} s of audio).`,
    err: (m) => `Error: ${m}`,
    empty: "type some text first",
    dl: "Download", bald: ".wav download",
    cached: "from cache",
    remain: (s) => `~${s} s left`, elapsed: (s) => `${s} s elapsed`,
    hist: "History", emptyHist: "Nothing yet.",
    replay: "Play", del: "Delete",
    faq: "FAQ",
    faqs: [
      ["Do I need an internet connection?",
       "Models download once on first launch (35.7 MiB); afterwards it works offline."],
      ["Is my voice or text sent anywhere?",
       "No. Everything, including synthesis, runs in your browser; there is no server."],
      ["Which model is used?",
       "EMA Lightning (8.6M parameters, Apache-2.0): converted to ONNX and run with WebGPU/WASM."],
      ["Why should I spell out numbers?",
       "The original package's normalizer-tr number/date reader is not in the browser; digits are read one by one."],
      ["Why is the first launch slow?",
       "Models download once at first launch (35.7 MiB). No download on repeat visits within a day; refreshed after a day."],
      ["Which browsers work?",
       "Chromium-based browsers with WebGPU use the GPU; others (including Safari and Firefox) use WASM."],
      ["Is my audio identical to the Python output?",
       "No. The browser uses its own random generator; the speech is valid but not bit-identical."],
      ["Can I download the audio?",
       "Yes. When done, it downloads as a .wav named with the date and text."],
      ["Is commercial use allowed?",
       "Yes. Both the model and this site are Apache-2.0 licensed."],
      ["What if something breaks?",
       "The “Re-download model” button refreshes the models; “Clear cache” empties storage."],
      ["Can I change the speaking speed?",
       "Yes. The speed box accepts 0.25 to 4; default is 1."],
      ["What happens with long texts?",
       "Text is split into pieces; the first plays immediately while the rest generates in the background. The UI never freezes."],
      ["Where is my history stored?",
       "Only in your browser: audio in session memory, the list in localStorage. Delete with ×."],
      ["How much space does the cache use?",
       "Models are 35.7 MiB. Auto-refreshed after a day; “Clear cache” empties it now."],
      ["Can I listen with the screen locked?",
       "Yes. Play/pause controls appear on the lock screen and in notifications."],
      ["Can I use this model on my own site?",
       "Yes. The ONNX files are on HuggingFace Hub under Apache-2.0; download and run them with onnxruntime-web."],
      ["What is the UI built with?",
       "Gea (@geajs/core) reactive runtime; no build step, runs directly in the browser."],
      ["How were the ONNX models made?",
       "With PyTorch's torch.export-based converter on GitHub Actions; every stage numerically verified with onnxruntime."],
      ["Why three separate model files?",
       "Text, sound and decoder are separate stages so the browser can stream: play the first sentence without waiting."],
      ["Who made this?",
       "Site: fr0stb1rd. Model: Canberk Aslan (EMA Lightning). Number reader (original): Erdem Tuna."],
      ["Where is the source code?",
       "Open on GitHub: ema-lightning-web. Bugs and ideas welcome as issues."],
      ["Can I contribute?",
       "Yes, the repo is Apache-2.0; pull requests welcome."],
    ],
    clearCache: "Clear cache", redownload: "Re-download model",
    cacheCleared: "Cache cleared.", clearHist: "Clear history",
    histCleared: "History cleared.",
    theme: "Theme:", thSystem: "System", thLight: "Light", thDark: "Dark",
    lang: "Language:", langAuto: "Auto",
    disc: `This software downloads <b>35.7 MiB</b> of models to your computer and runs them on your device. This software comes with no warranty. By using it, you agree that you have read and accepted the <a href="https://github.com/fr0stb1rd/ema-lightning-web/blob/main/LICENSE">LICENSE</a>.`,
  },
};
const t = () => T[effLang()];

const EXAMPLES = [
  "Merhaba, size nasıl yardımcı olabilirim?",
  "Siparişiniz yola çıktı, yarın sabah kapınızda olacak.",
  "Beş kilogram un, iki litre süt ve bir düzine yumurta aldım.",
  "On beş Ekim Çarşamba günü saat onda toplantımız var.",
];

/* ---------- gea store ---------- */
const { Store, Component, GEA_OBSERVER_REMOVERS } = gea;
class UI extends Store {
  phase = "idle";      // idle|loading|ready|busy|playing|done|error
  text = EXAMPLES[0];
  speed = 1;
  pct = 0; stats = ""; status = ""; dlSeq = 0;
  audioURL = ""; audioSize = ""; histSeq = 0;
}
const ui = new UI();

/* ---------- kucuk yardimcilar ---------- */
const $ = (id) => document.getElementById(id);
const fmtMB = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fmtS = (s) => s < 60 ? `${Math.round(s)}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Indirilen dosya adi: tarih + soylenen yazi (en fazla 40 harf, guvenli karakterler).
function dlName(text) {
  const tr = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u" };
  const slug = (text || "ema").replaceAll("İ", "i").replaceAll("I", "ı").toLowerCase()
    .split("").map((c) => tr[c] || c).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "ema";
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}_${slug}.wav`;
}

/* ---------- kalici ayarlar: tema + dil ---------- */
function applyTheme() {
  if (prefs.theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", prefs.theme);
}
function fillSelects(root) {
  const th = root.querySelector(".theme"), ls = root.querySelector(".langsel");
  th.innerHTML = [["system", t().thSystem], ["light", t().thLight], ["dark", t().thDark]]
    .map(([v, l]) => `<option value="${v}"${prefs.theme === v ? " selected" : ""}>${l}</option>`).join("");
  ls.innerHTML = [["auto", t().langAuto], ["tr", "Türkçe"], ["en", "English"]]
    .map(([v, l]) => `<option value="${v}"${prefs.lang === v ? " selected" : ""}>${l}</option>`).join("");
}

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} (HTTP ${r.status})`);
  return r.json();
}

// Cache-first indirme (Transformers.js kalibi): once Cache Storage, yoksa ag + put.
// Vade 1 gun: suresi dolan kayit silinip yeniden indirilir.
const CACHE_TTL = 24 * 3600 * 1000; // 1 gun
const TS_KEY = "ema-lightning-web-cache-ts";
const cacheTs = () => { try { return JSON.parse(localStorage.getItem(TS_KEY) || "{}"); } catch { return {}; } };
const stampCache = (url) => {
  try {
    const m = cacheTs(); m[url] = Date.now();
    localStorage.setItem(TS_KEY, JSON.stringify(m));
  } catch { }
};
async function cachedResponse(url) {
  const jar = ("caches" in self) ? await caches.open(CACHE_NAME).catch(() => null) : null;
  if (jar) {
    const hit = await jar.match(url).catch(() => null);
    if (hit) {
      if (Date.now() - (cacheTs()[url] || 0) < CACHE_TTL) return { res: hit, fromCache: true, jar };
      jar.delete(url).catch(() => { }); // suresi dolmus: sil, agdan indir
    }
  }
  const net = await fetch(url);
  if (!net.ok) throw new Error(`${url.split("/").pop()} (HTTP ${net.status})`);
  if (jar && (net.type === "basic" || net.type === "cors")) {
    jar.put(url, net.clone()).catch(() => { });
    stampCache(url);
  }
  return { res: net, fromCache: false, jar };
}

async function fetchBuffer(url, onTick) {
  const { res, fromCache } = await cachedResponse(url);
  const total = Number(res.headers.get("content-length")) || 0;
  const chunks = []; let loaded = 0;
  const reader = res.body.getReader();
  for (; ;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.byteLength;
    onTick(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return { buf, fromCache };
}

/* ---------- TTS cekirdegi (orijinal hattin portu) ---------- */
let VOCAB = null, STOI = null, TIMES = null, LATENT = 64;
let sessText = null, sessSound = null, sessDec = null;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(rows, cols, rand) {
  const o = new Float32Array(rows * cols);
  for (let i = 0; i < o.length; i += 2) {
    const u1 = Math.max(rand(), 1e-9), u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1)), t = 2 * Math.PI * u2;
    o[i] = r * Math.cos(t); if (i + 1 < o.length) o[i + 1] = r * Math.sin(t);
  }
  return o;
}
function finish(p) {
  const s = p.replace(/["')]+$/, "");
  return [".", "!", "?"].includes(s.slice(-1)) ? p : p.replace(/[,;:\- ]+$/, "") + ".";
}
function chunk(text, speed) {
  const limit = Math.min(MAX_LETTERS, Math.round(18 * 10 * speed));
  const cuts = [[/[.!?]+["']*(?= )/g, 0.25], [/[,;:](?= )/g, 0.12], [/\S(?= )/g, 0.12]];
  const pieces = [];
  let rest = text.trim();
  while (rest) {
    let cut = rest.length, pause = 0;
    if (rest.length > limit) {
      cut = limit;
      for (const [re, gap] of cuts) {
        const ends = []; const rx = new RegExp(re.source, "g");
        let m; while ((m = rx.exec(rest)) && m.index <= limit) ends.push(m.index + m[0].length);
        if (ends.length) { cut = ends[ends.length - 1]; pause = gap; break; }
      }
    }
    const piece = rest.slice(0, cut).trim(); rest = rest.slice(cut).trim();
    if (/\p{L}/u.test(piece)) pieces.push([finish(piece), pause]);
  }
  if (pieces.length) pieces[pieces.length - 1][1] = 0;
  return pieces;
}
function alphabet(text) { // SADELESTIRILMIS: normalizer-tr yok, sayilari yaziyle yazin
  // Orijinal frontend.py ile ayni: Turkce harfler oldugu gibi kalir (NFKD'ye sokulmaz),
  // diger harflerin aksanlari soyulur, vocab'da olmayan her sey bosluk olur.
  const TURKISH = new Set([..."çğıöşü"]);
  const typo = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "..." };
  text = text.replace(/[’‘“”–—…]/g, (c) => typo[c] || c)
    .replaceAll("İ", "i").replaceAll("I", "ı").toLowerCase();
  const vs = new Set(VOCAB);
  let out = "";
  for (const ch of text) {
    if (TURKISH.has(ch)) { out += vs.has(ch) ? ch : " "; continue; }
    const base = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    out += (base && [...base].every((c) => vs.has(c))) ? base : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}
function piece(text) {
  const ids = [...text].map((c) => STOI[c] ?? 1);
  const starts = [];
  [...text].forEach((c, i) => { if (c !== " " && (i === 0 || text[i - 1] === " ")) starts.push(i); });
  if (!starts.length) starts.push(0);
  const bounds = [0, ...starts.slice(1), text.length];
  const cw = [], wstart = [];
  for (let w = 0; w < bounds.length - 1; w++)
    for (let i = bounds[w]; i < bounds[w + 1]; i++) { cw.push(w); wstart.push(bounds[w]); }
  return { text, ids, cw, wstart };
}
const Big = (arr, dims) => new ort.Tensor("int64", BigInt64Array.from(arr.map(BigInt)), dims);
const F32 = (arr, dims) => new ort.Tensor("float32", Float32Array.from(arr), dims);
const Bool = (arr, dims) => new ort.Tensor("bool", Uint8Array.from(arr.map(Number)), dims);

function plan(p, dur) {
  const nw = p.cw[p.cw.length - 1] + 1;
  const per = new Array(nw).fill(0);
  p.cw.forEach((w, i) => per[w] += dur[i]);
  const n = per.map((x) => Math.min(MAX_WORD_FRAMES, Math.max(1, Math.round(x))));
  const frames = Math.min(n.reduce((a, b) => a + b, 0), MAX_FRAMES);
  const cum = []; let s = 0; for (const x of n) { cum.push(s); s += x; }
  const fw = [], fp = [];
  let k = 0;
  for (let w = 0; w < nw && k < frames; w++)
    for (let j = 0; j < n[w] && k < frames; j++, k++) { fw.push(w); fp.push((k - cum[w]) / n[w]); }
  return { fw, fp, frames };
}
function windows(frames, first = WINDOW) {
  const spans = []; let s = 0;
  while (s < frames) { const e = Math.min(frames, s + (s === 0 ? first : WINDOW)); spans.push([s, e]); s = e; }
  return spans;
}
const concat = (parts) => {
  const out = new Float32Array(parts.reduce((a, x) => a + x.length, 0));
  let o = 0; for (const c of parts) { out.set(c, o); o += c.length; }
  return out;
};

async function loadModels() {
  ui.phase = "loading"; ui.status = t().loading; ui.pct = 0; ui.stats = "";
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  // Agir cikarim isini arka plan worker'ina tasi: arayuz donmaz.
  // (Pages COOP/COEP gondermedigi icin tek thread; proxy sadece yeri degistirir.)
  ort.env.wasm.proxy = true;
  const files = MODEL_FILES;
  const t0 = performance.now();
  const state = Object.fromEntries(files.map((f) => [f, { loaded: 0, total: 0 }]));
  let last = 0, anyCached = false;
  const tick = () => {
    const now = performance.now();
    if (now - last < 120) return;
    last = now;
    const loaded = files.reduce((a, f) => a + state[f].loaded, 0);
    const total = files.reduce((a, f) => a + state[f].total, 0);
    const el = (now - t0) / 1000, spd = loaded / Math.max(el, 0.01);
    ui.pct = total ? Math.min(100, (100 * loaded) / total) : 0;
    const left = spd > 0 && total ? Math.max(0, (total - loaded) / spd) : 0;
    ui.stats = (total
      ? `${ui.pct.toFixed(0)}% • ${fmtMB(loaded)} / ${fmtMB(total)} • ${fmtMB(spd)}/sn • ${t().elapsed(fmtS(el))} • ${t().remain(fmtS(left))}`
      : `${fmtMB(loaded)} • ${fmtMB(spd)}/sn • ${t().elapsed(fmtS(el))}`)
      + (anyCached ? ` • ${t().cached}` : "");
    ui.dlSeq++;
  };
  const opt = { executionProviders: ["webgpu", "wasm"] };
  const v = await loadJSON("vocab.json");
  VOCAB = v.vocab; STOI = v.stoi; TIMES = v.times; LATENT = v.latent_dim;
  const makeSessions = () => files.map(async (f) => {
    const { buf, fromCache } = await fetchBuffer(`${MODEL_BASE}/${f}`,
      (loaded, total) => { state[f] = { loaded, total }; tick(); });
    if (fromCache) anyCached = true;
    state[f].loaded = state[f].total || state[f].loaded; tick();
    return ort.InferenceSession.create(buf, opt);
  });
  try {
    [sessText, sessSound, sessDec] = await Promise.all(makeSessions());
  } catch (e) {
    // Worker kurulamazsa ana threade dus.
    ort.env.wasm.proxy = false;
    [sessText, sessSound, sessDec] = await Promise.all(makeSessions());
  }
  ui.pct = 100;
  { // son tick throttle'a takilmis olabilir; kapanis satirini burada yaz
    const totalAll = files.reduce((a, f) => a + (state[f].total || state[f].loaded), 0);
    ui.stats = `100% • ${fmtMB(totalAll)} / ${fmtMB(totalAll)}` + (anyCached ? ` • ${t().cached}` : "");
  }
  ui.dlSeq++;
  ui.phase = "ready"; ui.status = t().ready;
}

// Parca parca uretir (pipelining icin async generator): her yield bir parcadir.
async function* synthPieces(text, speed, seed) {
  const spoken = alphabet(text);
  let seedI = 0;
  for (const [part, pause] of chunk(spoken, speed)) {
    const p = piece(part);
    const L = p.ids.length;
    const t = await sessText.run({ ids: Big(p.ids, [1, L]), mask: Bool(new Array(L).fill(1), [1, L]) });
    const d = t.h.dims[2];
    const h = Array.from(t.h.data), dur = Array.from(t.dur.data).map((x) => x / speed);
    const { fw, fp, frames } = plan(p, dur);
    const rand = mulberry32((seed * 1000003 + seedI++) >>> 0);
    const noise = [];
    for (let k = 0; k < TIMES.length; k++) noise.push(...randn(frames, LATENT, rand));
    const lat = await sessSound.run({
      h: F32(h, [1, L, d]), dur: F32(dur, [1, L]),
      mask: Bool(new Array(L).fill(1), [1, L]),
      cw: Big(p.cw, [1, L]), wstart: Big(p.wstart, [1, L]),
      fw: Big(fw, [1, frames]), fp: F32(fp, [1, frames]),
      fmask: Bool(new Array(frames).fill(1), [1, frames]),
      noise: F32(noise, [1, TIMES.length, frames, LATENT]),
    });
    const latents = Array.from(lat.latents.data);
    const waves = [];
    for (const [ws, we] of windows(frames, FIRST_WINDOW)) {
      const a = Math.max(0, ws - CONTEXT), b = Math.min(frames, we + CONTEXT);
      const n = b - a, z = new Float32Array(LATENT * n);
      for (let f = 0; f < n; f++)
        for (let c = 0; c < LATENT; c++) z[c * n + f] = latents[(a + f) * LATENT + c];
      const dec = await sessDec.run({ z: new ort.Tensor("float32", z, [1, LATENT, n]) });
      const hop = dec.audio.data.length / n;
      waves.push(dec.audio.data.slice((ws - a) * hop, (we - a) * hop));
    }
    if (pause > 0) waves.push(new Float32Array(Math.round(pause * RATE)));
    yield concat(waves);
  }
}

function toWav(samples) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); ws(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([b], { type: "audio/wav" });
}

/* ---------- gecmis (oturum ici ses + localStorage meta) ---------- */
let hist = [];
let lastGenText = ""; // indir tusunun adlandirmasi icin uretilen metin
try { hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch { hist = []; }
function saveHist() {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, 20).map(
      ({ text, speed, dur, size }) => ({ text, speed, dur, size }))));
  } catch { }
}

/* ---------- oynatma kuyrugu + media session ---------- */
let pieceURLs = [], fullURL = "", fullReady = false, queueDone = false;
function setSrc(pl, url) {
  if (pl.src === url) return;
  if (pl.src.startsWith("blob:")) { try { URL.revokeObjectURL(pl.src); } catch { } }
  if (url) pl.src = url;
  else { pl.removeAttribute("src"); pl.load(); }
}
function revokePlay() {
  for (const u of pieceURLs) URL.revokeObjectURL(u);
  pieceURLs = []; queueDone = false; fullReady = false;
  if (fullURL) { URL.revokeObjectURL(fullURL); fullURL = ""; }
}
function setupMedia(text) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: text.slice(0, 80) || "EMA Lightning",
      artist: "EMA Lightning",
      album: effLang() === "tr" ? "Tarayıcıda Türkçe TTS" : "In-browser Turkish TTS",
    });
    const pl = document.querySelector(".pl");
    navigator.mediaSession.setActionHandler("play", () => pl.play());
    navigator.mediaSession.setActionHandler("pause", () => pl.pause());
  } catch { }
}

/* ---------- onbellek yonetimi ---------- */
function dropAudio() { // calan + uretilmis sesleri bellekten dusur
  const pl = document.querySelector(".pl");
  if (pl) { pl.pause(); setSrc(pl, ""); pl.hidden = true; }
  revokePlay();
  if (ui.audioURL) { URL.revokeObjectURL(ui.audioURL); ui.audioURL = ""; }
}
async function clearCache() {
  try {
    if ("caches" in self) await caches.delete(CACHE_NAME).catch(() => {});
    try { localStorage.removeItem(TS_KEY); } catch {}
    // Uretilen sesleri de bellekten dusur (liste kalir, tekrar uretilebilir).
    hist.forEach((h) => { h.audio = null; });
    dropAudio();
    saveHist(); ui.histSeq++;
    ui.status = t().cacheCleared;
  } catch (e) { ui.status = t().err(e.message); }
}
function clearHist() { // gecmisi komple sil: liste + sesler
  dropAudio();
  hist = [];
  saveHist(); ui.histSeq++;
  ui.status = t().histCleared;
}
async function redownload() {
  if (ui.phase === "busy" || ui.phase === "playing" || ui.phase === "loading") return;
  try {
    if ("caches" in self) {
      const jar = await caches.open(CACHE_NAME).catch(() => null);
      if (jar) for (const f of MODEL_FILES) await jar.delete(`${MODEL_BASE}/${f}`).catch(() => {});
    }
    sessText = sessSound = sessDec = null;
    await loadModels();
  } catch (e) { ui.phase = "error"; ui.status = t().err(e.message); }
}

class App extends Component {
  template() {
    return `
      <div id="${this.id}">
        <h1>${t().title}</h1>
        <p class="sub">${t().sub}</p>
        <div class="set">
          <label>${t().theme} <select class="theme"></select></label>
          <label>${t().lang} <select class="langsel"></select></label>
        </div>
        <textarea class="txt" placeholder="${t().ph}">${esc(ui.text)}</textarea>
        <div class="ex"><span class="exlab">${t().ex}</span>${EXAMPLES.map((x, i) =>
      `<button class="ghost exb" data-i="${i}">${t().exN(i)}</button>`).join("")}</div>
        <div class="row">
          <label class="speed"><span class="spdlab">${t().speed}</span> <input class="spd" type="number" value="1" step="0.25" min="0.25" max="4"></label>
          <button class="say">${t().say}</button>
          <button class="ghost dl" disabled hidden>${t().dl}</button>
        </div>
        <div class="bar" hidden><i></i></div>
        <div class="stats"></div>
        <p class="status"></p>
        <audio class="pl" controls hidden></audio>
        <div class="hh" hidden><h2>${t().hist}</h2><div class="hl"></div></div>
        <div class="row store">
          <button class="ghost sclr">${t().clearCache}</button>
          <button class="ghost sredl">${t().redownload}</button>
          <button class="ghost shist">${t().clearHist}</button>
        </div>
        <p class="foot"><a href="https://github.com/fr0stb1rd/ema-lightning-web">ema-lightning-web</a> · model: <a href="https://github.com/canberk7/ema-lightning">canberk7/ema-lightning</a> (Apache-2.0) · onnx: <a href="https://huggingface.co/fr0stb1rd/ema-lightning-web-onnx">ema-lightning-web-onnx</a></p>
        <p class="foot disc"></p>
        <div class="faq"><h2></h2><div class="fl"></div></div>
      </div>`;
  }
  createdHooks() {
    const R = this[GEA_OBSERVER_REMOVERS];
    R.push(ui.observe("phase", () => this.paint()));
    R.push(ui.observe("dlSeq", () => this.paintDl()));
    R.push(ui.observe("audioURL", () => this.paintAudio()));
    R.push(ui.observe("histSeq", () => this.paintHist()));
    this.$(".pl").addEventListener("ended", () => this.onEnded());
    applyTheme(); fillSelects(this.$("div")); this.applyLang();
    this.paint(); this.paintHist();
  }
  applyLang() { // statik etiketleri guncel dile cevir (dinamik durum bir sonraki adimda guncellenir)
    const q = (s) => this.$(s);
    q("h1").textContent = t().title;
    q(".sub").textContent = t().sub;
    q(".txt").placeholder = t().ph;
    q(".exlab").textContent = t().ex;
    this.$$(".exb").forEach((b, i) => { b.textContent = t().exN(i); });
    q(".spdlab").textContent = t().speed;
    fillSelects(this.$("div"));
    q(".hh h2").textContent = t().hist;
    q(".disc").innerHTML = t().disc;
    q(".faq h2").textContent = t().faq;
    q(".faq .fl").innerHTML = t().faqs.map(([q_, a]) =>
      `<details><summary>${esc(q_)}</summary><p>${esc(a)}</p></details>`).join("");
    q(".sclr").textContent = t().clearCache;
    q(".sredl").textContent = t().redownload;
    q(".shist").textContent = t().clearHist;
    if (ui.phase === "ready") ui.status = t().ready;
    this.paint(); this.paintHist();
  }
  paint() {
    const loading = ui.phase === "loading", busy = ui.phase === "busy" || ui.phase === "playing";
    this.$(".say").disabled = loading || busy;
    this.$(".say").textContent = busy ? t().busy : t().say;
    this.$(".bar").hidden = !(loading || ui.phase === "ready");
    this.$(".status").textContent = ui.status;
    this.paintDl(); this.paintAudio();
  }
  paintDl() {
    this.$(".bar i").style.width = `${ui.pct}%`;
    this.$(".stats").textContent = ui.stats;
  }
  paintAudio() {
    const has = !!ui.audioURL;
    const dl = this.$(".dl");
    dl.hidden = !has; dl.disabled = !has;
    if (has) dl.textContent = `${t().dl} (${ui.audioSize})`;
  }
  paintHist() {
    const box = this.$(".hh"), list = this.$(".hl");
    box.hidden = hist.length === 0;
    if (!hist.length) { list.innerHTML = ""; return; }
    list.innerHTML = hist.map((h, i) => `
      <div class="hrow" data-i="${i}">
        <span class="ht">${esc(h.text.slice(0, 60))}${h.text.length > 60 ? "…" : ""}</span>
        <span class="hm">${h.dur} sn • ${h.size}</span>
        <button class="ghost hplay">${t().replay}</button>
        ${h.audio ? `<button class="ghost hdl">${t().dl}</button>` : ""}
        <button class="ghost hdel" title="${t().del}">×</button>
      </div>`).join("");
  }
  get events() {
    return {
      click: {
        ".say": () => this.onSay(),
        "details summary": (e) => { // akordeon: biri acilirken digerleri kapansin
          const d = e.target.closest("details");
          this.$$("details").forEach((x) => { if (x !== d && x.open) x.open = false; });
        },
        ".exb": (e) => {
          ui.text = EXAMPLES[Number(e.target.dataset.i)];
          this.$(".txt").value = ui.text;
        },
        ".dl": () => {
          const a = document.createElement("a");
          a.href = ui.audioURL; a.download = dlName(lastGenText || ui.text); a.click();
        },
        ".hplay": (e) => this.onHistPlay(Number(e.target.closest(".hrow").dataset.i)),
        ".hdl": (e) => this.onHistDl(Number(e.target.closest(".hrow").dataset.i)),
        ".hdel": (e) => {
          const i = Number(e.target.closest(".hrow").dataset.i);
          if (hist[i]) { hist.splice(i, 1); saveHist(); ui.histSeq++; }
        },
        ".sclr": () => clearCache(),
        ".sredl": () => redownload(),
        ".shist": () => clearHist(),
      },
      input: { ".txt": (e) => { ui.text = e.target.value; } },
      change: {
        ".spd": (e) => { ui.speed = parseFloat(e.target.value) || 1; },
        ".theme": (e) => { prefs.theme = e.target.value; savePrefs(); applyTheme(); },
        ".langsel": (e) => { prefs.lang = e.target.value; savePrefs(); this.applyLang(); },
      },
    };
  }
  async play() { try { await this.$(".pl").play(); } catch { } }
  onEnded() {
    if (pieceURLs.length) { // siradaki parca
      setSrc(this.$(".pl"), pieceURLs.shift());
      this.play();
    } else {
      queueDone = true;
      if (fullReady && fullURL) { setSrc(this.$(".pl"), fullURL); } // bastan dinlemek icin hazir
    }
  }
  async onSay() {
    if (ui.phase === "busy" || ui.phase === "playing" || ui.phase === "loading") return;
    if (!ui.text.trim()) { ui.phase = "error"; ui.status = t().err(t().empty); return; }
    try {
      if (!sessText) await loadModels();
      revokePlay();
      if (ui.audioURL) { URL.revokeObjectURL(ui.audioURL); ui.audioURL = ""; }
      ui.phase = "busy"; ui.status = t().busy;
      const t0 = performance.now();
      const text = ui.text, speed = ui.speed;
      const gen = synthPieces(text, speed, 0);
      const parts = [];
      const first = await gen.next();
      if (first.done) throw new Error(t().empty);
      parts.push(first.value);
      // Ilk parca hemen calsin, kalan arka planda uretilsin (pipelining).
      const pl = this.$(".pl");
      pl.hidden = false;
      pieceURLs = [URL.createObjectURL(toWav(first.value))];
      setSrc(pl, pieceURLs.shift());
      setupMedia(text);
      await this.play();
      ui.phase = "playing"; ui.status = t().playing;
      for await (const p of gen) {
        parts.push(p);
        pieceURLs.push(URL.createObjectURL(toWav(p)));
      }
      const audio = concat(parts);
      const blob = toWav(audio);
      fullURL = URL.createObjectURL(blob);
      fullReady = true;
      ui.audioURL = URL.createObjectURL(blob);
      ui.audioSize = fmtMB(blob.size);
      const dur = (audio.length / RATE).toFixed(1);
      lastGenText = text;
      hist.unshift({ text, speed, dur, size: ui.audioSize, audio });
      hist = hist.slice(0, 20);
      hist.forEach((h, i) => { if (i > 4) h.audio = null; }); // bellek: sesi sadece son 5 kayitta tut
      saveHist(); ui.histSeq++;
      ui.phase = "done";
      ui.status = t().done(dur) + ` (${((performance.now() - t0) / 1000).toFixed(1)} sn)`;
      if (queueDone) setSrc(pl, fullURL);
    } catch (e) {
      ui.phase = "error"; ui.status = t().err(e.message);
    }
  }
  async onHistPlay(i) {
    if (ui.phase === "busy" || ui.phase === "playing" || ui.phase === "loading") return;
    const h = hist[i];
    if (!h) return;
    if (h.audio) {
      const pl = this.$(".pl");
      pl.hidden = false;
      if (ui.audioURL) URL.revokeObjectURL(ui.audioURL);
      ui.audioURL = URL.createObjectURL(toWav(h.audio));
      ui.audioSize = h.size;
      setSrc(pl, ui.audioURL); setupMedia(h.text);
      await this.play();
      ui.phase = "done"; ui.status = t().done(h.dur);
    } else {
      ui.text = h.text; this.$(".txt").value = h.text;
      ui.speed = h.speed; this.$(".spd").value = h.speed;
      this.onSay(); // ses yoksa (sayfa yenilenmis) bastan uret
    }
  }
  onHistDl(i) {
    const h = hist[i];
    if (!h || !h.audio) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(toWav(h.audio));
    a.download = dlName(h.text); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

new App().render(document.getElementById("app"));
