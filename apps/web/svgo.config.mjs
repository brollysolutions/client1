// Conservative SVGO pass for hand-coded/Storyset illustrations. Keeps viewBox
// (Next.js Image needs it) and avoids aggressive ID/style rewrites that could
// break art referencing its own gradient/clip-path IDs.
const config = {
  multipass: true,
  js2svg: { indent: 2, pretty: false },
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          // removeViewBox is already disabled by default in preset-default;
          // no override needed. Keep IDs stable and path precision conservative.
          cleanupIds: { minify: false, remove: false },
          convertPathData: { floatPrecision: 2 },
        },
      },
    },
  ],
};

export default config;
