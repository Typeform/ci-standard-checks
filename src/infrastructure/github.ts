import * as core from '@actions/core'
import * as actionsGithub from '@actions/github'
import { Endpoints } from '@octokit/types'

import { Context } from '@actions/github/lib/context'
import { GitHub as ActionsGitHub } from '@actions/github/lib/utils'

export type Octokit = InstanceType<typeof ActionsGitHub>
export type PullsGetResponse = Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}']['response']

export class GitHub {
  context: Context
  private octokit: Octokit

  constructor(context: Context, octokit: Octokit) {
    this.context = context
    this.octokit = octokit
  }

  async getPullRequest(pull_number: number): Promise<PullsGetResponse> {
    return this.octokit.pulls.get({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number,
    })
  }
}

function createGitHub(): GitHub {
  const octokit: Octokit = actionsGithub.getOctokit(
    core.getInput('githubToken')
  )
  return new GitHub(actionsGithub.context, octokit)
}

export const github: GitHub = createGitHub()
