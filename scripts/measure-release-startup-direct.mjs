import { spawn } from 'node:child_process'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const executable = resolve(process.argv[2] || 'src-tauri/target/release/tiny-note.exe')
const runs = Number(process.argv[3] || 5)
const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
const median = values => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]

async function waitForReport(reportPath, timeout = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const entries = (await readFile(reportPath, 'utf8'))
        .split(/\r?\n/)
        .filter(Boolean)
        .flatMap(line => {
          try { return [JSON.parse(line)] } catch { return [] }
        })
      const staticShell = entries.find(entry => entry.state === 'static-shell')
      const shellReady = entries.find(entry => entry.state === 'shell-ready')
      const ready = entries.find(entry => entry.state === 'ready' || entry.state === 'error')
      if (staticShell && shellReady && ready) return { staticShell, shellReady, ready }
    } catch {}
    await delay(10)
  }
  throw new Error(`Timed out waiting for startup report ${reportPath}`)
}

const results = []
for (let index = 0; index < runs; index += 1) {
  const reportPath = join(tmpdir(), `tiny-note-startup-${process.pid}-${index}-${randomUUID()}.jsonl`)
  const launchedAt = Date.now()
  const child = spawn(executable, [], {
    env: { ...process.env, TINY_NOTE_STARTUP_REPORT: reportPath },
    stdio: 'ignore',
    windowsHide: false
  })
  const childExited = new Promise(resolveExit => child.once('exit', resolveExit))
  try {
    const report = await waitForReport(reportPath)
    results.push({
      run: index + 1,
      staticShell: Math.round(report.staticShell.browserTimestamp - launchedAt),
      vueShellReady: Math.round(report.shellReady.browserTimestamp - launchedAt),
      ready: Math.round(report.ready.browserTimestamp - launchedAt),
      state: report.ready.state
    })
  } finally {
    child.kill()
    await Promise.race([childExited, delay(2500)])
    await unlink(reportPath).catch(() => {})
  }
  await delay(1500)
}

const report = {
  executable,
  results,
  median: {
    staticShell: median(results.map(result => result.staticShell)),
    vueShellReady: median(results.map(result => result.vueShellReady)),
    ready: median(results.map(result => result.ready))
  },
  budgets: { staticShell: 500, ready: 1500 }
}
console.log(JSON.stringify(report, null, 2))
if (report.median.staticShell > report.budgets.staticShell || report.median.ready > report.budgets.ready) process.exitCode = 1
