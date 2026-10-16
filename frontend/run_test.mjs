import { createServer } from 'vite'

async function run() {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    await server.ssrLoadModule('./src/lib/test_extraction.ts')
  } catch (err) {
    console.error(err)
    process.exit(1)
  } finally {
    await server.close()
  }
}

run()
