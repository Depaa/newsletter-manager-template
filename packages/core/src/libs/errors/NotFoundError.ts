export default class NotFoundError extends Error {
  statusCode: number

  constructor (message: string = 'Not Found', statusCode: number = 404) {
    super(message)
    Object.setPrototypeOf(this, NotFoundError.prototype)
    this.name = 'NotFoundError'
    this.statusCode = statusCode
  }
}
