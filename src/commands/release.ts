import * as fs from "fs";
import * as prompts from "@inquirer/prompts";
import { controlledSpawn, isArray } from "../utils/functions";
import { Signale, SignaleOptions } from "signale";
import {
  root_package_json_schema,
  workspace_package_json_schema
} from "../utils/validation/package-json";
import { cosmodrome_config_schema } from "../utils/validation/cosmodrome-config";
import axios from "axios";

const baseSignalOptions: SignaleOptions = {
  types: {
    complete: {
      badge: "**",
      color: "cyan",
      label: "completed"
    }
  },
  config: {
    displayScope: false
  }
};

const s = new Signale({
  ...baseSignalOptions,
  types: {
    ...baseSignalOptions.types,
    newline: { badge: "", label: "", color: "black" }
  }
});
const s_versioning = new Signale({
  ...baseSignalOptions,
  interactive: true,
  scope: "versioning"
});
const s_git = new Signale({
  ...baseSignalOptions,
  interactive: true,
  scope: "git"
});

export type Flags = {
  config: string;
};
export type SemanticVersionType = "major" | "minor" | "patch" | "pre-release";
export type VersionActionType =  "pre-release" | "promote" | "major" | "minor" | "patch";

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
    const output = controlledSpawn("git", ["status", "--short"]);
    if (output !== "") {
      s.error(
        "Found local changes, please commit or stash it before relaunch release command."
      );
      process.exit(0);
    }

    const _config = {
      run: ".",
      monorepo: false,
      isCurrentAPreRelease: false,
      detected_version: "",
      new_version: "",
      packageJson: {} as Record<string, unknown>,
      mustBeAPreRelease: false,
    };


    // load and validate the root package.json
    _config.packageJson = root_package_json_schema.parse(
      JSON.parse(fs.readFileSync("./package.json", { encoding: "utf-8" }))
    );

    // is a monorepo ?
    const workspaces = _config.packageJson.workspaces;
    if (isArray(workspaces)) {
      const workspace = await prompts.select({
        message: "choose the workspace",
        choices: workspaces.map((workspace_path: string) => {
          return {
            value: workspace_path
          };
        })
      });
      // update config
      _config.run = workspace;
      _config.monorepo = true;
      _config.packageJson = workspace_package_json_schema.parse(
        JSON.parse(
          fs.readFileSync(`${workspace}/package.json`, { encoding: "utf-8" })
        )
      );
    }

    // STEP 0
    // Load the configuration
    if (!fs.existsSync(flags.config)) {
      s.error(
        `config file ${flags.config} not found, run 'init' command to scaffold it.`
      );
      process.exit(0);
    }
    const config = cosmodrome_config_schema.parse(
      JSON.parse(fs.readFileSync(flags.config, { encoding: "utf8" }))
    );

    // STEP 1
    // validate the configuration
    s.complete("configuration loaded successfully");
    s.newline();

    // repo configuration
    const repo_config = {
      tagName: "",
      releaseName: "",
      commitMessage: ""
    };

    // check if pre-release
    _config.detected_version = _config.packageJson.version as string;
    const isPreRelease = new RegExp(`\\d+\\.\\d+\\.\\d+-${config.preReleasePrefix}\\.\\d+`).test(_config.detected_version);
    _config.isCurrentAPreRelease = isPreRelease;
    _config.mustBeAPreRelease = isPreRelease;

    // STEP 2
    // choose the correct semantic version
    const choices: { value: string }[] = isPreRelease 
      ? [{ value: 'pre-release' }, { value: 'promote' }] 
      : [{ value: "major" }, { value: "minor" }, { value: "patch" }];
    const action = (await prompts.select({
      message: "choose a version type",
      choices: choices,
    })) as VersionActionType;

    if (action === 'promote') {
      _config.mustBeAPreRelease = false;
    }

    if (!_config.isCurrentAPreRelease) {
      _config.mustBeAPreRelease = await prompts.confirm({
        message: "Is a pre-release ?",
        default: false
      });
    }

    const newComputedVersion = _computeNewVersion(
      _config.detected_version,
      action,
    config.preReleasePrefix, 
      action === 'pre-release' || _config.mustBeAPreRelease
    );

    _config.new_version = newComputedVersion;
    const slug: string|null = _config.packageJson.slug as string || null;
    const projectNameOrSlug = slug || _config.packageJson.name;

    const commitPrefix: string = config.releaseCommitPrefix;
    repo_config.tagName = _config.monorepo ? `${projectNameOrSlug}@v${_config.new_version}` : `v${_config.new_version}`;
    repo_config.releaseName = repo_config.tagName;
    repo_config.commitMessage = `${commitPrefix}: ${repo_config.releaseName}`;

    // STEP 3
    // Update the version in package.json and package-lock.json
    s_versioning.pending("updating version ...");
    controlledSpawn("npm", ["pkg", "set", `version=${_config.new_version}`], {
      cwd: _config.run
    });
    controlledSpawn("npm", ["i"], { cwd: _config.run });
    s_versioning.complete(
      `version updated from ${_config.detected_version} to ${_config.new_version} in package.json and package-lock.json`
    );
    s.newline();

    // STEP 4
    // Ask configuration
    s.pending("asking for config data...");
    const message = await prompts.input({
      message: "Insert the commit message:",
      default: repo_config.commitMessage
    });
    const doesTag = await prompts.confirm({ message: "Create the tag ?" });
    const doesPush = await prompts.confirm({ message: "Push ?" });

    // choose repository provider type
    const git_provider: "GitHub" | "DevOps" = (await prompts.select({
      message: "Choose the repository provider",
      choices: [{ value: "GitHub" }, { value: "DevOps" }]
    })) as "GitHub" | "DevOps";

    const git_provider_config = {
      isDraft: false,
      doesGenerateReleaseNotes: true,
      releaseBranchName: controlledSpawn("git", [
        "branch",
        "--show-current"
      ]).trim()
    };

    if (git_provider === "GitHub") {
      git_provider_config.isDraft = await prompts.confirm({
        message: "Sign release as draft ?",
        default: git_provider_config.isDraft
      });
      git_provider_config.doesGenerateReleaseNotes = await prompts.confirm({
        message: "Does generate auto release notes ?",
        default: git_provider_config.doesGenerateReleaseNotes
      });
      git_provider_config.releaseBranchName = await prompts.input({
        message: "Insert the git branch name for release ( default current ):",
        default: git_provider_config.releaseBranchName
      });
    }

    s.complete("all data tacked");
    s.newline();

    // STEP 5
    // TODO: manually CHANGELOG generation

    // STEP 6
    // update git locally
    controlledSpawn("git", [
      "commit",
      `-am ${message}`,
      "--author",
      `${config.git.authorUsername} <${config.git.authorEmail}>`,
      "--no-verify"
    ]);
    s.complete(`created commit with message ${message}`);
    doesTag && controlledSpawn("git", ["tag", repo_config.tagName]);
    s.complete(`created tag ${repo_config.tagName}`);
    s.newline();

    // STEP 7
    // push git changes
    s_git.pending("pushing new commit ...");
    doesPush && controlledSpawn("git", ["push"], {});
    s_git.complete("commit pushed");
    s.newline();
    s_git.pending("pushing new tags ...");
    doesTag && controlledSpawn("git", ["push", "--tags"], {});
    s_git.complete("tags pushed");
    s.newline();

    // STEP 8 (?)
    // create release on repository
    if (git_provider === "GitHub" && !config.github) {
      s.error(
        "missing 'github' configuration inside the .cosmodrome.json file"
      );
      process.exit(0);
    }
    if (git_provider === "GitHub" && doesPush && config.github) {
      s_git.pending("pushing release on github ...");
      axios
        .post(
          `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/releases`,
          {
            tag_name: repo_config.tagName,
            target_commitish: git_provider_config.releaseBranchName,
            name: repo_config.releaseName,
            // body: log,
            draft: git_provider_config.isDraft,
            prerelease: _config.mustBeAPreRelease,
            generate_release_notes: git_provider_config.doesGenerateReleaseNotes
          },
          {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${config.github.token}`,
              "X-GitHub-Api-Version": "2022-11-28"
            }
          }
        )
        .then(res => {
          s_git.complete(`Release ${repo_config.releaseName} created`);
          s.newline();
          s.success("well done 🚀 !!");
          resolve();
        })
        .catch(err => {
          fs.writeFileSync("./cosmodrome.logs", err);
          reject();
        });
    }
  });
};

/**
 * How to:
 * 
 * A. stable:       a.b.c
 * major           (a+1).0.0
 * minor            a.(b+1).0
 * patch            a.b.(c+1)
 * major-pr        (a+1).0.0-x.1
 * minor-pr         a.(b+1).0-x.1
 * patch-pr         a.b.(c+1)-x.1
 * 
 * B. pre-release:   a.b.c-x.d
 * pre-release       a.b.c-x.(d+1)
 * promote           a.b.c
 * 
 * example:
 * 0.0.1        patch
 * 0.0.2        patch
 * 0.0.3        minor
 * 0.1.0        patch
 * 0.1.2        major-pr
 * 1.0.0-x.1    pre-release
 * 1.0.0-x.2    promote
 * 1.0.0        minor-pr
 * 1.1.0-x.1
 */
export const _computeNewVersion = (
  version: string,
  action: VersionActionType,
  preReleasePrefix: string,
  mustProducePreRelease: boolean,
): `${number}.${number}.${number}` | `${number}.${number}.${number}-${string}.${number}` => {
  if (version.split(".").length < 3)
    throw new Error("version is bad formatted");

  const stableSemanticVersionPieces: number[] = version
    .split('-')[0]
    .split(".")
    .slice(0, 3)
    .map(i => Number(i));
  
  const preReleasePiece: string|null = version.split('-').pop() || null;
  const [_, preReleaseNumber] = preReleasePiece?.split('.') || [null, null]

  switch (action) {
    case "major":
      return mustProducePreRelease ? `${stableSemanticVersionPieces[0] + 1}.0.0-${preReleasePrefix}.1` :`${stableSemanticVersionPieces[0] + 1}.0.0`;
    case "minor":
      return mustProducePreRelease ? `${stableSemanticVersionPieces[0]}.${stableSemanticVersionPieces[1] + 1}.0-${preReleasePrefix}.1` : `${stableSemanticVersionPieces[0]}.${stableSemanticVersionPieces[1] + 1}.0`;
    case "patch":
      return mustProducePreRelease ? `${stableSemanticVersionPieces[0]}.${stableSemanticVersionPieces[1]}.${
        stableSemanticVersionPieces[2] + 1
      }-${preReleasePrefix}.1` :  `${stableSemanticVersionPieces[0]}.${stableSemanticVersionPieces[1]}.${
        stableSemanticVersionPieces[2] + 1
      }`;

    case 'pre-release':
      return `${stableSemanticVersionPieces[0]}.${stableSemanticVersionPieces[1]}.${
        stableSemanticVersionPieces[2]}-${preReleasePrefix}.${Number(preReleaseNumber) + 1}`;
    case 'promote':
      return `${stableSemanticVersionPieces[0]}.${stableSemanticVersionPieces[1]}.${
        stableSemanticVersionPieces[2]}`;
  }
};
