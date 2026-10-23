---
'@corsenai/corsen-context': patch
'@corsenai/corsen-context-nextjs': patch
'@corsenai/corsen-context-astro': patch
---

Point the `import` condition of each package's `exports` map at the shipped `index.d.mts` declarations. Under `moduleResolution: node16`/`nodenext`, an ESM consumer previously resolved the CommonJS `index.d.ts` for the ESM entry (the "masquerading as CJS" problem reported by Are The Types Wrong); the `require` condition keeps `index.d.ts`.
