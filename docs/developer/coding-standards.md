# Coding Standards

## Python (FastAPI)
- Use explicit type hints where practical.
- Keep handlers small and focused.
- Avoid hidden global state; use environment configuration.
- Use `HTTPException` for expected errors.

## JavaScript UI
- Keep the UI dependency-free unless justified.
- Prefer simple fetch-based API calls.
- Escape user-provided values when rendering HTML.

## Dockerfiles
- Use minimal base images.
- Pin versions for reproducibility.
- Expose only the required internal port.

## Logging Standards
- Log build summaries and errors.
- Avoid logging sensitive content.

## Error Handling Rules
- Fail fast on invalid input.
- Do not partially write or publish output if a build fails.
- Prefer explicit error messages over silent failures.
