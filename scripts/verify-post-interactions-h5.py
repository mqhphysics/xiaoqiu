"""Headless desktop validation of worktree assets against an isolated real API.

Called by post-interactions.postgres.integration.spec.ts with FEED_BROWSER_CHECK=1.
All browser requests are routed to worktree build files or that test's API; no
user browser, daily service, or separate preview server is used.
"""
import json
import mimetypes
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright, expect

evidence = Path(sys.argv[1]).resolve()
repository = Path.cwd()
dist = (repository / "apps/mini-program/dist").resolve()
fixture = json.loads((evidence / "browser-fixture.json").read_text(encoding="utf-8"))
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    page = context.new_page()
    page.on("dialog", lambda dialog: dialog.accept())
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def route_request(route):
        parsed = urlparse(route.request.url)
        if parsed.path.startswith("/api/"):
            response = route.fetch(url=fixture["api"] + parsed.path + ("?" + parsed.query if parsed.query else ""))
            route.fulfill(response=response)
        elif parsed.hostname == "127.0.0.1" and parsed.port == 3000:
            path = (dist / unquote(parsed.path).lstrip("/")).resolve()
            if not path.is_relative_to(dist):
                route.abort()
                return
            if not path.is_file():
                path = dist / "index.html"
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            route.fulfill(path=str(path), content_type=mime)
        else:
            route.abort()

    context.route("**/*", route_request)
    try:
        page.goto("http://127.0.0.1:3000/", wait_until="networkidle")
        page.get_by_placeholder("请输入账号信息").fill("student")
        page.get_by_placeholder("请输入密码").fill("Xiaoqiu2026!")
        page.locator("form").filter(has=page.get_by_placeholder("请输入密码")).locator("button[type=submit]").click()
        page.wait_for_load_state("networkidle")
        page.screenshot(path=str(evidence / "feed-home-before.png"), full_page=True)
        (evidence / "initial-dom.html").write_text(page.content(), encoding="utf-8")
        page.evaluate("id => window.dispatchEvent(new CustomEvent('xiaoqiu:open-post', {detail:id}))", fixture["postId"])
        modal = page.locator(".post-detail-modal")
        expect(modal.get_by_text("FICTIONAL_TEST 浏览器主帖", exact=True)).to_be_visible()
        expect(modal.get_by_role("button", name="私聊", exact=True)).to_have_count(0)
        expect(modal.get_by_text("投诉", exact=True)).to_have_count(0)
        checks.append("detail has no duplicate private-message or exposed report entry")

        comment = modal.locator(".post-comment").first
        more = comment.get_by_role("button", name="评论操作：", exact=False)
        before = more.bounding_box()
        row_before = comment.bounding_box()
        more.click()
        expect(comment.get_by_role("button", name="投诉", exact=True)).to_be_visible()
        after = more.bounding_box()
        row_after = comment.bounding_box()
        assert abs(before["y"] - after["y"]) < 0.5
        assert abs(row_before["height"] - row_after["height"]) < 0.5
        popover = comment.locator(".post-actions__popover").bounding_box()
        assert popover["y"] >= after["y"] + after["height"]
        more.press("Escape")
        expect(comment.locator(".post-actions__popover")).to_have_count(0)
        expect(modal).to_be_visible()
        checks.append("more popover stays below trigger without moving comment; Escape only closes menu")

        comment.get_by_role("button", name="点赞评论", exact=True).click()
        expect(comment.get_by_role("button", name="取消评论点赞", exact=True)).to_have_attribute("aria-pressed", "true")
        expect(comment.locator(".post-comment__like span")).to_have_text("1")
        modal.get_by_role("button", name="收藏帖子", exact=True).click()
        expect(modal.get_by_role("button", name="取消收藏", exact=True)).to_be_visible()
        modal.get_by_role("button", name="点赞", exact=True).click()
        expect(modal.get_by_role("button", name="取消点赞", exact=True)).to_have_attribute("aria-pressed", "true")
        checks.append("post favorite, post like and comment like write successfully")

        input_box = modal.get_by_role("textbox", name="评论内容", exact=True)
        input_box.fill("FICTIONAL_TEST 回车发送")
        input_box.focus()
        styles = input_box.evaluate("e => ({outline:getComputedStyle(e).outlineStyle,border:getComputedStyle(e).borderWidth})")
        assert styles == {"outline": "none", "border": "0px"}, styles
        input_box.press("Shift+Enter")
        assert input_box.input_value().endswith("\n")
        input_box.evaluate("e => e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,isComposing:true}))")
        assert input_box.input_value().strip() == "FICTIONAL_TEST 回车发送"
        input_box.press("Enter")
        expect(input_box).to_have_value("")
        own = modal.locator(".post-comment").filter(has_text="FICTIONAL_TEST 回车发送")
        expect(own).to_have_count(1)
        own = page.locator("#" + own.get_attribute("id"))
        own.get_by_role("button", name="评论操作：", exact=False).click()
        expect(own.get_by_role("button", name="投诉", exact=True)).to_have_count(0)
        own.get_by_role("button", name="编辑", exact=True).click()
        edit = own.get_by_role("textbox", name="编辑评论内容")
        edit.fill("FICTIONAL_TEST 已编辑自己的评论")
        edit.press("Enter")
        expect(modal.locator(".post-comment__edit")).to_have_count(0)
        expect(modal.get_by_text("FICTIONAL_TEST 已编辑自己的评论", exact=True)).to_be_visible()
        checks.append("no green input frame; Enter sends, Shift+Enter creates newline, composing Enter does not send; owner edits comment")
        page.screenshot(path=str(evidence / "post-detail.png"))

        modal.get_by_role("button", name="关闭动态详情").click()
        page.evaluate("id => window.dispatchEvent(new CustomEvent('xiaoqiu:open-post', {detail:id}))", fixture["postId"])
        expect(modal.get_by_role("button", name="取消收藏", exact=True)).to_be_visible()
        expect(modal.get_by_role("button", name="取消点赞", exact=True)).to_have_attribute("aria-pressed", "true")
        expect(modal.locator(".post-comment__like").first).to_have_attribute("aria-pressed", "true")
        checks.append("closing/reopening reloads favorite and both like states from real API")

        modal.get_by_role("button", name="转发", exact=True).click()
        composer = page.locator(".post-composer")
        expect(composer.get_by_role("heading", name="转发到动态")).to_be_visible()
        expect(composer.locator(".post-quote")).to_contain_text("FICTIONAL_TEST 浏览器主帖")
        expect(composer.get_by_text("全校可见", exact=True)).to_have_count(0)
        team_response = context.request.get(fixture["api"] + "/api/me/team-preferences", headers={"Authorization": "Bearer " + fixture["session"]["accessToken"]}).json()
        assert team_response["primaryTeam"], "Seeded student must have a primary team"
        suggestions = composer.locator(".post-tag-picker__suggestions button")
        expect(suggestions.first).to_have_text("#" + team_response["primaryTeam"]["name"])
        suggestions.first.click()
        composer.get_by_role("textbox", name="动态正文").fill("FICTIONAL_TEST 引用转发")
        page.screenshot(path=str(evidence / "post-quote-composer.png"))
        composer.get_by_role("button", name="发布转发", exact=True).click()
        expect(composer).to_have_count(0)
        expect(modal.get_by_text("FICTIONAL_TEST 引用转发", exact=True)).to_be_visible()
        expect(modal.locator(".post-quote")).to_contain_text("FICTIONAL_TEST 浏览器主帖")
        checks.append("repost publishes quoted original with a selectable primary-team tag and no visibility badge")

        modal.get_by_role("button", name="动态操作", exact=True).click()
        expect(modal.get_by_role("button", name="投诉", exact=True)).to_have_count(0)
        modal.get_by_role("button", name="编辑", exact=True).click()
        composer.get_by_role("textbox", name="动态正文").fill("FICTIONAL_TEST 已编辑转发")
        composer.get_by_role("button", name="保存修改", exact=True).click()
        expect(modal.get_by_text("FICTIONAL_TEST 已编辑转发", exact=True)).to_be_visible()
        page.screenshot(path=str(evidence / "post-reposted.png"))
        modal.get_by_role("button", name="动态操作", exact=True).click()
        modal.get_by_role("button", name="删除", exact=True).click()
        expect(modal).to_have_count(0)
        checks.append("owner edits and deletes repost; deleted card is removed")

        # Check actual desktop cards, including pointer feedback after a round trip.
        like_buttons = page.locator(".post-card__action[aria-pressed]")
        assert like_buttons.count() > 0
        for button in like_buttons.all():
            assert button.is_enabled()
            button.hover()
            assert button.evaluate("e => getComputedStyle(e).cursor") != "not-allowed"
        checks.append("desktop card like buttons are enabled and do not show forbidden cursor")
        assert not errors, errors
        print(json.dumps({"ok": True, "checks": checks, "screenshots": ["post-detail.png", "post-quote-composer.png", "post-reposted.png"]}, ensure_ascii=False))
    except Exception:
        page.screenshot(path=str(evidence / "browser-failure.png"), full_page=True)
        (evidence / "failure-dom.html").write_text(page.content(), encoding="utf-8")
        raise
    finally:
        context.close()
        browser.close()
