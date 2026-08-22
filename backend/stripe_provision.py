import os, json, urllib.request
import stripe

base = os.environ["INTEGRATION_PROXY_URL"]
job_id = "312c4fa0-2a4a-4b72-bb1b-2f91e179918f"
key = "sk-emergent-775EdF901712fE608A"
req = urllib.request.Request(
    base + "/stripe/sandboxes",
    data=json.dumps({"job_id": job_id}).encode(),
    headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    sandbox = json.load(r)

stripe.api_key = sandbox["sandbox_secret_key"]
country = stripe.Account.retrieve()["country"]
SMP = {"AU","AT","BE","BG","CA","HR","CY","CZ","DK","EE","FI","FR","DE","GI","GR",
       "HK","HU","IE","IT","JP","LV","LI","LT","LU","MT","NL","NO","PL","PT","RO",
       "SG","SK","SI","ES","SE","CH","GB","US"}
print("SANDBOX_SECRET=" + sandbox["sandbox_secret_key"])
print("SANDBOX_PUBLISHABLE=" + sandbox["sandbox_publishable_key"])
print("SANDBOX_ACCOUNT=" + sandbox["sandbox_account_id"])
print("WEBHOOK_SECRET=" + sandbox.get("preview_webhook_secret", ""))
print("ONBOARDING_URL=" + sandbox.get("onboarding_url", ""))
print("COUNTRY=" + country)
print("USE_SMP=" + str(country in SMP))
