// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: "2025-02-08",
  modules: [
    "@nuxt/ui",
    "@nuxt/image",
    "@vueuse/nuxt",
    "@hypernym/nuxt-anime",
    "nuxt-auth-utils",
    "@nuxt/eslint",
  ],
  nitro: {
    experimental: {
      websocket: true,
    },
    esbuild: {
      options: {
        target: "es2022",
      },
    },
  },
  anime: {
    composables: true,
  },
  components: [{ path: "~/components", pathPrefix: false }],
  runtimeConfig: {
    session: {
      maxAge: 60 * 60 * 24 * 7, // 1 week
      password: process.env.NUXT_SESSION_PASSWORD || "",
    },
  },
});
