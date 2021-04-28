export default interface Check {
  name: string
  run: () => Promise<number | boolean>
}
