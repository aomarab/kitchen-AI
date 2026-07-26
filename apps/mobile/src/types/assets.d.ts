// Metro resolves static asset imports (fonts, images) to a numeric module id.
// Declared here so `.ttf` faces can be pulled in with ES imports instead of
// `require()`, which the shared ESLint config forbids.
declare module '*.ttf' {
  const value: number;
  export default value;
}
