<template>
  <section class="repo-section">
    <!-- Repository header -->
    <header class="repo-header" @click="expanded = !expanded">
      <span class="repo-expand-icon" :class="{collapsed: !expanded}">
        <svg viewBox="0 0 16 16" width="14" height="14" style="fill:currentColor;">
          <path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/>
        </svg>
      </span>

      <!-- Repo icon -->
      <svg viewBox="0 0 16 16" width="16" height="16" class="repo-icon">
        <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/>
      </svg>

      <a :href="`https://github.com/${owner}/${repo}`"
         target="_blank" rel="noopener noreferrer"
         class="repo-name"
         @click.stop>
        <span class="repo-owner">{{ owner }}/</span><span>{{ repo }}</span>
      </a>

      <!-- Status summary pills -->
      <div class="repo-status-pills">
        <span v-if="counts.in_progress > 0" class="pill pill-warning">
          {{ counts.in_progress }} running
        </span>
        <span v-if="counts.failure > 0" class="pill pill-failure">
          {{ counts.failure }} failing
        </span>
        <span v-if="counts.success > 0 && counts.failure === 0 && counts.in_progress === 0" class="pill pill-success">
          all passing
        </span>
      </div>

      <span class="repo-run-count">{{ totalRuns }} run{{ totalRuns !== 1 ? 's' : '' }}</span>
    </header>

    <!-- Run rows -->
    <div v-if="expanded" class="repo-runs">
      <!-- Group by workflow name -->
      <template v-for="wf in workflows" :key="wf.id">
        <div class="workflow-label">
          <a :href="wf.html_url" target="_blank" rel="noopener noreferrer" class="workflow-label-link">
            {{ wf.name }}
          </a>
          <span v-if="wf.state !== 'active'" class="workflow-state-badge">{{ wf.state.replace('disabled_', '') }}</span>
        </div>
        <RunItem
            v-for="run in wf.runs.slice(0, maxRunsPerWorkflow)"
            :key="run.id"
            :run="{...run, workflow_name: wf.name}"
        />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import {computed, ref, type PropType} from 'vue'
import RunItem from '@/components/RunItem.vue'

const props = defineProps({
  owner: {type: String, required: true},
  repo: {type: String, required: true},
  workflows: {type: Array as PropType<Workflow[]>, required: true},
  maxRunsPerWorkflow: {type: Number, default: 5},
})

const expanded = ref(true)

const allRuns = computed(() =>
    props.workflows.flatMap((wf) => wf.runs)
)

const totalRuns = computed(() => allRuns.value.length)

const counts = computed(() => {
  const c = {success: 0, failure: 0, in_progress: 0, other: 0}
  // Count the latest run per workflow
  props.workflows.forEach((wf) => {
    const run = wf.runs[0]
    if (!run) return
    if (run.status === 'in_progress' || run.status === 'queued') {
      c.in_progress++
    } else if (run.conclusion === 'success' || run.conclusion === 'neutral') {
      c.success++
    } else if (run.conclusion === 'failure' || run.conclusion === 'timed_out') {
      c.failure++
    } else {
      c.other++
    }
  })
  return c
})
</script>

<style scoped>
.repo-section {
  background: var(--primer-bg);
  border: 1px solid var(--primer-border);
  border-radius: var(--primer-radius);
  overflow: hidden;
}

.repo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: var(--primer-bg-subtle);
  border-bottom: 1px solid var(--primer-border);
}

.repo-header:hover {
  background: #eaeff2;
}

.repo-expand-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: var(--primer-text-muted);
  transition: transform 0.15s;
}

.repo-expand-icon.collapsed {
  transform: rotate(-90deg);
}

.repo-icon {
  flex-shrink: 0;
  fill: var(--primer-text-secondary);
}

.repo-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--primer-text-primary);
  text-decoration: none;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo-name:hover {
  color: var(--primer-link);
  text-decoration: underline;
}

.repo-owner {
  color: var(--primer-text-secondary);
  font-weight: 400;
}

.repo-status-pills {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.pill {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 2em;
  border: 1px solid transparent;
}

.pill-success {
  color: var(--primer-status-success);
  background: #dafbe1;
  border-color: #b0e6c3;
}

.pill-failure {
  color: var(--primer-status-failure);
  background: #ffebe9;
  border-color: #ffc1bb;
}

.pill-warning {
  color: var(--primer-status-warning);
  background: #fff8c5;
  border-color: #e3b341;
}

.repo-run-count {
  font-size: 12px;
  color: var(--primer-text-muted);
  flex-shrink: 0;
}

.repo-runs {
  display: flex;
  flex-direction: column;
}

.workflow-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 3px;
  background: var(--primer-bg-subtle);
  border-top: 1px solid var(--primer-border);
}

.workflow-label-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--primer-text-secondary);
  text-decoration: none;
}

.workflow-label-link:hover {
  color: var(--primer-link);
  text-decoration: underline;
}

.workflow-state-badge {
  font-size: 10px;
  color: var(--primer-text-muted);
  background: var(--primer-bg);
  border: 1px solid var(--primer-border);
  border-radius: 2em;
  padding: 0 5px;
}
</style>
