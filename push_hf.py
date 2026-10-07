"""models/*.onnx -> HuggingFace Hub.

Neden: tarayici, GitHub Releases dosyalarini CORS yuzunden indiremez
(release-assets.githubusercontent.com'da ACAO yok); HF CDN'de
`access-control-allow-origin: *` var, dogrudan fetch ile indirilebilir.
Boylece Pages reposu kucuk kalir (~36 MB git gecmisine girmez).

Kullanim (Actions'ta otomatik; yerelde elle):
    export HF_REPO=fr0stb1rd/ema-lightning-web-onnx
    export HF_TOKEN=hf_...   # yazma yetkili token
    python export_onnx.py --check && python push_hf.py
"""
import os
import sys
from pathlib import Path

REPO = os.environ.get("HF_REPO", "fr0stb1rd/ema-lightning-web-onnx")
MODELS = Path(__file__).parent / "models"


def main():
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("hata: HF_TOKEN yok. https://huggingface.co/settings/tokens adresinden "
              "yazma yetkili token alip HF_TOKEN olarak tanimlayin.", file=sys.stderr)
        raise SystemExit(1)
    files = sorted(MODELS.glob("*.onnx"))
    if not files:
        print(f"hata: {MODELS} bos; once python export_onnx.py calistirin.", file=sys.stderr)
        raise SystemExit(1)

    from huggingface_hub import HfApi  # noqa: PLC0415

    api = HfApi(token=token)
    api.create_repo(REPO, exist_ok=True, repo_type="model", private=False)
    for f in files:
        api.upload_file(path_or_fileobj=str(f), path_in_repo=f.name,
                        repo_id=REPO, repo_type="model", commit_message=f"update {f.name}")
        print(f"yuklendi: {REPO}/{f.name}")
    api.upload_file(path_or_fileobj=CARD.encode(), path_in_repo="README.md",
                    repo_id=REPO, repo_type="model", commit_message="model card (apache-2.0)")
    print(f"Bitti. Cozum URL kok: https://huggingface.co/{REPO}/resolve/main")


CARD = """---
license: apache-2.0
language:
- tr
base_model: canberkkkkkk/ema-lightning
pipeline_tag: text-to-speech
library_name: onnx
tags:
- onnx
- text-to-speech
- tts
- turkish
- onnxruntime-web
- webgpu
- wasm
---

# EMA Lightning Web — ONNX weights

ONNX-converted weights of [canberk7/ema-lightning](https://github.com/canberk7/ema-lightning)
for in-browser inference (produced by [fr0stb1rd/ema-lightning-web](https://github.com/fr0stb1rd/ema-lightning-web)).

- `text_stage.onnx`: text → hidden states + durations
- `sound_stage.onnx`: 4-step DiT → 25 Hz latents
- `decoder.onnx`: HiFi-GAN → 48 kHz audio

Live: https://fr0stb1rd.github.io/ema-lightning-web/

## Disclaimer

The models in this repository are licensed under the **Apache License 2.0**.
This software comes with no warranty. By using it, you agree that you have
read and accepted the [LICENSE](https://github.com/fr0stb1rd/ema-lightning-web/blob/main/LICENSE).
"""


if __name__ == "__main__":
    main()
