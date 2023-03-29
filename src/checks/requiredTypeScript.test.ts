import { mocked } from 'ts-jest/utils'

import {
  github,
  PullRequestFiles,
  PullsGetResponse,
} from '../infrastructure/github'
import { glob, readFile } from '../infrastructure/fs'
import { BOT_USERS } from '../conditions/triggeredByBot'

import requiredTypeScript, {
  isForbiddenJSFile,
  missingTsConfigSettings,
} from './requiredTypeScript'

const mockGithub = mocked(github, true)
const mockGlob = mocked(glob, true)
const mockReadFile = mocked(readFile, true)

jest.mock('../infrastructure/github')
jest.mock('../infrastructure/fs')

describe('Required TypeScript check', () => {
  describe('pull_request event', () => {
    const pullRequestResponse = {
      title: '',
      head: {
        ref: '',
      },
      user: {
        login: '',
      },
    }

    beforeEach(() => {
      mockGithub.context.eventName = 'pull_request'
      mockGithub.context.payload.pull_request = {
        number: 5,
      }

      mockGithub.getPullRequest.mockResolvedValue(
        pullRequestResponse as PullsGetResponse
      )
    })

    it('returns true for PR without JS changes and good tsconfig', async () => {
      pullRequestResponse.user.login = 'regular-user'
      mockGithub.getPullRequestFiles.mockResolvedValue([
        { filename: 'filename.ts' },
        { filename: 'component.tsx' },
        { filename: 'double.dot.ts' },
        { filename: 'double.dot.tsx' },
        { filename: 'spec.ts' },
        { filename: 'spec.tsx' },
        { filename: 'filename.test.ts' },
        { filename: 'component.test.tsx' },
        { filename: 'double.dot.test.ts' },
        { filename: 'double.dot.test.tsx' },
        { filename: 'filename.spec.ts' },
        { filename: 'component.spec.tsx' },
        { filename: 'double.dot.spec.ts' },
        { filename: 'double.dot.spec.tsx' },
        { filename: 'whatever.go' },
        { filename: '.env.dist' },
        { filename: 'workflows/test.yaml' },
      ] as PullRequestFiles)
      mockGlob.mockResolvedValue(['tsconfig.json'])
      mockReadFile.mockReturnValue(
        JSON.stringify({
          compilerOptions: {
            allowUnreachableCode: false,
            noImplicitAny: true,
          },
        })
      )

      await expect(requiredTypeScript.run()).resolves.toBeTruthy()
    })

    it('throws error for PR with JS changes but good tsconfig', async () => {
      pullRequestResponse.user.login = 'regular-user'
      mockGithub.getPullRequestFiles.mockResolvedValue([
        { filename: 'filename.js', additions: 100, deletions: 20 },
      ] as PullRequestFiles)
      mockGlob.mockResolvedValue(['tsconfig.json'])
      mockReadFile.mockReturnValue(
        JSON.stringify({
          compilerOptions: {
            allowUnreachableCode: false,
            noImplicitAny: true,
          },
        })
      )

      await expect(requiredTypeScript.run()).rejects.toThrow()
    })

    it('throws error for PR without JS changes but bad tsconfig', async () => {
      pullRequestResponse.user.login = 'regular-user'
      mockGithub.getPullRequestFiles.mockResolvedValue([
        { filename: 'filename.ts' },
      ] as PullRequestFiles)
      mockGlob.mockResolvedValue(['tsconfig.json'])
      mockReadFile.mockReturnValue(
        JSON.stringify({
          compilerOptions: {
            noImplicitAny: false,
          },
        })
      )

      await expect(requiredTypeScript.run()).rejects.toThrow()
    })

    it('throws error for PR with JS changes and bad tsconfig', async () => {
      pullRequestResponse.user.login = 'regular-user'
      mockGithub.getPullRequestFiles.mockResolvedValue([
        { filename: 'filename.js', additions: 100, deletions: 20 },
      ] as PullRequestFiles)
      mockGlob.mockResolvedValue(['tsconfig.json'])
      mockReadFile.mockReturnValue(
        JSON.stringify({
          compilerOptions: {
            noImplicitAny: false,
          },
        })
      )

      await expect(requiredTypeScript.run()).rejects.toThrow()
    })

    it.each(BOT_USERS)('returns true for bot users [%s]', async (botUser) => {
      pullRequestResponse.user.login = botUser

      await expect(requiredTypeScript.run()).resolves.toBeTruthy()
    })
  })
})

describe('isForbiddenJSFile', () => {
  it.each([
    'filename.js',
    'component.jsx',
    'double.dot.js',
    'double.dot.jsx',
    'spec.js',
    'spec.jsx',
  ])('returns true with JS/JSX file [%s]', (filename) => {
    expect(isForbiddenJSFile(filename)).toBeTruthy()
  })

  it.each([
    'filename.test.js',
    'component.test.jsx',
    'double.dot.test.js',
    'double.dot.test.jsx',
    'filename.spec.js',
    'component.spec.jsx',
    'double.dot.spec.js',
    'double.dot.spec.jsx',
  ])('it returns false with JS/JSX test file [%s]', (filename) => {
    expect(isForbiddenJSFile(filename)).toBeFalsy()
  })

  it.each([
    'filename.ts',
    'component.tsx',
    'double.dot.ts',
    'double.dot.tsx',
    'spec.ts',
    'spec.tsx',
    'filename.test.ts',
    'component.test.tsx',
    'double.dot.test.ts',
    'double.dot.test.tsx',
    'filename.spec.ts',
    'component.spec.tsx',
    'double.dot.spec.ts',
    'double.dot.spec.tsx',
  ])('it returns false with TS/TSX file [%s]', (filename) => {
    expect(isForbiddenJSFile(filename)).toBeFalsy()
  })

  it.each([
    'config.toml',
    'manifest.yaml',
    '.env',
    'README.md',
    'icon.svg',
    'vendor/style.css',
  ])('it returns false with unrelated files [%s]', (filename) => {
    expect(isForbiddenJSFile(filename)).toBeFalsy()
  })
})

describe('missingTsConfigSettings', () => {
  it('requires compilerOptions.allowUnreachableCode = false', () => {
    expect(
      missingTsConfigSettings({
        compilerOptions: { allowUnreachableCode: true },
      })
    ).toContainEqual(
      expect.stringMatching(/compilerOptions.allowUnreachableCode/)
    )
    expect(
      missingTsConfigSettings({
        compilerOptions: {},
      })
    ).toContainEqual(
      expect.stringMatching(/compilerOptions.allowUnreachableCode/)
    )
    expect(
      missingTsConfigSettings({
        compilerOptions: { allowUnreachableCode: false },
      })
    ).not.toContainEqual(
      expect.stringMatching(/compilerOptions.allowUnreachableCode/)
    )
  })
  it('requires compilerOptions.noImplicitAny = true', () => {
    expect(
      missingTsConfigSettings({
        compilerOptions: { noImplicitAny: false },
      })
    ).toContainEqual(expect.stringMatching(/compilerOptions.noImplicitAny/))
    expect(
      missingTsConfigSettings({
        compilerOptions: {},
      })
    ).toContainEqual(expect.stringMatching(/compilerOptions.noImplicitAny/))
    expect(
      missingTsConfigSettings({
        compilerOptions: { noImplicitAny: true },
      })
    ).not.toContainEqual(expect.stringMatching(/compilerOptions.noImplicitAny/))
  })
})
