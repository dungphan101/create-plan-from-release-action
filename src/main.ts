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
    const databases = core.getInput('databases', { required: true })

    const databaseList = databases.split(',')

    const c: httpClient = {
      url: url,
      token: token,
      c: new hc.HttpClient('actions-create-plan-from-release', [], {
        headers: {
          authorization: `Bearer ${token}`
        }
      })
    }

    const planToCreate = await previewPlan(c, project, release, databaseList)

    const plan = await createPlan(c, project, planToCreate)

    core.setOutput('plan', plan)
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
    allowOutOfOrder: true
  }

  const response = await c.c.postJson<{
    message: string
    plan: any
    outOfOrderFiles: DatabaseFiles[]
    appliedButModifiedFiles: DatabaseFiles[]
  }>(url, request)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to create release, ${response.statusCode}, ${response.result?.message}`
    )
  }

  if (!response.result) {
    throw new Error(`expect result to be not null, get ${response.result}`)
  }

  if (response.result.outOfOrderFiles.length > 0) {
    core.warning(
      `found out of order files\n${formatDatabaseFiles(response.result.outOfOrderFiles)}`
    )
  }
  if (response.result.appliedButModifiedFiles.length > 0) {
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

interface httpClient {
  c: hc.HttpClient
  url: string
  token: string
}

interface DatabaseFiles {
  database: string
  files: string[]
}
