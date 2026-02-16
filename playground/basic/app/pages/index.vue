<template>
  <div class="rounded-lg border border-slate-200 bg-white p-6">
    <h1 class="text-xl font-semibold">主页</h1>
    <p class="mt-2 text-sm text-slate-600">这是 metaving SSR 示例主页。</p>
    <div class="mt-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        @click="fetchHealth"
      >
        请求服务端数据
      </button>
      <button
        type="button"
        class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        @click="fetchUser"
      >
        请求动态 API
      </button>
      <RouterLink
        to="/user/42"
        class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        打开动态路由
      </RouterLink>
      <p v-if="status" class="text-sm text-emerald-600">{{ status }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"

const status = ref("")

const fetchHealth = async () => {
  status.value = "请求中..."
  try {
    const res = await fetch("/api/health")
    const data = await res.json()
    status.value = JSON.stringify(data)
  } catch (error) {
    status.value = error instanceof Error ? error.message : "请求失败"
  }
}

const fetchUser = async () => {
  status.value = "请求中..."
  try {
    const res = await fetch("/api/user/42")
    const data = await res.json()
    status.value = JSON.stringify(data)
  } catch (error) {
    status.value = error instanceof Error ? error.message : "请求失败"
  }
}
</script>
