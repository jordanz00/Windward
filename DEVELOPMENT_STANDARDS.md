# Windward development standards

Hard rule: **application load + WebGPU shader/pipeline success are non-negotiable.** A JS build alone never marks work done. Ocean / underwater feature work stays frozen until a verified baseline and this gate are green.

## Before every WGSL (or shader-adjacent) ship

1. Edit source.
2. Run `node source/wgsl-gate.mjs` (static reserved-id / `?:` scan + WebGPU `createShaderModule` + `getCompilationInfo` on every assembled module + smoke load).
3. JS build via `node source/build.mjs` (the gate runs build when needed).
4. Browser load must reach Enter with no reserved-keyword, invalid-character, or pipeline/bind-group errors.
5. Smoke ocean + underwater when those systems are in the baseline.
6. Only then push Origin and GitHub Pages.

## Ban list inside WGSL

- JS ternary `?:` inside shader template strings
- Reserved identifiers as user names (`filter`, `active`, … — full WGSL reserved list)
- Invalid Unicode / bad template escapes
- Type-incompatible `select`
- Bind-group / pipeline layouts that omit resources an entry point uses

JS `.filter()`, Web Audio `filter` nodes, and WebGPU sampler/texture filtering APIs are not WGSL identifiers — leave them alone.

## Temporary load restores

Disabling a feature (e.g. grass shadows) to restore Pages is allowed only as a hotfix, must be called out in the commit, and must be restored under the gate afterward.

## Commands

```bash
node source/build.mjs          # pack index.html
node source/wgsl-gate.mjs      # static + WebGPU compile + smoke load (required)
node source/wgsl-gate.mjs --static-only   # reserved-id / ?: scan only
```

Pre-commit: `.githooks/pre-commit` runs the static half of the gate; enable with `git config core.hooksPath .githooks`.
