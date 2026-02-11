# Build Pipeline

## Hugo Invocation
The builder runs Hugo with explicit `--source` and `--destination` paths:
- `--source /src`
- `--destination /public_tmp`

Optional flags can be injected via `HUGO_ARGS`.

## Build Triggers
- Primary trigger: `POST /build` on the builder service.
- Admin calls builder directly over the internal Docker network.

## Safe Publish Logic
1. Create a clean `/public_tmp` directory.
2. Run Hugo. If Hugo fails, keep `/public` unchanged.
3. Write a build manifest/log to the build output.
4. Swap directories using rename on the same filesystem.

## Rollback Strategy
- `/public_prev` holds the previous build after a successful swap.
- If a swap error occurs, the builder attempts to restore `/public` from `/public_prev`.
- Because the public site is read-only, accidental corruption is minimized.
