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
export type PullRequestFiles =
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/files']['response']['data']
export type Content =
  Endpoints['GET /repos/{owner}/{repo}/contents/{path}']['response']['data']
export type Commit =
  Endpoints['GET /repos/{owner}/{repo}/commits/{ref}']['response']['data']

export class GitHub {
  context: Context
  private octokit: Octokit

  constructor(context: Context, octokit: Octokit) {
    this.context = context
    this.octokit = octokit
  }

  async getPullRequest(pull_number: number): Promise<PullsGetResponse> {
    const response = await this.octokit.rest.pulls.get({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number,
    })
    return response.data
  }

  async getPullRequestsAssociatedWithCommit(): Promise<PullRequestsAssociatedWithCommitResponse> {
    const response =
      await this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        commit_sha: this.context.sha,
        mediaType: {
          previews: ['groot'],
        },
      })
    return response.data
  }

  async getPullRequestFiles(pull_number: number): Promise<PullRequestFiles> {
    const response = await this.octokit.rest.pulls.listFiles({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number,
    })
    return response.data
  }

  async getCommit(ref: string): Promise<Commit> {
    const response = await this.octokit.rest.repos.getCommit({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      ref: ref,
    })
    return response.data
  }

  async downloadContent(path: string, ref?: string): Promise<Content> {
    const response = await this.octokit.rest.repos.getContent({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      path: path,
      ref: ref,
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
