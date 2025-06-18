import * as core from '@actions/core'
import * as hc from '@actions/http-client'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const url = core.getInput('url', { required: true })
    const token = core.getInput('token', { required: true })
    const project = core.getInput('project', { required: true })
    const release = core.getInput('release', { required: true })
    const targets = core.getInput('targets', { required: true })
    const checkPlan = core.getInput('check-plan')
    let failOnWarning = false

    switch (checkPlan) {
      case 'SKIP':
        break
      case 'FAIL_ON_WARNING':
        failOnWarning = true
        break
      case 'FAIL_ON_ERROR':
        break
      default:
        throw new Error(`unknown check-plan value ${checkPlan}`)
    }

    const targetList = targets.split(',')

    const c: httpClient = {
      url: url,
      c: new hc.HttpClient('create-plan-from-release-action', [], {
        headers: {
          authorization: `Bearer ${token}`
        }
      })
    }

    const planToCreate = await previewPlan(c, project, release, targetList)

    if (
      ((
        planToCreate as {
          steps:
            | {
                specs: {}[] | undefined
              }[]
            | undefined
        }
      ).steps?.reduce((specsCount, step) => {
        return specsCount + (step.specs?.length ?? 0)
      }, 0) ?? 0) === 0
    ) {
      core.setOutput('deployment-required', 'false')
      return
    }
    core.setOutput('deployment-required', 'true')

    const plan = await createPlan(c, project, planToCreate)

    core.info(`Plan created. View at ${c.url}/${plan} on Bytebase.`)
    core.setOutput('plan', plan)

    if (checkPlan === 'SKIP') {
      return
    }

    await runPlanChecks(c, plan)

    await waitPlanChecks(c, plan, failOnWarning)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function previewPlan(
  c: httpClient,
  project: string,
  release: string,
  targets: string[]
): Promise<any> {
  const url = `${c.url}/v1/${project}:previewPlan`

  const request = {
    release: release,
    targets: targets,
    allowOutOfOrder: false
  }

  const response = await c.c.postJson<{
    message: string
    plan: any
    outOfOrderFiles?: DatabaseFiles[]
    appliedButModifiedFiles?: DatabaseFiles[]
  }>(url, request)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to create release, ${response.statusCode}, ${response.result?.message}`
    )
  }

  if (!response.result) {
    throw new Error(`expect result to be not null, get ${response.result}`)
  }

  if (
    response.result.outOfOrderFiles &&
    response.result.outOfOrderFiles.length > 0
  ) {
    core.error(
      `found out of order files\n${formatDatabaseFiles(response.result.outOfOrderFiles)}`
    )
     throw new Error(
      `failed to create release: found out of order files\n${formatDatabaseFiles(response.result.outOfOrderFiles)}`
    )
  }
  if (
    response.result.appliedButModifiedFiles &&
    response.result.appliedButModifiedFiles.length > 0
  ) {
    core.warning(
      `found applied but modified files\n${formatDatabaseFiles(response.result.appliedButModifiedFiles)}`
    )
  }

  return response.result.plan
}

function formatDatabaseFiles(databaseFiles: DatabaseFiles[]): string {
  return databaseFiles
    .map(e => {
      return `e.database:` + e.files.join(',')
    })
    .join('\n')
}

async function createPlan(
  c: httpClient,
  project: string,
  plan: any
): Promise<string> {
  const url = `${c.url}/v1/${project}/plans`

  const response = await c.c.postJson<{
    message: string
    name: string
  }>(url, plan)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to create release, ${response.statusCode}, ${response.result?.message}`
    )
  }

  if (!response.result) {
    throw new Error(`expect result to be not null, get ${response.result}`)
  }

  return response.result.name
}

async function runPlanChecks(c: httpClient, planName: string) {
  const url = `${c.url}/v1/${planName}:runPlanChecks`

  const response = await c.c.postJson<{
    message: string
  }>(url, {})

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to run plan checks, ${response.statusCode}, ${response.result?.message}`
    )
  }
}

async function listPlanCheckRuns(
  c: httpClient,
  planName: string,
  pageToken: string
) {
  const url = `${c.url}/v1/${planName}/planCheckRuns?latestOnly=true&pageSize=1000&pageToken=${pageToken}`
  const response = await c.c.getJson<any>(url)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to list plan check runs, ${response.statusCode}, ${response.result?.message}`
    )
  }

  return response.result
}

async function listAllPlanCheckRuns(c: httpClient, planName: string) {
  let pageToken = ''
  let planCheckRuns = []
  do {
    let response = await listPlanCheckRuns(c, planName, pageToken)
    planCheckRuns.push(...response.planCheckRuns)
    pageToken = response.nextPageToken
  } while (pageToken !== '')

  return planCheckRuns
}

function getPlanCheckRunsResult(planCheckRuns: Array<any>) {
  const status = {
    // plan check run status
    running: 0,
    done: 0,
    failed: 0,
    canceled: 0,
    // check result status
    warning: 0,
    error: 0
  }
  const advice = {}
  for (const r of planCheckRuns) {
    if (r.status === 'RUNNING') {
      status.running++
    }
    if (r.status === 'FAILED') {
      status.failed++
    }
    if (r.status === 'CANCELED') {
      status.canceled++
    }
    if (r.status === 'DONE') {
      status.done++
      for (const result of r.results) {
        if (result.status === 'ERROR') {
          status.error++
        }
        if (result.status === 'WARNING') {
          status.warning++
        }
      }
    }
  }

  return status
}

async function waitPlanChecks(
  c: httpClient,
  planName: string,
  failOnWarning: boolean
) {
  for (;;) {
    const planCheckRuns = await listAllPlanCheckRuns(c, planName)
    const status = getPlanCheckRunsResult(planCheckRuns)

    if (status.failed > 0) {
      throw new Error(`Found failed plan check run. View on Bytebase.`)
    }
    if (status.canceled > 0) {
      throw new Error(`Found canceled plan check run. View on Bytebase.`)
    }
    if (status.error > 0) {
      throw new Error(`Plan checks report errors. View on Bytebase.`)
    }
    if (failOnWarning && status.warning > 0) {
      throw new Error(`Plan checks report warnings. View on Bytebase.`)
    }
    if (status.running === 0) {
      break
    }
    sleep(5000)
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
interface httpClient {
  c: hc.HttpClient
  url: string
}

interface DatabaseFiles {
  database: string
  files: string[]
}
