import { handle } from 'hono/aws-lambda'
import { cloudApp } from './cloud.mjs'

export const handler = handle(cloudApp(process.env.POLICY_STORE_ID))
