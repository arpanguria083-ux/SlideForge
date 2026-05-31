# SlideForge AI - Privacy Notice Summary

**Last Updated:** May 25, 2026

This Privacy Notice Summary describes how SlideForge AI ("Software") handles data processed through the application. SlideForge AI is a desktop application running locally on Windows and is designed with strict **privacy-by-default** principles.

---

## 1. The Core Data Model: Local-First

SlideForge AI operates on a **local-first and offline-first architectural model**:
* **No Central Servers:** Your slide decks, source documents, generated notes, and text analysis are **never** uploaded to our servers or processed on our infrastructure. SlideForge does not operate any centralized cloud databases for your files.
* **Local Storage:** All session databases, processing logs, analysis results, and visual coordinates remain stored exclusively on your own Windows computer (typically within your `%AppData%` or `%LocalAppData%` profile directories).

---

## 2. Remote Third-Party API Processing

You can choose to configure SlideForge AI to use either local AI models (such as Ollama or LM Studio) or remote third-party AI APIs (such as OpenAI, Anthropic, or Google Gemini).
* **Local Models:** If you use local models, all AI inference is performed offline on your device, and no data is transmitted over the internet.
* **Remote APIs:** If you configure remote AI models, slide contents and coordinates are transmitted directly from your device to the configured provider's API endpoints. These companies process your data according to their own independent privacy agreements, which you are responsible for reviewing.

---

## 3. Data You Provide and System Access

During operation, the Software:
* Reads slide files (PDFs and PPTXs) you drag and drop into the application.
* Uses local CPU/GPU/memory to run OCR models and extract text coordinates.
* Stores operational history locally to allow you to restore previous reviews.

---

## 4. Your Rights and Erasure

Because your data is stored locally, you have total control over it:
* You can view and export all session data directly from the dashboard.
* You can instantly erase all local history by clicking "Close Session / Delete History" in the application interface, or by manually deleting the `%AppData%\slideforge-ai\` folder.

---

## 5. Full GDPR Compliance and Global Policies

If you reside in the European Union (EU), European Economic Area (EEA), United Kingdom (UK), or jurisdictions with similar data protection laws, please refer to our comprehensive, legally binding disclosure document:

👉 **[Read the Full GDPR Compliance & Privacy Policy](GDPR_COMPLIANCE_PRIVACY_POLICY.md)**

For any privacy-related support or questions, please contact our community coordinators at `privacy@slideforge.ai` or connect with our founder, **Arpan Guria**, at [https://www.arpan-guria.in/](https://www.arpan-guria.in/).
