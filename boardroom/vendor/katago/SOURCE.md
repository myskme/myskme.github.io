# Browser KataGo in MYSKME

The game uses real KataGo trained neural networks, native input features and game rules, compiled to single-thread WebAssembly. The search is the browser port's bounded PUCT implementation, **not** the full native KataGo AsyncBot. There is no rating or professional-rank claim. No hosted AI API is used, and no game records are sent to an analysis service.

## Source and models

- Original: https://github.com/lightvector/KataGo
- Browser port: https://github.com/saigo-online/katago-webgpu
- Pinned revision: `d5ad1c0423dba989c60a2f06b1848e7eec2b5941`
- Source archive: https://github.com/saigo-online/katago-webgpu/archive/d5ad1c0423dba989c60a2f06b1848e7eec2b5941.tar.gz
- Local changes: `third_party/katago-runtime.patch`; the deployed copy is `dist/vendor/katago/source.patch`.
- Unmodified trained models from the source's `cpp/tests/models/`:
  - `g170-b6c96-s175395328-d26788732.bin.gz` → `model-b6.bin.gz` (3,827,339 bytes)
  - `g170e-b10c128-s1141046784-d204142634.bin.gz` → `model-b10.bin.gz` (11,138,361 bytes)

`dist/vendor/katago/build.json` records SHA-256 and byte size for the shipped glue, WASM and models, and the source patch hash. The Worker verifies cached and freshly downloaded binary/model bytes before using them. `NOTICE.txt` in the same directory contains the full applicable license and contributor notices, as well as links to dependency source. It is linked from the in-game engine explanation.

## Rebuild

Use Python 3, Emscripten SDK **6.0.13**, Eigen **3.4.0**, and a checkout at the pinned source revision. Place this file at `third_party/KATAGO.md`, the patch at `third_party/katago-runtime.patch`, and the build script at `scripts/build-katago.py` in a project directory with `dist/`.

```sh
MYSKME_KATAGO_SOURCE=/path/to/katago-webgpu \
MYSKME_EMSDK=/path/to/emsdk \
MYSKME_EIGEN=/path/to/eigen-3.4.0 \
python scripts/build-katago.py
```

Eigen source: https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.gz

Emscripten source: https://github.com/emscripten-core/emscripten/tree/6.0.13

The script checks the source revision, applies or verifies the patch, compiles the port's `cpp/kataeval/sources.txt`, links WebGPU and Eigen backends and copies the two models. Eigen is unmodified and built with `EIGEN_MPL2_ONLY`. Builds use SIMD, exceptions, Asyncify, 64 MB initial and 512 MB maximum linear memory; they do not require threads or SharedArrayBuffer. Normal game play uses far less than that maximum. Compile warnings about deprecated literal-operator whitespace come from unchanged dependency headers.

## Port fixes

The patch addresses the boundary between the original game and the port:

1. Raw backend values are side-to-move logits and unscaled score outputs. Apply the model's postprocessing multipliers, convert to white perspective, and disable no-result under area scoring and positional superko. The bridge returns white point estimates, not raw 1/20 point values.
2. Match no-suicide Chinese area scoring, positional superko and 7.5 komi. Reject illegal history moves instead of silently skipping them.
3. Encode a resumed-scoring marker in move color bit 256, reset ending flags and consecutive ending passes while retaining ko history. The actual color remains in the low bits.
4. Use exact native final scores for ended positions, and do not expand terminal search nodes.
5. Allocate an owned ownership array in `NNOutput`; the upstream port assigned a caller-owned output pointer that its destructor subsequently freed. This corrupted repeated evaluation. The bridge now copies the postprocessed map to the caller's buffer.
6. Limit batches to four to keep short searches responsive.

## Product budgets and review semantics

| Mode | Model | Visit cap | Search time budget |
| --- | --- | ---: | ---: |
| Easy | b6c96 | 3 | 400 ms |
| Medium | b6c96 | 20 | 1,400 ms |
| Hard | b10c128 | 48 | 3,200 ms |
| Quick review | b6c96 | 12 per refined node | 900 ms per refined node |
| Deep review | b10c128 | 32 per refined node | 2,200 ms per refined node |

Both limits apply; initialization and a pending NN batch may extend wall time. Easy mode samples among three legal high-policy moves to offer more variety. Hard uses a larger model and budget; it is not a certified rank. The UI reports actual completed visits, backend and search time. WebGPU is attempted when an adapter is available; the same trained models run with Eigen on CPU otherwise. Runtime errors expose retry and an explicit lightweight-engine switch.

Go teaching review reconstructs the entire history, takes up to 14 or 24 candidate moves using phase coverage and verified local captures/atari, evaluates before/after positions, then searches up to six selected candidates. The best suggested move and played move are compared using their after-position NN score estimates from the mover's perspective. The reported point difference is an estimate, not the game's scored result or a claim of exhaustive maximum-loss ranking. At most three actual insights are saved. Human-vs-computer games review the human's moves; local games review both sides. The sampled coverage and model are visible. Gomoku review uses rules-verified immediate-win/defense facts and bounded alpha-beta search; it does not invent Go-style point or win-rate scores.

Only completed reports are cached with a history/configuration fingerprint. Cancellation, errors and stale results never overwrite a saved report. Teaching variations use the existing isolated branch mechanism, preserving the original record and SGF.

## Validation

`npm test` includes actual shipped-WASM execution, hash verification, 9/13/19-line loading, b6/b10 search, board/capture reconstruction, illegal ko and suicide, resumed scoring, terminal point units and komi perspective, plus rule and review semantics tests. Browser checks cover fast/deep reports, profile selection, user colors, progress and cache reuse, failure/retry, cancellation/stale results, original/reference/trial navigation, old records, and responsive layouts. CPU and a software WebGPU adapter are tested in Chromium, with matching b6 9-line point estimates within 0.00001; GPU availability and speed depend on the user's hardware/browser.
