// test/load-ts-hooks.mjs — resolve hook: map `./x.js` specifiers to `./x.ts`
// so Node's type stripping can run the TypeScript sources directly.
// Used by: node --import ./test/load-ts-hooks.mjs test/smoke.ts
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".js")) {
      const tsSpecifier = specifier.slice(0, -3) + ".ts";
      try {
        return nextResolve(tsSpecifier, context);
      } catch {
        // fall through to the original specifier
      }
    }
    return nextResolve(specifier, context);
  },
});
