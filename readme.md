# TS-Build

Ship your TypeScript projects as *native* ES modules today. TS-Build stitches a handful of OSS projects to provide
a simple CLI to ship your TypeScript as ES modules within both Node and modern browsers today, while still supporting 
good ole' CommonJS.

## Features

- Compile Node packages in CJS and ESM
- Generate TypeScript Declarations
- Generates package.json for your ES modules for easy imports
  - `main`
  - `module`
  - `types`
  - `typings`
  - `exports`
- Sourcemaps
- Update your gitignore
  
## Future Ideas

- [ ] Compile Deno packages in TS and ESM
- [ ] Investigate Browser builds
- [ ] Investigate Watch Mode
