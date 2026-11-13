"""Real DOM setup helper for tests that continue into a complete match."""
async def finish_opening(page, bench=True):
 await page.locator('#opening-start').wait_for()
 active=page.locator('[data-opening-active]:enabled').first
 ident=await active.get_attribute('data-opening-active');await active.tap()
 if bench:
  for button in await page.locator('[data-opening-bench]:enabled').all():
   if await button.get_attribute('data-opening-bench')!=ident:await button.tap()
 await page.locator('#opening-start').tap()
