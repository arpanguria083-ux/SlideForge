# Timeout Issues Analysis & Solutions

## Current Timeout Configuration

### Frontend Timeouts
- **Default**: 60 seconds (all endpoints)
- **runAnalysis**: 600 seconds (10 minutes) + fallback to polling for 20 minutes
- **Polling interval**: 2 seconds

### Backend Timeouts
- **No explicit timeout**: Analysis runs to completion
- **Async concurrency limits**:
  - MAX_CONCURRENT_LLM: 4 (controls LLM parallelism)
  - MAX_CONCURRENT_VISION: 8 (controls vision/OCR parallelism)

---

## Root Causes of Timeouts

### 1. **OCR Processing (SLOWEST)**
```
Time: ~19-23 seconds per page for layout + text detection
Problem: Surya model processes PDF sequentially per page
Example: 68 pages = 68 × 20s ≈ 23 minutes just for OCR
```
- Located in: PDF upload/processing stage
- Affects: slides_data generation before analysis starts

### 2. **LLM Analysis Pipeline (CONCURRENT)**
```
7 Agents run in parallel:
- Insight Extractor (claims analysis)
- Structure Auditor (narrative flow)
- Data Lineage Agent (Excel verification)
- Visual Analysis Agent (image analysis + OCR)
- Framework Agent (structure scoring)
- So-What Agent (impact analysis)
- Benchmarking Agent (metrics)

Each agent calls LLM multiple times (1-5 calls per agent typically)
Limited by: MAX_CONCURRENT_LLM = 4 semaphore
```

### 3. **Language Analysis (SEQUENTIAL)**
```
Time: LanguageTool (~500ms per slide) + LLM quality check (~2-5s per slide)
Example: 68 slides × 5s ≈ 340 seconds for language analysis alone
```

### 4. **Memory Pressure**
```
Current: 86.1% system memory used
Causes: Surya models + LLM models kept in memory simultaneously
Effect: Disk paging, slower inference
```

### 5. **LLM Response Parsing Issues**
```
Observed: "WARNING: Failed to parse JSON" logs indicate:
- LLM returns malformed JSON
- Parser falls back to regex extraction
- Adds latency + reduced quality
```

---

## Performance Breakdown: Example (68-slide PDF)

```
Phase 1: PDF Upload & OCR
  OCR Processing:        1360s (68 × 20s per page) ← BOTTLENECK
  
Phase 2: Parallel Agent Analysis
  7 Agents × ~3s average per agent = ~21s (parallelized)
  
Phase 3: Language Analysis
  68 slides × 5s average = 340s ← BOTTLENECK
  
Phase 4: Scoring & Grading
  Parallel calculation: ~2s
  
TOTAL: ~1360 + 21 + 340 + 2 = 1723 seconds (~29 minutes)
Frontend 600s timeout: EXCEEDED after first 10 minutes of OCR
```

---

## Solutions (Prioritized)

### HIGH PRIORITY (Immediate Impact)

#### Solution 1: Skip OCR for Already-Extracted Text
**Problem**: Re-running OCR on PDFs that already have text extraction
**Solution**: Check if PDF has embedded text; skip Surya if text available
**Impact**: Reduce 68 pages from 23 min to <1 min (text extraction already done)
**Implementation**:
```python
# In PDF upload handler
def should_skip_ocr(pdf_path):
    # Check if PDF has embedded text
    with pdfplumber.open(pdf_path) as pdf:
        text_count = sum(len(page.extract_text() or "") for page in pdf.pages[:5])
    return text_count > 500  # Has substantial embedded text
```
**Time Saved**: 1000+ seconds

#### Solution 2: Increase MAX_CONCURRENT_LLM
**Problem**: Only 4 LLM calls concurrent, but 7 agents need them
**Solution**: Increase semaphore to 8 (monitor memory)
**Impact**: Reduce agent analysis from 21s to ~12s
**Implementation**:
```bash
export MAX_CONCURRENT_LLM=8
```
**Time Saved**: ~10 seconds per analysis

#### Solution 3: Language Analysis Parallelization
**Problem**: Language checks run sequentially (340s for 68 slides)
**Solution**: Parallelize per-slide language checks (currently sequential)
**Impact**: Reduce from 340s to ~85s (4x parallelism with current concurrency limit)
**Implementation**:
```python
# Current: sequential
# language_annotations = []
# for slide in slides_data:
#     annotations.extend(await check_slide_language(slide))

# New: parallel batches of 4-8 slides
async def analyze_deck_parallel(self, slides_data, rules):
    tasks = [
        self._check_slide_language(slide, rules)
        for slide in slides_data
    ]
    results = await asyncio.gather(*tasks)
    return [a for result in results for a in result]
```
**Time Saved**: ~250 seconds

#### Solution 4: Increase Frontend Timeout
**Problem**: 600s timeout too aggressive for large files
**Solution**: Increase to 1200s (20 minutes) for initial request
**Impact**: Handles most normal PDFs without timeout
**Implementation**:
```typescript
// In apiService.ts line 746
}, { retries: 0, timeoutMs: 1200_000 });  // was 600_000
```
**Time Saved**: Prevents timeout on files that would complete

---

### MEDIUM PRIORITY (Significant Improvement)

#### Solution 5: Progressive Results Streaming
**Problem**: Frontend waits for all analysis to complete before getting results
**Solution**: Stream scorecard + annotations as each agent completes
**Impact**: User sees initial results quickly; can start reviewing
**Implementation**:
```python
# Send partial scorecard after key agents complete
@app.post("/api/session/{session_id}/run-analysis")
async def run_analysis(session_id: str):
    # Start background job
    asyncio.create_task(_run_analysis_job(session_id))
    
    # Return immediately with status endpoint
    return {
        "session_id": session_id,
        "status": "analyzing",
        "poll_url": f"/api/session/{session_id}/run-analysis/status"
    }
    
# Status endpoint returns partial results as they complete
@app.get("/api/session/{session_id}/run-analysis/status")
async def get_status(session_id: str):
    session = _get_session(session_id)
    return {
        "status": session.get("status"),
        "scorecard": session.get("scorecard"),  # Partial until complete
        "progress": session.get("analysis_progress", {})
    }
```
**Time Saved**: User can start viewing results after ~100s instead of waiting for full completion

#### Solution 6: LLM Response Caching
**Problem**: Repeated LLM calls for similar slides
**Solution**: Increase cache TTL; normalize prompts for better hits
**Impact**: 20-30% reduction in LLM calls on decks with repeated patterns
**Current**: 1-day TTL; many prompts don't match due to slide-specific details
**Implementation**:
```python
# Already implemented but under-utilized
_llm_cache_get(key, ttl_seconds=7*24*3600)  # Keep 7 days
# Normalize prompts to increase cache hits
```
**Time Saved**: ~50-100 seconds on patterned decks

#### Solution 7: Memory Optimization
**Problem**: 86% memory used; models kept in memory between analyses
**Solution**: Unload models after analysis; reload on-demand
**Impact**: Faster inference (less paging), support more concurrent users
**Implementation**:
```python
# Already has: inference_service.optimize_memory()
# Enhance: unload vision models if not used in last 5 min
# Reload only when needed
```
**Time Saved**: ~10-20s (faster inference due to less paging)

---

### LOW PRIORITY (Long-term Optimization)

#### Solution 8: Async OCR Batching
**Problem**: Surya processes pages sequentially
**Solution**: Process multiple pages in parallel (if VRAM allows)
**Impact**: Reduce 1360s to ~340s (4x parallelism)
**Caveat**: Requires GPU with sufficient VRAM
**Implementation**:
```python
# Batch pages for parallel processing
async def process_pdf_pages_parallel(pdf_path, batch_size=4):
    pages = get_pdf_pages(pdf_path)
    results = []
    for batch in chunks(pages, batch_size):
        batch_results = await asyncio.gather(
            *[process_page_ocr(page) for page in batch]
        )
        results.extend(batch_results)
    return results
```
**Time Saved**: ~1000 seconds (if GPU has capacity)

#### Solution 9: Slide Sampling for Large Decks
**Problem**: Analyzing 100+ slides takes very long
**Solution**: Allow user to select analysis scope (all, key slides, sampling)
**Impact**: Users can choose speed vs. coverage
**Implementation**:
```python
@app.post("/api/session/{session_id}/run-analysis")
async def run_analysis(session_id: str, options: Optional[Dict] = None):
    sample_rate = options.get("sample_rate", 1.0)  # 1.0 = all slides
    if sample_rate < 1.0:
        slides_data = random_sample(slides_data, sample_rate)
```
**Time Saved**: User-selectable (e.g., 50% sampling = 50% time)

#### Solution 10: LLM Query Optimization
**Problem**: Some agents make redundant LLM calls
**Solution**: Combine related queries into single LLM call
**Impact**: Reduce LLM calls by 15-25%
**Implementation**: Requires refactoring agents (moderate effort)
**Time Saved**: ~30-50 seconds

---

## Recommended Implementation Order

### IMMEDIATE (Do First - 15 minutes)
1. ✅ **Skip OCR for text-rich PDFs** → -1000s for most files
2. ✅ **Increase MAX_CONCURRENT_LLM to 8** → -10s
3. ✅ **Increase frontend timeout to 1200s** → Prevents premature timeout

### WEEK 1 (High ROI)
4. **Parallelize language analysis** → -250s
5. **Progressive results streaming** → Better UX
6. **Better LLM caching** → -50s

### WEEK 2-3 (Medium ROI)
7. **Memory optimization** → -20s
8. **Slide sampling UI** → User choice

### BACKLOG (Complex/Lower ROI)
9. Async OCR batching → Requires GPU optimization
10. LLM query optimization → Significant refactoring

---

## Expected Impact

| Scenario | Current Time | With Fixes | Reduction |
|----------|--------------|-----------|-----------|
| 5-slide deck | 30s | 15s | 50% |
| 20-slide deck | 90s | 40s | 55% |
| 68-slide deck | 1700s | 400s | 76% |
| Text-rich PDF (68p) | 1700s → 400s | 300s | 82% |

---

## Current Status

### What's Working
- ✅ 7-agent parallelism
- ✅ Caching (1-day TTL)
- ✅ Async/await throughout
- ✅ Polling fallback on frontend

### What Needs Fixing
- ❌ OCR on text-rich PDFs (unnecessary)
- ❌ Language analysis not parallelized
- ❌ Frontend timeout too low (600s)
- ❌ No progressive result streaming
- ❌ Memory pressure (86%)

---

## Monitoring Recommendations

```python
# Add to _execute_analysis to track bottlenecks
import time

start = time.time()
ocr_start = time.time()
slides_data = process_slides(pdf_path)  # OCR happens here
ocr_time = time.time() - ocr_start
logger.info(f"OCR time: {ocr_time:.1f}s")

agent_start = time.time()
agent_results = await analysis_orchestrator.run_parallel_analysis(...)
agent_time = time.time() - agent_start
logger.info(f"Agent analysis time: {agent_time:.1f}s")

language_start = time.time()
language_annotations = await language_agent.analyze_deck(...)
language_time = time.time() - language_start
logger.info(f"Language analysis time: {language_time:.1f}s")

total_time = time.time() - start
logger.info(f"Total analysis time: {total_time:.1f}s (OCR:{ocr_time:.1f}s, Agents:{agent_time:.1f}s, Language:{language_time:.1f}s)")
```

This will help identify which solution to prioritize for each use case.
