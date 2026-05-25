<template>
  <div class="about-container">
    <iframe
      src="data/assets/about.html"
      title="About Simple Product Pages"
      frameborder="0"
      class="about-iframe"
    ></iframe>
    <noscript>
      <p>To view the full About page, enable JavaScript or <a href="data/assets/about.html" target="_blank" rel="noopener">open it in a new tab</a>.</p>
    </noscript>
  </div>
</template>

<style>
.about-container {
  width: 100%;
}

.about-iframe {
  width: 100%;
  height: calc(100vh - 72px);
  border: 0;
  display: block;
}

@media (min-width: 720px) {
  .about-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
  }
}
</style>
