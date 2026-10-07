/* EMA Lightning Web — tarayici TTS arayuzu (gea-runtime) + cikarim hatti.
 * Model: canberk7/ema-lightning (Apache-2.0). Agirliklar HuggingFace Hub'da.
 */
"use strict";
const ORT_VERSION = "1.30.0"; // index.html'deki CDN script ile AYNI olmali
const HF_REPO = "fr0stb1rd/ema-lightning-web-onnx";
const MODEL_BASE = `https://huggingface.co/${HF_REPO}/resolve/main`;
const RATE = 48000, FPS = 25;
const FIRST_WINDOW = 25, WINDOW = 100, CONTEXT = 8;
const MAX_WORD_FRAMES = 250, MAX_FRAMES = 3000, MAX_LETTERS = 250;

/* ---------- i18n: arayuz dili tarayicidan, okunacak metin hep Turkce ---------- */
const LANG = (navigator.language || "tr").toLowerCase().startsWith("tr") ? "tr" : "en";
const T = {
  tr: {
    title: "⚡ EMA Lightning (tarayıcıda)",
    sub: "Türkçe metinden sese. Sunucu yok — her şey cihazınızda olur. Sayıları yazıyla yazın (örn. “bin iki yüz elli”).",
    ph: "Okunacak Türkçe metni yazın…",
    ex: "Örnekler:", exN: (i) => `Örnek ${i + 1}`,
    speed: "Hız:", say: "Sesi Üret", busy: "Üretiliyor…",
    loading: "Modeller indiriliyor (ilk sefer, ~36 MB)…",
    ready: "Hazır.",
    done: (d) => `Tamamlandı (${d} sn ses).`,
    err: (m) => `Hata: ${m}`,
    dl: "İndir", bald: ".wav indir",
    remain: (s) => `~${s} sn kaldı`, elapsed: (s) => `${s} sn geçti`,
  },
  en: {
    title: "⚡ EMA Lightning (in-browser)",
    sub: "Turkish text-to-speech. No server — everything runs on your device. Write numbers out in Turkish words (e.g. “bin iki yüz elli”).",
    ph: "Type Turkish text to speak…",
    ex: "Examples:", exN: (i) => `Example ${i + 1}`,
    speed: "Speed:", say: "Speak", busy: "Working…",
    loading: "Downloading models (first run, ~36 MB)…",
    ready: "Ready.",
    done: (d) => `Done (${d} s of audio).`,
    err: (m) => `Error: ${m}`,
    dl: "Download", bald: ".wav download",
    remain: (s) => `~${s} s left`, elapsed: (s) => `${s} s elapsed`,
  },
}[LANG];

const EXAMPLES = [
  "Merhaba, size nasıl yardımcı olabilirim?",
  "Siparişiniz yola çıktı, yarın sabah kapınızda olacak.",
  "Beş kilogram un, iki litre süt ve bir düzine yumurta aldım.",
  "On beş Ekim Çarşamba günü saat onda toplantımız var.",
];

/* ---------- gea store ---------- */
const { Store, Component, GEA_OBSERVER_REMOVERS } = gea;
class UI extends Store {
  phase = "idle";      // idle|loading|ready|busy|done|error
  text = EXAMPLES[0];
  speed = 1;
  pct = 0; stats = ""; status = ""; dlSeq = 0;
  audioURL = ""; audioSize = "";
}
const ui = new UI();

/* ---------- kucuk yardimcilar ---------- */
const $ = (id) => document.getElementById(id);
const fmtMB = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fmtS = (s) => s < 60 ? `${Math.round(s)}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} (HTTP ${r.status})`);
  return r.json();
}

// Ilerlemeli indirme: yuzde + toplam + hiz + gecen/kalan sure icin baytlari sayar.
async function fetchBuffer(url, onTick) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.split("/").pop()} (HTTP ${r.status})`);
  const total = Number(r.headers.get("content-length")) || 0;
  const chunks = []; let loaded = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.byteLength;
    onTick(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return { buf, total: total || loaded };
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
  const typo = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "..." };
  text = text.replace(/[’‘“”–—…]/g, (c) => typo[c] || c)
    .replaceAll("İ", "i").replaceAll("I", "ı").toLowerCase();
  const vs = new Set(VOCAB);
  let out = "";
  for (const ch of text.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""))
    out += vs.has(ch) ? ch : " ";
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

async function loadModels() {
  ui.phase = "loading"; ui.status = T.loading; ui.pct = 0; ui.stats = "";
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  const files = ["text_stage.onnx", "sound_stage.onnx", "decoder.onnx"];
  const t0 = performance.now();
  const state = Object.fromEntries(files.map((f) => [f, { loaded: 0, total: 0 }]));
  let last = 0;
  const tick = () => {
    const now = performance.now();
    if (now - last < 120) return; // ~8fps yeterli, DOM'u yormayalim
    last = now;
    const loaded = files.reduce((a, f) => a + state[f].loaded, 0);
    const total = files.reduce((a, f) => a + state[f].total, 0);
    const el = (now - t0) / 1000, spd = loaded / Math.max(el, 0.01);
    ui.pct = total ? Math.min(100, (100 * loaded) / total) : 0;
    const left = spd > 0 && total ? Math.max(0, (total - loaded) / spd) : 0;
    ui.stats = total
      ? `${ui.pct.toFixed(0)}% • ${fmtMB(loaded)} / ${fmtMB(total)} • ${fmtMB(spd)}/sn • ${T.elapsed(fmtS(el))} • ${T.remain(fmtS(left))}`
      : `${fmtMB(loaded)} • ${fmtMB(spd)}/sn • ${T.elapsed(fmtS(el))}`;
    ui.dlSeq++;
  };
  const opt = { executionProviders: ["webgpu", "wasm"] };
  const v = await loadJSON("vocab.json");
  VOCAB = v.vocab; STOI = v.stoi; TIMES = v.times; LATENT = v.latent_dim;
  const jobs = files.map(async (f) => {
    const { buf } = await fetchBuffer(`${MODEL_BASE}/${f}`,
      (loaded, total) => { state[f] = { loaded, total }; tick(); });
    state[f].loaded = state[f].total || state[f].loaded; tick();
    return ort.InferenceSession.create(buf, opt);
  });
  [sessText, sessSound, sessDec] = await Promise.all(jobs);
  ui.pct = 100; ui.dlSeq++;
  ui.phase = "ready"; ui.status = T.ready;
}

async function synthesize(text, speed, seed) {
  const spoken = alphabet(text);
  const out = [];
  let seedI = 0;
  for (const [part, pause] of chunk(spoken, speed)) {
    const p = piece(part);
    const L = p.ids.length;
    const t = await sessText.run({ ids: Big(p.ids, [1, L]), mask: Bool(new Array(L).fill(1), [1, L]) });
    const d = t.h.dims[2];
    const h = Array.from(t.h.data), dur = Array.from(t.dur.data).map((x) => x / speed);
    const { fw, fp, frames } = plan(p, dur);
    const Tframes = frames;
    const rand = mulberry32((seed * 1000003 + seedI++) >>> 0);
    const noise = [];
    for (let k = 0; k < TIMES.length; k++) noise.push(...randn(Tframes, LATENT, rand));
    const lat = await sessSound.run({
      h: F32(h, [1, L, d]), dur: F32(dur, [1, L]),
      mask: Bool(new Array(L).fill(1), [1, L]),
      cw: Big(p.cw, [1, L]), wstart: Big(p.wstart, [1, L]),
      fw: Big(fw, [1, Tframes]), fp: F32(fp, [1, Tframes]),
      fmask: Bool(new Array(Tframes).fill(1), [1, Tframes]),
      noise: F32(noise, [1, TIMES.length, Tframes, LATENT]),
    });
    const latents = Array.from(lat.latents.data);
    for (const [ws, we] of windows(frames, FIRST_WINDOW)) {
      const a = Math.max(0, ws - CONTEXT), b = Math.min(frames, we + CONTEXT);
      const n = b - a, z = new Float32Array(LATENT * n);
      for (let f = 0; f < n; f++)
        for (let c = 0; c < LATENT; c++) z[c * n + f] = latents[(a + f) * LATENT + c];
      const dec = await sessDec.run({ z: new ort.Tensor("float32", z, [1, LATENT, n]) });
      const hop = dec.audio.data.length / n;
      out.push(dec.audio.data.slice((ws - a) * hop, (we - a) * hop));
    }
    if (pause > 0) out.push(new Float32Array(Math.round(pause * RATE)));
  }
  const audio = new Float32Array(out.reduce((a, x) => a + x.length, 0));
  let o = 0; for (const c of out) { audio.set(c, o); o += c.length; }
  return audio;
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

/* ---------- gea bileseni ---------- */
class App extends Component {
  template() {
    return `
      <div id="${this.id}">
        <h1>${T.title}</h1>
        <p class="sub">${T.sub}</p>
        <textarea class="txt" placeholder="${T.ph}">${ui.text}</textarea>
        <div class="ex"><span>${T.ex}</span>${EXAMPLES.map((x, i) =>
          `<button class="ghost exb" data-i="${i}">${T.exN(i)}</button>`).join("")}</div>
        <div class="row">
          <label class="speed">${T.speed} <input class="spd" type="number" value="1" step="0.25" min="0.25" max="4"></label>
          <button class="say">${T.say}</button>
          <button class="ghost dl" disabled hidden>${T.dl}</button>
        </div>
        <div class="bar" hidden><i></i></div>
        <div class="stats"></div>
        <p class="status"></p>
        <audio class="pl" controls hidden></audio>
        <p class="foot"><a href="https://github.com/fr0stb1rd/ema-lightning-web">ema-lightning-web</a> · model: <a href="https://github.com/canberk7/ema-lightning">canberk7/ema-lightning</a> (Apache-2.0)</p>
      </div>`;
  }
  createdHooks() {
    const R = this[GEA_OBSERVER_REMOVERS];
    R.push(ui.observe("phase", () => this.paint()));
    R.push(ui.observe("dlSeq", () => this.paintDl()));
    R.push(ui.observe("audioURL", () => this.paintAudio()));
    this.paint();
  }
  paint() {
    const loading = ui.phase === "loading", busy = ui.phase === "busy";
    this.$(".say").disabled = loading || busy;
    this.$(".say").textContent = busy ? T.busy : T.say;
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
    const pl = this.$(".pl"), dl = this.$(".dl");
    pl.hidden = !has; dl.hidden = !has; dl.disabled = !has;
    if (has) {
      if (pl.src !== ui.audioURL) { pl.src = ui.audioURL; pl.play().catch(() => {}); }
      dl.textContent = `${T.dl} (${ui.audioSize})`;
    }
  }
  get events() {
    return {
      click: {
        ".say": () => this.onSay(),
        ".exb": (e) => {
          ui.text = EXAMPLES[Number(e.target.dataset.i)];
          this.$(".txt").value = ui.text;
        },
        ".dl": () => {
          const a = document.createElement("a");
          a.href = ui.audioURL; a.download = "ema.wav"; a.click();
        },
      },
      input: { ".txt": (e) => { ui.text = e.target.value; } },
      change: { ".spd": (e) => { ui.speed = parseFloat(e.target.value) || 1; } },
    };
  }
  async onSay() {
    if (ui.phase === "busy" || ui.phase === "loading") return;
    try {
      if (!sessText) await loadModels();
      ui.phase = "busy"; ui.status = T.busy;
      const t0 = performance.now();
      const audio = await synthesize(ui.text, ui.speed, 0);
      if (ui.audioURL) URL.revokeObjectURL(ui.audioURL);
      const blob = toWav(audio);
      ui.audioURL = URL.createObjectURL(blob);
      ui.audioSize = fmtMB(blob.size);
      ui.phase = "done";
      ui.status = T.done((audio.length / RATE).toFixed(1)) +
        ` (${((performance.now() - t0) / 1000).toFixed(1)} sn)`;
    } catch (e) {
      ui.phase = "error"; ui.status = T.err(e.message);
    }
  }
}

new App().render(document.getElementById("app"));
