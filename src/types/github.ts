type Workflow = {
    id: number
    owner: string
    repo: string
    name: string
    state: "active" | "deleted" | "disabled_fork" | "disabled_inactivity" | "disabled_manually"
    html_url: string
    runs: WorkflowRun[]
}

type WorkflowRun = {
    id: number
    html_url: string
    conclusion: WorkflowRunConclusion
    status: WorkflowRunStatus
    event: string
    head_branch: string | null
    head_commit_message: string | null
    created_at: string
    triggering_actor: string
}

type WorkflowRunStatus = "queued" | "in_progress" | "waiting" | "completed"

type WorkflowRunConclusion =
    "neutral"
    | "success"
    | "failure"
    | "cancelled"
    | "action_required"
    | "timed_out"
    | "skipped"
    | "stale"
