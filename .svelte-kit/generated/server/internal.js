
import root from '../root.svelte';
import { set_building, set_prerendering } from '$app/env/internal';
import { set_assets } from '$app/paths/internal/server';
import { set_manifest, set_read_implementation } from '__sveltekit/server';
import { set_env } from '__sveltekit/env';
import { set_private_env, set_public_env } from '../../../node_modules/@sveltejs/kit/src/runtime/shared-server.js';

export const options = {
	app_template_contains_nonce: false,
	async: false,
	csp: {"mode":"auto","directives":{"upgrade-insecure-requests":false,"block-all-mixed-content":false},"reportOnly":{"upgrade-insecure-requests":false,"block-all-mixed-content":false}},
	csrf_check_origin: true,
	csrf_trusted_origins: [],
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hash_routing: false,
	hooks: null, // added lazily, via `get_hooks`
	preload_strategy: "modulepreload",
	root,
	service_worker: false,
	service_worker_options: null,
	server_error_boundaries: false,
	templates: {
		app: ({ head, body, assets, nonce, env }) => "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\" />\n    <meta name=\"theme-color\" content=\"#000814\" />\n\n    <!-- iOS PWA -->\n    <meta name=\"apple-mobile-web-app-capable\" content=\"yes\" />\n    <meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\" />\n    <meta name=\"apple-mobile-web-app-title\" content=\"MusicPlayer\" />\n\n    <!-- Icons -->\n    <link rel=\"apple-touch-icon\" href=\"" + assets + "/apple-touch-icon.png\" />\n    <link rel=\"apple-touch-icon\" sizes=\"152x152\" href=\"" + assets + "/icon-152.png\" />\n    <link rel=\"apple-touch-icon\" sizes=\"120x120\" href=\"" + assets + "/icon-120.png\" />\n    <link rel=\"icon\" href=\"" + assets + "/icon-192.png\" />\n    <link rel=\"manifest\" href=\"" + assets + "/manifest.json\" />\n\n    <!-- Preconnect: eliminates DNS+TLS round-trip on first API call (~300-800ms on mobile) -->\n    <link rel=\"preconnect\" href=\"https://jiosaavn-api-sigma-sandy.vercel.app\" />\n    <link rel=\"dns-prefetch\" href=\"https://jiosaavn-api-sigma-sandy.vercel.app\" />\n\n    " + head + "\n  </head>\n  <body data-sveltekit-preload-data=\"hover\">\n    <div style=\"display: contents\">" + body + "</div>\n\n    <script>\n      if ('serviceWorker' in navigator) {\n        navigator.serviceWorker.register('" + assets + "/sw.js', {\n          updateViaCache: 'none'\n        }).then(reg => {\n          // Ask the waiting/installing SW for its version, then notify the app\n          function notifyIfNewer(sw) {\n            if (!sw) return;\n            const mc = new MessageChannel();\n            mc.port1.onmessage = e => {\n              if (e.data?.type === 'SW_VERSION') {\n                window.dispatchEvent(new CustomEvent('sw-update-ready', {\n                  detail: { waiting: sw, newVersion: e.data.version }\n                }));\n              }\n            };\n            sw.postMessage({ type: 'GET_VERSION' }, [mc.port2]);\n          }\n\n          // Already waiting on page load (e.g. user had the tab open during a deploy)\n          if (reg.waiting) notifyIfNewer(reg.waiting);\n\n          reg.addEventListener('updatefound', () => {\n            const sw = reg.installing;\n            if (!sw) return;\n            sw.addEventListener('statechange', () => {\n              if (sw.state === 'installed' && navigator.serviceWorker.controller)\n                notifyIfNewer(sw);\n            });\n          });\n\n          // When the new SW takes control, reload to load fresh assets.\n          // F2: never reload while audio is actively playing — a gesture-less reload\n          // stops the music and iOS won't autoplay afterwards. If a song is playing,\n          // defer the reload until it pauses/ends. With skipWaiting() removed from the\n          // SW install step, controllerchange now only fires after an explicit user\n          // \"Update now\", so this is a safety net rather than the primary gate.\n          navigator.serviceWorker.addEventListener('controllerchange', () => {\n            function isAudioPlaying() {\n              var a = document.getElementById('audio');\n              return !!a && !a.paused && !a.ended && a.currentTime > 0;\n            }\n            function reloadWhenIdle() {\n              if (!isAudioPlaying()) { location.reload(); return; }\n              var a = document.getElementById('audio');\n              var done = function () { a && a.removeEventListener('pause', done); a && a.removeEventListener('ended', done); location.reload(); };\n              a.addEventListener('pause', done);\n              a.addEventListener('ended', done);\n            }\n            setTimeout(reloadWhenIdle, 400);\n          });\n        }).catch(() => {});\n      }\n    </script>\n  </body>\n</html>\n",
		error: ({ status, message }) => "<!doctype html>\n<html lang=\"en\">\n\t<head>\n\t\t<meta charset=\"utf-8\" />\n\t\t<title>" + message + "</title>\n\n\t\t<style>\n\t\t\tbody {\n\t\t\t\t--bg: white;\n\t\t\t\t--fg: #222;\n\t\t\t\t--divider: #ccc;\n\t\t\t\tbackground: var(--bg);\n\t\t\t\tcolor: var(--fg);\n\t\t\t\tfont-family:\n\t\t\t\t\tsystem-ui,\n\t\t\t\t\t-apple-system,\n\t\t\t\t\tBlinkMacSystemFont,\n\t\t\t\t\t'Segoe UI',\n\t\t\t\t\tRoboto,\n\t\t\t\t\tOxygen,\n\t\t\t\t\tUbuntu,\n\t\t\t\t\tCantarell,\n\t\t\t\t\t'Open Sans',\n\t\t\t\t\t'Helvetica Neue',\n\t\t\t\t\tsans-serif;\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t\tjustify-content: center;\n\t\t\t\theight: 100vh;\n\t\t\t\tmargin: 0;\n\t\t\t}\n\n\t\t\t.error {\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t\tmax-width: 32rem;\n\t\t\t\tmargin: 0 1rem;\n\t\t\t}\n\n\t\t\t.status {\n\t\t\t\tfont-weight: 200;\n\t\t\t\tfont-size: 3rem;\n\t\t\t\tline-height: 1;\n\t\t\t\tposition: relative;\n\t\t\t\ttop: -0.05rem;\n\t\t\t}\n\n\t\t\t.message {\n\t\t\t\tborder-left: 1px solid var(--divider);\n\t\t\t\tpadding: 0 0 0 1rem;\n\t\t\t\tmargin: 0 0 0 1rem;\n\t\t\t\tmin-height: 2.5rem;\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t}\n\n\t\t\t.message h1 {\n\t\t\t\tfont-weight: 400;\n\t\t\t\tfont-size: 1em;\n\t\t\t\tmargin: 0;\n\t\t\t}\n\n\t\t\t@media (prefers-color-scheme: dark) {\n\t\t\t\tbody {\n\t\t\t\t\t--bg: #222;\n\t\t\t\t\t--fg: #ddd;\n\t\t\t\t\t--divider: #666;\n\t\t\t\t}\n\t\t\t}\n\t\t</style>\n\t</head>\n\t<body>\n\t\t<div class=\"error\">\n\t\t\t<span class=\"status\">" + status + "</span>\n\t\t\t<div class=\"message\">\n\t\t\t\t<h1>" + message + "</h1>\n\t\t\t</div>\n\t\t</div>\n\t</body>\n</html>\n"
	},
	version_hash: "1s1d13r"
};

export async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let handleValidationError;
	let init;
	

	let reroute;
	let transport;
	

	return {
		handle,
		handleFetch,
		handleError,
		handleValidationError,
		init,
		reroute,
		transport
	};
}

export { set_assets, set_building, set_env, set_manifest, set_prerendering, set_private_env, set_public_env, set_read_implementation };
