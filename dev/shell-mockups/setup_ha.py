"""Onboard a scratch HA (dev/devdevdev), add one woodland pet and make it a sunny day.

Usage: python3 dev/shell-mockups/setup_ha.py [http://localhost:8404]
"""
import json, sys, time, urllib.parse, urllib.request

HA = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8404"
CLIENT = HA + "/"


def api(method, url, token=None, body=None, form=False):
    headers, data = {}, None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if form:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(body).encode()
    elif body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(HA + url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        text = r.read().decode()
    return json.loads(text) if text else None


def token(code):
    return api("POST", "/auth/token", body={"grant_type": "authorization_code", "code": code,
                                             "client_id": CLIENT}, form=True)["access_token"]


def sign_in():
    try:
        steps = api("GET", "/api/onboarding")
    except Exception:
        steps = []
    user = next((s for s in steps if s["step"] == "user"), None)
    if user and not user["done"]:
        code = api("POST", "/api/onboarding/users", body={
            "client_id": CLIENT, "name": "Dev", "username": "dev", "password": "devdevdev",
            "language": "en"})["auth_code"]
        access = token(code)
        for s in steps:
            if s["done"] or s["step"] == "user":
                continue
            body = {"client_id": CLIENT, "redirect_uri": CLIENT} if s["step"] == "integration" else {}
            try:
                api("POST", f"/api/onboarding/{s['step']}", access, body)
            except Exception:
                pass
        return access
    flow = api("POST", "/auth/login_flow", body={"client_id": CLIENT,
               "handler": ["homeassistant", None], "redirect_uri": CLIENT})
    done = api("POST", f"/auth/login_flow/{flow['flow_id']}", body={
        "client_id": CLIENT, "username": "dev", "password": "devdevdev"})
    return token(done["result"])


access = sign_in()
for _ in range(60):
    if api("GET", "/api/config", access)["state"] == "RUNNING":
        break
    time.sleep(2)
entries = api("GET", "/api/config/config_entries/entry?domain=virtual_pet", access)
if not entries:
    flow = api("POST", "/api/config/config_entries/flow", access, {"handler": "virtual_pet"})
    api("POST", f"/api/config/config_entries/flow/{flow['flow_id']}", access,
        {"name": "Mockpip", "world": "woodland"})
api("POST", "/api/services/virtual_pet/fast_forward", access, {"hours": 1})
api("POST", "/api/services/input_select/select_option", access,
    {"entity_id": "input_select.fake_weather", "option": "sunny"})
print("ready")
