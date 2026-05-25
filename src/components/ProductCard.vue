<template>
  <article class="product-card" @click="open">
    <img :src="product.image" :alt="product.name" class="product-image" />
    <h3 class="product-name">{{ product.name }}</h3>
    <button class="product-button" @click.stop="open">Details</button>
  </article>
</template>

<script setup lang="ts">
const props = defineProps<{ product: { name: string; slug: string; image: string; descriptionPath?: string } }>()
const emit = defineEmits<{ (e: 'open', p: any): void }>()

function open() {
  emit('open', props.product)
}
</script>

<style scoped>
.product-card {
  min-width: 0; /* prevent item from forcing horizontal overflow */
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;

  border: 1px solid var(--color-border);
  padding: var(--space-card-padding);
  border-radius: var(--radius-card);
  background: var(--color-card-bg);
  display: flex;
  flex-direction: column;
  gap: var(--space-card-gap);
  cursor: pointer;
  box-shadow: var(--shadow-card);
}
.product-image {
  width: 100%;
  height: var(--card-image-height);
  object-fit: cover;
  border-radius: var(--radius-image);
}
.product-name {
  margin: 0;
  font-size: var(--font-size-product-name);
}
.product-button {
  margin-top: auto;
  align-self: flex-end;
  padding: var(--space-btn-padding);
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: none;
  border-radius: var(--radius-btn);
  cursor: pointer;
}
</style>
