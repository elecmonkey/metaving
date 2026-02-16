<template>
  <div class="min-h-screen bg-white text-slate-900">
    <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <nav class="flex items-center gap-4 text-sm">
        <RouterLink to="/" class="underline-offset-4 hover:underline">主页</RouterLink>
        <RouterLink to="/about" class="underline-offset-4 hover:underline">关于</RouterLink>
      </nav>
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import "./styles.css"
</script>
