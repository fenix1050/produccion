import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildPaginationScript, planPagination } from './mrc-v4-pagination.js'

// ---------------------------------------------------------------- planner (pure)

test('planPagination keeps everything on one page when it fits', () => {
  const plan = planPagination({ heights: [100, 100, 100], capacity: 400 })

  assert.deepEqual(plan, { pages: [[0, 1, 2]], error: null })
})

test('planPagination returns a single empty page for no blocks', () => {
  assert.deepEqual(planPagination({ heights: [], capacity: 400 }), { pages: [[]], error: null })
})

test('planPagination accepts content that exactly fills the page', () => {
  const plan = planPagination({ heights: [200, 200], capacity: 400 })

  assert.deepEqual(plan.pages, [[0, 1]])
})

test('planPagination moves trailing blocks to continuation pages in order', () => {
  const plan = planPagination({ heights: [150, 150, 150, 150, 150], capacity: 400 })

  assert.deepEqual(plan.pages, [[0, 1], [2, 3], [4]])
  assert.equal(plan.error, null)
})

test('planPagination counts gaps between blocks but not after the last block of a page', () => {
  // 3 blocks of 100 with gaps of 20: extent of the three is 340 > 330, two blocks need 220.
  const tight = planPagination({ heights: [100, 100, 100], gaps: [20, 20, 0], capacity: 330 })
  const roomy = planPagination({ heights: [100, 100, 100], gaps: [20, 20, 0], capacity: 340 })

  assert.deepEqual(tight.pages, [[0, 1], [2]])
  assert.deepEqual(roomy.pages, [[0, 1, 2]])
})

test('planPagination counts the leading margin of the first block and the trailing margin of the last', () => {
  const plan = planPagination({
    heights: [100, 100],
    gaps: [0, 0],
    leading: [30, 30],
    trailing: [10, 10],
    capacity: 240,
  })

  // 30 + 100 + 0 + 100 + 10 = 240 fits; one more unit would not.
  assert.deepEqual(plan.pages, [[0, 1]])
  const overflow = planPagination({
    heights: [100, 100],
    gaps: [0, 0],
    leading: [30, 30],
    trailing: [10, 10],
    capacity: 239,
  })
  assert.deepEqual(overflow.pages, [[0], [1]])
})

test('planPagination never strands a keep-with-next heading at the bottom of a page', () => {
  // Block 1 is a heading: it must travel with block 2 instead of staying after block 0.
  const plan = planPagination({
    heights: [300, 30, 200],
    capacity: 400,
    keepWithNext: [false, true, false],
  })

  assert.deepEqual(plan.pages, [[0], [1, 2]])
})

test('planPagination follows chains of keep-with-next blocks together', () => {
  const plan = planPagination({
    heights: [300, 30, 30, 200],
    capacity: 400,
    keepWithNext: [false, true, true, false],
  })

  assert.deepEqual(plan.pages, [[0], [1, 2, 3]])
})

test('planPagination breaks a keep-with-next chain that alone fills a page rather than looping', () => {
  const plan = planPagination({
    heights: [300, 200, 200, 200],
    capacity: 400,
    keepWithNext: [false, true, true, false],
  })

  // Backing up would empty the page, so the chain is split where it must be.
  assert.equal(plan.error, null)
  assert.deepEqual(plan.pages.flat(), [0, 1, 2, 3])
  assert.ok(plan.pages.every((page) => page.length > 0))
})

test('planPagination keeps a heading on the page when its next block still fits', () => {
  const plan = planPagination({
    heights: [100, 30, 100, 300],
    capacity: 400,
    keepWithNext: [false, true, false, false],
  })

  assert.deepEqual(plan.pages, [[0, 1, 2], [3]])
})

test('planPagination reports an error when one block is taller than a full page', () => {
  const plan = planPagination({ heights: [100, 500, 100], capacity: 400 })

  assert.equal(plan.error, 'block-too-tall')
  assert.equal(plan.errorIndex, 1)
})

test('planPagination assigns every block exactly once, in order, for arbitrary inputs', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    let state = seed
    const next = () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }
    const count = 1 + Math.floor(next() * 40)
    const heights = Array.from({ length: count }, () => 5 + Math.floor(next() * 150))
    const keepWithNext = Array.from({ length: count }, () => next() < 0.2)
    const plan = planPagination({ heights, capacity: 400, keepWithNext })

    assert.equal(plan.error, null)
    assert.deepEqual(
      plan.pages.flat(),
      heights.map((_, index) => index)
    )
    for (const page of plan.pages) {
      assert.ok(page.length > 0)
      assert.ok(page.reduce((total, index) => total + heights[index], 0) <= 400)
    }
  }
})

// ---------------------------------------------------------------- browser script

test('buildPaginationScript embeds the very same planner function source', () => {
  const script = buildPaginationScript({ continuationHeaders: { cover: '<header></header>' } })

  assert.ok(script.includes(planPagination.toString()))
})

test('buildPaginationScript is syntactically valid and defines the state contract', () => {
  const script = buildPaginationScript({ continuationHeaders: { cover: '<header></header>' } })

  assert.doesNotThrow(() => new Function(script))
  assert.match(script, /proposalPagination/)
  assert.match(script, /__proposalPaginationMetrics/)
  assert.match(script, /__proposalPaginationError/)
  assert.match(script, /document\.fonts/)
  assert.match(script, /data-page-number/)
  assert.match(script, /data-page-total/)
})

test('buildPaginationScript neutralizes markup that could close the script element', () => {
  const script = buildPaginationScript({
    continuationHeaders: { cover: '</script><script>alert(1)</script><!-- x' },
  })

  assert.doesNotMatch(script, /<\/script/i)
  assert.doesNotMatch(script, /<!--/)
})

test('the serialized planner is self-contained and behaves like the exported one', () => {
  const serialized = new Function(`return (${planPagination.toString()})`)()
  const input = {
    heights: [300, 30, 200, 90, 90, 90, 90],
    capacity: 400,
    keepWithNext: [false, true, false, false, true, false, false],
  }

  assert.deepEqual(serialized(input), planPagination(input))
})
