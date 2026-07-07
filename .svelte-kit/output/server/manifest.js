export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "musicplayer/_app",
	assets: new Set([".nojekyll","404.html","apple-touch-icon.png","icon-120.png","icon-152.png","icon-192.png","icon-512.png","manifest.json","sw.js"]),
	mimeTypes: {".html":"text/html",".png":"image/png",".json":"application/json",".js":"text/javascript"},
	_: {
		client: {start:"_app/immutable/entry/start.CVzr0dHW.js",app:"_app/immutable/entry/app.aA7Wslla.js",imports:["_app/immutable/entry/start.CVzr0dHW.js","_app/immutable/chunks/erXBz17Z.js","_app/immutable/chunks/kXES1-6-.js","_app/immutable/chunks/BtqWobR3.js","_app/immutable/entry/app.aA7Wslla.js","_app/immutable/chunks/CmsKOCeN.js","_app/immutable/chunks/kXES1-6-.js","_app/immutable/chunks/DCytfWcn.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
