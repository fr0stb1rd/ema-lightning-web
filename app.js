/* EMA Lightning Web (fr0stb1rd/ema-lightning-web) — tarayici cikarim hatti.
 * Orijinal: canberk7/ema-lightning (Apache-2.0).
 * Modeller export_onnx.py ile uretilip push_hf.py ile HuggingFace Hub'a
 * yuklenir; tarayici oradan indirir (HF CDN CORS'a izin verir).
 */
"use strict";
// onnxruntime-web surumu: index.html'deki CDN script ile AYNI olmali.
const ORT_VERSION = "1.30.0";
// ONNX agirliklar: push_hf.py'nin yukledigi Hub reposu (resolve URL'leri sabit,
// HF CDN'e yonlenir). vocab.json kucuk oldugu icin repo ile birlikte gelir.
const HF_REPO = "fr0stb1rd/ema-lightning-web-onnx";
const MODEL_BASE = `https://huggingface.co/${HF_REPO}/resolve/main`;
const RATE = 48000, FPS = 25;
const FIRST_WINDOW = 25, WINDOW = 100, CONTEXT = 8;
const MAX_WORD_FRAMES = 250, MAX_FRAMES = 3000, MAX_LETTERS = 250;
const $ = (id) => document.getElementById(id);
const log = (...a) => { $("log").textContent += a.join(" ") + "\n"; };
let VOCAB = null, STOI = null, TIMES = null, LATENT = 64;
let sessText = null, sessSound = null, sessDec = null, lastWav = null;

// ---- RNG (mulberry32 + Box-Muller). PyTorch seed ile birebir DEGIL (bkz README) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(rows, cols, rand) { // [rows, cols]
  const o = new Float32Array(rows * cols);
  for (let i = 0; i < o.length; i += 2) {
    const u1 = Math.max(rand(), 1e-9), u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1)), t = 2 * Math.PI * u2;
    o[i] = r * Math.cos(t); if (i + 1 < o.length) o[i + 1] = r * Math.sin(t);
  }
  return o;
}

// ---- chunker.py portu ----
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
        re.lastIndex = 0;
        const ends = [];
        let m; const rx = new RegExp(re.source, "g");
        while ((m = rx.exec(rest)) && m.index <= limit) ends.push(m.index + m[0].length);
        if (ends.length) { cut = ends[ends.length - 1]; pause = gap; break; }
      }
    }
    const piece = rest.slice(0, cut).trim(); rest = rest.slice(cut).trim();
    if (/\p{L}/u.test(piece)) pieces.push([finish(piece), pause]);
  }
  if (pieces.length) pieces[pieces.length - 1][1] = 0;
  return pieces;
}

// ---- frontend: SADELESTIRILMIS (normalizer-tr YOK) ----
function alphabet(text) {
  const typo = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "..." };
  text = text.replace(/[’‘“”–—…]/g, (c) => typo[c] || c)
    .replaceAll("İ", "i").replaceAll("I", "ı").toLowerCase();
  const vs = new Set(VOCAB);
  let out = "";
  for (const ch of text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")) {
    out += vs.has(ch) ? ch : (ch === " " ? " " : " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

// ---- Engine.piece portu ----
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

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} indirilemedi (HTTP ${r.status}). ` +
    "Birkaç dakika bekleyip tekrar deneyin.");
  return r.json();
}

async function loadModels() {
  $("status").textContent = "Model indiriliyor (~35 MB, ilk sefer)...";
  // Best practice (onnxruntime docs/deploy): CDN'den yuklenirken wasm/worker
  // dosyalarinin yolunu ayni surume sabitle; Pages COOP/COEP gondermedigi icin
  // ORT otomatik tek threade duser (crossOriginIsolated=false), ayar gerekmez.
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  const v = await loadJSON("vocab.json");
  VOCAB = v.vocab; STOI = v.stoi; TIMES = v.times; LATENT = v.latent_dim;
  const opt = { executionProviders: ["webgpu", "wasm"] };
  const at = (n) => `${MODEL_BASE}/${n}`;
  [sessText, sessSound, sessDec] = await Promise.all([
    ort.InferenceSession.create(at("text_stage.onnx"), opt),
    ort.InferenceSession.create(at("sound_stage.onnx"), opt),
    ort.InferenceSession.create(at("decoder.onnx"), opt),
  ]);
  $("status").textContent = "Hazır. Tamamen çevrimdışı çalışır.";
}

function plan(h, dur, p) { // h:[L,d] dur:[L] -> fw, fp, frames
  const L = p.ids.length;
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

async function synthesize(text, speed, seed) {
  const t0 = performance.now();
  const spoken = alphabet(text); // normalizer-tr yok: sayilari yaziyle yazin
  const out = [];
  let seedI = 0;
  for (const [part, pause] of chunk(spoken, speed)) {
    const p = piece(part);
    const L = p.ids.length;
    const t = await sessText.run({
      ids: Big(p.ids, [1, L]),
      mask: Bool(new Array(L).fill(1), [1, L]),
    });
    const d = t.h.dims[2];
    const h = Array.from(t.h.data), dur = Array.from(t.dur.data).map((x) => x / speed);
    const { fw, fp, frames } = plan(h, dur, p);
    const T = frames;
    const rand = mulberry32((seed * 1000003 + seedI++) >>> 0);
    const noise = []; // [steps, T, latent]
    for (let k = 0; k < TIMES.length; k++) noise.push(...randn(T, LATENT, rand));
    const lat = await sessSound.run({
      h: F32(h, [1, L, d]), dur: F32(dur, [1, L]),
      mask: Bool(new Array(L).fill(1), [1, L]),
      cw: Big(p.cw, [1, L]), wstart: Big(p.wstart, [1, L]),
      fw: Big(fw, [1, T]), fp: F32(fp, [1, T]),
      fmask: Bool(new Array(T).fill(1), [1, T]),
      noise: F32(noise, [1, TIMES.length, T, LATENT]),
    });
    const latents = Array.from(lat.latents.data); // [T*latent]
    // pencere pencere coz (CONTEXT marjli)
    for (const [ws, we] of windows(frames, FIRST_WINDOW)) {
      const a = Math.max(0, ws - CONTEXT), b = Math.min(frames, we + CONTEXT);
      const n = b - a, z = new Float32Array(LATENT * n);
      for (let f = 0; f < n; f++)
        for (let c = 0; c < LATENT; c++) z[c * n + f] = latents[(a + f) * LATENT + c];
      const dec = await sessDec.run({ z: new ort.Tensor("float32", z, [1, LATENT, n]) });
      const hop = dec.audio.data.length / n;
      const from = (ws - a) * hop, to = (we - a) * hop;
      out.push(dec.audio.data.slice(from, to));
    }
    if (pause > 0) out.push(new Float32Array(Math.round(pause * RATE)));
  }
  const total = out.reduce((a, x) => a + x.length, 0);
  const audio = new Float32Array(total);
  let o = 0; for (const c of out) { audio.set(c, o); o += c.length; }
  // resample yok: 48 kHz dogrudan
  log(`bitti: ${(total / RATE).toFixed(2)} sn ses, ${(performance.now() - t0).toFixed(0)} ms surdu`);
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

$("say").onclick = async () => {
  try {
    if (!sessText) await loadModels();
    $("status").textContent = "Üretiliyor...";
    const audio = await synthesize($("text").value, parseFloat($("speed").value) || 1, 0);
    if (lastWav) URL.revokeObjectURL(lastWav);
    lastWav = URL.createObjectURL(toWav(audio));
    $("player").src = lastWav; $("player").play();
    $("dl").disabled = false;
    $("dl").onclick = () => { const a = document.createElement("a"); a.href = lastWav; a.download = "ema.wav"; a.click(); };
    $("status").textContent = "Hazır.";
  } catch (e) { $("status").textContent = "Hata: " + e.message; log(String(e)); }
};
