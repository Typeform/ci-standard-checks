import exp from 'constants'
import { mocked } from 'ts-jest/utils'

import { Content, github } from '../infrastructure/github'

import {
  CsvDetectionThreshold,
  getFilesToIgnore,
  getCandidateFiles,
  isFileExtensionToBeScanned,
  Ignorefile,
  Prediction,
  PredictionResults,
  printResultsAndExit,
  scanCsvForPii,
} from './piiDetection'

const mockGithub = mocked(github, true)

jest.mock('../infrastructure/github')

class HTTPError extends Error {
  status: number
  constructor(code: number, message: string) {
    super(message)
    this.status = code
  }
}

const sampleDownloadFileResponse: Content = {
  content: Buffer.from('hello').toString('base64'),
  download_url:
    'https://raw.githubusercontent.com/Typeform/ci-standard-checks/185044902e85ee654c0897825bf18aa040604b56/scripts/secrets-scan/run.sh',
  encoding: 'base64',
  git_url:
    'https://api.github.com/repos/Typeform/ci-standard-checks/git/blobs/e38f43b95777e36d3c147660b288d2e8a3a6ea27',
  html_url:
    'https://github.com/Typeform/ci-standard-checks/blob/185044902e85ee654c0897825bf18aa040604b56/scripts/secrets-scan/run.sh',
  name: 'run.sh',
  path: 'scripts/secrets-scan/run.sh',
  sha: 'e38f43b95777e36d3c147660b288d2e8a3a6ea27',
  size: 3020,
  type: 'file',
  url: 'https://api.github.com/repos/Typeform/ci-standard-checks/contents/scripts/secrets-scan/run.sh?ref=185044902e85ee654c0897825bf18aa040604b56',
  _links: {
    git: null,
    html: null,
    self: '',
  },
}

describe('scanCsvForPii', () => {
  it('returns a prediction with a positive detection of type us-phone-number when the content contains that type of data', async () => {
    const sampleData = `data,data,data,+1 800 444 4444,data
data,data,data,+1 800 444 4444,data
data,data,data,+1 800 444 4444,data
`
    const expectedPrediction: Prediction = {
      detected: true,
      dataType: ['us-phone-number'],
    }

    const actualPrediction = await scanCsvForPii(
      sampleData,
      CsvDetectionThreshold
    )

    expect(actualPrediction).toEqual(expectedPrediction)
  })

  it('returns a prediction with a negative detection when there are less than CsvDetectionThreshold * csv_lines items', async () => {
    const sampleData = `data,data,data,+1 800 444 4444,data
data,data,data,+1 800 444 4444,data
data,data,data,+1 800 444 4444,data
data,data,data,data,data
data,data,data,data,data
data,data,data,data,data
data,data,data,data,data
data,data,data,data,data
data,data,data,data,data
data,data,data,data,data
`
    const expectedPrediction: Prediction = {
      detected: false,
      dataType: [],
    }

    const actualPrediction = await scanCsvForPii(
      sampleData,
      CsvDetectionThreshold
    )

    expect(actualPrediction).toEqual(expectedPrediction)
  })

  it('returns a prediction with a positive detection of type email and ssn when those are present in the content', async () => {
    const sampleData = `data,489-36-8350,data,someone@mail.com,data
data,514-14-8905,data,another.person@mail.co.uk,data
data,690-05-5315,data,my@personal.mail,data
`
    const expectedPrediction: Prediction = {
      detected: true,
      dataType: ['email', 'ssn'],
    }

    const actualPrediction = await scanCsvForPii(
      sampleData,
      CsvDetectionThreshold
    )

    expect(actualPrediction).toEqual(expectedPrediction)
  })
})

describe('getFilesToIgnore', () => {
  it('returns an empty string array if there is no .piidetectionignore file', async () => {
    github.downloadContent = jest.fn(() => {
      throw new HTTPError(404, 'Not Found')
    })
    const result = await getFilesToIgnore(Ignorefile)
    expect(result).toEqual([])
  })

  it('throws an error if there was an error different than a 404 downloading the file', async () => {
    github.downloadContent = jest.fn(() => {
      throw new HTTPError(403, 'Forbidden')
    })
    await expect(getFilesToIgnore(Ignorefile)).rejects.toThrow()
  })

  it('returns a string array with the files to be ignored', async () => {
    const ignorefile = `fake-customer-data.csv
tests/some/dir/super-fake.csv
`
    const response = sampleDownloadFileResponse
    response.content = Buffer.from(ignorefile).toString('base64')

    mockGithub.downloadContent.mockResolvedValue(response as Content)

    const result = await getFilesToIgnore(Ignorefile)
    expect(result).toEqual([
      'fake-customer-data.csv',
      'tests/some/dir/super-fake.csv',
    ])
  })
})

describe('getCandidateFiles', () => {
  it('throws an error if file argument is undefined', () => {
    expect(() => getCandidateFiles(undefined, [])).toThrow()
  })

  it('returns an array with only the files that have files extensions to be scanned', () => {
    const allFiles = [
      { filename: 'customer-data.csv' },
      { filename: 'fun-meme.jpeg' },
    ]
    const ignoreFiles = new Array<string>()

    const result = getCandidateFiles(allFiles, ignoreFiles)
    expect(result).toEqual([{ filename: 'customer-data.csv' }])
  })

  it('returns an array without files marked as to ignore', () => {
    const allFiles = [
      { filename: 'customer-data.csv' },
      { filename: 'mocked-customer-data.csv' },
    ]
    const ignoreFiles = ['mocked-customer-data.csv']

    const result = getCandidateFiles(allFiles, ignoreFiles)
    expect(result).toEqual([{ filename: 'customer-data.csv' }])
  })
})

describe('isFileExtensionToBeScanned', () => {
  it('returns false if the file has an extension not to be scanned', () => {
    expect(isFileExtensionToBeScanned('some/path/file.exe')).toBeFalsy()
  })

  it('returns true if the file has an extension to be scanned', () => {
    expect(isFileExtensionToBeScanned('another/longer/path/results.csv')).toBe(
      true
    )
  })
})

describe('printResultsAndExit', () => {
  it('returns true if the results are empty', () => {
    const results: PredictionResults = []
    expect(printResultsAndExit(results)).toBeTruthy()
  })

  it('returns true if none of the predictions were positive', () => {
    const results: PredictionResults = [
      {
        file: 'some-file.csv',
        prediction: {
          detected: false,
          dataType: [],
        },
      },
      {
        file: 'another-file.csv',
        prediction: {
          detected: false,
        },
      },
    ]
    expect(printResultsAndExit(results)).toBeTruthy()
  })

  it('returns false if any of the predictions were positive', () => {
    const results: PredictionResults = [
      {
        file: 'some-file.csv',
        prediction: {
          detected: true,
          dataType: ['ssn'],
        },
      },
      {
        file: 'another-file.csv',
        prediction: {
          detected: false,
        },
      },
    ]
    expect(printResultsAndExit(results)).toBeFalsy()
  })
})
