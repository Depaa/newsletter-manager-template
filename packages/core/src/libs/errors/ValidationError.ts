export default class ValidationError extends Error {
  statusCode: number

  constructor (message: string = 'Validation', statusCode: number = 401) {
    super(message)
    Object.setPrototypeOf(this, ValidationError.prototype)
    this.name = 'ValidationError'
    this.statusCode = statusCode
  }
}
