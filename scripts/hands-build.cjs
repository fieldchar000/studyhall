// Build Roamies' Windows hands helper on GitHub Actions (free) and download it into build/roamies-hands.exe.
//   node scripts/hands-build.cjs [ref]      (ref defaults to main; push the source first)
const { join } = require('node:path')
const { startWorkflow, waitForRun, downloadArtifact, failureLog } = require('./android-build.cjs')

;(async () => {
  const ref = process.argv[2] || 'main'
  const run = await startWorkflow('hands.yml', { ref })
  console.log(`Building roamies-hands (${ref}): ${run.html_url}`)
  const done = await waitForRun(run.id)
  if (done.conclusion !== 'success') {
    console.error(await failureLog(run.id))
    throw new Error(`hands build ${done.conclusion}`)
  }
  await downloadArtifact(run.id, 'roamies-hands', join(__dirname, '..', 'build'))
  console.log('build/roamies-hands.exe ready')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
