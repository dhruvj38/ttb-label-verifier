import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app/App'
import type { OcrEngine } from '../../src/domain/types'
import { GOVERNMENT_WARNING } from '../../src/domain/warning'

const extractedText = `
45% Alc./Vol. (90 Proof)
OLD TOM DISTILLERY
750 mL
Kentucky Straight Bourbon Whiskey
Bottled by Old Tom Distillery, Frankfort, Kentucky
${GOVERNMENT_WARNING}
`

const splitIdentityText = extractedText
  .replace('OLD TOM DISTILLERY', 'OLD TOM\nDISTILLERY')
  .replace(
    'Kentucky Straight Bourbon Whiskey',
    'Kentucky Straight\nBourbon Whiskey',
  )

const deeplySplitIdentityText = extractedText
  .replace('OLD TOM DISTILLERY', 'OLD\nTOM\nDISTILLERY')
  .replace(
    'Kentucky Straight Bourbon Whiskey',
    'Kentucky\nStraight\nBourbon Whiskey',
  )

function mockEngine(overrides: Partial<OcrEngine> = {}): OcrEngine {
  return {
    warm: vi.fn().mockResolvedValue(120),
    recognize: vi.fn().mockResolvedValue({
      text: extractedText,
      confidence: 92,
      durationMs: 840,
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

async function addValidFile(
  user: ReturnType<typeof userEvent.setup>,
  name = 'label.png',
) {
  const file = new File(['label pixels'], name, { type: 'image/png' })
  await user.upload(screen.getByLabelText('Choose label images'), file)
}

async function completeFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Brand name'), 'OLD TOM DISTILLERY')
  await user.type(
    screen.getByLabelText('Class / type'),
    'Kentucky Straight Bourbon Whiskey',
  )
  await user.type(screen.getByLabelText('Alcohol by volume'), '45')
  await user.type(screen.getByLabelText('Net contents'), '750 mL')
  await completeNameAddress(user)
}

async function completeNameAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText('Name & address statement'),
    'Bottled by Old Tom Distillery, Frankfort, Kentucky',
  )
}

describe('App', () => {
  it('explains invalid upload types and preserves the empty workspace', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App ocrEngine={mockEngine()} />)
    await user.upload(
      screen.getByLabelText('Choose label images'),
      new File(['pdf'], 'artwork.pdf', { type: 'application/pdf' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'choose a JPEG, PNG, or WebP image',
    )
    expect(screen.queryByLabelText('Brand name')).not.toBeInTheDocument()
  })

  it('runs the complete review path with evidence-linked results', async () => {
    const user = userEvent.setup()
    const engine = mockEngine()
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await completeFields(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    await waitFor(() => expect(engine.recognize).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Manual review remains')).toBeInTheDocument()
    expect(screen.getAllByText('Pass').length).toBeGreaterThanOrEqual(7)
    expect(screen.getAllByText('Needs review').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('92% OCR confidence')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Inspect warning formatting' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Inspect government warning',
    })
    expect(within(dialog).getByLabelText('Zoom')).toHaveValue('150')
    expect(
      within(dialog).getByAltText('Zoomable label evidence for label.png'),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Close inspection' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /View extracted label text/ }),
    )
    expect(
      screen.getByText(/OLD TOM DISTILLERY/, { selector: 'pre' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm compliant' }))
    expect(await screen.findByText('All checks complete')).toBeInTheDocument()
    expect(screen.getAllByText('Pass').length).toBeGreaterThanOrEqual(8)
    await user.click(
      screen.getByRole('button', { name: 'Clear manual decision' }),
    )
    expect(await screen.findByText('Manual review remains')).toBeInTheDocument()
  })

  it('requires country of origin only for imports and links it to label evidence', async () => {
    const user = userEvent.setup()
    const engine = mockEngine({
      recognize: vi.fn().mockResolvedValue({
        text: `${extractedText}\nProduct of France`,
        confidence: 92,
        durationMs: 700,
      }),
    })
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await completeFields(user)

    expect(screen.queryByLabelText('Country of origin')).not.toBeInTheDocument()
    await user.selectOptions(
      screen.getByLabelText('Product origin'),
      'imported',
    )
    expect(screen.getByLabelText('Country of origin')).toBeRequired()
    expect(screen.getByRole('button', { name: 'Analyze label' })).toBeDisabled()
    await user.type(screen.getByLabelText('Country of origin'), 'France')
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const heading = await screen.findByRole('heading', {
      name: 'Country of origin',
    })
    const check = heading.closest('article')!
    expect(within(check).getByText('Pass')).toBeVisible()
    expect(check).toHaveTextContent('Product of France')
  })

  it('applies a complete valid manifest atomically and leaves completed labels out of the next OCR batch', async () => {
    const user = userEvent.setup()
    const engine = mockEngine()
    render(<App ocrEngine={engine} />)
    const input = screen.getByLabelText('Choose label images')
    await user.upload(input, [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ])
    const manifest = new File(
      [
        [
          'filename,brand,class_type,abv,net_contents,name_address,origin,country_of_origin',
          'one.png,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45,750 mL,"Bottled by Old Tom Distillery, Frankfort, Kentucky",domestic,',
          'two.png,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45,750 mL,"Bottled by Old Tom Distillery, Frankfort, Kentucky",domestic,',
        ].join('\n'),
      ],
      'values.csv',
      { type: 'text/csv' },
    )
    await user.upload(screen.getByLabelText('Import CSV manifest'), manifest)
    expect(await screen.findByText('Manifest applied')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Analyze 2 labels' }))
    await waitFor(() => expect(engine.recognize).toHaveBeenCalledTimes(2))

    await user.click(
      screen.getAllByRole('button', { name: 'Confirm compliant' })[0]!,
    )
    expect(await screen.findByText('All checks complete')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('Import CSV manifest'), manifest)
    expect(await screen.findByText('Manifest applied')).toBeInTheDocument()
    expect(screen.getByText('All checks complete')).toBeInTheDocument()
    expect(engine.recognize).toHaveBeenCalledTimes(2)

    const replacement = new File(
      [
        [
          'filename,brand,class_type,abv,net_contents,name_address,origin,country_of_origin',
          'one.png,Changed,Kentucky Straight Bourbon Whiskey,45,750 mL,"Bottled by Old Tom Distillery, Frankfort, Kentucky",domestic,',
        ].join('\n'),
      ],
      'incomplete.csv',
      { type: 'text/csv' },
    )
    await user.upload(screen.getByLabelText('Import CSV manifest'), replacement)
    expect(
      await screen.findByText('Manifest was not applied'),
    ).toBeInTheDocument()
    expect(screen.getAllByLabelText('Brand name')[0]).toHaveValue(
      'OLD TOM DISTILLERY',
    )
    expect(
      screen.getAllByRole('button', { name: 'Analyze again' }),
    ).toHaveLength(1)
    expect(engine.recognize).toHaveBeenCalledTimes(2)

    await user.upload(
      input,
      new File(['three'], 'three.png', { type: 'image/png' }),
    )
    await user.type(
      screen.getAllByLabelText('Brand name')[2]!,
      'OLD TOM DISTILLERY',
    )
    await user.type(
      screen.getAllByLabelText('Class / type')[2]!,
      'Kentucky Straight Bourbon Whiskey',
    )
    await user.type(screen.getAllByLabelText('Alcohol by volume')[2]!, '45')
    await user.type(screen.getAllByLabelText('Net contents')[2]!, '750 mL')
    await user.type(
      screen.getAllByLabelText('Name & address statement')[2]!,
      'Bottled by Old Tom Distillery, Frankfort, Kentucky',
    )
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))
    await waitFor(() => expect(engine.recognize).toHaveBeenCalledTimes(3))
  })

  it('matches a delayed manifest against the latest selected images before applying', async () => {
    const user = userEvent.setup()
    render(<App ocrEngine={mockEngine()} />)
    await addValidFile(user, 'first.png')
    let resolveText!: (value: string) => void
    const delayedText = new Promise<string>((resolve) => {
      resolveText = resolve
    })
    const manifest = new File(['placeholder'], 'values.csv', {
      type: 'text/csv',
    })
    Object.defineProperty(manifest, 'text', {
      configurable: true,
      value: () => delayedText,
    })

    await user.upload(screen.getByLabelText('Import CSV manifest'), manifest)
    await user.upload(
      screen.getByLabelText('Choose label images'),
      new File(['second'], 'second.png', { type: 'image/png' }),
    )
    resolveText(
      [
        'filename,brand,class_type,abv,net_contents,name_address,origin,country_of_origin',
        'first.png,Changed,Kentucky Straight Bourbon Whiskey,45,750 mL,"Bottled by Old Tom Distillery, Frankfort, Kentucky",domestic,',
      ].join('\n'),
    )

    expect(
      await screen.findByText('Manifest was not applied'),
    ).toBeInTheDocument()
    expect(screen.getAllByLabelText('Brand name')[0]).toHaveValue('')
    expect(screen.getAllByLabelText('Brand name')[1]).toHaveValue('')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Selected image "second.png" has no manifest row.',
    )
  })

  it('does not pass a brand that is only a substring of label evidence', async () => {
    const user = userEvent.setup()
    render(<App ocrEngine={mockEngine()} />)
    await addValidFile(user)
    await user.type(screen.getByLabelText('Brand name'), 'TOM')
    await user.type(
      screen.getByLabelText('Class / type'),
      'Kentucky Straight Bourbon Whiskey',
    )
    await user.type(screen.getByLabelText('Alcohol by volume'), '45')
    await user.type(screen.getByLabelText('Net contents'), '750 mL')
    await completeNameAddress(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const heading = await screen.findByRole('heading', { name: 'Brand name' })
    const brandCheck = heading.closest('article')
    expect(brandCheck).not.toBeNull()
    expect(within(brandCheck!).getByText('Mismatch')).toBeInTheDocument()
    expect(
      within(brandCheck!).getByText('OLD TOM DISTILLERY'),
    ).toBeInTheDocument()
  })

  it('reviews single-line identity fragments and passes their full multi-line values', async () => {
    const user = userEvent.setup()
    const engine = mockEngine({
      recognize: vi.fn().mockResolvedValue({
        text: splitIdentityText,
        confidence: 92,
        durationMs: 700,
      }),
    })
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await user.type(screen.getByLabelText('Brand name'), 'OLD TOM')
    await user.type(screen.getByLabelText('Class / type'), 'Kentucky Straight')
    await user.type(screen.getByLabelText('Alcohol by volume'), '45')
    await user.type(screen.getByLabelText('Net contents'), '750 mL')
    await completeNameAddress(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const fragmentBrand = await screen.findByRole('heading', {
      name: 'Brand name',
    })
    const fragmentClass = screen.getByRole('heading', { name: 'Class / type' })
    expect(
      within(fragmentBrand.closest('article')!).getByText('Needs review'),
    ).toBeVisible()
    expect(
      within(fragmentClass.closest('article')!).getByText('Needs review'),
    ).toBeVisible()

    await user.clear(screen.getByLabelText('Brand name'))
    await user.type(screen.getByLabelText('Brand name'), 'OLD TOM DISTILLERY')
    await user.clear(screen.getByLabelText('Class / type'))
    await user.type(
      screen.getByLabelText('Class / type'),
      'Kentucky Straight Bourbon Whiskey',
    )
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const fullBrand = await screen.findByRole('heading', { name: 'Brand name' })
    const fullClass = screen.getByRole('heading', { name: 'Class / type' })
    expect(
      within(fullBrand.closest('article')!).getByText('Pass'),
    ).toBeVisible()
    expect(
      within(fullClass.closest('article')!).getByText('Pass'),
    ).toBeVisible()
  })

  it('reviews multi-line identity fragments and passes their complete groups', async () => {
    const user = userEvent.setup()
    const engine = mockEngine({
      recognize: vi.fn().mockResolvedValue({
        text: deeplySplitIdentityText,
        confidence: 92,
        durationMs: 700,
      }),
    })
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await user.type(screen.getByLabelText('Brand name'), 'OLD TOM')
    await user.type(screen.getByLabelText('Class / type'), 'Kentucky Straight')
    await user.type(screen.getByLabelText('Alcohol by volume'), '45')
    await user.type(screen.getByLabelText('Net contents'), '750 mL')
    await completeNameAddress(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const fragmentBrand = await screen.findByRole('heading', {
      name: 'Brand name',
    })
    const fragmentClass = screen.getByRole('heading', { name: 'Class / type' })
    expect(
      within(fragmentBrand.closest('article')!).getByText('Needs review'),
    ).toBeVisible()
    expect(
      within(fragmentClass.closest('article')!).getByText('Needs review'),
    ).toBeVisible()

    await user.clear(screen.getByLabelText('Brand name'))
    await user.type(screen.getByLabelText('Brand name'), 'OLD TOM DISTILLERY')
    await user.clear(screen.getByLabelText('Class / type'))
    await user.type(
      screen.getByLabelText('Class / type'),
      'Kentucky Straight Bourbon Whiskey',
    )
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const fullBrand = await screen.findByRole('heading', { name: 'Brand name' })
    const fullClass = screen.getByRole('heading', { name: 'Class / type' })
    expect(
      within(fullBrand.closest('article')!).getByText('Pass'),
    ).toBeVisible()
    expect(
      within(fullClass.closest('article')!).getByText('Pass'),
    ).toBeVisible()
  })

  it('reviews multi-line suffix fragments before passing complete groups', async () => {
    const user = userEvent.setup()
    const engine = mockEngine({
      recognize: vi.fn().mockResolvedValue({
        text: deeplySplitIdentityText,
        confidence: 92,
        durationMs: 700,
      }),
    })
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await user.type(screen.getByLabelText('Brand name'), 'TOM DISTILLERY')
    await user.type(
      screen.getByLabelText('Class / type'),
      'Straight Bourbon Whiskey',
    )
    await user.type(screen.getByLabelText('Alcohol by volume'), '45')
    await user.type(screen.getByLabelText('Net contents'), '750 mL')
    await completeNameAddress(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const fragmentBrand = await screen.findByRole('heading', {
      name: 'Brand name',
    })
    const fragmentClass = screen.getByRole('heading', { name: 'Class / type' })
    expect(
      within(fragmentBrand.closest('article')!).getByText('Needs review'),
    ).toBeVisible()
    expect(
      within(fragmentClass.closest('article')!).getByText('Needs review'),
    ).toBeVisible()

    await user.clear(screen.getByLabelText('Brand name'))
    await user.type(screen.getByLabelText('Brand name'), 'OLD TOM DISTILLERY')
    await user.clear(screen.getByLabelText('Class / type'))
    await user.type(
      screen.getByLabelText('Class / type'),
      'Kentucky Straight Bourbon Whiskey',
    )
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const fullBrand = await screen.findByRole('heading', { name: 'Brand name' })
    const fullClass = screen.getByRole('heading', { name: 'Class / type' })
    expect(
      within(fullBrand.closest('article')!).getByText('Pass'),
    ).toBeVisible()
    expect(
      within(fullClass.closest('article')!).getByText('Pass'),
    ).toBeVisible()
  })

  it('keeps directly adjacent complete application identities in review', async () => {
    const user = userEvent.setup()
    const engine = mockEngine({
      recognize: vi.fn().mockResolvedValue({
        text: `OLD TOM\nBOURBON WHISKEY\n45% Alc./Vol.\n750 mL\n${GOVERNMENT_WARNING}`,
        confidence: 92,
        durationMs: 700,
      }),
    })
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await user.type(screen.getByLabelText('Brand name'), 'OLD TOM')
    await user.type(screen.getByLabelText('Class / type'), 'BOURBON WHISKEY')
    await user.type(screen.getByLabelText('Alcohol by volume'), '45')
    await user.type(screen.getByLabelText('Net contents'), '750 mL')
    await completeNameAddress(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const brand = await screen.findByRole('heading', { name: 'Brand name' })
    const classType = screen.getByRole('heading', { name: 'Class / type' })
    expect(
      within(brand.closest('article')!).getByText('Needs review'),
    ).toBeVisible()
    expect(
      within(classType.closest('article')!).getByText('Needs review'),
    ).toBeVisible()
  })

  it('reviews malformed OCR numeric prefixes instead of passing suffixes', async () => {
    const user = userEvent.setup()
    const engine = mockEngine({
      recognize: vi.fn().mockResolvedValue({
        text: `45% Alc./Vol.\nOLD TOM DISTILLERY\n-750 mL\nKentucky Straight Bourbon Whiskey\n${GOVERNMENT_WARNING}`.replace(
          '45% Alc./Vol.',
          '1,45% Alc./Vol.',
        ),
        confidence: 92,
        durationMs: 700,
      }),
    })
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await completeFields(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const abv = await screen.findByRole('heading', {
      name: 'Alcohol by volume',
    })
    const volume = screen.getByRole('heading', { name: 'Net contents' })
    expect(
      within(abv.closest('article')!).getByText('Needs review'),
    ).toBeVisible()
    expect(
      within(volume.closest('article')!).getByText('Needs review'),
    ).toBeVisible()
  })

  it('shows every conflicting numeric declaration in review evidence', async () => {
    const user = userEvent.setup()
    const engine = mockEngine({
      recognize: vi.fn().mockResolvedValue({
        text: extractedText
          .replace('45% Alc./Vol. (90 Proof)', '45% Alc./Vol.\n40% Alc./Vol.')
          .replace('750 mL', '750 mL\n1 L'),
        confidence: 92,
        durationMs: 700,
      }),
    })
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await completeFields(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))

    const abv = (
      await screen.findByRole('heading', {
        name: 'Alcohol by volume',
      })
    ).closest('article')!
    const volume = screen
      .getByRole('heading', { name: 'Net contents' })
      .closest('article')!
    expect(within(abv).getByText('Needs review')).toBeVisible()
    expect(abv).toHaveTextContent('45% Alc./Vol., 40% Alc./Vol.')
    expect(within(volume).getByText('Needs review')).toBeVisible()
    expect(volume).toHaveTextContent('750 mL, 1 L')
  })

  it('blocks malformed or out-of-range ABV before analysis', async () => {
    const user = userEvent.setup()
    const engine = mockEngine()
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await user.type(screen.getByLabelText('Brand name'), 'OLD TOM DISTILLERY')
    await user.type(
      screen.getByLabelText('Class / type'),
      'Kentucky Straight Bourbon Whiskey',
    )
    await user.type(screen.getByLabelText('Alcohol by volume'), '450')
    await user.type(screen.getByLabelText('Net contents'), '750 mL')

    expect(screen.getByLabelText('Alcohol by volume')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(
      screen.getByText('Enter a complete number from 0 to 100.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Analyze label' })).toBeDisabled()
    expect(engine.recognize).not.toHaveBeenCalled()
  })

  it('identifies malformed net contents and accepts a complete supported value', async () => {
    const user = userEvent.setup()
    const engine = mockEngine()
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await user.type(screen.getByLabelText('Brand name'), 'OLD TOM DISTILLERY')
    await user.type(
      screen.getByLabelText('Class / type'),
      'Kentucky Straight Bourbon Whiskey',
    )
    await user.type(screen.getByLabelText('Alcohol by volume'), '45')
    await user.type(screen.getByLabelText('Net contents'), 'garbage 750 mL')
    await completeNameAddress(user)

    const netContents = screen.getByLabelText('Net contents')
    expect(netContents).toHaveAttribute('aria-invalid', 'true')
    expect(netContents).toHaveAccessibleDescription(
      'Enter a positive number followed by mL, L, or fl oz.',
    )
    expect(screen.getByRole('button', { name: 'Analyze label' })).toBeDisabled()
    expect(engine.recognize).not.toHaveBeenCalled()

    await user.clear(netContents)
    await user.type(netContents, '0.75 L')
    expect(netContents).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'Analyze label' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))
    await waitFor(() => expect(engine.recognize).toHaveBeenCalledTimes(1))
  })

  it('blocks retry when net contents becomes invalid', async () => {
    const user = userEvent.setup()
    const engine = mockEngine({
      recognize: vi.fn().mockRejectedValue(new Error('Unreadable image')),
    })
    render(<App ocrEngine={engine} />)
    await addValidFile(user)
    await completeFields(user)
    await user.click(screen.getByRole('button', { name: 'Analyze label' }))
    expect(await screen.findByText('Unreadable image')).toBeVisible()

    const netContents = screen.getByLabelText('Net contents')
    await user.clear(netContents)
    await user.type(netContents, '750 mL trailing')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
  })

  it('isolates a failed item and lets the next queued item complete', async () => {
    const user = userEvent.setup()
    const recognize = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unreadable image'))
      .mockResolvedValueOnce({
        text: extractedText,
        confidence: 92,
        durationMs: 700,
      })
    render(<App ocrEngine={mockEngine({ recognize })} />)

    const input = screen.getByLabelText('Choose label images')
    await user.upload(input, [
      new File(['one'], 'glare.png', { type: 'image/png' }),
      new File(['two'], 'clear.png', { type: 'image/png' }),
    ])

    for (const field of screen.getAllByLabelText('Brand name')) {
      await user.type(field, 'OLD TOM DISTILLERY')
    }
    for (const field of screen.getAllByLabelText('Class / type')) {
      await user.type(field, 'Kentucky Straight Bourbon Whiskey')
    }
    for (const field of screen.getAllByLabelText('Alcohol by volume')) {
      await user.type(field, '45')
    }
    for (const field of screen.getAllByLabelText('Net contents')) {
      await user.type(field, '750 mL')
    }
    for (const field of screen.getAllByLabelText('Name & address statement')) {
      await user.type(
        field,
        'Bottled by Old Tom Distillery, Frankfort, Kentucky',
      )
    }

    await user.click(screen.getByRole('button', { name: 'Analyze 2 labels' }))
    expect(await screen.findByText('Unreadable image')).toBeInTheDocument()
    expect(await screen.findByText('Manual review remains')).toBeInTheDocument()
    expect(recognize).toHaveBeenCalledTimes(2)
  })
})
