import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    paths: {
      base: process.env.BASE_PATH || '/musicplayer'
    },
    appDir: '_app',
    serviceWorker: {
      register: false
    }
  }
};

export default config;
