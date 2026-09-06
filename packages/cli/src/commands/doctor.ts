import { type TagVocabulary, loadConfig, resolveDiscovery, runDoctor } from '@testpilot/core'
import { collectTags } from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { doctorExitCode } from '../util/doctor-exit.js'
import { ExitCode } from '../util/exit-codes.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'
import { renderDoctorText } from '../util/render-doctor.js'
import { resolveRootDir } from '../util/resolve-config.js'

interface DoctorOptions {
  strictGuidance?: boolean
}

export async function doctorCommand(options: DoctorOptions, command: Command): Promise<void> {
  const globals = readGlobalOptions(command)

  let report: Awaited<ReturnType<typeof runDoctor>>
  try {
    report = await runDoctor({
      cwd: globals.cwd,
      configPath: globals.configPath,
      strictGuidance: options.strictGuidance === true,
      disablePlaywrightFallback: globals.playwrightDiscovery === false,
      tagVocabulary: () => readTagVocabulary(globals),
    })
  } catch (error) {
    if (!globals.quiet) {
      console.error(
        `testpilot doctor failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    process.exit(ExitCode.INTERNAL)
  }

  if (globals.verbose && !globals.quiet) {
    const testDir = report.checks.find((check) => check.id === 'test-directory')
    console.error(`[testpilot] ${testDir?.message ?? 'no test directory resolved'}`)
  }
  if (globals.json) {
    console.log(JSON.stringify(report))
  } else if (!globals.quiet) {
    console.log(renderDoctorText(report))
  }

  process.exit(doctorExitCode(report))
}

/**
 * Reads the suite's tag vocabulary for `doctor`'s `suites` check.
 *
 * Only called when suites are configured, so an untagged project pays nothing.
 * Deliberately does not reuse `resolveDiscoveryOrExit`: that helper exits the
 * process on a config problem, and `doctor` must report problems, never exit
 * from inside a check.
 */
async function readTagVocabulary(globals: GlobalOptions): Promise<TagVocabulary | null> {
  try {
    const loaded = await loadConfig({ cwd: globals.cwd, configPath: globals.configPath })
    const rootDir = resolveRootDir(globals.cwd, loaded.filepath)
    const resolved = resolveDiscovery(loaded, {
      rootDir,
      disablePlaywrightFallback: globals.playwrightDiscovery === false,
    })
    const report = await collectTags({
      cwd: globals.cwd,
      config: resolved.config,
      rootDir,
      scopes: resolved.scopes,
      discovery: resolved.discovery,
    })
    // Nothing scanned, or nothing recognized, is not a vocabulary at all — an
    // empty set would report every configured tag as a typo. Partial reads DO
    // return, carrying `complete: false`: a tag we found is confirmed good
    // whatever else was unreadable, and nulling everything made this check
    // silent on any real suite.
    if (report.summary.filesAnalyzed === 0 || report.summary.tests === 0) {
      return null
    }
    return {
      tags: new Set(report.tags.map((usage) => usage.tag)),
      complete: report.summary.vocabularyComplete,
    }
  } catch {
    return null
  }
}
