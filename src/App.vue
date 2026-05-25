<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const BASE_URL = import.meta.env.BASE_URL ?? '/'
const logoCandidates: string[] = [
  `${BASE_URL}data/assets/logo.svg`,
  `${BASE_URL}data/assets/logo.png`,
  `${BASE_URL}data/assets/logo.webp`
]
const logoSrc = ref<string>(logoCandidates[0] || logoCandidates[1] || logoCandidates[2] || '')
let candidateIndex = 0
function onLogoError() {
  candidateIndex++
  if (candidateIndex < logoCandidates.length) {
    logoSrc.value = logoCandidates[candidateIndex] || logoSrc.value
  }
}

const footerHtml = ref<string>('')
const footerVisible = ref<boolean>(false)

let boundScrollTarget: HTMLElement | Window | null = null
const route = useRoute()

function isScrollable(el: HTMLElement | null) {
  return !!el && (el.scrollHeight - el.clientHeight) > 0
}

function findBestScrollTarget() {
  try {
    const grid = document.querySelector('.product-grid') as HTMLElement | null
    if (grid && isScrollable(grid)) return grid
  } catch (e) {}
  return window
}

function handleScroll() {
  const THRESHOLD = 32
  let atBottom = false
  if (boundScrollTarget instanceof HTMLElement) {
    const t = boundScrollTarget as HTMLElement
    atBottom = (t.scrollTop + t.clientHeight) >= (t.scrollHeight - THRESHOLD)
  } else {
    const doc = document.documentElement
    const scrollTop = window.scrollY || doc.scrollTop || 0
    atBottom = (scrollTop + window.innerHeight) >= (doc.scrollHeight - THRESHOLD)
  }
  footerVisible.value = atBottom
}

function attachScrollTarget() {
  const newTarget = findBestScrollTarget()
  if (newTarget === boundScrollTarget) return
  detachScrollTarget()
  boundScrollTarget = newTarget
  if (boundScrollTarget instanceof HTMLElement) {
    boundScrollTarget.addEventListener('scroll', handleScroll, { passive: true })
  } else {
    window.addEventListener('scroll', handleScroll, { passive: true })
  }
  // initial check after layout settles
  setTimeout(handleScroll, 50)
}

function detachScrollTarget() {
  if (!boundScrollTarget) return
  try {
    if (boundScrollTarget instanceof HTMLElement) {
      boundScrollTarget.removeEventListener('scroll', handleScroll)
    } else {
      window.removeEventListener('scroll', handleScroll)
    }
  } catch (e) {}
  boundScrollTarget = null
  footerVisible.value = false
}

onMounted(async () => {
  try {
  const res = await fetch(`${import.meta.env.BASE_URL}data/assets/footer.html`)
    if (res.ok) footerHtml.value = await res.text()
  else footerHtml.value = `<div class="footer-default"><a href="${import.meta.env.BASE_URL}data/assets/footer.html" target="_blank" rel="noopener">Footer</a></div>`
  } catch (e) {
  footerHtml.value = `<div class="footer-default"><a href="${import.meta.env.BASE_URL}data/assets/footer.html" target="_blank" rel="noopener">Footer</a></div>`
  }

  // Load site title from public/data/assets/title.txt (if present)
  try {
    const titleRes = await fetch(`${import.meta.env.BASE_URL}data/assets/title.txt`)
    if (titleRes.ok) {
      const txt = (await titleRes.text())?.trim()
      if (txt) document.title = txt
    }
  } catch (e) {
    // ignore errors — keep existing document.title
  }

  attachScrollTarget()
  window.addEventListener('resize', attachScrollTarget, { passive: true })
})

watch(() => route.fullPath, () => {
  setTimeout(attachScrollTarget, 50)
})

onUnmounted(() => {
  detachScrollTarget()
  window.removeEventListener('resize', attachScrollTarget)
})
</script>

<template>
  <header>
    <RouterLink to="/" class="logo-link" aria-label="Home">
      <img alt="logo" class="logo" :src="logoSrc" width="32" height="32" @error="onLogoError" />
    </RouterLink>
    <div class="wrapper">
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
    </div>
  </header>

  <main class="content">
    <RouterView />
  </main>

  <footer class="site-footer" :class="{ 'is-visible': footerVisible }">
    <div v-if="footerHtml" v-html="footerHtml"></div>
    <noscript>
      <div class="container">
        <a href="data/assets/footer.html" target="_blank" rel="noopener">View footer</a>
      </div>
    </noscript>
  </footer>
</template>

<style scoped>
header {
  --header-height: 72px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  background: var(--color-bg, white);
  padding: var(--space-header-inline);
  box-shadow: var(--shadow-header);
}

.content {
  padding-top: var(--header-height);
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--header-height));
  box-sizing: border-box;
  width: 100%;
}

.logo {
  display: block;
  margin: 0;
}

nav {
  width: 100%;
  font-size: var(--font-size-nav);
  text-align: center;
}

nav a.router-link-exact-active {
  color: var(--color-text);
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
  border: 0;
}

@media (min-width: 1024px) {
  header {
    padding: 0 1rem;
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: center;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  nav {
    text-align: left;
    margin-left: -1rem;
    font-size: 1rem;

    padding: 1rem 0;
    margin-top: 0;
  }

  /* Ensure router content spans both columns of #app when #app is a two-column grid */
  .content {
    grid-column: 1 / -1;
    width: 100%;
  }
}


/* Footer styles */
.site-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1100;
  display: none;
  justify-content: center;
  align-items: center;
  padding: var(--space-footer-inline);
  background: var(--color-footer-bg);
  backdrop-filter: blur(4px);
  border-top: 1px solid var(--color-border);
}

/* Visible state (no animation) */
.site-footer.is-visible {
  display: flex;
}

/* inner container */
.site-footer .container {
  max-width: var(--container-max-width);
  margin: 0 auto;
  padding: 0 1rem;
  box-sizing: border-box;
  text-align: center;
}

.site-footer a { color: var(--color-accent); text-decoration: none; }

@media (min-width: 1024px) { .site-footer { padding: 1rem 0; } }

</style>
