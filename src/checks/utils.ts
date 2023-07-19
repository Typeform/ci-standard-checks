import * as ts from 'typescript'

import { TsConfig } from './requiredTypeScript'

export function getTypescriptConfigOptions(filename: string): TsConfig {
  //@ts-expect-error Argument of type 'System' is not assignable to parameter of type 'ParseConfigFileHost'.
  const options = ts.getParsedCommandLineOfConfigFile(filename, {}, ts.sys)
  return { compilerOptions: options?.options }
}
