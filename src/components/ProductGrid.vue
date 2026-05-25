<template>
  <section class="product-section">
    <div class="product-inner">
      <div class="product-layout">
        <div class="product-grid" ref="scrollEl">
          <ProductCard
            v-for="p in products"
            :key="p.slug"
            :product="p"
            @open="openProduct"
          />
        </div>
      </div>

      <aside class="product-indicator" v-show="!selected" aria-hidden="false">
        <ScrollIndicator :targetRef="scrollEl" />
      </aside>
    </div>

    <ProductModal v-if="selected" :product="selected" @close="closeModal" />
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import ProductCard from './ProductCard.vue'
import ProductModal from './ProductModal.vue'
import ScrollIndicator from './ScrollIndicator.vue'

type Product = { name: string; slug: string; image: string; descriptionPath?: string }

const products = ref<Product[]>([])
const selected = ref<Product | null>(null)

const router = useRouter()
const route = useRoute()

const scrollEl = ref<HTMLElement | null>(null)

async function loadProducts() {
  try {
    const mod = await import('@/generated-products')
    products.value = mod.default || []
    return
  } catch (e) {
    // ignore
  }

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/products.json`)
    if (res.ok) {
      products.value = await res.json()
      return
    }
  } catch (e) {
    // ignore
  }

  products.value = [
    {
      name: 'Example Product',
      slug: 'example-product',
      image: `${import.meta.env.BASE_URL}data/product1/image.svg`,
      descriptionPath: `${import.meta.env.BASE_URL}data/product1/description.html`
    }
  ]
}

onMounted(async () => {
  await loadProducts()
})

watch(
  [products, () => route.params.slug],
  ([ps, slug]) => {
    const slugStr = slug ? String(slug) : null
    if (!slugStr) {
      selected.value = null
      return
    }
    const p = (ps as Product[]).find((x) => x.slug === slugStr)
    if (p) selected.value = p
  },
  { immediate: true }
)

function openProduct(p: Product) {
  selected.value = p
  router.push({ name: 'product', params: { slug: p.slug } }).catch(() => {})
}

function closeModal() {
  selected.value = null
  router.push({ name: 'home' }).catch(() => {})
}
</script>

<style scoped>
.product-section {
  position: fixed;
  top: var(--header-height);
  bottom: 0;
  left: 0;
  right: 0;
  overflow: hidden;
}

.product-inner {
  position: relative;
  height: 100%;
  max-width: 1920px;
  margin: 0 auto;
  padding: var(--space-page-padding);
  box-sizing: border-box;
  display: flex;
  gap: var(--space-section-gap);
  align-items: stretch;
}

.product-layout {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.product-grid {
  height: 100%;
  overflow-y: auto;
  display: grid;
  gap: var(--space-section-gap);
  margin: 0;
  padding: 0;
  padding-right: 80px;
  box-sizing: border-box;
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 90%), 1fr));
  align-items: start;
  width: 100%;
}

.product-indicator {
  width: 64px;
  position: absolute;
  right: 8px;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8px;
  z-index: 1500;
  pointer-events: auto;
}
</style>
