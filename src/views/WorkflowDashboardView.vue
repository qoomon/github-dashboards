<template>
  <div class="dashboard">
    <!-- Sidebar -->
    <Sidebar
        :repo-keys="filteredRepoKeys"
        :repo-status="repoStatusMap"
        @update:filters="onFiltersChange"
    />

    <!-- Main content -->
    <main class="dashboard-main">
      <!-- Top bar -->
      <div class="topbar">
        <div class="topbar-title">
          <svg viewBox="0 0 16 16" width="20" height="20" class="topbar-logo">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>
          </svg>
          GitHub Actions Dashboard
        </div>

        <div class="topbar-meta" v-if="!loading">
          <span>{{ filteredRepoKeys.length }} repos</span>
          <span>·</span>
          <span>{{ totalWorkflows }} workflows</span>
        </div>

        <div v-if="loading" class="topbar-loading">
          <span class="loading-spinner"></span> Loading…
        </div>

        <div v-if="error" class="topbar-error">{{ error }}</div>
      </div>

      <!-- Repo sections -->
      <div class="repo-list" v-if="!loading">
        <RepoSection
            v-for="repoKey in filteredRepoKeys"
            :key="repoKey"
            :id="`repo-${repoKey}`"
            :owner="repoKey.split('/')[0]"
            :repo="repoKey.split('/')[1]"
            :workflows="groupedWorkflows[repoKey]"
        />
        <div v-if="filteredRepoKeys.length === 0" class="empty-state">
          No repositories match the current filters.
        </div>
      </div>

      <!-- Skeleton placeholders while loading -->
      <div class="repo-list" v-else>
        <div v-for="n in 4" :key="n" class="skeleton-card"></div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import Sidebar, {type DashboardFilters} from '@/components/Sidebar.vue'
import RepoSection from '@/components/RepoSection.vue'

// ── State ────────────────────────────────────────────────────────────────────

const workflows = ref<Workflow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const filters = ref<DashboardFilters>({hideSuccess: false, hideStale: false})
const STALE_DAYS = 14

// ── Derived data ──────────────────────────────────────────────────────────────

/** Workflows keyed by "owner/repo". */
const groupedWorkflows = computed<Record<string, Workflow[]>>(() => {
  return workflows.value.reduce((acc, wf) => {
    const key = `${wf.owner}/${wf.repo}`
    ;(acc[key] ??= []).push(wf)
    return acc
  }, {} as Record<string, Workflow[]>)
})

const allRepoKeys = computed(() => Object.keys(groupedWorkflows.value))

/** Aggregate status (worst-case) for a repo key. */
const repoStatusMap = computed<Record<string, 'success' | 'failure' | 'in_progress' | 'neutral'>>(() => {
  const map: Record<string, 'success' | 'failure' | 'in_progress' | 'neutral'> = {}
  for (const key of allRepoKeys.value) {
    const latestRuns = groupedWorkflows.value[key].map((wf) => wf.runs[0]).filter(Boolean)
    if (latestRuns.some((r) => r.status === 'in_progress' || r.status === 'queued')) {
      map[key] = 'in_progress'
    } else if (latestRuns.some((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out')) {
      map[key] = 'failure'
    } else if (latestRuns.every((r) => r.conclusion === 'success' || r.conclusion === 'neutral')) {
      map[key] = 'success'
    } else {
      map[key] = 'neutral'
    }
  }
  return map
})

const staleThreshold = computed(() => new Date(Date.now() - 1000 * 60 * 60 * 24 * STALE_DAYS))

const filteredRepoKeys = computed(() => {
  return allRepoKeys.value.filter((key) => {
    const wfs = groupedWorkflows.value[key]
    // Find the genuinely most-recent run across all workflows in this repo
    const latestRun = wfs
        .flatMap((w) => w.runs)
        .reduce<WorkflowRun | null>((best, run) =>
            !best || new Date(run.created_at) > new Date(best.created_at) ? run : best
        , null)

    if (filters.value.hideStale && latestRun) {
      if (new Date(latestRun.created_at) < staleThreshold.value) return false
    }

    if (filters.value.hideSuccess) {
      if (repoStatusMap.value[key] === 'success') return false
    }

    return true
  })
})

const totalWorkflows = computed(() =>
    filteredRepoKeys.value.reduce((sum, k) => sum + groupedWorkflows.value[k].length, 0)
)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const data = await fetch(`/api/workflows?historyDays=${STALE_DAYS}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    workflows.value = data
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load workflows'
  } finally {
    loading.value = false
  }
})

function onFiltersChange(val: DashboardFilters) {
  filters.value = val
}
</script>

<style scoped>
.dashboard {
  display: flex;
  min-height: 100vh;
  background: var(--primer-bg-subtle);
  color: var(--primer-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
}

.dashboard-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ── Top bar ── */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--primer-bg);
  border-bottom: 1px solid var(--primer-border);
}

.topbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: var(--primer-text-primary);
}

.topbar-logo {
  fill: var(--primer-text-primary);
  flex-shrink: 0;
}

.topbar-meta {
  display: flex;
  gap: 6px;
  font-size: 13px;
  color: var(--primer-text-muted);
  margin-left: auto;
}

.topbar-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--primer-text-muted);
  margin-left: auto;
}

.topbar-error {
  font-size: 13px;
  color: var(--primer-status-failure);
  margin-left: auto;
}

/* ── Repo list ── */
.repo-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--primer-text-muted);
  font-size: 14px;
}

/* ── Skeleton ── */
.skeleton-card {
  height: 80px;
  background: var(--primer-bg);
  border: 1px solid var(--primer-border);
  border-radius: var(--primer-radius);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}

/* ── Loading spinner ── */
.loading-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--primer-border);
  border-top-color: var(--primer-text-secondary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
