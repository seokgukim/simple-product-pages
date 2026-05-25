<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal">
      <button class="modal-close" @click="close">×</button>
      <div class="modal-body">
        <img :src="product.image" :alt="product.name" class="modal-image" />
        <div class="modal-content">
          <h2>{{ product.name }}</h2>
          <div class="product-description" v-html="description"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ product: { name: string; slug: string; image: string; descriptionPath?: string } }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const description = ref('<p>Loading…</p>')

async function load() {
  if (!props.product?.descriptionPath) {
    description.value = '<p>No description available.</p>'
    return
  }
  try {
    const res = await fetch(props.product.descriptionPath)
    if (res.ok) {
      description.value = await res.text()
    } else {
      description.value = '<p>Description not found.</p>'
    }
  } catch (e) {
    description.value = '<p>Error loading description.</p>'
  }
}

watch(
  () => props.product,
  () => {
    description.value = '<p>Loading…</p>'
    load()
  },
  { immediate: true }
)

function close() {
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.modal {
  background: var(--color-modal-bg);
  max-width: 900px;
  width: 95%;
  padding: var(--space-modal-padding);
  border-radius: var(--radius-modal);
  position: relative;
}
.modal-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  font-size: var(--font-size-modal-close);
  cursor: pointer;
}
.modal-body {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--space-modal-gap);
}
.modal-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-image);
}
.product-description {
  overflow: auto;
  max-height: 60vh;
}
@media (max-width: 600px) {
  .modal-body {
    grid-template-columns: 1fr;
  }
}
</style>
