import asyncio
from logging import (
    DEBUG,
    ERROR,
    getLogger
)
import nodriver
import os
import subprocess
from pyvirtualdisplay import Display

from mediamirror.services.logs import log_subprocess_output

VNC_INSTALL = os.environ.get("VNC_INSTALL", "false") == "true"
INTERNAL_VNC_PORT = 5900
NOVNC_PORT = os.environ.get("NOVNC_RUN_PORT")


class BrowserCreationException(Exception):
    pass


class WebBrowser(object):
    browser = None
    limited_domains = []
    subprocesses = []

    def __init__(self, browser_width: int, browser_height: int):
        try:
            self.__display = Display(visible=0, size=(browser_width, browser_height))
            self.__display.start()
        except Exception as e:
            raise Exception("Failed to start display.", e)

    async def start(self, headless: bool = True) -> None:
        """
        Start the browser process.

        :param headless: If the browser should start in headless mode
        """
        browser_args = [
            "--disable-web-security",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-features=IsolateOrigins,site-per-process",
            "--start-fullscreen"
        ]
        if headless:
            browser_args += [
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--mute-audio"
            ]
        self.browser = await nodriver.start(
            headless=headless,
            browser_args=browser_args,
            sandbox=False
        )

    async def limit_domains(self, domains: list[str]) -> None:
        """
        Set a list of domains that the browser is allowed to navigate to.

        :param domains: List of domains to match in navigation events
        """
        self.__limited_domains = domains
        if len(domains) > 0:
            await self.browser.cdp.send("Network.enable", {})
            await self.browser.cdp.send("Network.setRequestInterception", {"patterns": [{"urlPattern": "*"}]})

    def get_display_num(self) -> int:
        """
        Get the display number being used by the virtual display.

        :return: Associated PyVirtualDisplay display number
        """
        return self.__display.display

    def get_iframe_url(self) -> str:
        """
        Get URL for embedding browser view if VNC is installed.

        :return: URL for embedding
        """
        if VNC_INSTALL:
            return f"http://localhost:{NOVNC_PORT}/vnc.html?autoconnect=true&shared=false&resize=remote&compression=9"

    def get_cookies(self) -> list[dict]:
        """
        Get the cookies created in the browser.

        :return: List of Requests CookieJar Cookies
        """
        return self.browser.cookies.get_all(requests_cookie_format=True)

    def close(self) -> None:
        """
        End related processes, stop the browser and close the virtual display.
        """
        for process in self.subprocesses:
            process.terminate()
            process.wait()
        self.browser.stop()
        self.__display.stop()


async def restrict_browser_navigation(web_browser: WebBrowser) -> None:
    """
    Prevent navigation to domains outside those configured for a browser.

    :param web_browser: The WebBrowser object being restricted
    """
    async for event in web_browser.browser.cdp.listen("Network.requestIntercepted"):
        if len(web_browser.limited_domains) > 0:
            request = event["params"]["request"]
            url = request["url"]
            domain = url.split("/")[2]
            is_navigation_request = event["params"].get("isNavigationRequest", False)
            if is_navigation_request and domain not in web_browser.limited_domains:
                await web_browser.browser.cdp.send("Network.continueInterceptedRequest", {
                    "interceptionId": event["params"]["interceptionId"],
                    "errorReason": "BlockedByClient"
                })
            else:
                await web_browser.browser.cdp.send("Network.continueInterceptedRequest", {
                    "interceptionId": event["params"]["interceptionId"]
                })


async def make_browser(browser_width: int, browser_height: int, use_vnc: bool = False) -> WebBrowser:
    """
    Make a WebBrowser object driven with nodriver, and optionally configure VNC.

    :param browser_width: Width of virtual display for browser
    :param browser_height: Height of virtual display for browser
    :param use_vnc: Whether or not to start VNC processes with the browser
    :return: WebBrowser object
    """
    log = getLogger(__name__)
    if use_vnc and not VNC_INSTALL:
        raise BrowserCreationException("MediaMirror was not installed with VNC, cannot start VNC browser instance.")
    try:
        web_browser = WebBrowser(browser_width, browser_height)
        if use_vnc:
            # Start VNC process
            vnc_process = subprocess.Popen([
                "x11vnc", "-display", f":{web_browser.get_display_num()}", "-forever", "-rfbport",
                str(INTERNAL_VNC_PORT), "-nopw", "-shared"
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            asyncio.create_task(log_subprocess_output(log, vnc_process.stdout, DEBUG))
            asyncio.create_task(log_subprocess_output(log, vnc_process.stderr, ERROR))
            web_browser.subprocesses.append(vnc_process)
            # Start noVNC proxy process
            novnc_process = subprocess.Popen([
                "novnc_proxy", "--vnc", f"localhost:{INTERNAL_VNC_PORT}", "--listen",
                str(NOVNC_PORT)
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            asyncio.create_task(log_subprocess_output(log, novnc_process.stdout, DEBUG))
            asyncio.create_task(log_subprocess_output(log, novnc_process.stderr, ERROR))
            web_browser.subprocesses.append(novnc_process)
        await web_browser.start(False)
        return web_browser
    except Exception as e:
        log.exception("Failed to create web browser.")
        raise e
