import assert from 'node:assert/strict'
import { test } from 'node:test'

import { escaparLike } from './like.js'

test('escaparLike antepone una barra invertida a %, _ y a la propia barra', () => {
  assert.equal(escaparLike('%'), '\\%')
  assert.equal(escaparLike('_'), '\\_')
  assert.equal(escaparLike('\\'), '\\\\')
  assert.equal(escaparLike('a%b_c\\d'), 'a\\%b\\_c\\\\d')
})

test('escaparLike deja intacto el texto sin comodines', () => {
  assert.equal(escaparLike('Juan Pérez'), 'Juan Pérez')
})
