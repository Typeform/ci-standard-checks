export const github = {
  context: {
    eventName: '',
    payload: {
      pull_request: {
        number: 5,
      },
    },
  },
  getPullRequest: jest.fn(),
  getPullRequestFiles: jest.fn(),
  getPullRequestsAssociatedWithCommit: jest.fn(),
  downloadContent: jest.fn(),
}
