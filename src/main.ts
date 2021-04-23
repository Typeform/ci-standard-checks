import * as path from 'path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

async function run(): Promise<void> {
  try {
    const dockerUsername: string = core.getInput('docker-username')
    const dockerPassword: string = core.getInput('docker-password')

    const checkPath = path.join(__dirname, '..', 'checks', 'secrets-scan.sh')

    const env = {
      ...process.env,
      DOCKER_PASSWORD: dockerPassword,
      DOCKER_USERNAME: dockerUsername
    }

    await exec.exec('bash', [checkPath], {env})
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
