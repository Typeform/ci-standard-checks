import path from 'path'

import { getTypescriptConfigOptions } from './utils'
describe('Checks on Typescript config', () => {
  it('include base config ', () => {
    const tsconfig = path.resolve(
      `${__dirname}/../../test/fixtures/tsconfig.extended.json`
    )

    const tsconfigParsed = getTypescriptConfigOptions(tsconfig)

    expect(tsconfigParsed.compilerOptions).toEqual(
      expect.objectContaining({
        allowJs: true,
        allowUnreachableCode: false,
      })
    )
  })
})
