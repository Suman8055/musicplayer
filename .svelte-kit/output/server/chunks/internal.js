import { c as create_ssr_component, a as setContext, v as validate_component, m as missing_component } from "./ssr.js";
import { a as afterUpdate } from "./ssr2.js";
import "./server.js";
const Root = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { stores } = $$props;
  let { page } = $$props;
  let { constructors } = $$props;
  let { components = [] } = $$props;
  let { form } = $$props;
  let { data_0 = null } = $$props;
  let { data_1 = null } = $$props;
  {
    setContext("__svelte__", stores);
  }
  afterUpdate(stores.page.notify);
  if ($$props.stores === void 0 && $$bindings.stores && stores !== void 0) $$bindings.stores(stores);
  if ($$props.page === void 0 && $$bindings.page && page !== void 0) $$bindings.page(page);
  if ($$props.constructors === void 0 && $$bindings.constructors && constructors !== void 0) $$bindings.constructors(constructors);
  if ($$props.components === void 0 && $$bindings.components && components !== void 0) $$bindings.components(components);
  if ($$props.form === void 0 && $$bindings.form && form !== void 0) $$bindings.form(form);
  if ($$props.data_0 === void 0 && $$bindings.data_0 && data_0 !== void 0) $$bindings.data_0(data_0);
  if ($$props.data_1 === void 0 && $$bindings.data_1 && data_1 !== void 0) $$bindings.data_1(data_1);
  let $$settled;
  let $$rendered;
  let previous_head = $$result.head;
  do {
    $$settled = true;
    $$result.head = previous_head;
    {
      stores.page.set(page);
    }
    $$rendered = `  ${constructors[1] ? `${validate_component(constructors[0] || missing_component, "svelte:component").$$render(
      $$result,
      {
        data: data_0,
        params: page.params,
        this: components[0]
      },
      {
        this: ($$value) => {
          components[0] = $$value;
          $$settled = false;
        }
      },
      {
        default: () => {
          return `${validate_component(constructors[1] || missing_component, "svelte:component").$$render(
            $$result,
            {
              data: data_1,
              form,
              params: page.params,
              this: components[1]
            },
            {
              this: ($$value) => {
                components[1] = $$value;
                $$settled = false;
              }
            },
            {}
          )}`;
        }
      }
    )}` : `${validate_component(constructors[0] || missing_component, "svelte:component").$$render(
      $$result,
      {
        data: data_0,
        form,
        params: page.params,
        this: components[0]
      },
      {
        this: ($$value) => {
          components[0] = $$value;
          $$settled = false;
        }
      },
      {}
    )}`} ${``}`;
  } while (!$$settled);
  return $$rendered;
});
let read_implementation = null;
function set_read_implementation(fn) {
  read_implementation = fn;
}
function set_manifest(_) {
}
function set_env(env) {
}
let public_env = {};
function set_private_env(environment) {
}
function set_public_env(environment) {
  public_env = environment;
}
const options = {
  app_template_contains_nonce: false,
  async: false,
  csp: { "mode": "auto", "directives": { "upgrade-insecure-requests": false, "block-all-mixed-content": false }, "reportOnly": { "upgrade-insecure-requests": false, "block-all-mixed-content": false } },
  csrf_check_origin: true,
  csrf_trusted_origins: [],
  embedded: false,
  env_public_prefix: "PUBLIC_",
  env_private_prefix: "",
  hash_routing: false,
  hooks: null,
  // added lazily, via `get_hooks`
  preload_strategy: "modulepreload",
  root: Root,
  service_worker: false,
  service_worker_options: null,
  server_error_boundaries: false,
  templates: {
    app: ({ head, body, assets, nonce, env }) => '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n    <meta name="theme-color" content="#000814" />\n\n    <!-- iOS PWA -->\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n    <meta name="apple-mobile-web-app-title" content="MusicPlayer" />\n\n    <!-- Icons -->\n    <link rel="apple-touch-icon" href="' + assets + '/apple-touch-icon.png" />\n    <link rel="apple-touch-icon" sizes="152x152" href="' + assets + '/icon-152.png" />\n    <link rel="apple-touch-icon" sizes="120x120" href="' + assets + '/icon-120.png" />\n    <link rel="icon" href="' + assets + '/icon-192.png" />\n    <link rel="manifest" href="' + assets + '/manifest.json" />\n\n    <!-- Preconnect: eliminates DNS+TLS round-trip on first API call (~300-800ms on mobile) -->\n    <link rel="preconnect" href="https://jiosaavn-api-sigma-sandy.vercel.app" />\n    <link rel="dns-prefetch" href="https://jiosaavn-api-sigma-sandy.vercel.app" />\n\n    ' + head + '\n  </head>\n  <body data-sveltekit-preload-data="hover">\n    <div style="display: contents">' + body + "</div>\n\n    <script>\n      if ('serviceWorker' in navigator) {\n        navigator.serviceWorker.register('" + assets + `/sw.js', {
          updateViaCache: 'none'
        }).then(reg => {
          // Ask the waiting/installing SW for its version, then notify the app
          function notifyIfNewer(sw) {
            if (!sw) return;
            const mc = new MessageChannel();
            mc.port1.onmessage = e => {
              if (e.data?.type === 'SW_VERSION') {
                window.dispatchEvent(new CustomEvent('sw-update-ready', {
                  detail: { waiting: sw, newVersion: e.data.version }
                }));
              }
            };
            sw.postMessage({ type: 'GET_VERSION' }, [mc.port2]);
          }

          // Already waiting on page load (e.g. user had the tab open during a deploy)
          if (reg.waiting) notifyIfNewer(reg.waiting);

          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller)
                notifyIfNewer(sw);
            });
          });

          // When the new SW takes control, reload to load fresh assets.
          // F2: never reload while audio is actively playing — a gesture-less reload
          // stops the music and iOS won't autoplay afterwards. If a song is playing,
          // defer the reload until it pauses/ends. With skipWaiting() removed from the
          // SW install step, controllerchange now only fires after an explicit user
          // "Update now", so this is a safety net rather than the primary gate.
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            function isAudioPlaying() {
              var a = document.getElementById('audio');
              return !!a && !a.paused && !a.ended && a.currentTime > 0;
            }
            function reloadWhenIdle() {
              if (!isAudioPlaying()) { location.reload(); return; }
              var a = document.getElementById('audio');
              var done = function () { a && a.removeEventListener('pause', done); a && a.removeEventListener('ended', done); location.reload(); };
              a.addEventListener('pause', done);
              a.addEventListener('ended', done);
            }
            setTimeout(reloadWhenIdle, 400);
          });
        }).catch(() => {});
      }
    <\/script>
  </body>
</html>
`,
    error: ({ status, message }) => '<!doctype html>\n<html lang="en">\n	<head>\n		<meta charset="utf-8" />\n		<title>' + message + `</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">` + status + '</span>\n			<div class="message">\n				<h1>' + message + "</h1>\n			</div>\n		</div>\n	</body>\n</html>\n"
  },
  version_hash: "7j8p4v"
};
async function get_hooks() {
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
export {
  set_public_env as a,
  set_read_implementation as b,
  set_env as c,
  set_manifest as d,
  get_hooks as g,
  options as o,
  public_env as p,
  read_implementation as r,
  set_private_env as s
};
