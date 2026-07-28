# Assignment 1 Resume and Reflection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a polished two-page PDF with a headshot on the resume page and an improved prompt-engineering reflection.

**Architecture:** A small ReportLab builder creates both pages from verified source facts and the staged headshot. A unittest validates PDF page count, required text, and image presence before the PDF is rendered to PNG for visual QA.

**Tech Stack:** Python 3, ReportLab, pypdf, Poppler.

---

### Task 1: Create an output contract test

**Files:**
- Create: `work/tests/test_build_assignment_pdf.py`
- Create: `work/build_assignment_pdf.py`
- Create: `output/pdf/assignment1_resume_reflection_polished.pdf`

- [ ] **Step 1: Write the failing test**

```python
from build_assignment_pdf import build_pdf

def test_build_pdf_creates_two_pages_with_resume_and_reflection(tmp_path):
    output = tmp_path / "assignment.pdf"
    build_pdf(output)
    reader = PdfReader(output)
    assert len(reader.pages) == 2
    assert "HAOTIAN WU" in reader.pages[0].extract_text()
    assert "PROMPT ENGINEERING REFLECTION" in reader.pages[1].extract_text()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest work/tests/test_build_assignment_pdf.py -v`

Expected: FAIL because `build_assignment_pdf` does not yet exist.

- [ ] **Step 3: Write minimal implementation**

Implement `build_pdf(output_path)` with ReportLab using staged image and source-verified text, adding the headshot only to page 1.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest work/tests/test_build_assignment_pdf.py -v`

Expected: PASS with one test.

### Task 2: Render and inspect the deliverable

**Files:**
- Modify: `output/pdf/assignment1_resume_reflection_polished.pdf`
- Create: `tmp/pdfs/final-page-1.png`
- Create: `tmp/pdfs/final-page-2.png`

- [ ] **Step 1: Render the final PDF**

Run Poppler `pdftoppm.exe` with PNG output at 160 DPI.

- [ ] **Step 2: Inspect both pages**

Confirm readable text, a correctly proportioned headshot on page 1, no headshot on page 2, and no clipping or overlap.
