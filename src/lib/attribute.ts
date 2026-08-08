import { SourceMapConsumer } from 'source-map'
import type { RawSourceMap } from './inputs.js'
import { APP_CODE, UNMAPPED, packageFromSource } from './packages.js'

export interface PackageSize {
  name: string
  bytes: number
  fileCount: number
}

export interface Attribution {
  totalBytes: number
  mappedBytes: number
  packages: PackageSize[]
}

interface Segment {
  column: number
  source: string | null
}

/**
 * Attribute every byte of the generated bundle to the original source that produced it.
 *
 * A source map gives you the start column of each mapping, never a length. So a mapping
 * owns the bytes from its own column up to wherever the next mapping on that line begins,
 * and the last mapping on a line runs to the end of the line. Anything before the first
 * mapping is bundler-generated and gets counted as unmapped rather than silently dropped —
 * losing it would make the reported total disagree with the file on disk.
 */
export async function attributeBundle(
  bundleSource: string,
  map: RawSourceMap,
): Promise<Attribution> {
  const consumer = await new SourceMapConsumer(map as never)

  try {
    const segmentsByLine = new Map<number, Segment[]>()

    consumer.eachMapping(
      (mapping) => {
        const line = mapping.generatedLine
        let segments = segmentsByLine.get(line)
        if (!segments) {
          segments = []
          segmentsByLine.set(line, segments)
        }
        segments.push({ column: mapping.generatedColumn, source: mapping.source })
      },
      null,
      // GENERATED_ORDER still leaves ties, so each line is sorted explicitly below.
      SourceMapConsumer.GENERATED_ORDER,
    )

    const bytesBySource = new Map<string, number>()
    const addBytes = (source: string, bytes: number): void => {
      if (bytes <= 0) return
      bytesBySource.set(source, (bytesBySource.get(source) ?? 0) + bytes)
    }

    const lines = bundleSource.split('\n')

    lines.forEach((lineText, index) => {
      // eachMapping reports 1-based generated lines; array indices are 0-based.
      const lineNumber = index + 1
      // The newline consumed by split() is real output, so count it back in.
      const lineLength = lineText.length + (index < lines.length - 1 ? 1 : 0)
      const segments = segmentsByLine.get(lineNumber)

      if (!segments || segments.length === 0) {
        addBytes(UNMAPPED, lineLength)
        return
      }

      segments.sort((a, b) => a.column - b.column)

      // Bytes before the first mapping belong to no original source.
      addBytes(UNMAPPED, Math.min(segments[0]!.column, lineLength))

      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i]!
        const start = Math.min(segment.column, lineLength)
        const next = segments[i + 1]
        const end = next ? Math.min(next.column, lineLength) : lineLength
        addBytes(segment.source ?? UNMAPPED, end - start)
      }
    })

    // Roll individual files up into the package that ships them.
    const packageBytes = new Map<string, number>()
    const packageFiles = new Map<string, Set<string>>()

    for (const [source, bytes] of bytesBySource) {
      const name = source === UNMAPPED ? UNMAPPED : packageFromSource(source)
      packageBytes.set(name, (packageBytes.get(name) ?? 0) + bytes)

      let files = packageFiles.get(name)
      if (!files) {
        files = new Set()
        packageFiles.set(name, files)
      }
      if (source !== UNMAPPED) files.add(source)
    }

    const packages: PackageSize[] = [...packageBytes.entries()]
      .map(([name, bytes]) => ({
        name,
        bytes,
        fileCount: packageFiles.get(name)?.size ?? 0,
      }))
      .sort((a, b) => b.bytes - a.bytes)

    const totalBytes = packages.reduce((sum, entry) => sum + entry.bytes, 0)
    const mappedBytes = packages
      .filter((entry) => entry.name !== UNMAPPED)
      .reduce((sum, entry) => sum + entry.bytes, 0)

    return { totalBytes, mappedBytes, packages }
  } finally {
    consumer.destroy()
  }
}

export { APP_CODE, UNMAPPED }
