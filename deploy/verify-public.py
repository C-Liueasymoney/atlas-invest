"""Verify IP HTTPS, login, CSRF and protected APIs without printing credentials."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--external", action="store_true")
parser.add_argument("--password-file", type=Path)
args = parser.parse_args()
origin = "https://47.101.193.94"
if args.password_file:
    lines = args.password_file.read_text().splitlines()
    password = next(line.split("：", 1)[1].strip() for line in lines if line.startswith("应用登录密码："))
else:
    values = dict(line.split("=", 1) for line in Path("/opt/atlas-invest/deploy/.env").read_text().splitlines() if line and not line.startswith("#"))
    password = values["OWNER_PASSWORD"]

with tempfile.TemporaryDirectory(prefix="atlas-public-verify-") as directory:
    directory = Path(directory)
    cookies = directory / "cookies"
    def call(path, method="GET", payload=None, request_origin=origin):
        headers = directory / "headers"
        output = directory / "body"
        command = ["curl", "--silent", "--show-error", "--connect-timeout", "5", "--max-time", "30",
                   "-X", method, "-H", f"Origin: {request_origin}", "-H", "Content-Type: application/json",
                   "-b", str(cookies), "-c", str(cookies), "-D", str(headers), "-o", str(output),
                   "-w", "%{http_code}", origin + path]
        if not args.external:
            command += ["--connect-to", "47.101.193.94:443:172.19.7.35:443"]
        if payload is not None:
            command += ["--data-binary", "@-"]
        response = subprocess.run(command, input=json.dumps(payload) if payload is not None else "", text=True, capture_output=True, check=True)
        return int(response.stdout), headers.read_text(), output.read_text()

    assert call("/login")[0] == 200, "Login page is unavailable"
    assert call("/api/v1/catalog")[0] == 401, "Unauthenticated data access was not denied"
    assert call("/api/auth/login", "POST", {"password": password}, "https://untrusted.invalid")[0] == 403, "Untrusted origin was not rejected"
    code, headers, body = call("/api/auth/login", "POST", {"password": password})
    assert code == 200 and json.loads(body)["authenticated"], "Public-origin login failed"
    assert all(flag.lower() in headers.lower() for flag in ("HttpOnly", "SameSite=Strict", "Secure")), "Session cookie protection missing"
    code, _, body = call("/api/v1/session")
    session = json.loads(body)
    assert code == 200 and session["authenticated"] and session["mode"] == "live" and not session["localDemo"]
    code, _, body = call("/api/v1/catalog")
    assert code == 200 and len(json.loads(body)["items"]) >= 15
    code, _, body = call("/api/v1/dashboards")
    dashboards = json.loads(body)["items"]
    assert code == 200 and isinstance(dashboards, list), "Dashboard workspace API failed"
    assert all(isinstance(w["config"], dict) and isinstance(w["layout"], dict)
               for d in dashboards for w in d["widgets"]), "Workspace JSON was stored as an encoded string"
    code, _, body = call("/api/v1/quotes?seriesIds=SGE_AU9999_D1")
    assert code == 200 and len(json.loads(body)["items"]) == 1, "Dashboard quote API failed"
    code, _, body = call("/api/v1/dashboards")
    assert code == 200 and json.loads(body)["items"] == dashboards, "Quote refresh changed workspace configuration"
    code, _, body = call("/api/v1/series/SGE_AU9999_D1/bars?interval=1d")
    assert code == 200 and json.loads(body).get("isDemo") is False, "Protected live-series API failed"
    assert call("/api/auth/logout", "POST", {})[0] == 200
    assert call("/api/v1/catalog")[0] == 401, "Logout did not revoke access"
    route = "external public network" if args.external else "server-side private routing"
    print(f"PASS ({route}): trusted IP certificate, login, Secure/HttpOnly cookie, CSRF rejection, protected catalog, dashboard, quote and live-series APIs, logout.")
