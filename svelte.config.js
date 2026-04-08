/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  compilerOptions: {
    // Use legacy mode (Svelte 4 syntax) — components use export let, on:click, $: reactive
    // statements. Runes migration can happen incrementally in a future pass.
    runes: false,
  },
}
