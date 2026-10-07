"""PyTorch ema.pt / decoder.pt -> tarayicida calisan 3 ONNX dosyasi.

Kendi bilgisayarinizda bir kez calistirin (github.io'da degil):
    pip install ema-lightning torch onnx huggingface_hub
    python export_onnx.py [--check]

--check: onnxruntime ile sayisal dogrulama yapar (ek: pip install onnxruntime).
Ekstra kurulum gerektirmez; agirliklar ilk kullanimda HF'tan iner (~34 MB).

Yontem: torch.export tabanli ONNX exporter (dynamo=True) — PyTorch 2.5+
dokumanlarinda "recommended and default" yol. Opset default (onerilen);
dinamik eksenler dynamic_shapes ile isaretli. dynamo basarisiz olursa
eski TorchScript exporter'a duser (uyarir).
"""
import argparse
import json
import sys
from pathlib import Path

import torch
from huggingface_hub import hf_hub_download

REPO = "canberkkkkkk/ema-lightning"
OUT = Path(__file__).parent / "models"


def do_export(module, feeds, path, input_names, output_names, dyn_shapes, dyn_axes_fallback):
    """Once dynamo (onerilen; girdiler kwargs + dynamic_shapes), olmazsa legacy dene."""
    try:
        import onnxscript  # noqa: F401 (dynamo exporter'in zorunlu bagimliligi)
    except ImportError:
        print("hata: 'onnxscript' kurulu degil; dynamo exporter calisamaz. "
              "pip install onnxscript", file=sys.stderr)
        raise
    try:
        prog = torch.onnx.export(
            module, (), kwargs=feeds, input_names=input_names, output_names=output_names,
            dynamic_shapes=dyn_shapes, dynamo=True)
        prog.save(str(path))
        print(f"ok {path.name} (dynamo)")
        return
    except Exception as e:  # ornek: desteksiz op; legacy yolu dene
        print(f"uyari: dynamo exporter basarisiz ({type(e).__name__}: {e}); legacy deneniyor...",
              file=sys.stderr)
    torch.onnx.export(
        module, tuple(feeds.values()), str(path), input_names=input_names, output_names=output_names,
        dynamic_axes=dyn_axes_fallback, dynamo=False)
    print(f"ok {path.name} (legacy fallback)")


def main(check=False):
    from ema_lightning.decoder import load_decoder  # noqa: PLC0415 (agir importlar burada)
    from ema_lightning.engine import Engine
    from ema_lightning.model import load_acoustic

    OUT.mkdir(exist_ok=True)
    dev = torch.device("cpu")
    acoustic = load_acoustic(hf_hub_download(REPO, "ema.pt"), dev)
    decoder = load_decoder(hf_hub_download(REPO, "decoder.pt"), dev)
    (Path(__file__).parent / "vocab.json").write_text(
        json.dumps({"vocab": acoustic.vocab, "stoi": acoustic.stoi,
                    "times": acoustic.times, "latent_dim": acoustic.latent_dim}, ensure_ascii=False))

    B, L, T = 1, 8, 8  # ornek sekiller; asagida dinamik isaretleniyor
    d, ld = acoustic.d, acoustic.latent_dim

    # --- 1) text_stage: ids, mask -> h, dur ---
    class TextWrap(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, ids, mask):
            return self.m.text_stage(ids, mask)

    do_export(
        TextWrap(acoustic).eval(),
        {"ids": torch.ones(B, L, dtype=torch.long), "mask": torch.ones(B, L, dtype=torch.bool)},
        OUT / "text_stage.onnx", ["ids", "mask"], ["h", "dur"],
        {"ids": {0: "B", 1: "L"}, "mask": {0: "B", 1: "L"}},
        {"ids": {0: "B", 1: "L"}, "mask": {0: "B", 1: "L"},
         "h": {0: "B", 1: "L"}, "dur": {0: "B", 1: "L"}})

    # --- 2) sound_stage: 9 girdi -> latents ---
    class SoundWrap(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, h, dur, mask, cw, wstart, fw, fp, fmask, noise):
            return self.m.sound_stage(h, dur, mask, cw, wstart, fw, fp, fmask, noise)

    sound_feeds = {"h": torch.randn(B, L, d), "dur": torch.rand(B, L) + 0.5,
                   "mask": torch.ones(B, L, dtype=torch.bool),
                   "cw": torch.zeros(B, L, dtype=torch.long),
                   "wstart": torch.zeros(B, L, dtype=torch.long),
                   "fw": torch.zeros(B, T, dtype=torch.long), "fp": torch.zeros(B, T),
                   "fmask": torch.ones(B, T, dtype=torch.bool),
                   "noise": torch.randn(B, len(acoustic.times), T, ld)}
    do_export(
        SoundWrap(acoustic).eval(), sound_feeds, OUT / "sound_stage.onnx",
        ["h", "dur", "mask", "cw", "wstart", "fw", "fp", "fmask", "noise"], ["latents"],
        {"h": {0: "B", 1: "L"}, "dur": {0: "B", 1: "L"}, "mask": {0: "B", 1: "L"},
         "cw": {0: "B", 1: "L"}, "wstart": {0: "B", 1: "L"},
         "fw": {0: "B", 1: "T"}, "fp": {0: "B", 1: "T"}, "fmask": {0: "B", 1: "T"},
         "noise": {0: "B", 2: "T"}},
        {"h": {0: "B", 1: "L"}, "dur": {0: "B", 1: "L"}, "mask": {0: "B", 1: "L"},
         "cw": {0: "B", 1: "L"}, "wstart": {0: "B", 1: "L"},
         "fw": {0: "B", 1: "T"}, "fp": {0: "B", 1: "T"}, "fmask": {0: "B", 1: "T"},
         "noise": {0: "B", 2: "T"}, "latents": {0: "B", 1: "T"}})

    # --- 3) decoder: z [B, latent_dim, T] -> audio ---
    class DecWrap(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, z):
            return self.m(z)  # lengths=None: padding yok (tek pencere)

    do_export(
        DecWrap(decoder).eval(), {"z": torch.randn(B, ld, T)}, OUT / "decoder.onnx",
        ["z"], ["audio"], {"z": {0: "B", 2: "T"}},
        {"z": {0: "B", 2: "T"}, "audio": {0: "B", 1: "S"}})

    import onnx
    for n in ("text_stage", "sound_stage", "decoder"):
        onnx.checker.check_model(str(OUT / f"{n}.onnx"))
    print("onnx checker ok")

    if check:
        smoke_check(acoustic, decoder)
    print("Bitti. models/ + vocab.json olustu.")


def smoke_check(acoustic, decoder):
    """ONNX ciktilari torch ile ayni mi? (toleransli karsilastirma)"""
    import numpy as np
    import onnxruntime as ort

    from ema_lightning.engine import Engine

    engine = Engine(acoustic, decoder, torch.device("cpu"))
    piece = engine.piece("merhaba dünya.", 0.0, 0)
    engine.plan([piece], 1.0)
    L, T = piece.letters, piece.frames
    to = lambda t: t.cpu().numpy()  # noqa: E731

    # text_stage
    ids = piece.ids.unsqueeze(0)
    mask = torch.ones(1, L, dtype=torch.bool)
    h_ref, dur_ref = acoustic.text_stage(ids, mask)
    s = ort.InferenceSession(str(OUT / "text_stage.onnx"), providers=["CPUExecutionProvider"])
    h, dur = s.run(None, {"ids": to(ids).astype(np.int64), "mask": to(mask).astype(bool)})
    assert h.shape == (1, L, acoustic.d)
    torch.testing.assert_close(torch.from_numpy(h), h_ref, atol=1e-4, rtol=1e-4)
    torch.testing.assert_close(torch.from_numpy(dur), dur_ref, atol=1e-4, rtol=1e-4)

    # sound_stage (engine.think ile ayni girdiler)
    engine.think([piece])
    kw = dict(h=h_ref, dur=dur_ref, mask=mask,
              cw=piece.cw.unsqueeze(0), wstart=piece.wstart.unsqueeze(0),
              fw=piece.fw.unsqueeze(0), fp=piece.fp.unsqueeze(0),
              fmask=torch.ones(1, T, dtype=torch.bool),
              noise=engine.stack([engine.noise(piece)], T, 0.0, dim=1))
    lat_ref = acoustic.sound_stage(**kw)
    s = ort.InferenceSession(str(OUT / "sound_stage.onnx"), providers=["CPUExecutionProvider"])
    feed = {k: (to(v).astype(np.int64) if v.dtype == torch.int64
                else to(v).astype(bool) if v.dtype == torch.bool else to(v).astype(np.float32))
            for k, v in kw.items()}
    (lat,) = s.run(None, feed)
    assert lat.shape == (1, T, acoustic.latent_dim), f"latent sekli {lat.shape}"
    torch.testing.assert_close(torch.from_numpy(lat), lat_ref, atol=1e-3, rtol=1e-3)

    # decoder
    z = piece.latents.T.unsqueeze(0)  # [T, latent] -> [1, latent, T]
    a_ref = decoder(z)
    s = ort.InferenceSession(str(OUT / "decoder.onnx"), providers=["CPUExecutionProvider"])
    (a,) = s.run(None, {"z": to(z).astype(np.float32)})
    torch.testing.assert_close(torch.from_numpy(a), a_ref, atol=1e-4, rtol=1e-4)
    print(f"smoke ok: L={L} T={T} audio={a.shape[1]} ornek")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="onnxruntime ile sayisal dogrulama")
    main(**vars(ap.parse_args()))
