<template>
  <div class="rounded-lg border border-slate-200 bg-white p-6">
    <h1 class="text-xl font-semibold">用户详情</h1>
    <p class="mt-2 text-sm text-slate-600">当前用户 ID：{{ id }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const id = computed(() => String(route.params.id ?? ""))
</script>
