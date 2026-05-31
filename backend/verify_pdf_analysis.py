import asyncio
import os
from pathlib import Path
from app.services.document_ingestion import DocumentIngestionService
from app.agents.parallel_analysis import VisualAnalysisAgent
from app.models.schemas import GuardrailSchema


async def verify_analysis(pdf_path: str):
    print(f"--- Verifying Analysis for: {pdf_path} ---")

    ingestor = DocumentIngestionService()
    visual_agent = VisualAnalysisAgent()

    try:
        deck = await ingestor.ingest_pdf(pdf_path)
        print(f"Ingestion successful: {len(deck.slides)} slides found.")

        first_slide = deck.slides[0]
        full_text = "\n".join([tb.text for tb in first_slide.text_boxes])
        print(f"Slide 1 Title: {first_slide.title}")
        print(f"Slide 1 Text Length: {len(full_text)}")

        import pdfplumber

        preview_dir = Path("data/previews_test")
        preview_dir.mkdir(parents=True, exist_ok=True)
        preview_path = preview_dir / "slide_0_test.png"

        with pdfplumber.open(pdf_path) as pdf:
            page = pdf.pages[0]
            page.to_image(resolution=150).save(str(preview_path))

        print(f"Rendered Slide 1 to: {preview_path}")

        slide_entry = {
            "index": 0,
            "title": first_slide.title,
            "preview_path": str(preview_path),
            "full_text": full_text,
        }

        guardrail = GuardrailSchema(
            rubric_weights={
                "structure": 0.2,
                "claim_grounding": 0.2,
                "data_accuracy": 0.2,
                "visual": 0.2,
                "language": 0.2,
            },
            language_rules={"max_text_density": 0.6},
        )

        print("Running Visual Analysis Agent (multi-backend OCR)...")
        result = await visual_agent.run([slide_entry], guardrail)

        print(f"\nVisual Agent Score: {result.score}")
        print(f"Findings: {len(result.findings)}")
        for f in result.findings:
            print(f" - [{f.severity}] {f.message}")

        visuals = (
            result.metadata.get("slides_analysis", {}).get("0", {}).get("visuals", [])
        )
        print(f"\nDetected {len(visuals)} visual elements:")
        for v in visuals[:5]:
            print(f" - {v['label']} at T:{v['top']:.1f}% L:{v['left']:.1f}%")

        if len(visuals) > 0:
            print("\nSUCCESS: Visual Analysis Agent is functional.")
        else:
            print("\nWARNING: No visual elements detected.")

    except Exception as e:
        import traceback

        print(f"Error during verification: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    pdf_path = r"F:\Downloads\VELICIRAPTORS_IIM INDORE (1).pdf"
    if os.path.exists(pdf_path):
        asyncio.run(verify_analysis(pdf_path))
    else:
        print(f"File not found: {pdf_path}")
