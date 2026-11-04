// ---------------------------------------------------------------------------------------
// Propuesta Formal MRC v4: pagination with continuation pages.
//
// Two parts that share one source of truth:
//   * `planPagination`: PURE decision logic (block heights in, page assignment out). It is
//     unit-tested in Node and serialized verbatim (Function.prototype.toString) into the
//     document, so it must stay self-contained: no imports, no closure over module state.
//   * `buildPaginationScript`: the small browser script that measures the real layout, moves
//     overflowing trailing blocks into continuation pages and renumbers the footers.
// ---------------------------------------------------------------------------------------

// heights:      border-box height of every block, in layout order
// gaps:         collapsed vertical gap between block i and block i + 1 (last entry unused)
// leading:      margin-top of every block (applies when the block starts a page)
// trailing:     margin-bottom of every block (applies when the block ends a page)
// capacity:     usable height of one page body
// keepWithNext: blocks (headings) that must never end a page unless nothing else fits
//
// Returns { pages: number[][], error: null } or, when a single block is taller than a full
// page body, { pages, error: 'block-too-tall', errorIndex }.
export function planPagination({
  heights,
  gaps = [],
  leading = [],
  trailing = [],
  capacity,
  keepWithNext = [],
}) {
  const EPSILON = 0.5
  const count = heights.length
  if (count === 0) return { pages: [[]], error: null }

  const gapAfter = (index) => gaps[index] ?? 0
  const lead = (index) => leading[index] ?? 0
  const trail = (index) => trailing[index] ?? 0
  // Height of the run first..last when laid out as one page.
  const extent = (first, last) => {
    let total = lead(first) + trail(last)
    for (let index = first; index <= last; index += 1) {
      total += heights[index] + (index < last ? gapAfter(index) : 0)
    }
    return total
  }

  const pages = []
  let start = 0
  while (start < count) {
    if (extent(start, start) > capacity + EPSILON) {
      return { pages, error: 'block-too-tall', errorIndex: start }
    }
    let last = start
    while (last + 1 < count && extent(start, last + 1) <= capacity + EPSILON) last += 1
    if (last < count - 1) {
      // Do not leave a heading stranded at the bottom, unless that would empty the page.
      while (last > start && keepWithNext[last]) last -= 1
    }
    pages.push(Array.from({ length: last - start + 1 }, (_, offset) => start + offset))
    start = last + 1
  }
  return { pages, error: null }
}

// JSON that is safe inside an inline <script>: no "<" can ever close the element or open a
// comment.
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

const MAX_PAGES_PER_TOPIC = 40

function runnerSource() {
  return `
  var root = document.documentElement;
  if (root.dataset.proposalPagination !== 'pending') return;

  function fail(code) {
    window.__proposalPaginationError = code;
    root.dataset.proposalPagination = 'error';
  }
  function px(value) {
    var number = parseFloat(value);
    return isFinite(number) ? number : 0;
  }
  function imagesReady() {
    return Promise.all(
      Array.prototype.map.call(document.images, function (image) {
        if (image.complete) return null;
        return new Promise(function (resolve) {
          image.addEventListener('load', resolve);
          image.addEventListener('error', resolve);
        });
      })
    );
  }
  function bodyOf(page) {
    return page.querySelector('.page-body');
  }
  function measure(page) {
    var body = bodyOf(page);
    var blocks = Array.prototype.slice.call(body.children);
    var bodyRect = body.getBoundingClientRect();
    var bodyStyle = getComputedStyle(body);
    var input = {
      heights: [],
      gaps: [],
      leading: [],
      trailing: [],
      keepWithNext: [],
      capacity: bodyRect.height - px(bodyStyle.paddingTop) - px(bodyStyle.paddingBottom),
    };
    blocks.forEach(function (block, index) {
      var rect = block.getBoundingClientRect();
      var style = getComputedStyle(block);
      var next = blocks[index + 1];
      input.heights.push(rect.height);
      input.leading.push(px(style.marginTop));
      input.trailing.push(px(style.marginBottom));
      input.gaps.push(next ? next.getBoundingClientRect().top - rect.bottom : 0);
      input.keepWithNext.push(block.hasAttribute('data-keep-with-next'));
    });
    return { blocks: blocks, input: input };
  }
  function createContinuation(page) {
    var topic = page.getAttribute('data-topic');
    var article = document.createElement('article');
    article.className = 'proposal-page';
    article.setAttribute('data-topic', topic);
    article.setAttribute('data-continuation', '');
    article.innerHTML = HEADERS[topic] || '';
    var body = document.createElement('div');
    body.className = 'page-body';
    article.appendChild(body);
    article.appendChild(page.querySelector('.proposal-footer').cloneNode(true));
    page.parentNode.insertBefore(article, page.nextSibling);
    return article;
  }
  function countBlocks() {
    var total = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.page-body'), function (body) {
      total += body.children.length;
    });
    return total;
  }

  function paginate() {
    var before = countBlocks();
    var basePages = Array.prototype.slice.call(document.querySelectorAll('.proposal-page'));
    for (var index = 0; index < basePages.length; index += 1) {
      var page = basePages[index];
      var guard = 0;
      while (true) {
        var measured = measure(page);
        var plan = planPagination(measured.input);
        if (plan.error) return plan.error;
        if (plan.pages.length < 2) break;
        guard += 1;
        if (guard > ${MAX_PAGES_PER_TOPIC}) return 'too-many-pages';
        var continuation = createContinuation(page);
        var target = bodyOf(continuation);
        measured.blocks.slice(plan.pages[1][0]).forEach(function (block) {
          target.appendChild(block);
        });
        page = continuation;
      }
    }
    if (countBlocks() !== before) return 'block-count-mismatch';
    return null;
  }

  function finish() {
    var pages = Array.prototype.slice.call(document.querySelectorAll('.proposal-page'));
    pages.forEach(function (page, position) {
      Array.prototype.forEach.call(page.querySelectorAll('[data-page-number]'), function (node) {
        node.textContent = String(position + 1);
      });
      Array.prototype.forEach.call(page.querySelectorAll('[data-page-total]'), function (node) {
        node.textContent = String(pages.length);
      });
    });
    window.__proposalPaginationMetrics = {
      pages: pages.length,
      continuationPages: document.querySelectorAll('.proposal-page[data-continuation]').length,
      topics: TOPICS.map(function (topic) {
        return {
          topic: topic,
          pages: document.querySelectorAll('.proposal-page[data-topic="' + topic + '"]').length,
        };
      }),
    };
    root.dataset.proposalPagination = 'complete';
  }

  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : null;
  Promise.resolve(fontsReady)
    .then(imagesReady)
    .then(function () {
      var code = paginate();
      if (code) return fail(code);
      return imagesReady().then(finish);
    })
    .catch(function () {
      fail('exception');
    });
`
}

// continuationHeaders: { [topicId]: headerMarkup }, built by the template from the same helper
// the compact page headers use, so there is one source of truth for that markup.
export function buildPaginationScript({ continuationHeaders }) {
  const topics = Object.keys(continuationHeaders)
  return `(function () {
  var HEADERS = ${safeJson(continuationHeaders)};
  var TOPICS = ${safeJson(topics)};
  var planPagination = ${planPagination.toString()};
  ${runnerSource()}
})();`
}
