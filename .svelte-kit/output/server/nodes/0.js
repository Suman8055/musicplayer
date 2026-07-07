

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "ssr": false,
  "prerender": false
};
export const universal_id = "src/routes/+layout.js";
export const imports = ["_app/immutable/nodes/0.Dw0WxT5w.js","_app/immutable/chunks/kXES1-6-.js","_app/immutable/chunks/DCytfWcn.js","_app/immutable/chunks/D7pxI8-y.js","_app/immutable/chunks/BtqWobR3.js","_app/immutable/chunks/CmsKOCeN.js"];
export const stylesheets = ["_app/immutable/assets/BackButton.CxH5YLWp.css","_app/immutable/assets/0.DYTWfGDJ.css"];
export const fonts = [];
