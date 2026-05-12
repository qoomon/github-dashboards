<template>
  <aside class="sidebar">
    <div class="sidebar-section">
      <h3 class="sidebar-heading">Filters</h3>

      <label class="sidebar-option">
        <input type="checkbox" v-model="filters.hideSuccess" @change="emit('update:filters', {...filters})"/>
        <span>Hide passing</span>
      </label>

      <label class="sidebar-option">
        <input type="checkbox" v-model="filters.hideStale" @change="emit('update:filters', {...filters})"/>
        <span>Hide stale</span>
      </label>
    </div>

    <div class="sidebar-section">
      <h3 class="sidebar-heading">Repositories</h3>
      <ul class="sidebar-repo-list">
        <li v-for="repoKey in repoKeys" :key="repoKey">
          <a :href="`#repo-${repoKey}`" class="sidebar-repo-link">
            <span :class="['sidebar-repo-dot', dotClass(repoKey)]"></span>
            {{ repoKey }}
          </a>
        </li>
      </ul>
    </div>
  </aside>
</template>

<script setup lang="ts">
import {reactive, type PropType} from 'vue'

export interface DashboardFilters {
  hideSuccess: boolean
  hideStale: boolean
}

const props = defineProps({
  repoKeys: {type: Array as PropType<string[]>, required: true},
  repoStatus: {type: Object as PropType<Record<string, 'success' | 'failure' | 'in_progress' | 'neutral'>>, required: true},
})

const emit = defineEmits<{
  (e: 'update:filters', val: DashboardFilters): void
}>()

const filters = reactive<DashboardFilters>({
  hideSuccess: false,
  hideStale: false,
})

function dotClass(repoKey: string): string {
  const status = props.repoStatus[repoKey] ?? 'neutral'
  return `dot-${status}`
}
</script>

<style scoped>
.sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background: var(--primer-bg);
  border-right: 1px solid var(--primer-border);
  min-height: 100vh;
}

.sidebar-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--primer-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
}

.sidebar-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--primer-text-primary);
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
}

.sidebar-option input[type='checkbox'] {
  accent-color: var(--primer-link);
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.sidebar-repo-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.sidebar-repo-link {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--primer-text-primary);
  text-decoration: none;
  padding: 3px 6px;
  border-radius: var(--primer-radius);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-repo-link:hover {
  background: var(--primer-bg-subtle);
  color: var(--primer-link);
}

.sidebar-repo-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-success    { background: var(--primer-status-success); }
.dot-failure    { background: var(--primer-status-failure); }
.dot-in_progress { background: var(--primer-status-warning); }
.dot-neutral    { background: var(--primer-status-neutral); }
</style>
