# About

Github action to create release from plan on Bytebase.

- Tutorial:
  [Database Release CI/CD with GitHub Actions](http://bytebase.com/docs/tutorials/github-release-cicd-workflow/)
- Sample repo: https://github.com/bytebase/release-cicd-workflows-example

## Inputs

| Input Name   | Description                                                                                                                                                                                                                                                                                                                                                                                              | Required | Default |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `url`        | The bytebase URL.                                                                                                                                                                                                                                                                                                                                                                                        | Yes      |         |
| `token`      | The Bytebase access token.                                                                                                                                                                                                                                                                                                                                                                               | Yes      |         |
| `project`    | The project on Bytebase. Format: `projects/{project}`                                                                                                                                                                                                                                                                                                                                                    | Yes      |         |
| `release`    | The release to create plan from. Format: `projects/{project}/releases/{release}`                                                                                                                                                                                                                                                                                                                         | Yes      |         |
| `targets`    | The database group or databases to deploy. Either a comma separated list of the databases or a database group. Databases example: `instances/mysql1/databases/db1,instances/mysql1/databases/db2`. Database format: `instances/{instance}/databases/{database}` Database group example: `projects/exa/databaseGroups/mygroup` Database group format: `projects/{project}/databaseGroups/{databaseGroup}` | Yes      |         |
| `check-plan` | An enum to determine should we run plan checks and fail on warning or error. Valid values are `SKIP`, `FAIL_ON_WARNING`, `FAIL_ON_ERROR`                                                                                                                                                                                                                                                                 | No       | `SKIP`  |

## Outputs

| Output Name         | Description                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| deployment-required | Indicates whether a deployment is required due to changes detected in the targets. Available values: 'true', 'false'. If 'true', new changes are present and a deployment plan has been created. If 'false', no new changes were found, and a deployment plan was not created. |
| plan                | The created plan. Format: projects/{project}/plans/{plan}                                                                                                                                                                                                                      |

## Example

```yaml
on:
  push:
    branches:
      - main

jobs:
  bytebase-cicd:
    runs-on: ubuntu-latest
    env:
      BYTEBASE_URL: 'https://demo.bytebase.com'
      BYTEBASE_PROJECT: 'projects/example'
      BYTEBASE_SERVICE_ACCOUNT: 'demo@service.bytebase.com'
      BYTEBASE_TARGETS: 'instances/mysql1/databases/db1,instances/mysql1/databases/db2'
    name: Bytebase cicd
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Login to Bytebase
        id: login
        uses: bytebase/login-action@main
        with:
          url: ${{ env.BYTEBASE_URL }}
          service-account: ${{ env.BYTEBASE_SERVICE_ACCOUNT }}
          service-account-key: ${{ secrets.BYTEBASE_PASSWORD }}
      - name: Create release
        id: create_release
        uses: bytebase/create-release-action@main
        with:
          url: ${{ env.BYTEBASE_URL }}
          token: ${{ steps.login.outputs.token }}
          project: ${{ env.BYTEBASE_PROJECT }}
          file-pattern: 'migrations/*.sql'
      - name: Create plan
        id: create_plan
        uses: bytebase/create-plan-from-release-action@main
        with:
          url: ${{ env.BYTEBASE_URL }}
          token: ${{ steps.login.outputs.token }}
          project: ${{ env.BYTEBASE_PROJECT }}
          release: ${{ steps.create_release.outputs.release }}
          targets: ${{ env.BYTEBASE_TARGETS }}
```
