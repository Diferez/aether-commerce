import packageJson from "../package.json";

// The version genuinely bundled into this Worker right now - reading it
// from this package's own package.json (not an external registry lookup)
// means it can never drift from what's actually running, unlike a value
// baked in at some other build step.
export const deployedPackageVersion: string = packageJson.version;
