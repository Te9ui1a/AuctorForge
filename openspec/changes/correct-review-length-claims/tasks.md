## 1. Validation Coverage

- [x] 1.1 Add regression tests that use real review-report wording from WebUI output and prove false short-length claims are corrected when the server-side count is above the minimum.
- [x] 1.2 Add regression coverage showing unrelated AI-flavor or continuity content remains intact after the length correction.

## 2. Review Length Correction

- [x] 2.1 Expand the review length detection and correction logic so it normalizes the false variants seen in the generated reports, not just the numeric estimate.
- [x] 2.2 Keep the server-side length verification section in the augmented report and ensure it reflects the authoritative narrative count.
- [x] 2.3 Preserve the existing review gate selection logic while correcting only the length-related wording.

## 3. Verification

- [x] 3.1 Run the focused review augmentation test file.
- [x] 3.2 Run the server build or the narrow server test subset covering review augmentation.
