import { Readable } from 'stream'

import * as core from '@actions/core'
import { WebhookEventMap } from '@octokit/webhooks-types'
import { Endpoints } from '@octokit/types'
import CsvReadableStream from 'csv-reader'

import { github } from '../infrastructure/github'

import Check from './check'

type FileData =
  Endpoints['GET /repos/{owner}/{repo}/commits/{ref}']['response']['data']['files']

export type PiiDataTypeName =
  | 'us-phone-number'
  | 'email'
  | 'ssn'
  | 'credit-card-number'

export type Prediction = {
  detected: boolean
  dataType?: PiiDataTypeName[]
}

export type piiDataType = {
  type: PiiDataTypeName
  regexp: RegExp
}

export type PredictionResults = {
  file: string
  prediction: Prediction
}[]

const piiData: piiDataType[] = [
  {
    type: 'us-phone-number',
    regexp: new RegExp(
      /^\+?(\d+)?[ .-]?\(?(\d{3})\)?[ .-]?(\d{3})[ .-]?(\d{4})$/i
    ), // source https://gist.github.com/charles-rumley/e13b314662a203e5172a298bc66544b3
  },
  {
    type: 'email',
    regexp: new RegExp(/^[^@ \t\r\n]+@[^@ \t\r\n]+\.[^@ \t\r\n]+$/), // source https://ihateregex.io/expr/email
  },
  {
    type: 'ssn',
    regexp: new RegExp(
      /^(?!0{3})(?!6{3})[0-8]\d{2}-(?!0{2})\d{2}-(?!0{4})\d{4}$/
    ), // source https://ihateregex.io/expr/ssn/
  },
  {
    type: 'credit-card-number',
    regexp: new RegExp(
      /^(^4[0-9]{12}(?:[0-9]{3})?$)|(^(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}$)|(3[47][0-9]{13})|(^3(?:0[0-5]|[68][0-9])[0-9]{11}$)|(^6(?:011|5[0-9]{2})[0-9]{12}$)|(^(?:2131|1800|35\d{3})\d{11}$)$/
    ), // source https://ihateregex.io/expr/credit-card/
  },
]

const FileExtensionsToScan = ['.csv']
export const Ignorefile = '.piidetectionignore'
export const CsvDetectionThreshold = 0.7 // At least 70% of the CSV file lines must contain one of the detected data types
const NotionPage =
  'https://www.notion.so/typeform/PII-Detection-Check-11658ceb312c49a69681d2507e750748'

const piiDetection: Check = {
  name: 'pii-detection',
  async run(): Promise<boolean> {
    if (!['push', 'pull_request'].includes(github.context.eventName)) {
      core.info(
        'PII detection will only run on "push" and "pull_request" events. Skipping...'
      )
      return true
    }

    const filesData =
      github.context.eventName === 'push'
        ? await downloadFilesDataFromPush()
        : await downloadFilesDataFromPullRequest()

    const ignoreFiles = await getFilesToIgnore(Ignorefile)

    const filesToBeScanned = getCandidateFiles(filesData, ignoreFiles)

    if (!filesToBeScanned || filesToBeScanned.length === 0) {
      core.info('No files to be scanned')
      return true
    }

    const results: PredictionResults = []

    core.info(`Scanning ${filesToBeScanned.length} files for PII`)
    for (const file of filesToBeScanned) {
      let content: string
      try {
        if (!file.contents_url) {
          core.warning(`Unable to find file URL for ${JSON.stringify(file)}`)
          continue
        }

        if (!file.filename) {
          core.warning(`Unable to find file name for ${JSON.stringify(file)}`)
          continue
        }

        const ref = file.contents_url.split('?ref=')[1]
        content = await downloadFileContent(file.filename, ref)
      } catch (e) {
        core.error(`Error downloading ${file.filename}: ${e}`)
        continue
      }

      const prediction = await scanCsvForPii(content, 0.7)
      if (prediction.detected)
        results.push({
          file: file.filename,
          prediction: prediction,
        })
    }

    return printResultsAndExit(results)
  },
}
export default piiDetection

async function downloadFilesDataFromPush(): Promise<FileData> {
  const commitData = await github.getCommit(github.context.sha)
  return commitData.files
}

async function downloadFilesDataFromPullRequest(): Promise<FileData> {
  const pullPayload = github.context.payload as WebhookEventMap['pull_request']
  return github.getPullRequestFiles(pullPayload.pull_request.number)
}

export function scanCsvForPii(
  content: string,
  threshold: number
): Promise<Prediction> {
  let linesTotal = 0
  const lineMatches: { [matchType: string]: number } = {}
  for (const dataType of piiData) {
    lineMatches[dataType.type] = 0
  }

  const prediction = new Promise<Prediction>((resolve, reject) => {
    Readable.from(content)
      .pipe(new CsvReadableStream({ trim: true, skipEmptyLines: true }))
      .on('data', (line: string[]) => {
        linesTotal++

        for (const item of line) {
          for (const dataType of piiData) {
            if (dataType.regexp.test(item)) lineMatches[dataType.type]++
          }
        }
      })
      .on('error', (e) => {
        reject(e)
      })
      .on('end', () => {
        const p: Prediction = {
          detected: false,
          dataType: [],
        }

        for (const dataType of piiData) {
          if (lineMatches[dataType.type] > linesTotal * threshold) {
            p.detected = true
            p.dataType?.push(dataType.type)
          }
        }

        resolve(p)
      })
  })

  return prediction
}

export async function downloadFileContent(
  filepath: string,
  ref?: string | undefined
): Promise<string> {
  const response = await github.downloadContent(filepath, ref)
  if (!('content' in response)) {
    throw new Error('No content in response')
  }

  return response.encoding === 'base64'
    ? Buffer.from(response.content, 'base64').toString()
    : response.content
}

export async function getFilesToIgnore(
  ignoreFile: string
): Promise<Array<string>> {
  let ignoreFiles: Array<string> = []

  try {
    const content = await downloadFileContent(ignoreFile, github.context.ref)
    ignoreFiles = content.split('\n').filter((line) => line.length > 0)
  } catch (e) {
    // Skipping error if the file added in the ignorefile doesn't exist (HTTP 404)
    if (!e.status || (e.status && e.status !== 404)) {
      throw e
    }
  }

  return ignoreFiles
}

export function getCandidateFiles(
  files: FileData,
  ignoreFiles: Array<string>
): FileData {
  if (!files) throw new Error('files is undefined')

  const candidates = files.filter(
    (f) =>
      !(f.filename && ignoreFiles.includes(f.filename)) &&
      isFileExtensionToBeScanned(f.filename || '')
  )

  return candidates
}

export function isFileExtensionToBeScanned(filename: string): boolean {
  for (const ext of FileExtensionsToScan) {
    if (filename.endsWith(ext)) {
      return true
    }
  }
  return false
}

export function printResultsAndExit(results: PredictionResults): boolean {
  let shouldCheckPass = true

  if (results.length === 0) {
    core.info('No files with PII were detected')
    return shouldCheckPass
  }

  for (const r of results) {
    if (!r.prediction.detected) continue

    if (r.prediction.dataType && r.prediction.dataType.length > 0) {
      shouldCheckPass = false
      core.info(
        `The file ${r.file} contains ${r.prediction.dataType.toString()}`
      )
    }
  }

  if (!shouldCheckPass)
    core.info(`Looks like one or more files contain Personal Identifiable Information (PII) or it's a false positive.
Check out this Notion page to know what to do next ${NotionPage}`)

  return shouldCheckPass
}
