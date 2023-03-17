export default interface Check {
  name: string
  optional?: boolean
  run: () => Promise<number | boolean>
}
