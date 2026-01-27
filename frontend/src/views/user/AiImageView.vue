<template>
  <AppLayout full-bleed>
    <HomeView mode="image" embedded :show-header="false" :allow-home-content="false" />
  </AppLayout>
</template>

<script setup lang="ts">
import AppLayout from '@/components/layout/AppLayout.vue'
import HomeView from '@/views/HomeView.vue'
</script>
