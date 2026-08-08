# Contributing

Thanks for taking a look. Bug reports with a reproduction are the most useful thing you can send.

## Getting set up

```bash
git clone https://github.com/Shrutis3004/rn-profiler.git
cd rn-profiler
npm install
npm run build
npm test
```

`npm run dev` rebuilds on change. `npm run typecheck` runs TypeScript without emitting.

## Trying it locally

The repo ships a fixture so you do not need a React Native app to hack on the bundle analyser:

```bash
node dist/index.js bundle fixtures/demo-app.js
node dist/index.js bundle fixtures/demo-app.js --html /tmp/report.html
```

Fixtures are generated, not checked in — see `test/` for how they are built.

## Reporting a bug

Include the command you ran, what you expected, and what happened. For bundle issues, the
output of `--json` is more useful than a screenshot. If a package is attributed to the wrong
name, paste the offending path from the source map's `sources` array — that is almost always
enough to reproduce it.

## Pull requests

- One fix per pull request. An unrelated cleanup in the same diff makes it slower to review, not faster.
- Add a test. For attribution bugs that means a new path in the table in `test/packages.test.js`;
  for anything numeric it means asserting an exact value, not a range.
- Run `npm run typecheck && npm test` before pushing. CI runs on Node 18, 20 and 22.
- Match the surrounding style. There is no linter, so the existing code is the spec.

## Things worth knowing before you change the internals

**Every byte must be accounted for.** The sum of all package sizes has to equal the file size on
disk. Unattributed bytes go to `[unmapped]` rather than being dropped — there is a test enforcing
this, and it is the single most important invariant in the project.

**Never report an unmeasured thing as clean.** A component without `useRenderTracker` shows `—` in
the Wasted column, not `0`. A confident wrong number is worse than a visible gap.

**Do not trust a fixture you wrote yourself to catch a format bug.** The Hermes bytecode detector
was once wrong and its test encoded the same mistake, so both agreed and a real `.hbc` file passed
straight through. Where a binary format is involved, the test uses literal bytes copied from a real
file.
