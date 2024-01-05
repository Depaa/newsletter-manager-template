import { middyfy, type Handler } from '@core/libs/middyWrapper'

import collection from './NewsletterManager.postman_collection.json'

const main: Handler<void, void, void> = async (event) => {
  return {
    statusCode: 200,
    body: { ...collection }
  }
}

export const handler = middyfy(main)
