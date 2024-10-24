import * as core from '@actions/core'
import * as actionsGithub from '@actions/github'
import { Endpoints } from '@octokit/types'
import { Context } from '@actions/github/lib/context'
import { GitHub as ActionsGitHub } from '@actions/github/lib/utils'

export type Octokit = InstanceType<typeof ActionsGitHub>
export type PullsGetResponse =
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}']['response']['data']
export type PullRequestFiles =
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/files']['response']['data']
export type Content =
  Endpoints['GET /repos/{owner}/{repo}/contents/{path}']['response']['data']
export type Commit =
  Endpoints['GET /repos/{owner}/{repo}/commits/{ref}']['response']['data']
export type Comment =
  Endpoints['GET /repos/{owner}/{repo}/issues/{issue_number}/comments']['response']['data'][0]

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

  /**
   * Lists all existing comments on an issue or PR.
   * Pagination is handled automatically.
   * @param pull_number the issue or PR number
   * @returns an array of comments
   */
  async *listComments(pull_number: number): AsyncGenerator<Comment> {
    for await (const { data: comments } of this.octokit.paginate.iterator(
      this.octokit.rest.issues.listComments,
      {
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: pull_number,
        per_page: 100,
      }
    )) {
      if (!comments.length) break

      for (const comment of comments) {
        yield comment
      }
    }
  }

  /**
   * "Pins" a comment at the top of an issue or PR.
   * Either creates a new comment or updates the existing one; comments are matched
   * using the `header` param, which is also rendered as `h3`.
   * @param pull_number the issue or PR number
   * @param match RegExp to match when finding an existing comment to update
   * @param content comment content
   */
  async pinComment(
    pull_number: number,
    match: RegExp,
    content: string
  ): Promise<Comment['id']> {
    for await (const comment of this.listComments(pull_number)) {
      if (comment.body && comment.body.match(match)) {
        this.octokit.rest.issues.updateComment({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          comment_id: comment.id,
          body: content,
        })

        return comment.id
      }
    }

    const response = await this.octokit.rest.issues.createComment({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      issue_number: pull_number,
      body: content,
    })

    return response.data.id
  }
}

function createGitHub(): GitHub {
  const octokit: Octokit = actionsGithub.getOctokit(
    core.getInput('githubToken')
  )
  return new GitHub(actionsGithub.context, octokit)
}

export const github: GitHub = createGitHub()
