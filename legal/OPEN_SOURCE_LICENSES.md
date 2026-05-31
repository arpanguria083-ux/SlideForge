# SlideForge AI - Open Source Licenses & Third-Party Notices

**Last Updated:** May 25, 2026

SlideForge AI is a free and open-source desktop application. We are committed to complying with all open-source licensing requirements. This document contains the licenses and third-party notices for the open-source software libraries, runtimes, and dependencies included in or bundled with the Windows installer packages of SlideForge AI.

---

## 1. Core Software License

SlideForge AI is distributed under the **MIT License**.

```text
MIT License

Copyright (c) 2026 SlideForge

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Frontend & Electron Container Dependencies

SlideForge AI utilizes several open-source libraries in its frontend user interface and desktop integration:

### A. Electron Framework
* **License:** MIT License
* **Copyright:** Copyright (c) Electron contributors
* **Notice:** Used as the core desktop container to run the React frontend on Windows.

### B. React and React-DOM
* **License:** MIT License
* **Copyright:** Copyright (c) Meta Platforms, Inc. and affiliates.
* **Notice:** Used as the primary UI library.

### C. TanStack React Query
* **License:** MIT License
* **Copyright:** Copyright (c) Tanner Linsley
* **Notice:** Used for state synchronization and API request caching.

### D. Recharts
* **License:** MIT License
* **Copyright:** Copyright (c) 2015-present Recharts Group
* **Notice:** Used for rendering audit diagnostics and metric charts.

### E. Lucide React
* **License:** ISC License
* **Copyright:** Copyright (c) 2020, Cole Bemis
* **Notice:** Used to provide modern iconography in the dashboard.

### F. PDF.js (pdfjs-dist)
* **License:** Apache License 2.0
* **Copyright:** Copyright 2012 Mozilla Foundation
* **Notice:** Used to parse and render PDF slide deck previews locally.

---

## 3. Backend & Machine Learning Dependencies

The local SlideForge AI backend packages a Python runtime environment and several machine learning and web server dependencies:

### A. Python Runtime (Windows Embedded Python)
* **License:** Python Software Foundation (PSF) License Agreement
* **Copyright:** Copyright (c) 2001-2026 Python Software Foundation
* **Notice:** Bundled to run local analytical microservices.

### B. FastAPI
* **License:** MIT License
* **Copyright:** Copyright (c) 2018-present Tiangolo
* **Notice:** Used to construct the local RESTful API server.

### C. Uvicorn
* **License:** BSD 3-Clause "New" or "Revised" License
* **Copyright:** Copyright (c) 2017-present, Encode Sandbox
* **Notice:** Used as the ASGI server implementation for FastAPI.

### D. PyTorch (torch)
* **License:** BSD-style License
* **Copyright:** Copyright (c) 2016-present Facebook, Inc (Meta) and contributors.
* **Notice:** PyTorch provides the core tensor processing and deep learning execution graph for local vision models.

### E. Hugging Face Transformers
* **License:** Apache License 2.0
* **Copyright:** Copyright 2018-present Hugging Face
* **Notice:** Used to load and execute localized transformer architectures.

### F. Surya OCR Pipeline
* **License:** Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) or custom commercial license.
* **Copyright:** Copyright (c) 2024-present Vik Paruchuri
* **Notice:** SlideForge AI utilizes Surya OCR scripts for localized layout recognition. Standard distributions are for non-commercial research and editing support. Users deploying SlideForge AI commercially must ensure that their deployment model aligns with Surya's licensing parameters or configure a commercial remote API alternative (such as Azure OCR or Google Cloud Vision).

---

## 4. Standard Open-Source License Texts

### A. Apache License, Version 2.0
Subject to the Apache License, Version 2.0 (the "License"); you may not use this software except in compliance with the License. You may obtain a copy of the License at `http://www.apache.org/licenses/LICENSE-2.0`. Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

### B. BSD 3-Clause License
```text
Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
