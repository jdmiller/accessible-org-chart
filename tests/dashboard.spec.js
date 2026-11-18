const { test, expect } = require('@playwright/test');
const path = require('path');
const fileUrl = '/';  // served by webServer in playwright.config.js

async function waitForLoad(page) {
  await page.waitForFunction(
    () => {
      const s = document.getElementById('tree-status');
      return s && s.textContent && !s.textContent.includes('Loading');
    },
    { timeout: 20000 }
  );
}

test.describe('Org chart — label colors', () => {

  test('sunburst labels use .sunburst-label class', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    const count = await page.evaluate(() =>
      document.querySelectorAll('.sunburst-label').length
    );
    expect(count).toBeGreaterThan(0);
  });

  test('no raw <text> elements without .sunburst-label or .center-text in SVG', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    const orphans = await page.evaluate(() => {
      const svgTexts = document.querySelectorAll('#chart-container svg text');
      return Array.from(svgTexts).filter(t =>
        !t.classList.contains('sunburst-label') &&
        !t.classList.contains('center-text') &&
        !t.classList.contains('center-logo') &&
        !t.classList.contains('center-name-line1') &&
        !t.classList.contains('center-name-line2')
      ).map(t => ({ text: t.textContent.trim().slice(0, 20), classes: t.className }));
    });
    console.log('Orphan SVG texts:', orphans);
    // Should be empty (no phantom EC etc)
    expect(orphans.length).toBe(0);
  });

});

test.describe('Departments view removed', () => {

  test('no view toggle or department bar is present', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(fileUrl);
    await waitForLoad(page);
    expect(await page.locator('#view-toggle, #btn-depts').count()).toBe(0);
    expect(await page.locator('.dept-stacked-bar, #dept-list').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test('hierarchy easter egg still renders colored nodes', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(fileUrl);
    await waitForLoad(page);
    await page.fill('#tree-search-input', 'hierarchy');
    await expect(page.locator('#hierarchy-panel')).not.toHaveAttribute('hidden', '', { timeout: 3000 });
    await page.waitForTimeout(800);
    expect(await page.locator('#hierarchy-panel svg rect').count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

});

test.describe('Sunburst zoom', () => {

  test('every visible slice is fully opaque', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    const faded = await page.evaluate(() => {
      let n = 0;
      path.each(function () { const o = +this.getAttribute('fill-opacity'); if (o > 0 && o < 1) n++; });
      return n;
    });
    expect(faded).toBe(0);
  });

  test('mouse wheel expands the hovered branch one level per interval, and back out', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 820 });
    await page.goto(fileUrl);
    await waitForLoad(page);
    const box = await page.locator('#chart-container svg').boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 150);
    const depth = () => page.evaluate(() => currentSbNode.depth);
    // A couple of notches only magnify
    for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(80); }
    expect(await depth()).toBe(0);
    expect(await page.evaluate(() => view.k)).toBeGreaterThan(1.2);
    // Crossing the interval expands the branch under the pointer
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(80); }
    await page.waitForTimeout(900);
    expect(await depth()).toBe(1);
    expect(await page.evaluate(() => view.k)).toBe(1);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(80); }
    await page.waitForTimeout(900);
    expect(await depth()).toBe(2);
    // Scrolling out steps back up
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(80); }
    await page.waitForTimeout(900);
    expect(await depth()).toBe(1);
  });

  test('+ / - / 0 in the tree use the same intervals and keep focus in the tree', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    await page.click('#tree-root [role="treeitem"]');     // first top-level person; chart focuses on them
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowRight');               // expand
    await page.keyboard.press('ArrowRight');               // first report
    const target = await page.evaluate(() => document.activeElement.dataset.nodeId);
    await page.keyboard.press('+');
    await page.waitForTimeout(400);
    expect(await page.textContent('#zoom-level')).toBe('150%');
    await page.keyboard.press('+');                        // crosses the interval
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => ({ id: currentSbNode.data.id, k: view.k }));
    expect(st.k).toBe(1);
    expect(await page.evaluate(([id, t]) => sunburstNodeMap.get(t).ancestors().some(a => a.data.id === id), [st.id, target])).toBe(true);
    expect(await page.textContent('#zoom-announce')).toContain('expanded');
    expect(await page.evaluate(() => !!document.activeElement.closest('#tree-root'))).toBe(true);
    await page.keyboard.press('-');                        // at 100%: up a level
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => currentSbNode.depth)).toBe(1);
    await page.keyboard.press('+');
    await page.waitForTimeout(400);
    await page.keyboard.press('0');
    await page.waitForTimeout(600);
    expect(await page.textContent('#zoom-level')).toBe('100%');
  });

  test('an expanded shallow branch fills the same area as the full chart', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 820 });
    await page.goto(fileUrl);
    await waitForLoad(page);
    const measure = () => page.evaluate(() => {
      let maxR = 0, labels = 0;
      path.each(function () {
        if (+this.getAttribute('fill-opacity') === 0) return;
        const b = this.getBBox();
        maxR = Math.max(maxR, -b.x, -b.y, b.x + b.width, b.y + b.height);
      });
      label.each(function () { if (+this.getAttribute('fill-opacity') > 0 && this.textContent) labels++; });
      return { maxR: Math.round(maxR), labels };
    });
    const full = await measure();
    // A manager whose team is two levels deep: the rings stretch to the full radius
    const id = await page.evaluate(() =>
      [...sunburstNodeMap.values()].filter(n => n.height === 2).sort((a, b) => b.value - a.value)[0].data.id);
    await page.evaluate(id => zoomSunburst(null, sunburstNodeMap.get(id)), id);
    await page.waitForTimeout(1000);
    const team = await measure();
    expect(Math.abs(team.maxR - full.maxR)).toBeLessThanOrEqual(2);
    // Everyone in that team is labelled
    const size = await page.evaluate(id => sunburstNodeMap.get(id).descendants().length - 1, id);
    expect(team.labels).toBe(size);
    // The wheel still finds the branch under the pointer in stretched rings
    expect(await page.evaluate(() => {
      const c = currentSbNode.children[0];
      const a = (c.current.x0 + c.current.x1) / 2, r = rPx(1.5);
      return drillTargetAt(r * Math.sin(a), -r * Math.cos(a)) === (c.children ? c : null);
    })).toBe(true);
  });

  test('every shown name is padded clear of its slice edges, including mid-animation', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 820 });
    await page.goto(fileUrl);
    await waitForLoad(page);
    // Smallest distance (px) from any glyph cell of a shown label to its ring edges or slice sides
    const worst = () => page.evaluate(() => {
      const c0 = sbG.node().getCTM();
      let w = Infinity;
      label.each(function (d) {
        if (!(+this.getAttribute('fill-opacity') > 0) || !this.textContent) return;
        if (getComputedStyle(this).visibility === 'hidden') return;
        const g = geom(d.current, d.data), rIn = rPx(g.y0), rOut = rPx(g.y1) - 1;
        const mid = (g.x0 + g.x1) / 2, m = this.getCTM();
        for (const ts of this.querySelectorAll('tspan')) {
          for (let i = 0; i < ts.getNumberOfChars(); i++) {
            const e = ts.getExtentOfChar(i);
            for (const [x, y] of [[e.x, e.y], [e.x + e.width, e.y], [e.x, e.y + e.height], [e.x + e.width, e.y + e.height]]) {
              const px = m.a * x + m.c * y + m.e - c0.e, py = m.b * x + m.d * y + m.f - c0.f;
              const r = Math.hypot(px, py);
              const phi = mid + ((((Math.atan2(px, -py) - mid) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
              const side = a => a < 0 ? -1 : a >= Math.PI / 2 ? r : r * Math.sin(a);
              w = Math.min(w, r - rIn, rOut - r, side(phi - g.x0), side(g.x1 - phi));
            }
          }
        }
      });
      return w;
    });
    const ids = await page.evaluate(() =>
      [...sunburstNodeMap.values()].filter(n => n.height >= 2 && n.depth >= 2).sort((a, b) => b.value - a.value).slice(0, 2).map(n => n.data.id));
    for (const mode of ['name', 'title']) {
      await page.check(`#label-mode input[value="${mode}"]`);
      await page.evaluate(() => zoomSunburst(null, root));
      await page.waitForTimeout(900);
      expect(await worst()).toBeGreaterThanOrEqual(4);
      for (const id of ids) {
        await page.evaluate(id => zoomSunburst(null, sunburstNodeMap.get(id)), id);
        for (let i = 0; i < 4; i++) { await page.waitForTimeout(150); expect(await worst()).toBeGreaterThanOrEqual(4); }
        await page.waitForTimeout(500);
        expect(await worst()).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test('Names / Titles switch changes the slice labels and is remembered', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 820 });
    await page.goto(fileUrl);
    await waitForLoad(page);
    const shown = () => page.evaluate(() => {
      const out = [];
      label.each(function (d) {
        if (+this.getAttribute('fill-opacity') > 0 && this.textContent) {
          const lines = [...this.querySelectorAll('tspan')].map(t => t.textContent);
          out.push({ text: lines.join(' '), name: d.data.name,
                     isTitle: !!d.data.title && titleOptions(d.data.title).some(o => o.join('|') === lines.join('|')) });
        }
      });
      return out;
    });
    const names = await shown();
    expect(names.length).toBeGreaterThan(0);
    // Name labels are the name or an abbreviation of it, never the title
    expect(names.every(l => l.text[0] === l.name[0] && !l.isTitle)).toBe(true);

    await page.click('#label-mode label:last-of-type');            // Titles
    expect(await page.isChecked('#label-mode input[value="title"]')).toBe(true);
    // Expand a team so there's room for titles
    const id = await page.evaluate(() =>
      [...sunburstNodeMap.values()].filter(n => n.height === 1).sort((a, b) => b.value - a.value)[0].data.id);
    await page.evaluate(id => zoomSunburst(null, sunburstNodeMap.get(id)), id);
    await page.waitForTimeout(1000);
    const titles = await shown();
    expect(titles.length).toBeGreaterThan(0);
    // Every label is the person's title, in full or shortened form
    expect(titles.every(l => l.isTitle)).toBe(true);
    // The centre circle follows the switch too
    const centre = () => page.evaluate(() =>
      [document.querySelector('.center-name-line1').textContent, document.querySelector('.center-name-line2').textContent].join(' ').trim());
    const focusNode = await page.evaluate(() => ({ name: currentSbNode.data.name, title: currentSbNode.data.title }));
    // In Titles mode the centre shows the title form (not the name)
    const showsTitle = async () => {
      const c = await centre();
      const expected = await page.evaluate(() => centreLines(currentSbNode).join(' ').trim());
      const name = await page.evaluate(() => currentSbNode.data.name);
      return c === expected && c !== name;
    };
    expect(await showsTitle()).toBe(true);
    await page.check('#label-mode input[value="name"]');
    expect(await centre()).toBe(focusNode.name);
    await page.check('#label-mode input[value="title"]');
    expect(await showsTitle()).toBe(true);

    // Titles stay through real expand / collapse clicks
    const box = await page.locator('#chart-container svg').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);        // centre: up a level
    await page.waitForTimeout(1000);
    await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2 - 30);  // a slice: expand
    await page.waitForTimeout(1000);
    const after = await shown();
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(l => l.isTitle)).toBe(true);
    const f2 = await page.evaluate(() => ({ name: currentSbNode.data.name, title: currentSbNode.data.title }));
    if (f2.title) expect(await showsTitle()).toBe(true);

    await page.reload();
    await waitForLoad(page);
    expect(await page.isChecked('#label-mode input[value="title"]')).toBe(true);
    // Arrow keys switch it like any radio group
    await page.focus('#label-mode input:checked');
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => labelMode)).toBe('name');
  });

  test('each team is centred within its parent slice', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    const offCentre = await page.evaluate(() => {
      let worst = 0;
      root.each(n => {
        if (!n.children) return;
        const a = n.children[0].x0, b = n.children[n.children.length - 1].x1;
        worst = Math.max(worst, Math.abs((a + b) / 2 - (n.x0 + n.x1) / 2));
      });
      return worst;
    });
    expect(offCentre).toBeLessThan(1e-9);
  });

  test('hidden labels leave no ghost text', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    const ghosts = await page.evaluate(() => {
      let n = 0;
      label.each(function () {
        if (this.textContent && +this.getAttribute('fill-opacity') === 0 && getComputedStyle(this).visibility !== 'hidden') n++;
      });
      return n;
    });
    expect(ghosts).toBe(0);
    expect(await page.locator('#hier-cut-overlay').isVisible()).toBe(false);
  });

  test('rapid focus changes with hovering leave no stale slices', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    const box = await page.locator('#chart-container svg').boundingBox();
    const ids = await page.evaluate(() => [...sunburstNodeMap.values()].filter(n => n.depth === 4 && n.children).slice(0, 3).map(n => n.data.id));
    for (const id of ids) {
      await page.evaluate(id => zoomSunburst(null, sunburstNodeMap.get(id)), id);
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40);
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1200);
    const stale = await page.evaluate(() => {
      let bad = 0;
      path.each(function (d) {
        const vis = +this.getAttribute('fill-opacity') > 0;
        if (vis !== arcVisible(d.current)) bad++;
        if (vis && this.getAttribute('d') !== arcFor(d)) bad++;
      });
      return bad;
    });
    expect(stale).toBe(0);
  });

});

test.describe('Tornado chart', () => {

  test('year labels are 13px and #002649', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    await page.fill('#tree-search-input', 'years');
    await expect(page.locator('#tornado-panel')).not.toHaveAttribute('hidden', { timeout: 3000 });
    await page.waitForTimeout(1000);
    const labelAttrs = await page.evaluate(() => {
      const svg = document.querySelector('#tornado-chart-wrap svg');
      if (!svg) return null;
      const texts = Array.from(svg.querySelectorAll('text'));
      // With default bucket size 5, labels show ranges like "0–4yr", "5–9yr"
      const yearLabel = texts.find(t => /yr$/.test(t.textContent?.trim()));
      if (!yearLabel) return null;
      return {
        fontSize: yearLabel.getAttribute('font-size'),
        fill: yearLabel.getAttribute('fill'),
        text: yearLabel.textContent,
      };
    });
    console.log('Year label attrs:', labelAttrs);
    expect(labelAttrs).toBeTruthy();
    expect(labelAttrs.fontSize).toBe('13px');
    expect(labelAttrs.fill).toBe('#002649');
  });

  test('results table appears to right of chart on wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(fileUrl);
    await waitForLoad(page);
    await page.fill('#tree-search-input', 'years');
    await page.waitForTimeout(1000);
    const bodyRow = await page.locator('#tornado-body-row');
    const display = await bodyRow.evaluate(el => getComputedStyle(el).flexDirection);
    expect(display).toBe('row');
  });

});

test.describe('Search behaviour', () => {

  test('typing does not steal focus from search input', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    await page.click('#tree-search-input');
    await page.type('#tree-search-input', 'gideon', { delay: 50 });
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('tree-search-input');
  });

  test('Gideon Fitzroy not search-hidden after typing "gideon"', async ({ page }) => {
    await page.goto(fileUrl);
    await waitForLoad(page);
    // Use type() to fire input events character by character
    await page.click('#tree-search-input');
    await page.type('#tree-search-input', 'gideon', { delay: 30 });
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[role="treeitem"]'));
      const person = items.find(el => el.textContent.includes('Gideon Fitzroy'));
      if (!person) return { found: false };
      return {
        found: true,
        hidden: person.classList.contains('search-hidden'),
        isMatch: person.classList.contains('search-match'),
      };
    });
    console.log('Gideon Fitzroy result:', result);
    expect(result.found).toBe(true);
    expect(result.hidden).toBe(false);
  });

});
