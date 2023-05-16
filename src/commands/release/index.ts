import {Command} from '@oclif/core'
import {spawnSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as process from 'node:process'
const prompts = require('@inquirer/prompts')

type SemanticVersionType = 'major' | 'minor' | 'patch';
type ParamsOf<T extends (...params: readonly any[]) => any> = T extends ((...params: infer P) => any) ? P : never;

export default class Release extends Command {
  static description = ''

  private readonly _log = 'feat: starting application log\n' +
    'feat: feature one log\n' +
    'chore: typo in Application starting log'

  private computeNewVersion = (version: string, result: SemanticVersionType): `${number}.${number}.${number}`  => {
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

  private controlledSpawn = (...params: ParamsOf<typeof spawnSync>) => {
    const output = spawnSync(...params)
    if (output.status !== 0) {
      console.log(output.error)
      console.log(output.stdout?.toString() ?? '')
      console.log(output)
      throw new Error(output.stderr.toString())
    }

    return output.stdout.toString()
  }

  async run() {
    /**
     * STEP 0
     * Load the configuration
     */
    if (!fs.existsSync('./.release.json')) throw new Error('config file .release.json not found, run \'release init\'')
    const config = JSON.parse(fs.readFileSync('./.release.json', {encoding: 'utf8'}))

    /**
     * STEP 1
     * Ask the release type: ( minor, major or patch ) and update
     */
    // console.log('STEP 1')
    // console.log('Ask the release type: ( minor, major or patch )')
    const result: SemanticVersionType = await prompts.select({
      message: 'choose a version type:',
      choices: [
        {value: 'major'},
        {value: 'minor'},
        {value: 'patch'},
      ],
    })
    const pack = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf-8'}))
    console.log('current version:', pack.version)
    const computedVersion = this.computeNewVersion(pack.version, result)
    console.log('new version:', computedVersion)

    /**
     * STEP 2
     * Create a changelog from the latest commit message body.
     *
     * This step expects that the body of the latest commit contains
     * the squashed commits representing all the main important things
     * changed for the current release
     */
    // console.log('STEP 2')
    // console.log('Create a changelog from the latest commit message body.')
    // console.log('WARNING: using an example mocked body ... replace it')
    const log = process.env.NODE_ENV === 'development' ?
      this._log :
      spawnSync('git', ['log', '-1', '--pretty=format:"%b"']).output[1]?.toString()
      .replace(/"/g, '')
      .split('\n')
      .filter(line => line.length > 2)
      .map(line => `* ${line}`)
      .join('\n') ?? ''
    const changelog = fs.readFileSync('./CHANGELOG.md', {encoding: 'utf-8'})
    fs.writeFileSync('./CHANGELOG.md', `# ${computedVersion}\n### What's changed\n\n` + log + '\n---\n' + changelog)

    /**
     * STEP 3
     * Wait for any manual changes of the CHANGELOG.md
     */
    // console.log('STEP 3')
    // console.log('Wait for any manual changes of the CHANGELOG.md')
    await prompts.confirm({message: 'Is CHANGELOG.md ready ?'})

    /**
     * STEP 4
     * Update the version in package.json and package-lock.json
     */
    spawnSync('npm', ['pkg', 'set', `version=${computedVersion}`])
    spawnSync('npm', ['i'])

    /**
     * STEP 5
     * Update Git and Repository.
     *
     * [-] choose the commit message
     * [-] create the version corresponding tag
     * [-] push on the repo
     * [-] (?Github) create release
     */
    // console.log('STEP 4')
    // console.log('Update Git and Repository.')
    // TODO: choose the commit message format
    const message = await prompts.input({message: 'Insert the commit message:', default: `version: ${computedVersion}`})
    const doesTag = await prompts.confirm({message: 'Create the tag ?'})
    const doesPush = await prompts.confirm({message: 'Push ?'})
    doesTag && this.controlledSpawn('git', ['tag', `${computedVersion}`], {})
    doesTag && this.controlledSpawn('git', ['push', '--tags'], {})
    // console.log('OUTCOME: message', message, 'doesTag', doesTag, 'doesPush', doesPush)
    this.controlledSpawn('git', ['commit', `-am ${message}`, '--no-verify'], {})
    doesPush && this.controlledSpawn('git', ['push'], {})
    // spawnSync('git', [`commit -am '${message}'`], {}).output.toString()
    // create the release on GitHub
    if (doesPush && config.github !== undefined) {
      try {
        await fetch(
          `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/releases`,
          {
            method: 'POST',
            body: JSON.stringify({
              // eslint-disable-next-line camelcase
              tag_name: computedVersion,
              // eslint-disable-next-line camelcase
              target_commitish: config.github.release_branch,
              name: `Release ${computedVersion}`,
              body: log,
              draft: config.github.draft,
              prerelease: config.github.prerelease,
              // eslint-disable-next-line camelcase
              generate_release_notes: config.github.generate_release_notes,
            }),
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${config.github.token}`,
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        )
      } catch (error) {
        console.log('EXC', error)
      }
    }

    // end
    return Promise.resolve()
  }
}

