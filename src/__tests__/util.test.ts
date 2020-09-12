import { cropToMargins } from '../util'
import { PaperSize } from '../paper-size'
import { Vec2 } from '../vec'

describe("crop to margins", () => {
  const paper = new PaperSize({x: 100, y: 100})
  const margin = 5

  it('has no effect on a drawing already inside the margins', () => {
    const drawing = [
      [{x: 10, y: 10}, {x: 20, y: 10}]
    ]
    expect(cropToMargins(drawing, paper, margin)).toEqual(drawing)
  })

  it('crops a line that extends beyond the margins', () => {
    const drawing = [
      [{x: 50, y: 50}, {x: 200, y: 50}]
    ]
    const cropped = [
      [{x: 50, y: 50}, {x: 95, y: 50}]
    ]
    expect(cropToMargins(drawing, paper, margin)).toEqual(cropped)
  })

  it('turns a line that goes beyond the margin and then returns into two lines', () => {
    const drawing = [
      [{x: 50, y: 50}, {x: 200, y: 50}, {x: 50, y: 80}]
    ]
    const cropped = [
      [{x: 50, y: 50}, {x: 95, y: 50}],
      [{x: 95, y: 71}, {x: 50, y: 80}]
    ]
    expect(cropToMargins(drawing, paper, margin)).toEqual(cropped)
  })

  it('excludes lines that are entirely outside the page', () => {
    const drawing = [
      [{x: 200, y: 50}, {x: 250, y: 50}],
    ]
    const cropped: Vec2[][] = [
    ]
    expect(cropToMargins(drawing, paper, margin)).toEqual(cropped)
  })

  it('excludes line segments that are entirely outside the page', () => {
    const drawing = [
      [{x: 50, y: 50}, {x: 200, y: 50}, {x: 200, y: 80}, {x: 50, y: 80}]
    ]
    const cropped = [
      [{x: 50, y: 50}, {x: 95, y: 50}],
      [{x: 95, y: 80}, {x: 50, y: 80}]
    ]
    expect(cropToMargins(drawing, paper, margin)).toEqual(cropped)
  })

  it('permits a line along each edge of the margin', () => {
    const drawing = [
      [
        {x: margin, y: margin},
        {x: paper.size.x - margin, y: margin},
        {x: paper.size.x - margin, y: paper.size.y - margin},
        {x: margin, y: paper.size.y - margin},
        {x: margin, y: margin},
      ]
    ]
    expect(cropToMargins(drawing, paper, margin)).toEqual(drawing)
  })
})