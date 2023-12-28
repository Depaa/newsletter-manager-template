export default class ValidationError extends Error {
  statusCode: number

  constructor (message: string = 'ValidationError', statusCode: number = 400) {
    super(message)
    Object.setPrototypeOf(this, ValidationError.prototype)
    this.name = 'ValidationError'
    this.statusCode = statusCode
  }
}
