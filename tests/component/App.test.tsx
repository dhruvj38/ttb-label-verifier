import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app/App'
import type { OcrEngine } from '../../src/domain/types'
import { GOVERNMENT_WARNING } from '../../src/domain/warning'

const extractedText = `
OLD TOM DISTILLERY
Kentucky Straight Bourbon Whiskey
45% Alc./Vol. (90 Proof)
750 mL
${GOVERNMENT_WARNING}
`

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
    expect(screen.getAllByText('Pass').length).toBeGreaterThanOrEqual(5)
    expect(screen.getAllByText('Needs review').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('92% OCR confidence')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /View extracted label text/ }),
    )
    expect(
      screen.getByText(/OLD TOM DISTILLERY/, { selector: 'pre' }),
    ).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Analyze 2 labels' }))
    expect(await screen.findByText('Unreadable image')).toBeInTheDocument()
    expect(await screen.findByText('Manual review remains')).toBeInTheDocument()
    expect(recognize).toHaveBeenCalledTimes(2)
  })
})
