#!/usr/bin/env python3
"""
VOXA Telephony Recordings Fetcher
Fetches call audio recordings from Asterisk on-demand API (http://172.16.17.127/callOnDemandApi.php)
and downloads them into /var/www/voxa-backend/recordings.
"""

import json
import sys
import os
import subprocess
import urllib.request
import urllib.error

API_URL = os.environ.get("CALL_ON_DEMAND_API_URL", "http://172.16.17.127/callOnDemandApi.php")

# Determine target directory
if os.path.exists("/var/www/voxa-backend/recordings"):
    TARGET_DIR = "/var/www/voxa-backend/recordings"
elif os.path.exists("/var/www/voxa-backend"):
    TARGET_DIR = "/var/www/voxa-backend/recordings"
    os.makedirs(TARGET_DIR, exist_ok=True)
else:
    TARGET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings")
    os.makedirs(TARGET_DIR, exist_ok=True)

print("=" * 60)
print(f"VOXA Call Recordings Sync")
print(f"API Endpoint: {API_URL}")
print(f"Save Directory: {TARGET_DIR}")
print("=" * 60)

# 1. Fetch metadata list from API
req = urllib.request.Request(API_URL, headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))
except Exception as e:
    print(f"❌ Error connecting to Asterisk API: {e}", file=sys.stderr)
    print("Note: This endpoint is IP-whitelisted and must run on the server (/var/www/voxa-backend on zain-vm-2).", file=sys.stderr)
    sys.exit(1)

if payload.get("status") != "success" or "data" not in payload:
    print(f"❌ Invalid response from API: {payload}", file=sys.stderr)
    sys.exit(1)

recordings = payload["data"]
print(f"Found {len(recordings)} recordings in API.\n")

downloaded = 0
already_exists = 0
failed = 0
index = []

for rec in recordings:
    raw_url = rec.get("recording_url", "")
    # Clean escaped slashes
    clean_url = raw_url.replace(r"\/", "/").replace("//call_recordings", "/call_recordings")
    filename = rec.get("file_name")
    if not filename:
        continue

    dest_file = os.path.join(TARGET_DIR, filename)

    if os.path.exists(dest_file) and os.path.getsize(dest_file) > 0:
        already_exists += 1
        index.append({**rec, "local_path": dest_file, "exists": True})
        continue

    print(f"Downloading: {filename} ...")
    try:
        # Use curl if available, otherwise urllib
        res = subprocess.run(["curl", "-s", "-f", "-o", dest_file, clean_url], check=False)
        if res.returncode == 0 and os.path.exists(dest_file) and os.path.getsize(dest_file) > 0:
            downloaded += 1
            index.append({**rec, "local_path": dest_file, "exists": True})
        else:
            # Fallback to urllib
            urllib.request.urlretrieve(clean_url, dest_file)
            downloaded += 1
            index.append({**rec, "local_path": dest_file, "exists": True})
    except Exception as err:
        print(f"  ⚠️ Failed downloading {filename}: {err}")
        failed += 1

# Save index
index_path = os.path.join(TARGET_DIR, "recordings_index.json")
try:
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)
    print(f"\nSaved metadata index to: {index_path}")
except Exception as err:
    print(f"Could not save index: {err}")

print("\n" + "=" * 60)
print(f"Done! {len(recordings)} files processed.")
print(f"  - Newly downloaded: {downloaded}")
print(f"  - Already existed:  {already_exists}")
if failed > 0:
    print(f"  - Failed downloads: {failed}")
print("=" * 60)
