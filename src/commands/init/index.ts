import {Command} from '@oclif/core'
import * as fs from 'node:fs'

export default class Init extends Command {
  static description = ''

  async run() {
    fs.writeFileSync('./.release.json', JSON.stringify(
      {
        github: {
          owner: '',
          repo: '',
          token: '',
          // eslint-disable-next-line camelcase
          release_branch: '',
          draft: false,
          prerelease: false,
          // eslint-disable-next-line camelcase
          generate_release_notes: false,
        },
        // eslint-disable-next-line comma-dangle
      }, null, 2)
    )
    console.log('.release.json file was successfully created 🚀')

    // end
    return Promise.resolve()
  }
}

