import { type Handler, middyfy } from '@core/libs/middyWrapper'

const main: Handler<void, void, void> = async (event) => {
  console.debug(JSON.stringify(event))

  return {
    statusCode: 200,
    body: {}
  }
}

export const handler = middyfy(main)
