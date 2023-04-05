import { mocked } from 'ts-jest/utils'

import {
  github,
  PullRequestFiles,
  PullsGetResponse,
} from '../infrastructure/github'
import { glob, readFile } from '../infrastructure/fs'
import { BOT_USERS } from '../conditions/triggeredByBot'

import requiredTypeScript, {
  formatAdoptionPercentage,
  isForbiddenJSFile,
  measureTsAdoption,
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
      number: 5,
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

    it('returns true for PR with JS changes but good tsconfig and increasing TS adoption', async () => {
      pullRequestResponse.user.login = 'regular-user'
      mockGithub.getPullRequestFiles.mockResolvedValue([
        { filename: 'filename.js', additions: 100, deletions: 120 },
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

    it('returns true for PR with JS changes but good tsconfig and stable TS adoption', async () => {
      pullRequestResponse.user.login = 'regular-user'
      mockGithub.getPullRequestFiles.mockResolvedValue([
        { filename: 'filename.js', additions: 100, deletions: 100 },
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

    it('pins a GitHub comment with the adoption %', async () => {
      pullRequestResponse.user.login = 'regular-user'
      mockGithub.getPullRequestFiles.mockResolvedValue([
        { filename: 'file.ts' },
      ] as PullRequestFiles)
      mockGlob.mockImplementation(async ({ patterns }) => {
        if (patterns[0].includes('tsconfig.json')) {
          return ['tsconfig.json']
        } else if (patterns[0].includes('js')) {
          return ['file.js']
        } else if (patterns[0].includes('ts')) {
          return ['file.ts']
        }
        return []
      })
      mockReadFile.mockImplementation((path) => {
        switch (path) {
          case 'tsconfig.json':
            return JSON.stringify({
              compilerOptions: {
                allowUnreachableCode: false,
                noImplicitAny: true,
              },
            })
          case 'file.js':
            return 'this\nis a\njs\nfile'
          case 'file.ts':
            return 'this\nis a\nlonger\nts\nfile\nso it has\nmore\nadoption'
        }
        return ''
      })

      await requiredTypeScript.run()

      expect(mockGithub.pinComment).toHaveBeenCalledWith(
        5,
        /## TypeScript adoption/,
        '## TypeScript adoption\nCurrent adoption level: **66.7%**\n'
      )
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

describe('measureTsAdoption', () => {
  it('correctly calculates and formats adoption %', async () => {
    mockGlob.mockImplementation(async ({ patterns }) => {
      if (patterns[0].includes('js')) {
        return ['file.js']
      } else if (patterns[0].includes('ts')) {
        return ['file.ts']
      }
      return []
    })
    mockReadFile.mockImplementation((path) => {
      switch (path) {
        case 'file.js':
          return 'this\nis a\njs\nfile'
        case 'file.ts':
          return 'this\nis a\nlonger\nts\nfile\nso it has\nmore\nadoption'
      }
      return ''
    })

    await expect(
      measureTsAdoption().then((x) => formatAdoptionPercentage(x))
    ).resolves.toBe('66.7%')
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
