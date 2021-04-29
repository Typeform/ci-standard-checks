import * as core from '@actions/core'
import * as github from '@actions/github'

import {Context} from '@actions/github/lib/context'
import {GitHub as ActionsGitHub} from '@actions/github/lib/utils'

export class GitHub {
  context: Context
  private octokit: InstanceType<typeof ActionsGitHub>

  constructor(context: Context, octokit: InstanceType<typeof ActionsGitHub>) {
    this.context = context
    this.octokit = octokit
  }

  async getPullRequest(pull_number: number) {
    return this.octokit.pulls.get({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number
    })
  }
}

export function getGitHub() {
  return new GitHub(
    github.context,
    github.getOctokit(core.getInput('githubToken'))
  )
}
