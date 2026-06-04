# DESIGN.md - Apex Retail Store Intelligence

## 1. System Overview
The Store Intelligence System turns raw CCTV footage from Apex Retail's physical stores into a real-time, queryable analytics surface. The architecture is built as a three-stage pipeline wrapped in three Docker containers (`pipeline`, `api`, `dashboard`). It processes raw anonymised video into structured behavioural events, which are ingested by an idempotent API to compute live metrics, funnels, and operational anomalies.

## 2. Pipeline Stages & Architecture
**Stage 1 - Detection Layer:**
We use YOLOv8n (Ultralytics) running frame-by-frame on the COCO 'person' class. Given the input resolution (1080p at 15fps) and the fact that faces are already blurred, YOLOv8n provides the optimal balance of speed (hitting 15fps on CPU) and accuracy.

**Stage 2 - Tracking + Re-ID:**
ByteTrack handles intra-clip identity tracking via Kalman filter and IoU association. To handle cross-camera tracking and the REENTRY edge case, we integrate OSNet (torchreid) embeddings. A 512-d embedding is cached per visitor, allowing us to compute cosine similarity and deduplicate visitors returning to the store or crossing overlapping camera zones.

**Stage 3 - Spatial + Behavioural Reasoning (FSM):**
Using `supervision`'s `PolygonZone` and `LineZone`, the pipeline performs spatial analytics. A finite-state machine (FSM) per `visitor_id` tracks transitions (e.g., crossing the entry threshold, dwelling in a product zone for >30s, or joining a billing queue) and emits structured JSONL events compliant with our Pydantic schema. Staff are excluded via a uniform-color HSV histogram match (with VLM fallback).

**Stage 4 - Ingest + Intelligence API:**
Events stream into a FastAPI application, validated by strict Pydantic v2 schemas. Database interactions are handled via SQLAlchemy 2.0 Core over an SQLite database configured in WAL (Write-Ahead Logging) mode, enabling concurrent writes (from the ingest endpoint) and reads (from metrics/dashboard endpoints) without needing a dedicated database container.

## 3. AI-Assisted Decisions
As required by the challenge policy, AI tools (Claude, GPT-4) were used extensively. Here are three key areas where an LLM shaped the design and my reasoning for agreeing or overriding it:

**Decision 1: Tracker Choice (ByteTrack vs DeepSORT)**
* **LLM Suggestion:** Claude initially recommended DeepSORT for its robust appearance model, arguing it would better handle the "partial occlusion" edge case in the billing clip.
* **My Choice (Override):** I disagreed and chose ByteTrack. DeepSORT couples appearance embeddings to every frame, which adds heavy computational overhead. ByteTrack keeps low-confidence tracks alive across occlusions purely using motion/IoU, which is much faster on CPU. I reserved appearance embeddings (OSNet) strictly for cross-camera and re-entry events where they are strictly necessary.

**Decision 2: Event Schema Metadata Nesting**
* **LLM Suggestion:** GPT-4 suggested flattening `metadata.queue_depth` and `metadata.sku_zone` into top-level fields for "simpler SQL querying", or creating a complex discriminated union (one Pydantic model per event type).
* **My Choice (Override):** I stuck with the nested `metadata` object as specified in the original challenge brief. A discriminated union is more type-safe but overly verbose for this exercise, and flattening the schema breaks the standard contract expected by the automated scoring harness.

**Decision 3: POS Correlation Window**
* **LLM Suggestion:** The spec defines a converted visitor as one who was in the billing zone in the "5-minute window before a transaction timestamp." Claude proposed dynamically extending this window based on the current `queue_depth` (e.g., waiting longer if the queue is deep).
* **My Choice (Agree/Constrain):** While Claude's logic makes business sense, implementing dynamic windows breaks the strict deterministic scoring criteria for the conversion funnel. I overrode the AI to stick strictly to the 5-minute fixed window to ensure the `/funnel` endpoint remains monotonically accurate against the challenge ground truth.

## 4. Non-Goals
To maintain scope and performance, this system explicitly does **not** attempt:
* Facial recognition (faces are intentionally blurred in the dataset).
* Per-SKU attribution beyond the named zone level.
* Cross-store visitor identification (visitor IDs are scoped per store session).
