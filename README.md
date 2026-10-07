# ⚡ EMA Lightning Web

Türkçe metinden sese (TTS) web uygulaması — **tamamen tarayıcıda çalışır**.
Sunucu yok, API anahtarı yok, sesiniz cihazınızdan çıkmaz.

**▶️ Canlı:** https://fr0stb1rd.github.io/ema-lightning-web/

[![pages](https://github.com/fr0stb1rd/ema-lightning-web/actions/workflows/pages.yml/badge.svg)](https://github.com/fr0stb1rd/ema-lightning-web/actions/workflows/pages.yml)
[![export-onnx](https://github.com/fr0stb1rd/ema-lightning-web/actions/workflows/export-onnx.yml/badge.svg)](https://github.com/fr0stb1rd/ema-lightning-web/actions/workflows/export-onnx.yml)

Model: [canberk7/ema-lightning](https://github.com/canberk7/ema-lightning) —
8,6M parametre (~34 MB), Apache-2.0, Freya-TR-Eval'de %0,92 WER.
Bu repo, modeli ONNX'e çevirip `onnxruntime-web` + WebAudio ile tarayıcıda koşturur.

## Kullanım

1. Sayfayı açın: https://fr0stb1rd.github.io/ema-lightning-web/
2. Metni yazın, **Sesi Üret**'e basın.
3. İlk açılışta modeller bir kez indirilir (~35 MB, sonra tarayıcıda önbelleklenir).

> 🔢 **Sayıları yazıyla yazın** (örn. "bin iki yüz elli lira") — otomatik
> sayı/tarih okunuşu bu sürümde yok (bkz. Sınırlamalar).

## Nasıl çalışıyor?

```
metin → app.js (parçalama + alfabe) → text_stage.onnx (metin → süreler)
      → plan (JS: süre → kare zaman çizgisi)
      → sound_stage.onnx (4 adımlı DiT, 25 Hz gizli temsil)
      → decoder.onnx (HiFi-GAN, 48 kHz ses)
      → WebAudio ile çal / .wav indir
```

ONNX dosyaları [HuggingFace Hub](https://huggingface.co/fr0stb1rd/ema-lightning-web-onnx)'da
durur, tarayıcı oradan indirir (HF CDN'i CORS'a izin verir; GitHub Releases
vermiyor — bu yüzden Hub). `vocab.json` küçük olduğu için siteyle birlikte gelir.

Orijinal hat: `ema-lightning` paketi
(`model.py`, `engine.py`, `decoder.py`, `chunker.py`, `frontend.py`).
WebGPU varsa denenir, yoksa otomatik WASM'a düşülür.

## Geliştirme

### 1. ONNX modellerini üretme (bir kez yeterli)

**Ön koşul (bir kez):** [huggingface.co/new-model](https://huggingface.co/new-model)
adresinden `ema-lightning-web-onnx` adında public model deposu açın, sonra
[huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) adresinden
yazma yetkili token üretip repo → **Settings** → **Secrets** → **Actions** altında
`HF_TOKEN` adıyla ekleyin. (Repo yoksa `push_hf.py` kendisi açar, ama token şart.)

**Önerilen — GitHub Actions ile:**

Repo → **Actions** → `export-onnx` → **Run workflow**.
İş bitince `models/*.onnx` HuggingFace Hub'a yüklenir, `vocab.json` repoya
commitlenir. Site, modelleri Hub'dan indirir.

**Alternatif — kendi bilgisayarınızda:**

```bash
pip install -r requirements-export.txt   # sürümleri sabitli liste (CPU torch)
pip install onnxruntime && python export_onnx.py --check  # önerilen: sayısal doğrulamalı
export HF_TOKEN=hf_... && python push_hf.py  # Hub'a yükle
git add vocab.json && git commit -m "vocab" && git push
```

Dönüştürücü, PyTorch'un önerdiği `torch.export` tabanlı exporter'ı
(`dynamo=True`) kullanır; opset varsayılan, eksenler dinamik. Başarısız olursa
eski exporter'a düşer ve uyarır. `--check`, üç modelin çıktısını da PyTorch
referansıyla karşılaştırır.

> Not: ~36 MB'lık ONNX dosyaları artık git'e girmiyor (`.gitignore`'da
> `models/`); Hub'da sürümlü duruyor. Eski commitlerdeki kopyaları temizlemek
> için: `git rm -r --cached models && git commit -m "modeller Hub'a taşındı"`.

### 2. Yayınlama

Repo → **Settings** → **Pages** → Source: **GitHub Actions**.
(`.github/workflows/pages.yml` hazır; her push'ta otomatik yayınlanır.)

### Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Arayüz iskeleti + stil (açık/koyu tema, mobil uyumlu) |
| `app.js` | Arayüz (`@geajs/core` runtime, TR/EN) + çıkarım hattı |
| `export_onnx.py` | PyTorch → ONNX dönüştürücü (+ `--check` doğrulaması) |
| `push_hf.py` | `models/*.onnx` → HuggingFace Hub'a yükleme |
| `requirements-export.txt` | Dönüştürme bağımlılıkları (sürümleri sabitli, CPU torch) |
| `.github/workflows/pages.yml` | Pages yayını |
| `.github/workflows/export-onnx.yml` | Tek tıkla dönüştür + Hub'a yükle |
| `vocab.json` | Alfabe + örnekleme bilgisi (sitede, küçük) |

## Sınırlamalar

- **Sayı/tarih okunuşu yok.** Orijinal `normalizer-tr` Python paketi tarayıcıda
  yok; `app.js` yalnızca küçük harf + alfabe filtresi yapıyor. "1.250.000 TL"
  gibi girdiler rakam rakam okunur.
- **Seed uyumu yok.** Tarayıcı kendi rastgele sayı üretecini kullanır; aynı
  metin geçerli Türkçe ses üretir ama Python çıktısıyla birebir aynı olmaz.
- **Hız:** masaüstü CPU'da Python ~6× gerçek zamanlı; WASM'da kısa cümlelerde
  ~1–2× bekleyin. Uzun metin parça parça üretilir, arayüz donmaz.
- Model tek ses, yalnızca Türkçe — orijinal modelin limitleri aynen geçerli.

## Teşekkür ve lisans

- Model ve ağırlıklar: [Canberk Aslan (canberk7/ema-lightning)](https://github.com/canberk7/ema-lightning), Apache-2.0 (ticari kullanım dahil).
- Metin normalleştirme (orijinal): [Erdem Tuna (normalizer-tr)](https://github.com/erdemtuna/normalizer-tr).
- Bu repodaki kod: Apache-2.0.
