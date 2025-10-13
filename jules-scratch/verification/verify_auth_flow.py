from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    try:
        # Go to signup page
        page.goto("http://localhost:5173/signup")

        # Fill out signup form
        page.get_by_label("First Name").fill("Test")
        page.get_by_label("Last Name").fill("User")
        # Use a unique email to avoid conflicts
        unique_email = f"testuser_{int(time.time())}@example.com"
        page.get_by_label("Email").fill(unique_email)
        page.get_by_label("Phone").fill("+1234567890")
        page.get_by_label("Company Name").fill("Test Company")
        page.locator("#password").fill("StrongPass123!")
        page.locator("#confirmPassword").fill("StrongPass123!")
        page.locator('div:has-text("Basic")').first.click()
        page.locator('button:has-text("Nigeria")').first.click()

        page.get_by_role("button", name="Create Account").click()
        page.wait_for_load_state("networkidle")

        # Verify redirection to cashier dashboard (POS)
        expect(page.get_by_text("Point of Sale")).to_be_visible(timeout=10000)
        page.screenshot(path="jules-scratch/verification/verification.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
