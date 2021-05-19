import * as core from '@actions/core'
import * as actionsGithub from '@actions/github'
import { Endpoints } from '@octokit/types'
import { Context } from '@actions/github/lib/context'
import { GitHub as ActionsGitHub } from '@actions/github/lib/utils'

export type Octokit = InstanceType<typeof ActionsGitHub>
export type PullsGetResponse =
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}']['response']['data']
export type PullRequestsAssociatedWithCommitResponse =
  Endpoints['GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls']['response']['data']

export class GitHub {
  context: Context
  private octokit: Octokit

  constructor(context: Context, octokit: Octokit) {
    this.context = context
    this.octokit = octokit
  }

  async getPullRequest(pull_number: number): Promise<PullsGetResponse> {
    const response = await this.octokit.pulls.get({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number,
    })
    return response.data
  }

  async getPullRequestsAssociatedWithCommit(): Promise<PullRequestsAssociatedWithCommitResponse> {
    const response =
      await this.octokit.repos.listPullRequestsAssociatedWithCommit({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        commit_sha: this.context.sha,
        mediaType: {
          previews: ['groot'],
        },
      })
    return response.data
  }
}

function createGitHub(): GitHub {
  const octokit: Octokit = actionsGithub.getOctokit(
    core.getInput('githubToken')
  )
  return new GitHub(actionsGithub.context, octokit)
}

export const github: GitHub = createGitHub()
