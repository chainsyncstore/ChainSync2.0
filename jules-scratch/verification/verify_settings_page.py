import re
from playwright.sync_api import sync_playwright, Page, expect

def verify_settings_page(page: Page):
    """
    This test verifies that the settings page is fully functional.
    """
    # 1. Arrange: Go to the login page.
    page.goto("http://localhost:5173/login")

    # 2. Act: Log in as an admin user.
    page.get_by_label("Email").fill("admin@test.com")
    page.get_by_label("Password").fill("admin@test.com")
    page.get_by_role("button", name="Login").click()

    # 3. Assert: Confirm the navigation to the settings page was successful.
    page.goto("http://localhost:5173/settings")
    expect(page).to_have_title(re.compile(r"Settings"))

    # 4. Interact with the store information form.
    page.get_by_label("Store Name").fill("New Store Name")
    page.get_by_label("Address").fill("New Store Address")
    page.get_by_label("Phone").fill("123-456-7890")
    page.get_by_label("Email").fill("newstore@email.com")
    page.get_by_role("button", name="Save Store Settings").click()
    expect(page.get_by_text("Store settings saved successfully.")).to_be_visible()

    # 5. Interact with the password change form.
    page.get_by_label("Current Password").fill("admin@test.com")
    page.get_by_label("New Password").fill("newpassword")
    page.get_by_label("Confirm New Password").fill("newpassword")
    page.get_by_role("button", name="Change Password").click()
    expect(page.get_by_text("Password changed successfully.")).to_be_visible()

    # 6. Interact with the notification settings form.
    page.get_by_label("Low Stock Alerts").check()
    page.get_by_role("button", name="Save Preferences").click()
    expect(page.get_by_text("Notification settings saved.")).to_be_visible()

    # 7. Interact with the integration settings form.
    page.get_by_label("Payment Gateway").check()
    page.get_by_role("button", name="Configure Integrations").click()
    expect(page.get_by_text("Integration settings saved.")).to_be_visible()

    # 8. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/verification.png")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    verify_settings_page(page)
    browser.close()
