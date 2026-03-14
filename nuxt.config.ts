// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  css: ["~/assets/main.css"],
  devtools: {enabled: true},
  compatibilityDate: "2025-02-08",
  modules: [
    "@nuxt/ui",
    "@nuxt/image",
    "@vueuse/nuxt",
    "nuxt-auth-utils",
    "@nuxt/eslint",
    "motion-v/nuxt",
  ],
  ui: {
    theme: {
      colors: [
        "primary",
        "secondary",
        "info",
        "success",
        "warning",
        "error",
        "old-orange",
        "old-fuchsia",
        "old-sky",
        "old-amber",
        "old-lime",
        "old-yellow",
        "old-purple",
        "old-teal",
        "old-pink",
        "old-emerald",
        "old-violet",
      ],
    },
  },
  nitro: {
    experimental: {websocket: true},
    esbuild: {options: {target: "es2022"}},
    typescript: {
      tsConfig: {
        compilerOptions: {
          noUncheckedIndexedAccess: false,
        },
      },
    },
  },
  components: [{path: "~/components", pathPrefix: false}],
  runtimeConfig: {
    session: {
      maxAge: 60 * 60 * 24 * 7, // 1 week
      password: process.env.NUXT_SESSION_PASSWORD || "",
    },
  },
  typescript: {
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: false,
        strict: true,
      },
    },
    nodeTsConfig: {
      compilerOptions: {
        strict: true,
      },
    },
  },
});
