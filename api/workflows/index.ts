import {VercelRequest, VercelResponse} from '@vercel/node'
import StatusCodes from 'http-status-codes'
import {firstValue, run} from "../_lib/utils.js";
import {Octokit} from "@octokit/rest"
import {paginateRest} from "@octokit/plugin-paginate-rest";
import {idTokenVerifier} from "../_lib/jwt.js";
import {getUser} from "../_lib/user-store.js";

const DEVELOPMENT = true

export default async (request: VercelRequest, response: VercelResponse) => run(async () => {
    switch (request.method) {
        case 'GET':
            return await handleGet(request, response)
        default:
            return response.status(StatusCodes.METHOD_NOT_ALLOWED)
                .send({error: StatusCodes.getStatusText(StatusCodes.METHOD_NOT_ALLOWED)})
    }
}).catch(error => {
    console.error("[ERROR]", error)
    return response.status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send({error: StatusCodes.getStatusText(StatusCodes.INTERNAL_SERVER_ERROR)})
})


async function handleGet(request: VercelRequest, response: VercelResponse) {
    const idToken = firstValue(request.cookies['id_token'])
    if (!idToken) {
        return response.status(StatusCodes.UNAUTHORIZED)
    }
    const callerIdentity = idTokenVerifier(idToken)
    // TODO handle error
    const user = await getUser(callerIdentity.user)
    if (!user) {
        return response.status(StatusCodes.UNAUTHORIZED)
    }
    console.log('user:', user.login)

    const historyDays = parseInt(firstValue(request.query.historyDays) ?? '14', 10) || 14

    if (DEVELOPMENT) {
        return response.status(StatusCodes.OK)
            .json(mockedResponse())
    }

    const octokit = new (Octokit.plugin(paginateRest))({auth: user.accessToken.access_token})

    const userRepositories = await listUserRepositories({
        per_page: 100,
    }).then((repositories) => {
        console.info('repository count:', repositories.length)
        return repositories
    }).then((repositories) => Promise.all(repositories.map(async (repository) => {
        return {
            ...repository,
            workflows: await listRepoWorkflows(repository)
        }
    })))

    console.log(userRepositories.map((repo) => repo.repo))
    const responseBody = userRepositories.flatMap((repo) => {
        return repo.workflows
            .filter((workflow) => workflow.runs.length > 0)
            .map((workflow) => ({
                owner: repo.owner,
                repo: repo.repo,
                ...workflow,
            }))
    })

    return response.status(StatusCodes.OK)
        .json(responseBody)

    async function listRepoWorkflows(repo: { owner: string, repo: string }) {
        return await octokit.paginate(octokit.actions.listRepoWorkflows, {
            ...repo,
            per_page: 100,
            headers: {'X-GitHub-Api-Version': '2022-11-28'}
        })
            // filter ancient workflows
            .then((workflows) => workflows
                // workflow.state: "active" | "deleted" | "disabled_fork" | "disabled_inactivity" | "disabled_manually"
                .filter((workflow) => workflow.state !== "deleted")
            )
            .then((workflows) => Promise.all(workflows.map(async (workflow) => ({
                    id: workflow.id,
                    name: workflow.name,
                    state: workflow.state,
                    html_url: `https://github.com/${repo.owner}/${repo.repo}/actions/workflows/${workflow.path.replace(/^.*\//, '')}`, // workflow.html_url,
                    runs: await listWorkflowRuns(repo, workflow.id)
                })
            )))
    }

    async function listWorkflowRuns(repo: { owner: string, repo: string }, workflow_id: number) {
        let runs: any = await octokit.paginate(octokit.actions.listWorkflowRuns, {
            ...repo,
            workflow_id,
            created: '>' + new Date(Date.now() - 1000 * 60 * 60 * 24 * historyDays).toISOString(),
            per_page: 100,
            headers: {'X-GitHub-Api-Version': '2022-11-28'}
        })
        if (runs.length === 0) {
            runs = await octokit.actions.listWorkflowRuns({
                ...repo,
                workflow_id,
                per_page: 1,
                page: 1,
                headers: {'X-GitHub-Api-Version': '2022-11-28'}
            }).then((res) => res.data.workflow_runs)
        }
        return runs.map((run) => ({
            id: run.id,
            created_at: run.created_at,
            run_started_at: run.run_started_at,
            run_attempt: run.run_attempt,
            status: run.status,
            conclusion: run.conclusion,
            event: run.event,
            head_branch: run.head_branch,
            head_commit_message: run.head_commit?.message ?? null,
            triggering_actor: run.triggering_actor.login,
            html_url: run.html_url,
        }))
    }


    async function listUserRepositories({per_page}: { per_page: number }) {
        // Note: we can not use octokit.repos.listForAuthenticatedUser because it does not list private repositories
        let repositories = []
        let page
        do {
            page = await fetch('https://api.github.com/graphql', {
                method: 'POST',
                body: JSON.stringify({
                    query: `
                query ($first: Int, $after: String) {
                  viewer {
                    repositories(
                      isArchived: false
                      first: $first
                      after: $after
                      orderBy: {field: PUSHED_AT, direction: DESC}
                    ) {
                      pageInfo {
                        endCursor
                        hasNextPage
                      }
                      nodes {
                        nameWithOwner
                        updatedAt
                      }
                    }
                  }
                }
             `,
                    variables: {
                        first: per_page,
                        after: page?.pageInfo?.endCursor
                    }
                }),
                headers: {
                    Authorization: `${user.accessToken.token_type} ${user.accessToken.access_token}`
                },
            }).then(res => res.json() as any)
                .then(body => body?.data?.viewer?.repositories)

            if (page) {
                repositories = repositories.concat(page.nodes.map((node) => ({
                    owner: node.nameWithOwner.split('/')[0],
                    repo: node.nameWithOwner.split('/')[1],
                    updatedAt: new Date(node.updatedAt)
                })))
            }

        } while (page?.pageInfo?.hasNextPage)

        return repositories
    }
}

function mockedResponse() {
    const workflows = [
        {
            "owner": "qoomon",
            "repo": "aws-s3-bucket-browser",
            "id": 18127668,
            "name": "pages-build-deployment",
            "state": "active",
            "html_url": "https://github.com/qoomon/aws-s3-bucket-browser/actions/workflows/pages-build-deployment",
            "runs": [
                {
                    "id": 5708058048,
                    "created_at": "2023-07-30T19:46:18Z",
                    "run_started_at": "2023-07-30T19:46:18Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/aws-s3-bucket-browser/actions/runs/5708058048"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "banking-demo",
            "id": 109041,
            "name": "Build",
            "state": "active",
            "html_url": "https://github.com/qoomon/banking-demo/actions/workflows/build.yml",
            "runs": [
                {
                    "id": 7393391568,
                    "created_at": "2024-01-03T04:14:08Z",
                    "run_started_at": "2024-01-03T04:14:08Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "dependabot[bot]",
                    "html_url": "https://github.com/qoomon/banking-demo/actions/runs/7393391568"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "banking-swift-messages-java",
            "id": 424573,
            "name": "Build",
            "state": "active",
            "html_url": "https://github.com/qoomon/banking-swift-messages-java/actions/workflows/build.yml",
            "runs": [
                {
                    "id": 7393314735,
                    "created_at": "2024-01-03T04:02:13Z",
                    "run_started_at": "2024-01-03T04:02:13Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "dependabot[bot]",
                    "html_url": "https://github.com/qoomon/banking-swift-messages-java/actions/runs/7393314735"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "cdn",
            "id": 20033069,
            "name": "pages-build-deployment",
            "state": "active",
            "html_url": "https://github.com/qoomon/cdn/actions/workflows/pages-build-deployment",
            "runs": [
                {
                    "id": 5760042768,
                    "created_at": "2023-08-04T08:19:36Z",
                    "run_started_at": "2023-08-04T08:19:36Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/cdn/actions/runs/5760042768"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "diceware-webapp",
            "id": 66191179,
            "name": "pages-build-deployment",
            "state": "active",
            "html_url": "https://github.com/qoomon/diceware-webapp/actions/workflows/pages-build-deployment",
            "runs": [
                {
                    "id": 6219512186,
                    "created_at": "2023-09-18T07:32:41Z",
                    "run_started_at": "2023-09-18T07:32:41Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/diceware-webapp/actions/runs/6219512186"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "docker-host",
            "id": 420140,
            "name": "Build",
            "state": "active",
            "html_url": "https://github.com/qoomon/docker-host/actions/workflows/dockerimage.yml",
            "runs": [
                {
                    "id": 6825153065,
                    "created_at": "2023-11-10T13:02:32Z",
                    "run_started_at": "2023-11-10T13:02:32Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/docker-host/actions/runs/6825153065"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "git-conventional-commits",
            "id": 20586639,
            "name": "Build",
            "state": "active",
            "html_url": "https://github.com/qoomon/git-conventional-commits/actions/workflows/build.yml",
            "runs": [
                {
                    "id": 7877673088,
                    "created_at": "2024-02-12T20:43:47Z",
                    "run_started_at": "2024-02-12T20:43:47Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/git-conventional-commits/actions/runs/7877673088"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "gradle-git-versioning-plugin",
            "id": 255800,
            "name": "Build",
            "state": "active",
            "html_url": "https://github.com/qoomon/gradle-git-versioning-plugin/actions/workflows/build.yml",
            "runs": [
                {
                    "id": 7791648323,
                    "created_at": "2024-02-05T22:24:59Z",
                    "run_started_at": "2024-02-05T22:24:59Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "dependabot[bot]",
                    "html_url": "https://github.com/qoomon/gradle-git-versioning-plugin/actions/runs/7791648323"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "gradle-git-versioning-plugin",
            "id": 38627110,
            "name": "CodeQL",
            "state": "active",
            "html_url": "https://github.com/qoomon/gradle-git-versioning-plugin/actions/workflows/codeql.yml",
            "runs": [
                {
                    "id": 7919986601,
                    "created_at": "2024-02-15T17:33:46Z",
                    "run_started_at": "2024-02-15T17:33:46Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/gradle-git-versioning-plugin/actions/runs/7919986601"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "Jira-Issue-Card-Printer",
            "id": 49597,
            "name": "Build & Deploy",
            "state": "active",
            "html_url": "https://github.com/qoomon/Jira-Issue-Card-Printer/actions/workflows/deploy.yml",
            "runs": [
                {
                    "id": 7383457480,
                    "created_at": "2024-01-02T08:01:55Z",
                    "run_started_at": "2024-01-02T08:01:55Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/Jira-Issue-Card-Printer/actions/runs/7383457480"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "Jira-Issue-Card-Printer",
            "id": 22375334,
            "name": "pages-build-deployment",
            "state": "active",
            "html_url": "https://github.com/qoomon/Jira-Issue-Card-Printer/actions/workflows/pages-build-deployment",
            "runs": [
                {
                    "id": 7383461166,
                    "created_at": "2024-01-02T08:02:19Z",
                    "run_started_at": "2024-01-02T08:02:19Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "github-pages[bot]",
                    "html_url": "https://github.com/qoomon/Jira-Issue-Card-Printer/actions/runs/7383461166"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "maven-git-versioning-extension",
            "id": 49745,
            "name": "Build",
            "state": "active",
            "html_url": "https://github.com/qoomon/maven-git-versioning-extension/actions/workflows/build.yml",
            "runs": [
                {
                    "id": 7784285279,
                    "created_at": "2024-02-05T12:16:48Z",
                    "run_started_at": "2024-02-05T12:16:48Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "dependabot[bot]",
                    "html_url": "https://github.com/qoomon/maven-git-versioning-extension/actions/runs/7784285279"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "maven-git-versioning-extension",
            "id": 2015218,
            "name": "CodeQL",
            "state": "active",
            "html_url": "https://github.com/qoomon/maven-git-versioning-extension/actions/workflows/codeql-analysis.yml",
            "runs": [
                {
                    "id": 7983833196,
                    "created_at": "2024-02-21T04:05:35Z",
                    "run_started_at": "2024-02-21T04:05:35Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/maven-git-versioning-extension/actions/runs/7983833196"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "maven-git-versioning-extension",
            "id": 17820804,
            "name": "pages-build-deployment",
            "state": "active",
            "html_url": "https://github.com/qoomon/maven-git-versioning-extension/actions/workflows/pages-build-deployment",
            "runs": [
                {
                    "id": 7492311492,
                    "created_at": "2024-01-11T17:23:48Z",
                    "run_started_at": "2024-01-11T17:23:48Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/maven-git-versioning-extension/actions/runs/7492311492"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "meeting-cash-creep",
            "id": 13471441,
            "name": "Build & Deploy",
            "state": "active",
            "html_url": "https://github.com/qoomon/meeting-cash-creep/actions/workflows/build_deploy.yml",
            "runs": [
                {
                    "id": 7474692323,
                    "created_at": "2024-01-10T12:10:31Z",
                    "run_started_at": "2024-01-10T12:10:31Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/meeting-cash-creep/actions/runs/7474692323"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "my-badges",
            "id": 85170929,
            "name": "Check",
            "state": "disabled_manually",
            "html_url": "https://github.com/qoomon/my-badges/actions/workflows/check.yml",
            "runs": [
                {
                    "id": 7811572936,
                    "created_at": "2024-02-07T07:53:51Z",
                    "run_started_at": "2024-02-07T07:53:51Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/my-badges/actions/runs/7811572936"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "my-badges",
            "id": 85170930,
            "name": "Release",
            "state": "disabled_manually",
            "html_url": "https://github.com/qoomon/my-badges/actions/workflows/release.yml",
            "runs": [
                {
                    "id": 7811572931,
                    "created_at": "2024-02-07T07:53:51Z",
                    "run_started_at": "2024-02-07T07:53:51Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/my-badges/actions/runs/7811572931"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "my-badges",
            "id": 85170931,
            "name": "Test",
            "state": "disabled_manually",
            "html_url": "https://github.com/qoomon/my-badges/actions/workflows/test.yml",
            "runs": [
                {
                    "id": 7811572934,
                    "created_at": "2024-02-07T07:53:51Z",
                    "run_started_at": "2024-02-07T07:53:51Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/my-badges/actions/runs/7811572934"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "otp-authenticator-webapp",
            "id": 2015306,
            "name": "CodeQL",
            "state": "active",
            "html_url": "https://github.com/qoomon/otp-authenticator-webapp/actions/workflows/codeql-analysis.yml",
            "runs": [
                {
                    "id": 7990233615,
                    "created_at": "2024-02-21T14:00:36Z",
                    "run_started_at": "2024-02-21T14:00:36Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/otp-authenticator-webapp/actions/runs/7990233615"
                },
                {
                    "id": 7983487011,
                    "created_at": "2024-02-21T03:16:09Z",
                    "run_started_at": "2024-02-21T03:16:09Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "dependabot[bot]",
                    "html_url": "https://github.com/qoomon/otp-authenticator-webapp/actions/runs/7983487011"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "otp-authenticator-webapp",
            "id": 43338,
            "name": "Build & Deploy",
            "state": "active",
            "html_url": "https://github.com/qoomon/otp-authenticator-webapp/actions/workflows/deploy.yml",
            "runs": [
                {
                    "id": 7471204676,
                    "created_at": "2024-01-10T06:32:52Z",
                    "run_started_at": "2024-01-10T06:32:52Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/otp-authenticator-webapp/actions/runs/7471204676"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "otp-authenticator-webapp",
            "id": 18127751,
            "name": "pages-build-deployment",
            "state": "active",
            "html_url": "https://github.com/qoomon/otp-authenticator-webapp/actions/workflows/pages-build-deployment",
            "runs": [
                {
                    "id": 7471208254,
                    "created_at": "2024-01-10T06:33:13Z",
                    "run_started_at": "2024-01-10T06:33:13Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "github-pages[bot]",
                    "html_url": "https://github.com/qoomon/otp-authenticator-webapp/actions/runs/7471208254"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "qoomon",
            "id": 84821674,
            "name": "My Badges",
            "state": "active",
            "html_url": "https://github.com/qoomon/qoomon/actions/workflows/my-badges.yml",
            "runs": [
                {
                    "id": 7991211371,
                    "created_at": "2024-02-21T15:08:10Z",
                    "run_started_at": "2024-02-21T15:08:10Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7991211371"
                },
                {
                    "id": 7991123118,
                    "created_at": "2024-02-21T15:02:36Z",
                    "run_started_at": "2024-02-21T15:02:36Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7991123118"
                },
                {
                    "id": 7990655191,
                    "created_at": "2024-02-21T14:28:27Z",
                    "run_started_at": "2024-02-21T14:28:27Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7990655191"
                },
                {
                    "id": 7981863910,
                    "created_at": "2024-02-21T00:14:46Z",
                    "run_started_at": "2024-02-21T00:14:46Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7981863910"
                },
                {
                    "id": 7974654288,
                    "created_at": "2024-02-20T13:59:38Z",
                    "run_started_at": "2024-02-20T13:59:38Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7974654288"
                },
                {
                    "id": 7966554102,
                    "created_at": "2024-02-20T00:14:31Z",
                    "run_started_at": "2024-02-20T00:14:31Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7966554102"
                },
                {
                    "id": 7952720348,
                    "created_at": "2024-02-19T00:15:24Z",
                    "run_started_at": "2024-02-19T00:15:24Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7952720348"
                },
                {
                    "id": 7945187501,
                    "created_at": "2024-02-18T00:16:07Z",
                    "run_started_at": "2024-02-18T00:16:07Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7945187501"
                },
                {
                    "id": 7938263534,
                    "created_at": "2024-02-17T01:18:42Z",
                    "run_started_at": "2024-02-17T01:18:42Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7938263534"
                },
                {
                    "id": 7938138614,
                    "created_at": "2024-02-17T01:00:48Z",
                    "run_started_at": "2024-02-17T01:00:48Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7938138614"
                },
                {
                    "id": 7938088719,
                    "created_at": "2024-02-17T00:54:46Z",
                    "run_started_at": "2024-02-17T00:54:46Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7938088719"
                },
                {
                    "id": 7937972647,
                    "created_at": "2024-02-17T00:40:50Z",
                    "run_started_at": "2024-02-17T00:40:50Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7937972647"
                },
                {
                    "id": 7937846929,
                    "created_at": "2024-02-17T00:25:20Z",
                    "run_started_at": "2024-02-17T00:25:20Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "cancelled",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7937846929"
                },
                {
                    "id": 7937815517,
                    "created_at": "2024-02-17T00:21:43Z",
                    "run_started_at": "2024-02-17T00:21:43Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7937815517"
                },
                {
                    "id": 7937758712,
                    "created_at": "2024-02-17T00:15:29Z",
                    "run_started_at": "2024-02-17T00:15:29Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7937758712"
                },
                {
                    "id": 7937754328,
                    "created_at": "2024-02-17T00:14:56Z",
                    "run_started_at": "2024-02-17T00:14:56Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7937754328"
                },
                {
                    "id": 7937744742,
                    "created_at": "2024-02-17T00:13:54Z",
                    "run_started_at": "2024-02-17T00:13:54Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7937744742"
                },
                {
                    "id": 7933197177,
                    "created_at": "2024-02-16T16:09:52Z",
                    "run_started_at": "2024-02-16T16:12:54Z",
                    "run_attempt": 2,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7933197177"
                },
                {
                    "id": 7933145309,
                    "created_at": "2024-02-16T16:05:46Z",
                    "run_started_at": "2024-02-16T16:05:46Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7933145309"
                },
                {
                    "id": 7933145349,
                    "created_at": "2024-02-16T16:05:46Z",
                    "run_started_at": "2024-02-16T16:05:46Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7933145349"
                },
                {
                    "id": 7933072686,
                    "created_at": "2024-02-16T16:00:12Z",
                    "run_started_at": "2024-02-16T16:00:12Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7933072686"
                },
                {
                    "id": 7933046551,
                    "created_at": "2024-02-16T15:57:40Z",
                    "run_started_at": "2024-02-16T15:57:40Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7933046551"
                },
                {
                    "id": 7933021579,
                    "created_at": "2024-02-16T15:55:14Z",
                    "run_started_at": "2024-02-16T15:55:14Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7933021579"
                },
                {
                    "id": 7932865628,
                    "created_at": "2024-02-16T15:41:18Z",
                    "run_started_at": "2024-02-16T15:41:18Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7932865628"
                },
                {
                    "id": 7932671021,
                    "created_at": "2024-02-16T15:24:40Z",
                    "run_started_at": "2024-02-16T15:24:40Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7932671021"
                },
                {
                    "id": 7932473551,
                    "created_at": "2024-02-16T15:09:17Z",
                    "run_started_at": "2024-02-16T15:09:17Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7932473551"
                },
                {
                    "id": 7932449619,
                    "created_at": "2024-02-16T15:07:29Z",
                    "run_started_at": "2024-02-16T15:07:29Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7932449619"
                },
                {
                    "id": 7932376895,
                    "created_at": "2024-02-16T15:02:06Z",
                    "run_started_at": "2024-02-16T15:02:06Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7932376895"
                },
                {
                    "id": 7932277782,
                    "created_at": "2024-02-16T14:53:14Z",
                    "run_started_at": "2024-02-16T14:53:14Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/qoomon/actions/runs/7932277782"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "sandbox",
            "id": 50782087,
            "name": "OpenID Connect Example",
            "state": "active",
            "html_url": "https://github.com/qoomon/sandbox/actions/workflows/oidc_aws.example.yaml",
            "runs": [
                {
                    "id": 6361688232,
                    "created_at": "2023-09-30T08:58:36Z",
                    "run_started_at": "2023-09-30T08:58:36Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/sandbox/actions/runs/6361688232"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "sandbox",
            "id": 50783857,
            "name": "GitHub Actions Access Manager Example",
            "state": "active",
            "html_url": "https://github.com/qoomon/sandbox/actions/workflows/github_actions_access_manager.example.yml",
            "runs": [
                {
                    "id": 6397642787,
                    "created_at": "2023-10-03T19:39:20Z",
                    "run_started_at": "2023-10-03T19:39:20Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/sandbox/actions/runs/6397642787"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "sandbox",
            "id": 51134820,
            "name": "Self-Hosted Runners Example",
            "state": "active",
            "html_url": "https://github.com/qoomon/sandbox/actions/workflows/self-hosted-runners.example.yaml",
            "runs": [
                {
                    "id": 4670286910,
                    "created_at": "2023-04-11T17:23:53Z",
                    "run_started_at": "2023-04-11T17:23:53Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/sandbox/actions/runs/4670286910"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "sandbox",
            "id": 52546085,
            "name": "Sandbox",
            "state": "active",
            "html_url": "https://github.com/qoomon/sandbox/actions/workflows/sandbox.yaml",
            "runs": [
                {
                    "id": 7899385795,
                    "created_at": "2024-02-14T09:54:38Z",
                    "run_started_at": "2024-02-14T09:54:38Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/sandbox/actions/runs/7899385795"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "sandbox",
            "id": 72275942,
            "name": "GitHub Actions Access Manager Example",
            "state": "active",
            "html_url": "https://github.com/qoomon/sandbox/actions/workflows/example.yaml",
            "runs": [
                {
                    "id": 6576595835,
                    "created_at": "2023-10-19T15:07:38Z",
                    "run_started_at": "2023-10-19T15:07:38Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "failure",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/sandbox/actions/runs/6576595835"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "sandbox",
            "id": 77453431,
            "name": "OIDC Token Example",
            "state": "active",
            "html_url": "https://github.com/qoomon/sandbox/actions/workflows/oidc.yaml",
            "runs": [
                {
                    "id": 7005052810,
                    "created_at": "2023-11-27T12:34:55Z",
                    "run_started_at": "2023-11-27T12:34:55Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/sandbox/actions/runs/7005052810"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "time-timer-webapp",
            "id": 909363,
            "name": "Build & Deploy",
            "state": "active",
            "html_url": "https://github.com/qoomon/time-timer-webapp/actions/workflows/build_deploy.yml",
            "runs": [
                {
                    "id": 7344401244,
                    "created_at": "2023-12-28T04:23:51Z",
                    "run_started_at": "2023-12-28T04:23:51Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "dependabot[bot]",
                    "html_url": "https://github.com/qoomon/time-timer-webapp/actions/runs/7344401244"
                }
            ]
        },
        {
            "owner": "qoomon",
            "repo": "website",
            "id": 31425130,
            "name": "pages-build-deployment",
            "state": "active",
            "html_url": "https://github.com/qoomon/website/actions/workflows/pages-build-deployment",
            "runs": [
                {
                    "id": 5955892262,
                    "created_at": "2023-08-23T20:00:53Z",
                    "run_started_at": "2023-08-23T20:00:53Z",
                    "run_attempt": 1,
                    "status": "completed",
                    "conclusion": "success",
                    "triggering_actor": "qoomon",
                    "html_url": "https://github.com/qoomon/website/actions/runs/5955892262"
                }
            ]
        }
    ]
    // Backfill fields added after the mock was created so the dev server always
    // returns a complete WorkflowRun shape.
    const mockEvents = ['push', 'pull_request', 'schedule', 'workflow_dispatch']
    const mockBranches = ['main', 'develop', 'feature/update-deps', 'fix/crash-on-load']
    const mockMessages = [
        'chore: update dependencies',
        'fix: resolve null pointer on startup',
        'feat: add dark mode support',
        'docs: improve README',
        'ci: bump actions versions',
    ]
    return workflows.map((wf: any) => ({
        ...wf,
        runs: wf.runs.map((run: any, i: number) => ({
            ...run,
            event: run.event ?? mockEvents[i % mockEvents.length],
            head_branch: run.head_branch ?? mockBranches[i % mockBranches.length],
            head_commit_message: run.head_commit_message ?? mockMessages[i % mockMessages.length],
        })),
    }))
}


