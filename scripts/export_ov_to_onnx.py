"""
Export the Onsets & Velocities pretrained model to ONNX format for browser inference.

Produces an onset-only model (velocity stage stripped) that takes a log-mel
spectrogram of shape (batch, melbins, time) and outputs onset probabilities
of shape (batch, 88, time-1) after sigmoid.

Run from the SightReading project root in PowerShell:
    python scripts\export_ov_to_onnx.py

Requires: torch, onnx, onnxsim, onnxruntime (for verification)
"""

import sys
import os
from pathlib import Path
import numpy as np

# ---------------------------------------------------------------------------
# Paths — all relative to the SightReading project root
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
IAMUSICA_ROOT = PROJECT_ROOT / "scripts" / "iamusica_training"
CHECKPOINT_PATH = (
    IAMUSICA_ROOT / "assets"
    / "OnsetsAndVelocities_2023_03_04_09_53_53.289step=43500_f1=0.9675__0.9480.torch"
)
OUTPUT_DIR = PROJECT_ROOT / "public" / "models"
OUTPUT_PATH = OUTPUT_DIR / "onsets_and_velocities.onnx"

# Add iamusica_training to path so we can import ov_piano
sys.path.insert(0, str(IAMUSICA_ROOT))

import torch
import onnx
from onnxsim import simplify

from ov_piano.models.ov import OnsetsAndVelocities
from ov_piano.utils import load_model


# ---------------------------------------------------------------------------
# Wrapper: onset-only forward with sigmoid baked in
# ---------------------------------------------------------------------------
class OnsetDetector(torch.nn.Module):
    """Thin wrapper that runs only the onset path and applies sigmoid."""

    def __init__(self, model: OnsetsAndVelocities):
        super().__init__()
        self.specnorm = model.specnorm
        self.stem = model.stem
        self.onset_stages = model.onset_stages

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        :param x: Log-mel spectrogram, shape (batch, melbins, time)
        :returns: Onset probabilities, shape (batch, 88, time-1)
        """
        xdiff = x[:, :, 1:] - x[:, :, :-1] # xdiff = x.diff(dim=-1)
        x = torch.stack([x[:, :, 1:], xdiff]).permute(1, 0, 2, 3)
        x = self.specnorm(x)
        stem_out = self.stem(x)
        x = self.onset_stages[0](stem_out)
        for stg in self.onset_stages[1:]:
            x = stg(stem_out) + x
        x = x.squeeze(1)
        x = torch.sigmoid(x)
        return x


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"Checkpoint: {CHECKPOINT_PATH}")
    assert CHECKPOINT_PATH.exists(), f"Checkpoint not found: {CHECKPOINT_PATH}"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Instantiate full model with eval-time settings (matching eval script)
    print("Instantiating OnsetsAndVelocities model...")
    full_model = OnsetsAndVelocities(
        in_chans=2,
        in_height=229,
        out_height=88,
        conv1x1head=(200, 200),
        bn_momentum=0,
        leaky_relu_slope=0.1,
        dropout_drop_p=0,
    )

    # 2. Load pretrained weights
    print("Loading checkpoint...")
    load_model(full_model, str(CHECKPOINT_PATH), eval_phase=True)

    # 3. Create onset-only wrapper
    wrapper = OnsetDetector(full_model)
    wrapper.eval()

    # 4. Create dummy input — batch=1, 229 mel bins, 100 time frames
    #    (time dim is dynamic, 100 is just for tracing)
    dummy_input = torch.randn(1, 229, 100)

    # 5. Run PyTorch forward for later verification
    with torch.no_grad():
        pt_output = wrapper(dummy_input)
    print(f"PyTorch output shape: {pt_output.shape}")

    # 6. Export to ONNX (TorchScript exporter — battle-tested for conv models)
    print("Exporting to ONNX...")
    torch.onnx.export(
        wrapper,
        dummy_input,
        str(OUTPUT_PATH),
        dynamo=False,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=["logmel"],
        output_names=["onsets"],
        dynamic_axes={
            "logmel": {0: "batch", 2: "time"},
            "onsets": {0: "batch", 2: "time"},
        },
    )
    print(f"ONNX model saved to {OUTPUT_PATH}")

    # 7. Validate ONNX
    print("Validating ONNX model...")
    onnx_model = onnx.load(str(OUTPUT_PATH))
    onnx.checker.check_model(onnx_model)
    print("ONNX model is valid.")

    # 8. Simplify
    print("Simplifying ONNX model...")
    simplified, ok = simplify(onnx_model)
    if ok:
        onnx.save(simplified, str(OUTPUT_PATH))
        print("Simplified model saved.")
    else:
        print("WARNING: Simplification failed, keeping original.")

    # 9. Verify numerically with ONNX Runtime
    print("Verifying with ONNX Runtime...")
    import onnxruntime as ort

    session = ort.InferenceSession(str(OUTPUT_PATH))
    ort_input = {session.get_inputs()[0].name: dummy_input.numpy()}
    ort_output = session.run(None, ort_input)[0]

    max_diff = np.max(np.abs(pt_output.numpy() - ort_output))
    print(f"Max absolute difference (PyTorch vs ONNX Runtime): {max_diff:.2e}")
    if max_diff < 1e-4:
        print("PASS — outputs match within tolerance.")
    else:
        print("WARNING — outputs differ more than expected. Investigate.")

    # 10. Report file size
    size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"Final ONNX model size: {size_mb:.1f} MB")
    print("Done.")


if __name__ == "__main__":
    main()