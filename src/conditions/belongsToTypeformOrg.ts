import { github } from '../infrastructure/github'

export async function belongsToTypeformOrg(): Promise<boolean> {
  return github.context.repo.owner === 'Typeform'
}
