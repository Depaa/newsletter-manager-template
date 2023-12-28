import { type Handler, middyfy } from '@core/libs/middyWrapper'

const main: Handler<void, void, void> = async (event) => {
  console.debug(JSON.stringify(event))

  /**
   * TODO
   * if soft bounce, then ok
   * if hard bounce, then remove the email from the newsletter
   */

  return {
    statusCode: 200,
    body: {}
  }
}

export const handler = middyfy(main)
