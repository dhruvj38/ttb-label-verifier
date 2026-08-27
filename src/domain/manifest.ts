import { parseExpectedAbv, parseExpectedNetContents } from './extract'
import type { ApplicationValues } from './types'

export const MANIFEST_HEADERS = [
  'filename',
  'brand',
  'class_type',
  'abv',
  'net_contents',
  'name_address',
  'origin',
  'country_of_origin',
] as const

export interface ManifestRow {
  rowNumber: number
  filename: string
  values: ApplicationValues
}

export interface ManifestParseResult {
  rows: ManifestRow[]
  errors: string[]
}

function parseCsvRecords(source: string): {
  records: string[][]
  errors: string[]
} {
  const text = source.replace(/^\uFEFF/, '')
  const records: string[][] = []
  const errors: string[] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let afterQuote = false
  let row = 1

  const finishRecord = () => {
    record.push(field.trim())
    if (record.some((value) => value.length > 0)) records.push(record)
    record = []
    field = ''
    afterQuote = false
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          afterQuote = true
        }
      } else {
        field += character
      }
      continue
    }
    if (
      afterQuote &&
      character !== ',' &&
      character !== '\r' &&
      character !== '\n' &&
      !/\s/.test(character)
    ) {
      errors.push(`Row ${row}: unexpected text after a closing quote.`)
    }
    if (character === '"' && field.trim().length === 0) {
      field = ''
      quoted = true
      afterQuote = false
    } else if (character === ',') {
      record.push(field.trim())
      field = ''
      afterQuote = false
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      finishRecord()
      row += 1
    } else {
      field += character
    }
  }
  if (quoted) errors.push(`Row ${row}: closing quote is missing.`)
  if (field.length > 0 || record.length > 0) finishRecord()
  return { records, errors }
}

export function parseManifest(source: string): ManifestParseResult {
  const { records, errors } = parseCsvRecords(source)
  if (records.length === 0)
    return { rows: [], errors: [...errors, 'The CSV is empty.'] }

  const header = records[0]!.map((value) => value.toLocaleLowerCase('en-US'))
  const missing = MANIFEST_HEADERS.filter((name) => !header.includes(name))
  const extra = header.filter(
    (name) =>
      !MANIFEST_HEADERS.includes(name as (typeof MANIFEST_HEADERS)[number]),
  )
  const duplicateHeaders = header.filter(
    (name, index) => header.indexOf(name) !== index,
  )
  if (
    missing.length ||
    extra.length ||
    duplicateHeaders.length ||
    header.length !== MANIFEST_HEADERS.length
  ) {
    return {
      rows: [],
      errors: [
        ...errors,
        ...(missing.length ? [`Header: missing ${missing.join(', ')}.`] : []),
        ...(extra.length ? [`Header: unexpected ${extra.join(', ')}.`] : []),
        ...(duplicateHeaders.length
          ? [`Header: duplicate ${[...new Set(duplicateHeaders)].join(', ')}.`]
          : []),
      ],
    }
  }

  const indexOf = (name: (typeof MANIFEST_HEADERS)[number]) =>
    header.indexOf(name)
  const rows: ManifestRow[] = []
  const filenames = new Map<string, number>()
  records.slice(1).forEach((record, index) => {
    const rowNumber = index + 2
    if (record.length !== MANIFEST_HEADERS.length) {
      errors.push(
        `Row ${rowNumber}: expected ${MANIFEST_HEADERS.length} columns, found ${record.length}.`,
      )
      return
    }
    const filename = record[indexOf('filename')]!.trim()
    const origin = record[indexOf('origin')]!.trim().toLocaleLowerCase('en-US')
    if (origin !== 'domestic' && origin !== 'imported')
      errors.push(`Row ${rowNumber}: origin must be domestic or imported.`)
    const values: ApplicationValues = {
      brand: record[indexOf('brand')]!.trim(),
      classType: record[indexOf('class_type')]!.trim(),
      abv: record[indexOf('abv')]!.trim(),
      netContents: record[indexOf('net_contents')]!.trim(),
      nameAddress: record[indexOf('name_address')]!.trim(),
      productOrigin: origin === 'imported' ? 'imported' : 'domestic',
      countryOfOrigin: record[indexOf('country_of_origin')]!.trim(),
    }
    if (
      [
        values.brand,
        values.classType,
        values.abv,
        values.netContents,
        values.nameAddress,
        origin,
      ].some((value) => value.length === 0) ||
      !filename
    ) {
      errors.push(
        `Row ${rowNumber}: filename, brand, class/type, ABV, net contents, name/address, and origin are required.`,
      )
      return
    }
    if (origin === 'imported' && !values.countryOfOrigin)
      errors.push(
        `Row ${rowNumber}: country of origin is required for an imported product.`,
      )
    if (origin === 'domestic' && values.countryOfOrigin)
      errors.push(
        `Row ${rowNumber}: country of origin must be blank for a domestic product.`,
      )
    if (parseExpectedAbv(values.abv) === null)
      errors.push(`Row ${rowNumber}: ABV must be a number from 0 to 100.`)
    if (parseExpectedNetContents(values.netContents) === null)
      errors.push(
        `Row ${rowNumber}: net contents must be a positive number followed by mL, L, or fl oz.`,
      )
    const key = filename.toLocaleLowerCase('en-US')
    const firstRow = filenames.get(key)
    if (firstRow !== undefined)
      errors.push(
        `Row ${rowNumber}: duplicate filename "${filename}" (also row ${firstRow}).`,
      )
    else filenames.set(key, rowNumber)
    rows.push({ rowNumber, filename, values })
  })
  return { rows, errors }
}

export interface ManifestMatchResult {
  valuesByFilename: Map<string, ApplicationValues>
  errors: string[]
}

export function matchManifestToFiles(
  rows: ManifestRow[],
  filenames: string[],
): ManifestMatchResult {
  const errors: string[] = []
  const imageNames = new Map<string, string[]>()
  for (const filename of filenames) {
    const key = filename.toLocaleLowerCase('en-US')
    imageNames.set(key, [...(imageNames.get(key) ?? []), filename])
  }
  for (const names of imageNames.values()) {
    if (names.length > 1)
      errors.push(
        `Selected images are ambiguous: ${names.join(', ')} share the same filename.`,
      )
  }
  const valuesByFilename = new Map<string, ApplicationValues>()
  for (const row of rows) {
    const key = row.filename.toLocaleLowerCase('en-US')
    if (!imageNames.has(key))
      errors.push(
        `Row ${row.rowNumber}: "${row.filename}" does not match a selected image.`,
      )
    else valuesByFilename.set(key, row.values)
  }
  for (const [key, names] of imageNames) {
    if (!valuesByFilename.has(key))
      errors.push(`Selected image "${names[0]}" has no manifest row.`)
  }
  return { valuesByFilename, errors }
}

export const MANIFEST_TEMPLATE = `${MANIFEST_HEADERS.join(',')}\nexample-label.png,Example Distillery,Kentucky Straight Bourbon Whiskey,45,750 mL,"Bottled by Example Distillery,Frankfort Kentucky",domestic,\n`
