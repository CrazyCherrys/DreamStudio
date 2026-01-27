<template>
  <div class="landing-shell relative min-h-screen overflow-hidden">
    <div class="landing-backdrop" aria-hidden="true">
      <div class="landing-glow landing-glow-left"></div>
      <div class="landing-glow landing-glow-right"></div>
      <div class="landing-glow landing-glow-bottom"></div>
      <div class="landing-grid"></div>
      <div class="landing-stars"></div>
    </div>

    <header class="relative z-10 pt-6">
      <div class="landing-container">
        <div class="landing-inner">
          <nav class="flex flex-wrap items-center justify-between gap-4">
            <router-link to="/" class="flex items-center gap-3">
              <div class="landing-logo">
                <img :src="siteLogo || '/logo.png'" :alt="siteName" class="h-full w-full object-contain" />
              </div>
              <span class="text-base font-semibold tracking-wide text-white/90">{{ siteName }}</span>
            </router-link>

            <div class="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <router-link v-for="link in navLinks" :key="link.to" :to="link.to" class="landing-nav-link">
                {{ link.label }}
              </router-link>
            </div>

            <div class="flex items-center gap-2">
              <div class="landing-locale">
                <LocaleSwitcher />
              </div>
              <router-link v-if="isAuthenticated" :to="dashboardPath" class="landing-user">
                <span class="landing-user-avatar">{{ userInitial }}</span>
                <span class="hidden sm:inline">{{ t('landing.nav.userCenter') }}</span>
              </router-link>
              <router-link v-else to="/login" class="landing-login">
                <Icon name="login" size="sm" />
                {{ t('home.login') }}
              </router-link>
            </div>
          </nav>
        </div>
      </div>
    </header>

    <main class="relative z-10 pb-20 pt-16 sm:pt-20">
      <div class="landing-container">
        <div class="landing-inner">
          <section class="flex flex-col items-center text-center">
            <p class="landing-kicker landing-reveal" style="animation-delay: 100ms;">
              {{ t('landing.hero.kicker') }}
            </p>
            <h1 class="landing-title landing-reveal" style="animation-delay: 180ms;">
              {{ t('landing.hero.titleLine1') }}
            </h1>
            <h2 class="landing-title-secondary landing-reveal" style="animation-delay: 240ms;">
              {{ t('landing.hero.titleLine2Prefix') }}
              <span class="landing-gradient-text">{{ t('landing.hero.titleLine2Highlight') }}</span>
              {{ t('landing.hero.titleLine2Suffix') }}
            </h2>
            <p class="landing-subtitle landing-reveal" style="animation-delay: 320ms;">
              {{ t('landing.hero.subtitle') }}
            </p>

            <div class="landing-search landing-reveal" style="animation-delay: 400ms;">
              <div class="landing-search-icon">
                <Icon name="sparkles" size="sm" />
              </div>
              <input
                v-model="heroPrompt"
                type="text"
                class="landing-search-input"
                :placeholder="t('landing.hero.inputPlaceholder')"
                :aria-label="t('landing.hero.inputPlaceholder')"
                @keyup.enter="startCreate"
              />
              <button
                type="button"
                class="landing-search-action"
                :aria-label="t('landing.hero.ctaPrimary')"
                @click="startCreate"
              >
                <Icon name="arrowRight" size="sm" />
              </button>
            </div>

            <div class="landing-cta landing-reveal" style="animation-delay: 480ms;">
              <button type="button" class="landing-primary" @click="startCreate">
                <Icon name="sparkles" size="sm" />
                {{ t('landing.hero.ctaPrimary') }}
              </button>
              <router-link to="/gallery" class="landing-secondary">
                <Icon name="grid" size="sm" />
                {{ t('landing.hero.ctaSecondary') }}
              </router-link>
            </div>
          </section>

          <section class="landing-explore landing-reveal" style="animation-delay: 560ms;">
            <h3 class="landing-explore-title">
              {{ t('landing.explore.title') }}
            </h3>
            <p class="landing-explore-subtitle">
              {{ t('landing.explore.subtitle') }}
            </p>
            <div class="landing-tags">
              <button
                v-for="tag in hotTags"
                :key="tag"
                type="button"
                class="landing-tag"
                @click="applyTag(tag)"
              >
                <Icon name="fire" size="xs" />
                {{ tag }}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore, useAuthStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Icon from '@/components/icons/Icon.vue'

const router = useRouter()
const { t, tm } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()

const heroPrompt = ref('')

const siteName = computed(
  () => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'DreamStudio'
)
const siteLogo = computed(() => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '')
const isAuthenticated = computed(() => authStore.isAuthenticated)
const dashboardPath = computed(() => (authStore.isAdmin ? '/admin/dashboard' : '/dashboard'))

const userInitial = computed(() => {
  const user = authStore.user
  if (!user) return ''
  if (user.username) return user.username.slice(0, 1).toUpperCase()
  if (user.email) return user.email.slice(0, 1).toUpperCase()
  return ''
})

const navLinks = computed(() => [
  { to: '/ai-image', label: t('nav.aiImage') },
  { to: '/ai-video', label: t('nav.aiVideo') },
  { to: '/redink', label: t('nav.redink') },
  { to: '/gallery', label: t('gallery.nav.gallery') }
])

const hotTags = computed<string[]>(() => {
  const value = (tm as (key: string) => unknown)('landing.explore.tags')
  return Array.isArray(value) ? (value as string[]) : []
})

const startCreate = () => {
  router.push('/ai-image')
}

const applyTag = (tag: string) => {
  heroPrompt.value = tag
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap');

.landing-shell {
  --landing-bg: #0b1020;
  --landing-grid: rgba(148, 163, 184, 0.12);
  --landing-line: rgba(148, 163, 184, 0.24);
  --landing-accent: #7dd3fc;
  --landing-accent-strong: #38bdf8;
  --landing-accent-deep: #0ea5e9;
  --landing-glow-a: rgba(14, 116, 144, 0.35);
  --landing-glow-b: rgba(59, 130, 246, 0.35);
  --landing-glow-c: rgba(14, 165, 233, 0.25);
  --landing-star: rgba(255, 255, 255, 0.5);
  color: #e2e8f0;
  font-family: 'Space Grotesk', 'Noto Sans SC', sans-serif;
  background: radial-gradient(1200px 600px at 50% -10%, rgba(14, 165, 233, 0.2), transparent 70%),
    linear-gradient(180deg, rgba(6, 11, 20, 0.92), rgba(9, 13, 26, 0.98));
}

.landing-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.landing-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(48px);
  opacity: 0.7;
}

.landing-glow-left {
  top: -220px;
  left: -200px;
  height: 520px;
  width: 520px;
  background: radial-gradient(circle at 30% 30%, var(--landing-glow-b), transparent 70%);
}

.landing-glow-right {
  right: -240px;
  top: 80px;
  height: 520px;
  width: 520px;
  background: radial-gradient(circle at 60% 40%, var(--landing-glow-a), transparent 70%);
}

.landing-glow-bottom {
  bottom: -240px;
  left: 20%;
  height: 520px;
  width: 520px;
  background: radial-gradient(circle at 50% 50%, var(--landing-glow-c), transparent 70%);
}

.landing-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(to right, var(--landing-grid) 1px, transparent 1px),
    linear-gradient(to bottom, var(--landing-grid) 1px, transparent 1px);
  background-size: 56px 56px;
  opacity: 0.4;
}

.landing-stars {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--landing-star) 1px, transparent 1px);
  background-size: 120px 120px;
  opacity: 0.25;
}

.landing-container {
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 0 1.5rem;
}

.landing-inner {
  width: 100%;
  max-width: 1120px;
}

.landing-logo {
  height: 38px;
  width: 38px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  padding: 6px;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.35);
}

.landing-nav-link {
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0.35rem 0.8rem;
  font-weight: 500;
  color: rgba(226, 232, 240, 0.78);
  transition: all 0.2s ease;
}

.landing-nav-link:hover {
  border-color: var(--landing-line);
  color: #ffffff;
  background: rgba(15, 23, 42, 0.35);
}

.landing-user,
.landing-login {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--landing-line);
  padding: 0.35rem 0.85rem;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.45);
  font-size: 0.75rem;
  font-weight: 600;
  transition: all 0.2s ease;
}

.landing-user:hover,
.landing-login:hover {
  border-color: rgba(125, 211, 252, 0.6);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.35);
}

.landing-user-avatar {
  display: inline-flex;
  height: 28px;
  width: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--landing-accent), var(--landing-accent-deep));
  color: #0b1020;
  font-size: 0.7rem;
  font-weight: 700;
}

.landing-locale :deep(button) {
  border-radius: 999px;
  border: 1px solid var(--landing-line);
  padding: 0.35rem 0.85rem;
  color: rgba(226, 232, 240, 0.85);
  background: rgba(15, 23, 42, 0.45);
  font-size: 0.75rem;
  font-weight: 600;
}

.landing-locale :deep(button:hover) {
  background: rgba(15, 23, 42, 0.65);
  color: #ffffff;
}

.landing-locale :deep(svg) {
  color: rgba(148, 163, 184, 0.8);
}

.landing-kicker {
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.35em;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.8);
}

.landing-title {
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 700;
  line-height: 1.1;
  color: #f8fafc;
}

.landing-title-secondary {
  margin-top: 0.6rem;
  font-size: clamp(1.8rem, 3.6vw, 3rem);
  font-weight: 600;
  color: rgba(226, 232, 240, 0.92);
}

.landing-gradient-text {
  background: linear-gradient(120deg, var(--landing-accent), var(--landing-accent-deep));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.landing-subtitle {
  margin-top: 1rem;
  max-width: 640px;
  font-size: 1rem;
  color: rgba(226, 232, 240, 0.72);
}

.landing-search {
  margin-top: 2.4rem;
  display: flex;
  width: min(720px, 100%);
  align-items: center;
  gap: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--landing-line);
  padding: 0.6rem 0.7rem;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.4);
}

.landing-search:focus-within {
  border-color: rgba(125, 211, 252, 0.6);
  box-shadow: 0 18px 46px rgba(56, 189, 248, 0.25);
}

.landing-search-icon {
  display: inline-flex;
  height: 34px;
  width: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: var(--landing-accent);
}

.landing-search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 0.95rem;
  color: #f8fafc;
  outline: none;
}

.landing-search-input::placeholder {
  color: rgba(148, 163, 184, 0.9);
}

.landing-search-action {
  display: inline-flex;
  height: 38px;
  width: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: none;
  background: #ffffff;
  color: #0b1020;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.landing-search-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.35);
}

.landing-cta {
  margin-top: 2rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
}

.landing-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  border: none;
  padding: 0.75rem 1.8rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0b1020;
  background: linear-gradient(120deg, var(--landing-accent), var(--landing-accent-deep));
  box-shadow: 0 18px 36px rgba(56, 189, 248, 0.3);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.landing-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 22px 40px rgba(56, 189, 248, 0.38);
}

.landing-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--landing-line);
  padding: 0.75rem 1.6rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.55);
  transition: all 0.2s ease;
}

.landing-secondary:hover {
  border-color: rgba(125, 211, 252, 0.6);
  color: #ffffff;
}

.landing-explore {
  margin-top: 5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.85rem;
}

.landing-explore-title {
  font-size: 1.6rem;
  font-weight: 600;
  background: linear-gradient(120deg, #bae6fd, #38bdf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.landing-explore-subtitle {
  max-width: 520px;
  color: rgba(148, 163, 184, 0.9);
}

.landing-tags {
  margin-top: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
}

.landing-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.85);
  background: rgba(15, 23, 42, 0.45);
  transition: all 0.2s ease;
}

.landing-tag:hover {
  border-color: rgba(125, 211, 252, 0.6);
  color: #ffffff;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.3);
}

.landing-reveal {
  animation: landing-reveal 0.8s ease both;
}

@keyframes landing-reveal {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .landing-container {
    padding: 0 1.1rem;
  }

  .landing-search {
    flex-direction: column;
    align-items: stretch;
    border-radius: 24px;
  }

  .landing-search-action {
    align-self: flex-end;
  }

  .landing-title-secondary {
    line-height: 1.2;
  }
}
</style>
