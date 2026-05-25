<template>
  <div class="scroll-indicator" aria-hidden="false">
    <div class="scroll-track" ref="trackRef" @pointerdown.prevent="onTrackPointerDown">
      <div class="scroll-progress" :style="{ height: percent + '%' }"></div>
      <button
        ref="thumbRef"
        class="scroll-thumb"
        @pointerdown.prevent="onThumbPointerDown"
        aria-label="Scroll"
        :aria-hidden="false"
        :style="{ top: percent + '%' }"
      >
        <img :src="iconSrc" alt="scroll button" draggable="false" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, isRef } from 'vue'
import type { Ref } from 'vue'

const props = defineProps<{
  targetRef?: Ref<HTMLElement | null> | HTMLElement | null
  icon?: string
  iconActive?: string
}>()

// Base paths without extension. Defaults: try /data first (public/ is served from root), then legacy /public/data
const baseUrl = import.meta.env.BASE_URL ?? '/'
const DEFAULT_BASES = [baseUrl + 'data/assets/scroll', baseUrl + 'public/data/assets/scroll']
const DEFAULT_BASES_ACTIVE = [baseUrl + 'data/assets/scroll_react', baseUrl + 'public/data/assets/scroll_react']
const EXT_ORDER = ['.png', '.svg', '.jpg', '.jpeg', '.webp']

const trackRef = ref<HTMLElement | null>(null)
const thumbRef = ref<HTMLElement | null>(null)
const percent = ref(0)
const visible = ref(true)

// resolved URLs (may be updated during runtime if fallbacks are found)
const resolvedIcon = ref<string>(props.icon || (DEFAULT_BASES[0] + '.svg'))
const resolvedActiveIcon = ref<string>(props.iconActive || (DEFAULT_BASES_ACTIVE[0] + '.svg'))
const iconSrc = ref<string>(resolvedIcon.value)

let dragging = false
let pointerDownTime = 0
let pointerMoved = false
let moveHandler: ((e: PointerEvent) => void) | null = null
let upHandler: ((e: PointerEvent) => void) | null = null
let boundScrollTarget: HTMLElement | Window | null = null
let rafId: number | null = null

function rafTick() {
  measureScroll()
  rafId = requestAnimationFrame(rafTick)
}

function startRaf() {
  if (rafId == null) rafTick()
}

function stopRaf() {
  if (rafId != null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

function unwrapTargetRef(tr?: Ref<HTMLElement|null> | HTMLElement | null): HTMLElement | null {
  if (!tr) return null
  if (isRef(tr)) return tr.value ?? null
  return tr instanceof HTMLElement ? tr : null
}

function resolveTarget() {
  const unwrapped = unwrapTargetRef(props.targetRef)
  return unwrapped instanceof HTMLElement ? unwrapped : (document.scrollingElement || document.documentElement)
}

function buildCandidates(provided?: string, base?: string | string[]) {
  const exts = EXT_ORDER
  const candidates: string[] = []
  if (provided) {
    if (/\.(png|svg|jpg|jpeg|webp)$/i.test(provided)) {
      candidates.push(provided)
      const baseNoExt = provided.replace(/\.(png|svg|jpg|jpeg|webp)$/i, '')
      for (const ext of exts) {
        const alt = baseNoExt + ext
        if (!candidates.includes(alt)) candidates.push(alt)
      }
    } else {
      for (const ext of exts) candidates.push(provided + ext)
    }
  } else if (base) {
    if (Array.isArray(base)) {
      for (const b of base) {
        for (const ext of exts) {
          const candidate = b + ext
          if (!candidates.includes(candidate)) candidates.push(candidate)
        }
      }
    } else {
      for (const ext of exts) candidates.push(base + ext)
    }
  }
  return [...new Set(candidates)]
}

function testImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

async function pickAvailable(candidates: string[]) {
  for (const c of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const ok = await testImage(c)
      if (ok) return c
    } catch (err) {
      // ignore and try next
    }
  }
  // fallback to first candidate (may 404, but keeps behavior predictable)
  return candidates[0] || ''
}

async function initIcons() {
  const normalCandidates = buildCandidates(props.icon, DEFAULT_BASES)
  const activeCandidates = buildCandidates(props.iconActive, DEFAULT_BASES_ACTIVE)
  try {
    const [norm, act] = await Promise.all([pickAvailable(normalCandidates), pickAvailable(activeCandidates)])
    if (norm) resolvedIcon.value = norm
    if (act) resolvedActiveIcon.value = act
    iconSrc.value = resolvedIcon.value
  } catch (e) {
    // fall back to existing resolved values
    iconSrc.value = resolvedIcon.value
  }
}

function measureScroll() {
  // If bound target is window but a grid becomes scrollable later, prefer that dynamically
  try {
    const grid = document.querySelector('.product-grid') as HTMLElement | null
    if ((!(boundScrollTarget instanceof HTMLElement) || (boundScrollTarget instanceof HTMLElement && (boundScrollTarget.scrollHeight - boundScrollTarget.clientHeight) <= 0)) && grid && (grid.scrollHeight - grid.clientHeight) > 0) {
      // reattach to grid when it becomes scrollable
      attachScrollTarget(grid)
      return
    }
  } catch (e) {
    // ignore DOM exceptions
  }

  // Prefer the bound scroll target when available
  let scrollTop = 0
  let scrollable = 0
  if (boundScrollTarget instanceof HTMLElement) {
    const t = boundScrollTarget as HTMLElement
    scrollTop = t.scrollTop
    scrollable = t.scrollHeight - t.clientHeight
  } else {
    const doc = document.documentElement
    scrollTop = window.scrollY || doc.scrollTop || 0
    scrollable = doc.scrollHeight - doc.clientHeight
  }
  percent.value = scrollable > 0 ? (scrollTop / scrollable) * 100 : 0
  visible.value = scrollable > 0
}

function setScrollFromPercent(p: number) {
  const clamped = Math.max(0, Math.min(100, p))
  if (boundScrollTarget instanceof HTMLElement) {
    const t = boundScrollTarget as HTMLElement
    const scrollable = t.scrollHeight - t.clientHeight
    t.scrollTop = Math.round((clamped / 100) * scrollable)
  } else {
    const doc = document.documentElement
    const scrollHeight = doc.scrollHeight - doc.clientHeight
    window.scrollTo({ top: Math.round((clamped / 100) * scrollHeight), behavior: 'auto' })
  }
  percent.value = clamped
}

function onThumbPointerDown(e: PointerEvent) {
  pointerDownTime = Date.now()
  pointerMoved = false
  dragging = true
  iconSrc.value = resolvedActiveIcon.value || resolvedIcon.value

  // try to capture the pointer on the thumb for consistent dragging
  try {
    if (thumbRef.value && 'setPointerCapture' in thumbRef.value) {
      ;(thumbRef.value as HTMLElement).setPointerCapture((e as any).pointerId)
    }
  } catch (err) {}

  moveHandler = onPointerMove
  upHandler = onPointerUp
  window.addEventListener('pointermove', moveHandler, { passive: false })
  window.addEventListener('pointerup', upHandler)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  e.preventDefault()
  pointerMoved = true
  if (!trackRef.value) return
  const rect = trackRef.value.getBoundingClientRect()
  const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
  const p = (y / rect.height) * 100
  setScrollFromPercent(p)
}

function onPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  if (moveHandler) window.removeEventListener('pointermove', moveHandler)
  if (upHandler) window.removeEventListener('pointerup', upHandler)
  moveHandler = null
  upHandler = null

  // try to release pointer capture
  try {
    if (thumbRef.value && 'releasePointerCapture' in thumbRef.value) {
      ;(thumbRef.value as HTMLElement).releasePointerCapture((e as any).pointerId)
    }
  } catch (err) {}

  const clickDuration = Date.now() - pointerDownTime
  const CLICK_THRESHOLD = 220
  if (!pointerMoved && clickDuration <= CLICK_THRESHOLD) {
    iconSrc.value = resolvedActiveIcon.value || resolvedIcon.value
    if (boundScrollTarget instanceof HTMLElement) {
      boundScrollTarget.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    setTimeout(() => {
      iconSrc.value = resolvedIcon.value
    }, 600)
  } else {
    iconSrc.value = resolvedIcon.value
  }
}

function onTrackPointerDown(e: PointerEvent) {
  if (!trackRef.value) return
  const rect = trackRef.value.getBoundingClientRect()
  const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
  const p = (y / rect.height) * 100
  setScrollFromPercent(p)
}

// helper to attach/detach scroll listener to given element (or window)
function attachScrollTarget(el: HTMLElement | null) {
  // Determine best scroll target in this order:
  // 1. explicit element passed in
  // 2. .product-grid element if present and scrollable
  // 3. first element with overflow-y auto/scroll that is scrollable
  // 4. window as fallback
  let newTarget: HTMLElement | Window

  if (el instanceof HTMLElement) {
    newTarget = el
  } else {
    const grid = document.querySelector('.product-grid') as HTMLElement | null
    if (grid && grid.scrollHeight - grid.clientHeight > 0) {
      newTarget = grid
    } else {
      // search for any scrollable element
      let found: HTMLElement | null = null
      const all = Array.from(document.querySelectorAll<HTMLElement>('*'))
      for (const node of all) {
        try {
          const style = window.getComputedStyle(node)
          if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && (node.scrollHeight - node.clientHeight > 0)) {
            found = node
            break
          }
        } catch (e) {
          // ignore
        }
      }
      newTarget = found || window
    }
  }

  if (boundScrollTarget === newTarget) return

  // remove previous
  if (boundScrollTarget) {
    try {
      if (boundScrollTarget instanceof HTMLElement) {
        boundScrollTarget.removeEventListener('scroll', measureScroll)
      } else {
        window.removeEventListener('scroll', measureScroll)
      }
    } catch (e) {}
  }

  boundScrollTarget = newTarget
  if (boundScrollTarget instanceof HTMLElement) {
    boundScrollTarget.addEventListener('scroll', measureScroll, { passive: true })
  } else {
    window.addEventListener('scroll', measureScroll, { passive: true })
  }
  measureScroll()
}

onMounted(() => {
  initIcons().catch(() => {})
  const initialEl = unwrapTargetRef(props.targetRef)
  attachScrollTarget(initialEl)
  startRaf()
})

// Rebind when targetRef changes
watch(() => (isRef(props.targetRef) ? props.targetRef.value : props.targetRef), (newEl) => {
  attachScrollTarget(newEl ?? null)
}, { immediate: true })

onUnmounted(() => {
  if (boundScrollTarget) {
    try {
      if (boundScrollTarget instanceof HTMLElement) boundScrollTarget.removeEventListener('scroll', measureScroll)
      else window.removeEventListener('scroll', measureScroll)
    } catch (e) {}
    boundScrollTarget = null
  }
  stopRaf()
  if (moveHandler) window.removeEventListener('pointermove', moveHandler)
  if (upHandler) window.removeEventListener('pointerup', upHandler)
})

watch(() => [props.icon, props.iconActive], () => {
  initIcons().catch(() => {})
})
</script>
<style scoped>
.scroll-indicator {
  top: calc(var(--header-height) * 2);
  right: 8px;
  display: flex;
  align-items: flex-start;
  height: 80%;
  z-index: 99999;
  pointer-events: auto;
  user-select: none;
}

.scroll-track {
  width: 48px;
  height: 100%;
  background: transparent;
  border-radius: var(--radius-pill);
  position: relative;
  overflow: visible;
  display: block;
}

.scroll-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 0%;
  background: var(--gradient-scroll-progress);
  transition: height var(--duration-scroll) linear;
}

.scroll-thumb {
  position: absolute;
  left: 50%;
  transform: translate(-50%);
  top: 0%;
  border: none;
  background: transparent;
  padding: var(--space-scroll-thumb-padding);
  cursor: pointer;
  touch-action: none;
  border-radius: var(--radius-pill);
  z-index: 100000; /* ensure it sits above everything */
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-divider-weak);
}

.scroll-thumb img {
  width: var(--size-scroll-icon);
  height: var(--size-scroll-icon);
  display: block;
}


@media (max-width: 640px) {
  .scroll-track { width: 40px }
  .scroll-thumb img { width: 32px; height: 32px }
}
</style>
