# CHOICES.md - Three Key Decisions

## Decision 1: Detection Model - YOLOv8n vs RT-DETR-L vs MediaPipe Pose

**Options considered.**
- **YOLOv8n** (Ultralytics): 3.2M params, ~45ms/frame on CPU, COCO-pretrained person class, mature ecosystem.
- **RT-DETR-L**: transformer-based, higher mAP on crowded scenes, ~120ms/frame on CPU, heavier deployment footprint.
- **MediaPipe Pose**: optimised for single-person on-device use, weak at multi-person counting in retail crowds.

**What AI suggested.** Claude initially recommended RT-DETR-L, citing better performance on partial occlusion examples.

**What I chose and why.** YOLOv8n. Three reasons. First, the input is 1080p at 15fps; YOLOv8n hits real-time on commodity CPUs without dropping frames. Second, face blur is already applied, so the standard COCO person class is sufficient without fine-tuning. Third, ByteTrack compensates for YOLOv8n's slight occlusion weakness, making the heavier RT-DETR-L unnecessary.

## Decision 2: Event Schema - Why 'metadata' is Nested

**Options considered.**
- **Flat schema** with 'queue_depth', 'sku_zone', 'session_seq' as top-level fields.
- **Nested metadata object** as specified in the prompt.
- **Discriminated union per event_type** with type-specific payloads.

**What AI suggested.** GPT-4 strongly preferred the discriminated union (one Pydantic model per event_type, validated via Tagged Union).

**What I chose and why.** The nested 'metadata' object specified in the brief. The discriminated union is more type-safe in code, but the scoring harness validates against the exact JSON schema provided in the challenge spec. Flattening or unionizing the fields risks failing the automated "Schema compliance" scoring gate.

## Decision 3: API Storage - SQLite (WAL) vs PostgreSQL

**Options considered.**
- **SQLite with WAL mode**: single-file, zero external dependency, supports concurrent reader + writer.
- **PostgreSQL 16**: full-featured, separate service, better for high-concurrency writes.
- **DuckDB**: analytical, columnar, no concurrent write support.

**What AI suggested.** Claude recommended PostgreSQL, arguing that "production-aware" implies a real database service.

**What I chose and why.** SQLite in WAL mode. The acceptance gate is explicit: `docker compose up` must work with no manual steps, and the live dashboard requires concurrent reads while the ingest pipeline writes. SQLite WAL satisfies both without requiring a heavy third container, keeping the footprint small and reliable for the reviewer.
