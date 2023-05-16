import * as fs from 'fs'
import { exit } from 'node:process';
import * as prompts from '@inquirer/prompts';
import { controlledSpawn } from '../utils/functions'
import { Signale, SignaleOptions } from 'signale'

const baseSignalOptions: SignaleOptions = {
  types: {
    complete: {
      badge: '**',
      color: 'cyan',
      label: 'completed'
    }
  },
  config: {
    displayScope: false,
  }
}

const s = new Signale({...baseSignalOptions, types: { ...baseSignalOptions.types, newline: { badge: '',label: '', color: 'black' } } })
const s_versioning = new Signale({
  ...baseSignalOptions,
  interactive: true,
  scope: 'versioning',
})
const s_git = new Signale({
  ...baseSignalOptions,
  interactive: true,
  scope: 'git',
})

export type Flags = {
  config: string
}
export type SemanticVersionType = 'major' | 'minor' | 'patch';


/**
 * COMMAND release
 * @param flags
 */
export const release = async (flags: Flags): Promise<void> => {
  return new Promise(async (resolve, reject) => {

  // STEP 0
  // Load the configuration
  if (!fs.existsSync(flags.config)) {
    s.error(`config file ${flags.config} not found, run \'init\' command to scaffold it.`)
    exit(0)
  }
  const config = JSON.parse(fs.readFileSync(flags.config, { encoding: 'utf8' }))

  // STEP 1
  // validate the configuration
  s.complete('configuration loaded successfully')
  s.newline()

  // STEP 2
  // choose the correct semantic version
  const semantic: SemanticVersionType = await prompts.select({
    message: 'choose a version type',
    choices: [{ value: 'major' }, { value: 'minor' }, { value: 'patch' }]
  }) as SemanticVersionType;
  const pack = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf-8'}))
  const computedVersion = _computeNewVersion(pack.version, semantic)

  // STEP 4
  // Update the version in package.json and package-lock.json
  s_versioning.pending('updating version ...')
  controlledSpawn('npm', ['pkg', 'set', `version=${computedVersion}`])
  controlledSpawn('npm', ['i'])
  s_versioning.complete(`version updated from ${pack.version} to ${computedVersion} in package.json and package-lock.json`)
  s.newline()

  // STEP 5
  // Ask configuration
  s.pending('asking for config data...')
  const message = await prompts.input({message: 'Insert the commit message:', default: `release: v${computedVersion}`})
  const doesTag = await prompts.confirm({message: 'Create the tag ?'})
  const doesPush = await prompts.confirm({message: 'Push ?'})
  s.complete('all data tacked')
  s.newline()

  // STEP 6
  // TODO: manually CHANGELOG generation

  // STEP 7
  // update git locally
  // TODO: choose the commit message format
  controlledSpawn('git', ['commit', `-am ${message}`, '--no-verify'], {})
  s.complete(`created commit with message ${message}`)
  doesTag && controlledSpawn('git', ['tag', `v${computedVersion}`], {})
  s.complete(`created tag v${computedVersion}`)
  s.newline()

  // STEP 8
  // push git changes
  s_git.pending('pushing new commit ...')
  doesPush && controlledSpawn('git', ['push'], {})
  s_git.complete('commit pushed')
  s.newline()
  s_git.pending('pushing new tags ...')
  doesTag && controlledSpawn('git', ['push', '--tags'], {})
  s_git.complete('tags pushed')
  s.newline()

  // STEP 9 (?)
  // create release on repository
  if (doesPush && config.github !== undefined) {
    s_git.pending('pushing release on github ...')
    fetch(
      `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/releases`,
      {
        method: 'POST',
        body: JSON.stringify({
          tag_name: `v${computedVersion}`,
          target_commitish: config.github.release_branch,
          name: `Release v${computedVersion}`,
          // body: log,
          draft: config.github.draft,
          prerelease: config.github.prerelease,
          generate_release_notes: config.github.generate_release_notes,
        }),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.github.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    ).then(
      (res) => {
        s_git.complete(`Release v${computedVersion} created`)
        s.newline()
        s.success('well done')
        resolve()
      }
    ).catch(
      (err) => {
        s_git.fatal(err)
        reject()
      }
    )}
  });

}

const _computeNewVersion = (version: string, result: SemanticVersionType): `${number}.${number}.${number}`  => {
  if (version.split('.').length !== 3) throw new Error('version is bad formatted')
  const semanticVersion = version.split('.').map(string => Number(string))
  switch (result) {
  case 'major':
    return `${semanticVersion[0] + 1}.0.0`
  case 'minor':
    return `${semanticVersion[0]}.${semanticVersion[1] + 1}.0`
  case 'patch':
    return `${semanticVersion[0]}.${semanticVersion[1]}.${semanticVersion[2] + 1}`
  }
}

