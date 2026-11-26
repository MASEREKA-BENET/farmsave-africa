import { test,expect } from "@playwright/test";
for(const width of [360,390,768,1024,1440]){
 test(`public navigation, forms and themes at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto("/");await expect(page.getByRole("heading",{name:/Save more harvest/})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole("link",{name:/Join as a buyer/}).click();await expect(page.getByRole("heading",{name:"Grow with FarmSave"})).toBeVisible();await expect(page.getByLabel("I’m joining as")).toHaveValue("buyer");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  if(width<640){await page.goto("/");await page.getByRole("button",{name:"Open navigation"}).click();await expect(page.getByRole("navigation",{name:"Mobile navigation"})).toBeVisible();await page.getByRole("button",{name:"Use dark theme"}).last().click();}else await page.getByRole("button",{name:"Use dark theme"}).click();
  await expect(page.locator("html")).toHaveClass(/dark/);await page.reload();await expect(page.locator("html")).toHaveClass(/dark/);
  if(width<640)await page.getByRole("button",{name:"Open navigation"}).click();
  await page.getByRole("button",{name:"Use light theme"}).filter({visible:true}).first().click();await expect(page.locator("html")).not.toHaveClass(/dark/);
 });
}
test("contact validation and legal navigation",async({page})=>{await page.goto("/#contact");await page.getByLabel("Your name").fill("Pilot applicant");await page.getByLabel("Email address").fill("pilot@example.org");await page.getByLabel("How can we help?").fill("I would like information about the pilot.");await page.getByRole("button",{name:"Send message"}).click();await expect(page.getByRole("status")).toContainText(/saved|database is connected|try again/i);await page.getByRole("link",{name:"Privacy policy"}).click();await expect(page.getByRole("heading",{name:"Privacy notice"})).toBeVisible();});
test("protected workspaces cannot be accessed anonymously",async({page})=>{await page.goto("/workspace/users");await expect(page).toHaveURL(/login|setup/);});
