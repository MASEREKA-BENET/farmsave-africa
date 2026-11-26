import { test, expect, type Page, type Locator } from "@playwright/test";
test.skip(process.env.E2E_LIVE !== "true", "Configure a dedicated Neon test database or run npm run test:e2e:local.");
const district = "10000000-0000-0000-0000-000000000003";
const crop = "30000000-0000-0000-0000-000000000001";
const today = new Date().toISOString().slice(0, 10);
async function recordId(page: Page, kind: string, text?: string) {
  let rows=page.locator(`#${kind} [data-record-id]`).filter({visible:true});
  if(text)rows=rows.filter({hasText:text});
  await expect(rows.first()).toBeVisible();
  return (await rows.first().getAttribute("data-record-id"))!;
}
async function login(page: Page, roleOrEmail: string, password = process.env.SEED_PASSWORD!) {
  await page.goto("/login"); await page.getByLabel("Email address").fill(roleOrEmail.includes("@") ? roleOrEmail : `${roleOrEmail}@farmsave.example.test`); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/workspace$/);
}
async function add(page: Page, path: string, kind: string, fill: (dialog: Locator) => Promise<void>) {
  await page.goto(`/workspace/${path}`); await page.locator(`#${kind}`).getByRole("button", { name: "Add record", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible(); await fill(dialog); await dialog.getByRole("button", { name: "Save record", exact: true }).click();
  try { await expect(dialog).not.toBeVisible(); }
  catch (error) {
    console.info("Form feedback:",await dialog.getByRole("status").allTextContents());
    console.info("Invalid form fields:",await dialog.locator("input,select,textarea").evaluateAll(elements=>elements.filter(element=>!(element as HTMLInputElement).checkValidity()).map(element=>(element as HTMLInputElement).name)));
    throw error;
  }
}
async function act(page: Page, path: string, kind: string, id: string, label: string, fill?: (dialog: Locator) => Promise<void>) {
  await page.goto(`/workspace/${path}`); const row = page.locator(`#${kind} [data-record-id="${id}"]`).filter({ visible: true });
  await row.getByRole("button", { name: label, exact: true }).click(); const dialog = page.getByRole("dialog"); if (fill) await fill(dialog);
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click(); await expect(dialog).not.toBeVisible();
}
test("Auth.js and Prisma complete all five workspaces and the farm-to-market workflow", async ({ browser }) => {
  test.setTimeout(300000);
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ viewport: { width: 1440, height: 1000 } })));
  const [farmer, buyer, transporter, coordinator, admin] = await Promise.all(contexts.map(context => context.newPage()));
  try {
    for (const [page, role] of [[farmer, "farmer"], [buyer, "buyer"], [transporter, "transporter"], [coordinator, "coordinator"], [admin, "admin"]] as const) {
      await login(page, role);
      await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
      for (const width of [360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    let farmerId="";
    const farmName = `E2E Neon farm ${Date.now()}`;
    await add(farmer, "farms", "farms", async d => {
      farmerId=await d.getByLabel("Farmer", { exact: true }).inputValue();expect(farmerId).not.toBe("");await d.getByLabel("Farm name").fill(farmName); await d.getByLabel("District", { exact: true }).selectOption(district); await d.getByLabel("Approximate locality").fill("Development area"); await d.getByLabel("Farm size (acres)").fill("2");
    });
    const farmId = await recordId(farmer,"farms",farmName);
    await add(farmer, "farms", "farm_crops", async d => { await d.getByLabel("Farm", { exact: true }).selectOption(farmId); await d.getByLabel("Crop", { exact: true }).selectOption(crop); await d.getByLabel("Planting date").fill(today); await d.getByLabel("Crop area (acres)").fill("1"); });
    const planting = await recordId(farmer,"farm_crops",farmName);
    await add(farmer, "harvests", "harvests", async d => { await d.getByLabel("Farm crop / planting").selectOption(planting); await d.getByLabel("Expected harvest date").fill(today); await d.getByLabel("Expected quantity").fill("100"); await d.getByLabel("Crop measurement unit").selectOption("kg"); });
    const harvest = await recordId(farmer,"harvests",farmName);
    await add(farmer, "harvests", "actual_harvest", async d => { await d.getByLabel("Harvest", { exact: true }).selectOption(harvest); await d.getByLabel("Cumulative harvested quantity").fill("100"); await d.getByLabel("Actual harvest date").fill(today); await d.getByLabel("Quality grade").selectOption("Grade A"); await d.getByLabel("Measurement / adjustment reason").fill("Development weighing record"); });
    await add(farmer, "marketplace", "produce_listings", async d => { await d.getByLabel("Harvest", { exact: true }).selectOption(harvest); await d.getByLabel("Quantity to list").fill("100"); await d.getByLabel("Asking price").fill("2000"); await d.getByLabel("Available from").fill(today); });
    const listing = await recordId(farmer,"produce_listings");
    await buyer.goto(`/workspace/marketplace?crop=${crop}&quality=Grade+A&quantity=50`); await expect(buyer.locator(`[data-record-id="${listing}"]`).filter({ visible: true })).toBeVisible();
    await act(buyer, "marketplace", "produce_listings", listing, "Make an offer", async d => { await d.getByLabel("Requested quantity").fill("60"); await d.getByLabel("Proposed price").fill("1800"); });
    await buyer.goto("/workspace/offers");const offer = await recordId(buyer,"buyer_offers");
    await act(farmer, "marketplace", "buyer_offers", offer, "Accept offer"); const order = await recordId(farmer,"orders");
    await act(buyer, "offers", "orders", order, "Confirm purchase");
    await add(transporter, "profile", "transport_profiles", async d => { await d.getByLabel("Vehicle description").fill("Development pickup"); await d.getByLabel("Vehicle registration").fill("NEON-TEST"); await d.getByLabel("Vehicle capacity").fill("1000"); await d.getByLabel("Capacity unit").fill("kg"); await d.getByLabel("Service districts").selectOption([district]); });
    const transportProfile = await recordId(transporter,"transport_profiles");
    await act(admin, "users", "transport_profiles", transportProfile, "Verify transporter");
    await add(farmer, "support", "transport_requests", async d => { await d.getByLabel("Farmer", { exact: true }).selectOption(farmerId); await d.getByLabel("Harvest", { exact: true }).selectOption(harvest); await d.getByLabel("Related order").selectOption(order); await d.getByLabel("Destination district").selectOption(district); await d.getByLabel("Destination area").fill("Development collection point"); await d.getByLabel("Quantity in harvest unit").fill("60"); await d.getByLabel("Preferred collection date").fill(today); });
    const request = await recordId(farmer,"transport_requests");
    await act(transporter, "requests", "transport_requests", request, "Submit quotation", async d => { await d.getByLabel("Proposed total charge").fill("20000"); });
    const quote = await recordId(transporter,"transport_quotes");
    await act(farmer, "support", "transport_quotes", quote, "Assign transporter"); const delivery = await recordId(farmer,"deliveries");
    await act(transporter, "deliveries", "deliveries", delivery, "Confirm pickup"); await act(transporter, "deliveries", "deliveries", delivery, "Confirm delivery", async d => { await d.getByLabel("Actual delivery charge").fill("18000"); }); await act(farmer, "support", "deliveries", delivery, "Confirm actual charge");
    await act(farmer, "marketplace", "orders", order, "Start preparing"); await act(farmer, "marketplace", "orders", order, "Ready for collection"); await act(farmer, "marketplace", "orders", order, "Record completed sale", async d => { await d.getByLabel("Actual received price").fill("1750"); });
    await add(farmer, "records", "loss_records", async d => { await d.getByLabel("Harvest", { exact: true }).selectOption(harvest); await d.getByLabel("Quantity lost").fill("5"); await d.getByLabel("Loss date").fill(today); await d.getByLabel("Stage", { exact: true }).selectOption("storage"); await d.getByLabel("Cause").fill("Development spoilage report"); });
    await add(farmer, "records", "expenses", async d => { await d.getByLabel("Farmer", { exact: true }).selectOption(farmerId); await d.getByLabel("Related harvest").selectOption(harvest); await d.getByLabel("Cost category").selectOption("packaging"); await d.getByLabel("Actual amount").fill("5000"); await d.getByLabel("Cost description").fill("Development crate hire"); await d.getByLabel("Expense date").fill(today); });
    await add(farmer, "support", "service_requests", async d => { await d.getByLabel("Farmer", { exact: true }).selectOption(farmerId); await d.getByLabel("Support needed",{exact:true}).selectOption("storage"); await d.getByLabel("Describe the support needed").fill("Development storage guidance request"); });
    const assistedName = `E2E Neon assisted ${Date.now()}`;
    await add(coordinator, "farmers", "farmer_profiles", async d => { await d.getByLabel("Farmer’s full name").fill(assistedName); await d.getByLabel("District", { exact: true }).selectOption(district); await d.getByLabel("Locality (approximate area)").fill("Development locality"); await d.getByLabel("The farmer has consented").check(); });
    const assisted = await recordId(coordinator,"farmer_profiles",assistedName);
    await add(coordinator, "reports", "baseline_surveys", async d => {
      await d.getByLabel("Farmer", { exact: true }).selectOption(assisted); await d.getByLabel("Crop", { exact: true }).selectOption(crop); await d.getByLabel("Harvest quantity for survey period").fill("100"); await d.getByLabel("Loss quantity", { exact: true }).fill("20"); await d.getByLabel("Measurement unit").selectOption("kg");
      for (const name of ["Handling methods", "Storage practices", "Transport arrangements", "Buyer access", "Main challenges", "Training needs"]) await d.getByLabel(name, { exact: true }).fill("Development survey response");
      await d.getByLabel("Reported sales").fill("100000"); await d.getByLabel("Reported relevant costs").fill("20000"); await d.getByLabel("Survey date").fill(today); await d.getByLabel("Comparable reporting period").fill("30"); await d.getByLabel("Pilot phase").fill("development"); await d.getByLabel("Data source").selectOption("farmer_reported");
    });
    const trainingName = `E2E Neon training ${Date.now()}`;
    await add(coordinator, "training", "training_sessions", async d => { await d.getByLabel("Session title").fill(trainingName); await d.getByLabel("District", { exact: true }).selectOption(district); await d.getByLabel("Confirmed venue").fill("Development venue"); await d.getByLabel("Session date and time").fill(`${today}T09:00`); await d.getByLabel("Participant capacity").fill("20"); });
    const training = await recordId(coordinator,"training_sessions",trainingName);
    await add(coordinator, "training", "training_attendance", async d => { await d.getByLabel("Training session").selectOption(training); await d.getByLabel("Farmer", { exact: true }).selectOption(assisted); await d.getByLabel("Farmer attended").check(); });
    await act(coordinator, "monitoring", "harvests", harvest, "Verify record");
    await add(coordinator, "reports", "field_reports", async d => { await d.getByLabel("Farmer", { exact: true }).selectOption(assisted); await d.getByLabel("Observation").fill("Development field observation"); await d.getByLabel("Report date").fill(today); });
    await add(admin, "catalogue", "crop_guidance", async d => { await d.getByLabel("Crop", { exact: true }).selectOption(crop); await d.getByLabel("Guidance title").fill(`E2E draft ${Date.now()}`); for (const name of ["Harvesting guidance", "Sorting and grading", "Storage recommendations", "Packaging recommendations", "Transport considerations", "Common post-harvest risks"]) await d.getByLabel(name, { exact: true }).fill("Development draft only; not agricultural advice"); });
    await admin.goto("/workspace/impact"); const download = admin.waitForEvent("download"); await admin.getByRole("link", { name: "Export CSV", exact: true }).click(); expect((await download).suggestedFilename()).toMatch(/farmsave-impact/);
    await farmer.goto("/workspace/harvests");const balance=farmer.locator(`#harvests [data-record-id="${harvest}"]`).filter({visible:true});
    await expect(balance.locator('[data-field="available_quantity"]')).toHaveText("35");await expect(balance.locator('[data-field="sold_quantity"]')).toHaveText("60");await expect(balance.locator('[data-field="lost_quantity"]')).toHaveText("5");
    await farmer.goto("/workspace/records");const sale=farmer.locator('#sales [data-record-id]').filter({visible:true}).first();await expect(sale.locator('[data-field="quantity"]')).toHaveText("60");await expect(sale.locator('[data-field="unit_price"]')).toContainText("1,750");
    await buyer.goto("/workspace/users"); await expect(buyer.getByRole("heading", { name: "This page could not be found" })).toBeVisible();
    const denied = await buyer.request.get("/api/reports"); expect(denied.status()).toBe(403);
    await farmer.goto("/workspace/profile"); await farmer.getByLabel("Phone (optional)").fill("+256700000001"); await farmer.getByRole("button", { name: "Save profile" }).click(); await expect(farmer.getByRole("status")).toContainText("Update saved");
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test("registration, Auth.js sessions, password changes and logout use the new database", async ({ page }) => {
  test.skip(process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false", "This no-mail test requires explicit development-only verification disablement; production verification is tested separately.");
  const email = `registration-${Date.now()}@farmsave.example.test`;
  await page.goto("/register?as=farmer"); await page.getByLabel("Full name", { exact: true }).fill("E2E new farmer"); await page.getByLabel("Email address").fill(email); await page.getByLabel("Password", { exact: true }).fill(process.env.SEED_PASSWORD!); await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Create account", exact: true }).click(); await expect(page.getByRole("status")).toContainText("registration has been processed");
  await login(page, email);
  await page.goto("/account/password"); await page.getByLabel("Current password", { exact: true }).fill(process.env.SEED_PASSWORD!); await page.getByLabel("Password", { exact: true }).fill("Changed-browser-password-2026"); await page.getByRole("button", { name: "Update password" }).click(); await expect(page.getByRole("status")).toContainText("previous sessions are revoked");
  await page.goto("/workspace"); await expect(page).toHaveURL(/\/login/); await login(page, email, "Changed-browser-password-2026");
  await page.getByRole("button", { name: "Sign out", exact: true }).filter({ visible: true }).first().click(); await expect(page).toHaveURL(/\/login$/); await page.goto("/workspace"); await expect(page).toHaveURL(/\/login/);
});
