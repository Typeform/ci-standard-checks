import * as path from 'path'

export default function getScriptsDir(): string {
  return path.join(__dirname, '..', 'scripts')
}
