<template>
  <a :href="run.html_url" target="_blank" rel="noopener noreferrer" class="run-item">
    <!-- Status icon -->
    <span class="run-status-icon" :title="statusLabel">
      <svg v-if="statusIcon === 'success'" viewBox="0 0 16 16" width="16" height="16" :style="{fill: 'var(--primer-status-success)'}">
        <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z"/>
      </svg>
      <svg v-else-if="statusIcon === 'failure'" viewBox="0 0 16 16" width="16" height="16" :style="{fill: 'var(--primer-status-failure)'}">
        <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z"/>
      </svg>
      <svg v-else-if="statusIcon === 'in_progress'" viewBox="0 0 16 16" width="16" height="16" class="spin" :style="{fill: 'var(--primer-status-warning)'}">
        <path d="M3.05 3.05a7 7 0 1 1 9.9 9.9 7 7 0 0 1-9.9-9.9Z" fill="none" stroke="var(--primer-status-warning)" stroke-width="2" opacity=".4"/>
        <path d="M14 8a6 6 0 0 0-6-6V0a8 8 0 0 1 8 8h-2Z"/>
      </svg>
      <svg v-else viewBox="0 0 16 16" width="16" height="16" :style="{fill: 'var(--primer-status-neutral)'}">
        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
      </svg>
    </span>

    <!-- Commit message -->
    <span class="run-commit" :title="run.head_commit_message ?? undefined">
      {{ shortMessage }}
    </span>

    <!-- Branch badge -->
    <span v-if="run.head_branch" class="run-branch">
      <svg viewBox="0 0 16 16" width="12" height="12" style="fill:currentColor;flex-shrink:0;">
        <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/>
      </svg>
      {{ run.head_branch }}
    </span>

    <!-- Event badge -->
    <span class="run-event">{{ run.event }}</span>

    <!-- Relative time -->
    <span class="run-time" :title="run.created_at">{{ relativeTime }}</span>
  </a>
</template>

<script setup lang="ts">
import {computed, type PropType} from 'vue'

const props = defineProps({
  run: {
    type: Object as PropType<WorkflowRun & { workflow_name?: string }>,
    required: true,
  },
})

const statusIcon = computed(() => {
  const {status, conclusion} = props.run
  if (status === 'in_progress' || status === 'queued') return 'in_progress'
  if (status === 'completed') {
    if (conclusion === 'success' || conclusion === 'neutral') return 'success'
    if (conclusion === 'failure' || conclusion === 'timed_out') return 'failure'
  }
  return 'neutral'
})

const statusLabel = computed(() => {
  const {status, conclusion} = props.run
  if (status !== 'completed') return status.replace('_', ' ')
  return conclusion ?? status
})

const shortMessage = computed(() => {
  const msg = props.run.head_commit_message ?? props.run.workflow_name ?? ''
  const first = msg.split('\n')[0]
  return first.length > 72 ? first.slice(0, 69) + '…' : first
})

const relativeTime = computed(() => {
  const diff = Date.now() - new Date(props.run.created_at).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
})
</script>

<style scoped>
.run-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--primer-border);
  color: var(--primer-text-primary);
  text-decoration: none;
  font-size: 13px;
  transition: background 0.1s;
  min-width: 0;
}

.run-item:last-child {
  border-bottom: none;
}

.run-item:hover {
  background: var(--primer-bg-subtle);
}

.run-status-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.run-commit {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--primer-text-primary);
  font-weight: 500;
  min-width: 0;
}

.run-branch {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--primer-text-secondary);
  background: var(--primer-bg-subtle);
  border: 1px solid var(--primer-border);
  border-radius: 2em;
  padding: 1px 7px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-event {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--primer-text-muted);
  background: var(--primer-bg-subtle);
  border: 1px solid var(--primer-border);
  border-radius: 2em;
  padding: 1px 7px;
}

.run-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--primer-text-muted);
  white-space: nowrap;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}
</style>
