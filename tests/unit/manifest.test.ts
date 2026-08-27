import { describe, expect, it } from 'vitest'
import {
  MANIFEST_TEMPLATE,
  matchManifestToFiles,
  parseManifest,
} from '../../src/domain/manifest'

describe('CSV manifests', () => {
  it('parses a BOM, quoted RFC 4180 fields, escaped quotes, and CRLF records', () => {
    const result = parseManifest(
      '\uFEFF FILENAME , BRAND , CLASS_TYPE , ABV , NET_CONTENTS , NAME_ADDRESS , ORIGIN , COUNTRY_OF_ORIGIN\r\n"old, tom.png","Old ""Tom""",Bourbon,45,750 mL,"Imported by Example, Chicago Illinois",imported,France\r\n',
    )
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        filename: 'old, tom.png',
        values: {
          brand: 'Old "Tom"',
          classType: 'Bourbon',
          abv: '45',
          netContents: '750 mL',
          nameAddress: 'Imported by Example, Chicago Illinois',
          productOrigin: 'imported',
          countryOfOrigin: 'France',
        },
      },
    ])
  })

  it('reports headers, rows, duplicates, and invalid values without partial acceptance', () => {
    const result = parseManifest(
      'filename,brand,class_type,abv,net_contents,name_address,origin,country_of_origin\none.png,One,Bourbon,120,750 mL,"Bottled by One, Austin Texas",domestic,\none.png,Two,Bourbon,45,750 mL,"Imported by Two, Austin Texas",imported,\nthree.png,Three,Bourbon,45,,"Bottled by Three, Austin Texas",domestic,\n',
    )
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Row 2: ABV must be a number from 0 to 100.',
        'Row 3: country of origin is required for an imported product.',
        'Row 4: filename, brand, class/type, ABV, net contents, name/address, and origin are required.',
      ]),
    )
    expect(parseManifest('filename,brand,abv\na,b,45\n').errors).toEqual(
      expect.arrayContaining([
        'Header: missing class_type, net_contents, name_address, origin, country_of_origin.',
      ]),
    )
  })

  it('requires exactly one case-insensitive row for each non-ambiguous selected image', () => {
    const parsed = parseManifest(
      MANIFEST_TEMPLATE.replace('example-label.png', 'ONE.PNG'),
    )
    const match = matchManifestToFiles(parsed.rows, ['one.png', 'two.png'])
    expect(match.errors).toEqual([
      'Selected image "two.png" has no manifest row.',
    ])
    expect(
      matchManifestToFiles(parsed.rows, ['one.png', 'ONE.PNG']).errors,
    ).toEqual([
      'Selected images are ambiguous: one.png, ONE.PNG share the same filename.',
    ])
    expect(matchManifestToFiles(parsed.rows, ['different.png']).errors).toEqual(
      expect.arrayContaining([
        'Row 2: "ONE.PNG" does not match a selected image.',
        'Selected image "different.png" has no manifest row.',
      ]),
    )
  })
})
