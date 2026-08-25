import { Hono } from 'hono'
import { CourseSchema } from '@scrimba/shared'

const app = new Hono()

app.get('/', (c) => c.text('Scrimba API'))

export default app
