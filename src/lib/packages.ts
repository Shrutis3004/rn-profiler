/** Bytes that no mapping claims — bundler runtime, polyfills, module wrappers. */
export const UNMAPPED = '[unmapped]'

/** Your own source, i.e. anything not under node_modules. */
export const APP_CODE = '[your code]'

/**
 * Reduce a source-map source path to the npm package that owns it.
 *
 * The paths Metro emits are messy in practice, so each case is stripped before
 * the package is read off the end:
 *
 *  - `webpack://`, `file://` and `metro://` prefixes
 *  - `?` and `#` suffixes appended by loaders
 *  - Windows backslashes
 *  - pnpm's virtual store, `.pnpm/react-native@0.74.1/node_modules/react-native/…`,
 *    where a naive first-segment read yields the versioned directory name
 *  - nested dependencies, `node_modules/a/node_modules/b/…`, which belong to `b`
 *
 * In a monorepo a workspace package resolves through `node_modules` as a symlink,
 * so it is reported as the dependency it appears as rather than as app code —
 * that matches how it actually lands in the bundle.
 */
export function packageFromSource(source: string | null): string {
  if (!source) return UNMAPPED

  let path = source.replace(/\\/g, '/')

  // Bundler URL schemes, including webpack's `webpack:///./src/App.js`.
  path = path.replace(/^[a-z][a-z0-9+.-]*:\/{2,3}/i, '')
  // Loader suffixes: `App.tsx?platform=ios`, `index.js#fragment`.
  const cut = path.search(/[?#]/)
  if (cut !== -1) path = path.slice(0, cut)

  const marker = 'node_modules/'
  const last = path.lastIndexOf(marker)
  if (last === -1) return APP_CODE

  const segments = path
    .slice(last + marker.length)
    .split('/')
    .filter(Boolean)

  const first = segments[0]
  if (!first) return APP_CODE

  // pnpm's store puts a versioned directory where the package name would be;
  // the real package always follows a further `node_modules/`, which the
  // lastIndexOf above already skips to — so only a bare `.pnpm` can land here.
  if (first === '.pnpm') {
    const versioned = segments[1]
    if (!versioned) return APP_CODE
    // `react-native@0.74.1` or `@react-navigation+native@6.1.0`
    const withoutVersion = versioned.replace(/@[^@]*$/, '')
    return withoutVersion.replace('+', '/') || APP_CODE
  }

  // Scoped packages span two segments: @scope/name
  if (first.startsWith('@')) {
    const second = segments[1]
    return second ? `${first}/${second}` : first
  }

  return first
}
