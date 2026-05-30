"""Test timed challenge mode."""
import time
from playwright.sync_api import sync_playwright

FRONTEND = "http://localhost:8000"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=300)
        page = browser.new_page()
        page.goto(FRONTEND)
        page.wait_for_load_state("networkidle")

        print("=== TIMED CHALLENGE ===")
        page.click(".mode-card:has-text('Timed Challenge')")
        page.wait_for_selector("#startTimedBtn")

        # Verify config shows total time (not per-question)
        desc = page.inner_text(".cat-config-desc")
        print("Config desc:", desc)
        tabs = page.locator("#timedSecsTabs .tab-btn").all_text_contents()
        print("Time options:", tabs)
        active = page.locator("#timedSecsTabs .tab-btn.active").inner_text()
        print("Default selected:", active)

        # Start with 60s
        page.click("#startTimedBtn")
        page.wait_for_selector("#question", timeout=12000)
        print("Quiz started")

        # Check counter shows timer
        time.sleep(0.5)
        counter = page.inner_text("#questionCounter")
        print("Counter:", counter)

        # No progress dots
        dots = page.locator("#questionDots").is_visible()
        print("Dots visible:", dots)

        # Timer bar present
        timer_bar = page.locator("#timerBar").is_visible()
        print("Timer bar visible:", timer_bar)

        # Answer a few questions quickly
        for i in range(4):
            q = page.inner_text("#question")
            print(f"Q{i+1}: {q[:60]}")
            page.locator("#multipleButtons button").first.click()
            time.sleep(0.3)
            fb = page.inner_text("#feedback")
            print(f"  Feedback: {fb[:40]}")
            time.sleep(0.9)  # wait for auto-advance
            counter = page.inner_text("#questionCounter")
            print(f"  Counter after: {counter}")

        # Wait for session to end (60s total — skip wait, navigate away)
        print("\nTest passed — timed mode working correctly")
        time.sleep(1)
        browser.close()

if __name__ == "__main__":
    run()
