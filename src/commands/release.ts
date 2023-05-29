import * as fs from 'fs'
import * as prompts from '@inquirer/prompts'
import {controlledSpawn, isArray} from '../utils/functions'
import {Signale, SignaleOptions} from 'signale'
import {root_package_json_schema, workspace_package_json_schema} from '../utils/validation/package-json'
import {cosmodrome_config_schema} from '../utils/validation/cosmodrome-config'
import axios from 'axios'

const baseSignalOptions: SignaleOptions = {
  types: {
    complete: {
      badge: '**',
      color: 'cyan',
      label: 'completed',
    },
  },
  config: {
    displayScope: false,
  },
}

const s = new Signale({
  ...baseSignalOptions,
  types: {...baseSignalOptions.types, newline: {badge: '', label: '', color: 'black'}},
})
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
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {

    // TODO: check environment ( git installed )
    // TODO: take before all date and then execute commands ...
    // TODO: error management

    // check for local pending changes
    const output = controlledSpawn('git', ['status', '--short'])
    if (output !== '') {
      s.error('Found local changes, please commit or stash it before relaunch release command.')
      process.exit(0)
    }

    // load and validate the root package.json
    const p_json = root_package_json_schema.parse(
      JSON.parse(
        fs.readFileSync('./package.json', {encoding: 'utf-8'}),
      ),
    )

    const _config = {
      run: '.',
      monorepo: false,
      detected_version: '',
      new_version: '',
    }

    // is a monorepo ?
    const workspaces = p_json.workspaces
    if (isArray(workspaces)) {
      const workspace = await prompts.select({
        message: 'choose the workspace',
        choices:
          workspaces.map((workspace_path: string) => {
            return {
              value: workspace_path,
            }
          }),
      })
      // update config
      _config.run = workspace
      _config.monorepo = true
    }

    // STEP 0
    // Load the configuration
    if (!fs.existsSync(flags.config)) {
      s.error(`config file ${flags.config} not found, run 'init' command to scaffold it.`)
      process.exit(0)
    }
    const config = cosmodrome_config_schema.parse(
      JSON.parse(
        fs.readFileSync(flags.config, {encoding: 'utf8'}),
      ),
    )

    // STEP 1
    // validate the configuration
    s.complete('configuration loaded successfully')
    s.newline()

    // repo configuration
    const repo_config = {
      tagName: '',
      releaseName: '',
      commitMessage: '',
    }

    // STEP 2
    // choose the correct semantic version
    const semantic: SemanticVersionType = await prompts.select({
      message: 'choose a version type',
      choices: [{value: 'major'}, {value: 'minor'}, {value: 'patch'}],
    }) as SemanticVersionType

    // MONOREPO
    if (_config.monorepo) {
      // read the target workspace package.json
      const target_p_json =
        workspace_package_json_schema.parse(
          JSON.parse(
            fs.readFileSync(`${_config.run}/package.json`, {encoding: 'utf-8'}),
          ),
        )
      // set repo config vars
      const workspace_new_version = _computeNewVersion(target_p_json.version, semantic)
      _config.detected_version = target_p_json.version
      _config.new_version = workspace_new_version
      repo_config.tagName = `${target_p_json.slug}@v${workspace_new_version}`
      repo_config.releaseName = `${target_p_json.name}@v${workspace_new_version}`
      repo_config.commitMessage = `release: ${target_p_json.name}@v${workspace_new_version}`
    }
    // NO MONOREPO
    else {
      // set repo config vars
      const root_new_version = _computeNewVersion(p_json.version, semantic)
      _config.detected_version = p_json.version
      _config.new_version = root_new_version
      repo_config.tagName = `v${root_new_version}`
      repo_config.releaseName = `v${root_new_version}`
      repo_config.commitMessage = `release: v${root_new_version}`
    }

    // STEP 3
    // Update the version in package.json and package-lock.json
    s_versioning.pending('updating version ...')
    controlledSpawn('npm', ['pkg', 'set', `version=${_config.new_version}`], {cwd: _config.run})
    controlledSpawn('npm', ['i'], {cwd: _config.run})
    s_versioning.complete(`version updated from ${_config.detected_version} to ${_config.new_version} in package.json and package-lock.json`)
    s.newline()

    // STEP 4
    // Ask configuration
    s.pending('asking for config data...')
    const message = await prompts.input({message: 'Insert the commit message:', default: repo_config.commitMessage})
    const doesTag = await prompts.confirm({message: 'Create the tag ?'})
    const doesPush = await prompts.confirm({message: 'Push ?'})

    // choose repository provider type
    const git_provider: 'GitHub' | 'DevOps' = await prompts.select({
      message: 'Choose the repository provider',
      choices: [
        {value: 'GitHub'},
        {value: 'DevOps'},
        // { value: 'GitLab' },
        // { value: 'BitBucket' }
      ],
    }) as 'GitHub' | 'DevOps'

    const git_provider_config = {
      isPreRelease: false,
      isDraft: false,
      doesGenerateReleaseNotes: true,
      releaseBranchName: controlledSpawn('git', ['branch', '--show-current']),
    }

    if (git_provider === 'GitHub') {
      git_provider_config.isPreRelease =
        await prompts.confirm({message: 'Is a pre-release ?', default: git_provider_config.isPreRelease})
      git_provider_config.isDraft =
        await prompts.confirm({message: 'Sign release as draft ?', default: git_provider_config.isDraft})
      git_provider_config.doesGenerateReleaseNotes =
        await prompts.confirm({
          message: 'Does generate auto release notes ?',
          default: git_provider_config.doesGenerateReleaseNotes,
        })
      git_provider_config.releaseBranchName =
        await prompts.input({
          message: 'Insert the git branch name for release ( default current ):',
          default: git_provider_config.releaseBranchName,
        })
    }

    s.complete('all data tacked')
    s.newline()

    // STEP 5
    // TODO: manually CHANGELOG generation

    // STEP 6
    // update git locally
    controlledSpawn('git', ['commit', `-am ${message}`, '--author', `${config.git.authorUsername} <${config.git.authorEmail}>`, '--no-verify'])
    s.complete(`created commit with message ${message}`)
    doesTag && controlledSpawn('git', ['tag', repo_config.tagName])
    s.complete(`created tag ${repo_config.tagName}`)
    s.newline()

    // STEP 7
    // push git changes
    s_git.pending('pushing new commit ...')
    doesPush && controlledSpawn('git', ['push'], {})
    s_git.complete('commit pushed')
    s.newline()
    s_git.pending('pushing new tags ...')
    doesTag && controlledSpawn('git', ['push', '--tags'], {})
    s_git.complete('tags pushed')
    s.newline()

    // STEP 8 (?)
    // create release on repository
    if (git_provider === 'GitHub' && !config.github) {
      s.error('missing \'github\' configuration inside the .cosmodrome.json file')
      process.exit(0)
    }
    if (git_provider === 'GitHub' && doesPush && config.github) {
      s_git.pending('pushing release on github ...')
      axios.post(
        `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/releases`,
        {
          tag_name: repo_config.tagName,
          target_commitish: git_provider_config.releaseBranchName,
          name: repo_config.releaseName,
          // body: log,
          draft: git_provider_config.isDraft,
          prerelease: git_provider_config.isPreRelease,
          generate_release_notes: git_provider_config.doesGenerateReleaseNotes,
        }, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${config.github.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      ).then(
        (res) => {
          console.log('SUCCESS')
          s.info(res)
          s_git.complete(`Release ${repo_config.releaseName} created`)
          s.newline()
          s.success('well done')
          resolve()
        },
      ).catch(
        (err) => {
          console.log('ERROR')
          s.info(err)
          s_git.fatal(err)
          reject()
        },
      )
    }
  })

}

const _computeNewVersion = (version: string, result: SemanticVersionType): `${number}.${number}.${number}` => {
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

