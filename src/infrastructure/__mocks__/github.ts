import { vi } from 'vitest'

export const github = {
  context: {
    eventName: '',
    payload: {
      pull_request: {
        number: 5,
      },
    },
  },
  getPullRequest: vi.fn(),
  getPullRequestFiles: vi.fn(),
  getCommit: vi.fn(),
  downloadContent: vi.fn(),
  listComments: vi.fn(),
  pinComment: vi.fn(),
}
