import * as fs from 'fs'

export const init = (): Promise<void> => {
  fs.writeFileSync('./.cosmodrome.json', JSON.stringify(
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
  console.log('.cosmodrome.json file was successfully created 🚀')
  // return
  return Promise.resolve()
}
