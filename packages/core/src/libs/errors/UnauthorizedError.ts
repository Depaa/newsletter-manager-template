export default class UnauthorizedError extends Error {
  statusCode: number

  constructor (message: string = 'Unauthorized', statusCode: number = 401) {
    super(message)
    Object.setPrototypeOf(this, UnauthorizedError.prototype)
    this.name = 'UnauthorizedError'
    this.statusCode = statusCode
  }
}
