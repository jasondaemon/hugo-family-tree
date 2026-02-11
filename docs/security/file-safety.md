# File Safety

## Page Bundle Isolation
Each person is stored as a Hugo page bundle under:
- `src/content/family/<bundle>/index.md`

This keeps content scoped per person and avoids cross-file coupling.

## Upload Validation Expectations
- Validate file types and sizes in the admin UI before writing.
- Store images in the same bundle directory when possible.

## Path Traversal Protections
- The admin service should only write under `src/content/family`.
- Inputs used in file paths must be normalized and sanitized.

## Atomic Build Safety
The builder writes to `/public_tmp` and only swaps to `/public` when the build completes. This prevents partial or broken public states.
