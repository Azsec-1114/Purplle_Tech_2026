# Apex Retail — Store Intelligence System
End-to-end pipeline that turns raw CCTV footage into a queryable analytics API
with a live dashboard. Built for the Purplle Tech Challenge 2026.
## Quick Start (5 commands)
```bash
git clone <repo_url> && cd store-intelligence cp .env.example .env docker compose up --build -d python pipeline/demo_generator.py open http://localhost:3000 # 1. clone
# 2. configure
# 3. boot all services
# 4. seed events (or `bash pipeline/run.sh` for real videos)
# 5. view dashboard

docker compose up -d api
python pipeline/demo_generator.py pytest tests/ -v # seed the API
# full suite (incl. test_assertions.py)
