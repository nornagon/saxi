const semver = require('semver')
const path = require('path')
const fs = require('fs')
const child_process = require('child_process')

const repositoryRoot = path.join(__dirname, '..')
const packageJsonPath = path.join(repositoryRoot, 'package.json')
const package = JSON.parse(fs.readFileSync(packageJsonPath))

const args = require('yargs')
  .strict()
  .option("level", {
    type: "string",
    choices: ["major", "premajor", "minor", "preminor", "patch", "prepatch", "prerelease"],
    demandOption: true
  })
  .parse()

const newVersion = semver.inc(package.version, args.level)

const newPackageJson = {...package, version: newVersion}
fs.writeFileSync(packageJsonPath, JSON.stringify(newPackageJson, null, 2) + "\n")

const packageLockJsonPath = path.join(repositoryRoot, 'package-lock.json')
const packageLock = JSON.parse(fs.readFileSync(packageLockJsonPath))
const newPackageLockJson = {...packageLock, version: newVersion}
fs.writeFileSync(packageLockJsonPath, JSON.stringify(newPackageLockJson, null, 2) + "\n")

function git(args) {
  const r = child_process.spawnSync("git", args, {cwd: repositoryRoot})
  if (r.status !== 0) {
    console.error(r.stderr)
    throw new Error(`Command failed: git ${args.join(" ")}`)
  }
}
git(["add", "package.json", "package-lock.json"])
git(["commit", "-m", `bump to ${newVersion}`])
git(["tag", `v${newVersion}`])

console.log(`Bumped version from ${package.version} -> ${newVersion}`)
