<p align="center">
  <a href="https://github.com/Typeform/ci-standard-checks/actions"><img alt="ci-standard-checks status" src="https://github.com/Typeform/ci-standard-checks/workflows/build-test/badge.svg"></a>
</p>

# Continuous Integration Standard Checks

This action is collecting certain standardized checks across the
Typeform organisation in a single central place, so that teams have an
easier time adopting them in their CI and platform teams have an
easier time rolling out new checks to teams. Win-win!

Right now, included checks are:

- jira-linked: never forget a Jira Issue key in your commits or PRs
  again!
- secret-scan: make sure you're never ever ever commiting a secret to
  your repo. _Shhh, it's a secret_ :shushing_face:

## How to use it

Add this action to your workflow by adding something like:

```yaml
jobs:
  ci_standard_checks: # make sure the action works on a clean machine without building
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - uses: Typeform/ci-standard-checks@v1
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN  }}
          dockerUsername: ${{ secrets.GITLEAKS_DOCKER_USERNAME }}
          dockerPassword: ${{ secrets.GITLEAKS_DOCKER_PASSWORD }}
```

## Adding new Checks

We use GitHub actions toolkit. See the [toolkit
documentation](https://github.com/actions/toolkit/blob/master/README.md#packages)
for the various packages.

We have a wrapper for `@actions/github` in
`.src/infrasctructure/github` that's meant to hold handy helper
methods for accesing data from GitHub that the action might care about
(e.g. info about the PR that triggered the action). They also provide
an extra abstraction layer that is easier to mock in your tests than
pure Octokit. If you need more info from GitHub in your check,
consider adding new helper methods to this class instead of using
`@actions/github` directly.

Right now, we support two ways of adding new checks. Typescript and
Bash.

### Typescript Checks

Typescript checks implement the `Check` interface. This is very simple
interface which defines and object with two fields:

- `name` - the name of the check
- `run` - an async function that runs the code of your check

To make your check pass, return a value. To make it fail, throw an
`Error`. The error message will be caught and printed to the action
output.

### Bash Checks

Bash checks are created using the function `bashCheck` from
`./src/checks/bash.ts` like, for example:

```typescript
bashCheck({
  name: 'my-check-name',
  inputs: ['myInput1', 'myInput2'],
})
```

This will create a check called `my-check-name`. To provide it some
code to run, create a `my-check-name` folder inside the `./scripts`
folder and add a `run.sh` script to it. This will be your main
entrypoint, but feel free to add anything else that your script might
need in that folder or break your script into more scripts.

Inputs listed in the check definition will be read using
`core.getInput` from `@actions/core` and passed down to your script
and environment variables in all uppercase. So, following the example,
your `run.sh` script would have two env vars: `MYINPUT1` and
`MYINPUT2` with the values set to whatever you passed to the action in
your workflow file.

## Development Workflow and Releasing

This is mostly from the action template we used and it's bound to
change in the near future. We plan on automating releases based on
conventional commits.

### Code in Main

> First, you'll need to have a reasonably modern version of `node` handy. This won't work with versions older than 9, for instance.

Install the dependencies

```bash
$ yarn
```

Build the typescript and package it for distribution

```bash
$ yarn run build && yarn run package
```

Run the tests :heavy_check_mark:

```bash
$ yarn test

 PASS  ./index.test.js
  ✓ throws invalid number (3ms)
  ✓ wait 500 ms (504ms)
  ✓ test runs (95ms)

...
```

### Publish to a distribution branch

Actions are run from GitHub repos so we will checkin the packed dist folder.

Then run [ncc](https://github.com/zeit/ncc) and push the results:

```bash
$ yarn run package
$ git add dist
$ git commit -a -m "prod dependencies"
$ git push origin releases/v1
```

Note: We recommend using the `--license` option for ncc, which will create a license file for all of the production node modules used in your project.

Your action is now published! :rocket:

See the [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

### Validate

You can now validate the action by referencing `./` in a workflow in your repo (see [test.yml](.github/workflows/test.yml))

```yaml
uses: ./
with:
  milliseconds: 1000
```

See the [actions tab](https://github.com/Typeform/ci-standard-checks/actions) for runs of this action! :rocket:

### Usage:

After testing you can [create a v1 tag](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md) to reference the stable and latest V1 action
