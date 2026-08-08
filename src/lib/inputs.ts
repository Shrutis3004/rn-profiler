import { access, open, readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

export interface BundleInputs {
  bundlePath: string
  mapPath: string
  bundleBytes: number
  mapBytes: number
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Metro emits the source map next to the bundle as `<bundle>.map`, but Expo's
 * `--dump-sourcemap` writes it as a sibling with the same basename. Try both
 * before giving up, so the common case needs no flags.
 */
export async function resolveInputs(bundleArg: string, mapArg?: string): Promise<BundleInputs> {
  const bundlePath = resolve(bundleArg)

  if (!(await exists(bundlePath))) {
    throw new Error(`No bundle at ${bundlePath}`)
  }

  const candidates = mapArg
    ? [resolve(mapArg)]
    : [`${bundlePath}.map`, bundlePath.replace(/\.(js|hbc)$/, '.map')]

  let mapPath: string | undefined
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      mapPath = candidate
      break
    }
  }

  if (!mapPath) {
    throw new Error(
      `No source map found for ${basename(bundlePath)}.\n` +
        `Looked for: ${candidates.join(', ')}\n` +
        `Generate one with: npx expo export --dump-sourcemap`,
    )
  }

  const [bundleStat, mapStat] = await Promise.all([stat(bundlePath), stat(mapPath)])

  return {
    bundlePath,
    mapPath,
    bundleBytes: bundleStat.size,
    mapBytes: mapStat.size,
  }
}

export interface RawSourceMap {
  version: number
  sources: string[]
  sourcesContent?: (string | null)[]
  mappings: string
  names?: string[]
  file?: string
}

export async function readSourceMap(mapPath: string): Promise<RawSourceMap> {
  const raw = await readFile(mapPath, 'utf8')

  let parsed: RawSourceMap
  try {
    parsed = JSON.parse(raw) as RawSourceMap
  } catch {
    throw new Error(`${mapPath} is not valid JSON — is it really a source map?`)
  }

  if (!Array.isArray(parsed.sources) || typeof parsed.mappings !== 'string') {
    throw new Error(`${mapPath} is missing "sources" or "mappings" — not a usable source map.`)
  }

  return parsed
}

/**
 * Hermes bytecode starts with the 64-bit magic 0x1F1903C103BC1FC6 written
 * little-endian, so on disk the first eight bytes are exactly these. Compared as
 * a byte sequence rather than as an integer: reading it back as a number invites
 * getting the endianness backwards, which is a mistake a hand-written fixture
 * will happily agree with.
 */
const HERMES_MAGIC = Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f])

/** True when the bundle is Hermes bytecode rather than JavaScript. */
export async function isHermesBytecode(bundlePath: string): Promise<boolean> {
  // Read only the header — these bundles run to several megabytes.
  const handle = await open(bundlePath, 'r')
  try {
    const header = Buffer.alloc(HERMES_MAGIC.length)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    return bytesRead === HERMES_MAGIC.length && header.equals(HERMES_MAGIC)
  } finally {
    await handle.close()
  }
}
