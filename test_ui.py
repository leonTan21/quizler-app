"""Quick smoke test for the Quizler app UI."""
import time
from playwright.sync_api import sync_playwright, expect

FRONTEND = "http://localhost:8000"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=400)
        page = browser.new_page()
        page.goto(FRONTEND)
        page.wait_for_load_state("networkidle")

        # ── 1. Home page ──────────────────────────────────────
        print("=== HOME PAGE ===")
        print(page.title())
        labels = page.locator(".home-section-label").all_text_contents()
        print("Section labels:", labels)
        cards = page.locator(".mode-card").all_text_contents()
        print(f"{len(cards)} cards visible")

        # ── 2. Quick Play ─────────────────────────────────────
        print("\n=== QUICK PLAY ===")
        page.click(".mode-card:has-text('Quick Play')")
        page.wait_for_selector("#startQuickBtn")
        page.click("#startQuickBtn")
        page.wait_for_selector("#question", timeout=10000)
        q_text = page.inner_text("#question")
        print("First question:", q_text[:80])
        dots_count = page.locator(".q-dot").count()
        print(f"Progress dots: {dots_count}")

        # Answer True
        page.click("#trueBtn")
        page.wait_for_selector("#feedback:not(:empty)", timeout=5000)
        feedback = page.inner_text("#feedback")
        print("Feedback:", feedback)
        next_visible = page.locator("#nextBtn").is_visible()
        print("Next button visible:", next_visible)

        # Wait for auto-advance, then go back home
        time.sleep(3.5)
        page.goto(FRONTEND + "#home")
        page.wait_for_load_state("networkidle")

        # ── 3. Numbers mode ───────────────────────────────────
        print("\n=== NUMBER FACTS ===")
        page.click(".mode-card:has-text('Number Facts')")
        page.wait_for_selector("#startNumbersBtn")
        page.click("#startNumbersBtn")
        page.wait_for_selector("#question", timeout=10000)
        q_text = page.inner_text("#question")
        print("Question:", q_text[:100])
        opts = page.locator("#multipleButtons button").all_text_contents()
        print("Options:", opts)
        page.locator("#multipleButtons button").first.click()
        page.wait_for_selector("#feedback:not(:empty)", timeout=5000)
        print("Feedback:", page.inner_text("#feedback"))

        time.sleep(1)
        page.goto(FRONTEND + "#home")
        page.wait_for_load_state("networkidle")

        # ── 4. Jeopardy mode ──────────────────────────────────
        print("\n=== JEOPARDY ===")
        page.click(".mode-card:has-text('Jeopardy')")
        page.wait_for_selector("#startJeopardyBtn")
        page.click("#startJeopardyBtn")
        page.wait_for_selector("#question", timeout=10000)
        q_text = page.inner_text("#question")
        print("Clue:", q_text[:80])
        cat = page.inner_text("#jeopardyMeta") if page.locator("#jeopardyMeta").is_visible() else "(no category)"
        print("Category:", cat)
        input_visible = page.locator("#jeopardyAnswer").is_visible()
        print("Text input visible:", input_visible)
        page.fill("#jeopardyAnswer", "test answer")
        page.click("#jeopardySubmit")
        page.wait_for_selector("#feedback:not(:empty)", timeout=5000)
        feedback = page.inner_text("#feedback")
        print("Feedback:", feedback)
        correct_shown = page.locator("#jeopardyCorrectAnswer").is_visible()
        print("Correct answer shown:", correct_shown)
        if correct_shown:
            print("Correct answer text:", page.inner_text("#jeopardyCorrectAnswer"))

        time.sleep(1)
        page.goto(FRONTEND + "#home")
        page.wait_for_load_state("networkidle")

        # ── 5. Sudden Death ───────────────────────────────────
        print("\n=== SUDDEN DEATH ===")
        page.click(".mode-card:has-text('Sudden Death')")
        page.wait_for_selector("#startSdBtn")
        best_text = page.inner_text(".sd-best")
        print("SD best display:", best_text)
        page.click("#startSdBtn")
        page.wait_for_selector("#question", timeout=10000)
        print("Question loaded:", page.inner_text("#question")[:60])
        # Deliberately pick wrong answer to trigger sudden death
        first_btn = page.locator("#multipleButtons button").first
        first_btn.click()
        page.wait_for_selector("#feedback:not(:empty)", timeout=5000)
        print("Feedback:", page.inner_text("#feedback"))
        time.sleep(1)
        see_result = page.locator("#nextBtn:has-text('See Result')")
        if see_result.is_visible():
            print("Sudden death end button visible — PASS")
            see_result.click()
            page.wait_for_selector("#summaryScore", timeout=3000)
            print("SD summary score:", page.inner_text("#summaryScore"))
        else:
            # Might have been correct, check Next
            print("Answer was correct, next btn:", page.locator("#nextBtn").inner_text())

        time.sleep(1)
        page.goto(FRONTEND + "#home")

        # ── 6. Saved page ─────────────────────────────────────
        print("\n=== SAVED PAGE ===")
        page.click(".mode-card:has-text('Saved Questions')")
        page.wait_for_selector(".saved-page", timeout=3000)
        content = page.inner_text(".saved-page")
        print("Saved page content:", content[:120])

        print("\n=== ALL TESTS DONE ===")
        time.sleep(2)
        browser.close()

if __name__ == "__main__":
    run()
