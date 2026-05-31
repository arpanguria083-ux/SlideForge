# SlideForge AI - Windows Open Source Installer Agreement

**Last Updated:** May 25, 2026

PLEASE READ THIS WINDOWS OPEN SOURCE INSTALLER AGREEMENT ("INSTALLER AGREEMENT") CAREFULLY BEFORE INITIATING, RUNNING, OR COMPLETING THE INSTALLATION OF SLIDEFORGE AI ("SOFTWARE") ON A WINDOWS OPERATING SYSTEM. 

BY LAUNCHING THE INSTALLER PACKAGE (INCLUDING NSIS-BASED executable, PORTABLE executables, OR MSIX PACKAGES), OR BY EXTRACTING ZIP OR TARBALL RELEASES OF THE INSTALLER, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND EXPRESSLY AGREE TO BE BOUND BY THE TERMS OF THIS INSTALLER AGREEMENT. IF YOU DO NOT AGREE TO THESE TERMS, DO NOT RUN THE INSTALLER AND IMMEDIATELY DELETE ALL DOWNLOADED INSTALLATION BUNDLES.

---

## 1. Description and Purpose of the Installer

The SlideForge AI Windows Installer ("Installer") is a packaging and setup utility designed to deploy the SlideForge AI desktop application on computers running Microsoft Windows (Windows 10, Windows 11, or Windows Server equivalents). 

The Installer automates:
* The deployment of the SlideForge AI Electron frontend and runtime container.
* The unpacking of the local SlideForge AI Python backend binary and executable components.
* The creation of standard Windows desktop and Start Menu shortcuts (optional).
* The preparation of local directories for the caching and indexing of slide assets, session databases, and optional offline Machine Learning / Optical Character Recognition (OCR) models.

---

## 2. Open Source Status and Relationship to Licenses

1. **Core Licensing:** SlideForge AI is a free and open-source software application. The source code of SlideForge AI is licensed under the **MIT License**.
2. **Installer License:** The Installer packaging scripts (e.g., NSIS scripts, electron-builder configurations) are provided under the same MIT License.
3. **No Fee:** The Installer is provided free of charge. You are permitted to copy, distribute, modify, and run the Installer in accordance with the terms of the MIT License.
4. **Third-Party Binaries:** To provide a ready-to-run experience on Windows without requiring manual environment configuration, this Installer bundles compiled binaries of third-party open-source components (including Node.js, Electron, Python, FastAPI, and scientific libraries). These third-party components are licensed under their respective open-source licenses (such as BSD, Apache 2.0, and Python Software Foundation licenses). For full third-party disclosures, refer to the [Open Source Licenses Notice](OPEN_SOURCE_LICENSES.md).

---

## 3. Windows System Modifications & File Placements

To install and operate correctly on Windows, the Installer and the resulting Software will perform the following actions and write files to the designated paths:

1. **Installation Directory:**
   * By default, the application is installed in the user-level directory:  
     `%LocalAppData%\Programs\slideforge-ai\`  *(e.g., C:\Users\<Username>\AppData\Local\Programs\slideforge-ai)*
   * For machine-wide installations (if administrative privileges are provided), the application will be written to:  
     `%ProgramFiles%\SlideForge AI\` or `%ProgramFiles(x86)%\SlideForge AI\`

2. **Application Data and Cache:**
   * SlideForge AI stores localized databases, cached PDF/PPTX representations, temporary vision-pipeline coordinates, and logs in:  
     `%AppData%\slideforge-ai\`  *(e.g., C:\Users\<Username>\AppData\Roaming\slideforge-ai)*
   * Operational model cache, local Optical Character Recognition (OCR) neural network weights (such as Surya OCR assets), and temporary local backends reside under:  
     `%LocalAppData%\slideforge-ai-backend\` or within the user's home profile directory under `.cache` folders.

3. **Registry Modifications:**
   * The Installer will register standard Windows Uninstallation keys under:  
     `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\slideforge-ai`
   * This is required to support standard Windows Control Panel "Add/Remove Programs" functionality and clean uninstallation.
   * The Installer does not write keys to `HKLM` (Local Machine) registry trees unless installed with explicit administrative overrides.

4. **Desktop and Start Menu Shortcuts:**
   * The Installer creates a Start Menu entry under `SlideForge AI` and optionally a Desktop shortcut. These can be removed at any time without impacting application functionality.

---

## 4. Local-First Processing and System Resources

1. **Offline Isolation:** SlideForge AI is designed to operate locally. All slide analysis, document parsing, visual coordinate generation, and local text indexing are executed directly on your Windows endpoint using local CPUs, GPUs, and memory.
2. **System Resources:** Performing local OCR and visual AI processing is highly resource-intensive. Depending on your Windows configuration, running these pipelines may lead to temporary spikes in CPU utilization, GPU memory allocation, and disk read/write cycles. You are responsible for ensuring that your Windows hardware meets the thermal and power requirements to handle heavy local machine learning operations safely.
3. **Network Connections:** The Installer itself does not require an active internet connection to deploy the core Software. However, first-run activation of certain local AI features (such as high-precision OCR models) or standard third-party remote API models will require internet access to fetch weights or transmit API requests.

---

## 5. Security, Signing, and Windows SmartScreen

1. **Unsigned Installer Status:** Official builds of the SlideForge AI Installer may be compiled and distributed without a commercial Authenticode code-signing certificate (unsigned) to maintain its non-commercial, open-source character.
2. **Windows SmartScreen Warnings:** Due to the unsigned status, Windows SmartScreen or Windows Defender may display a warning stating that the publisher is "Unknown" or that the installer was blocked. 
3. **Execution Instructions:** To run the Installer in these environments, you must click *"More Info"* on the SmartScreen dialog and select *"Run Anyway"*. You are encouraged to verify the cryptographic SHA-256 hash of the downloaded installer against the official release hashes published on the SlideForge GitHub repository to ensure file integrity.
4. **Administrative Privileges:** The Installer is designed to run in user space and does not require administrative privileges by default. Running as a standard user is highly recommended to maintain Windows sandbox security.

---

## 6. Telemetry and Privacy Disclosures

1. **No Spyware / Adware:** The Installer does not bundle any third-party spyware, adware, commercial tracking software, or browser toolbar extensions.
2. **No Automatic Telemetry:** Neither the Installer nor the packaged Software transmits silent telemetry, crash reports, or application usage statistics to any central SlideForge server. All operational logs are written strictly to your local Windows filesystem.
3. **Opt-In Logs:** In the event of system failures or backend crashes, diagnostic logs reside on your local machine. No data is sent to developers unless you manually copy and submit these logs through open support forums.

---

## 7. Disclaimer of Warranties

THE INSTALLER AND ALL PACKAGED COMPONENTS, SCRIPTS, BINARIES, AND ASSOCIATED SOFTWARE ARE PROVIDED **"AS IS"**, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. 

IN NO EVENT SHALL THE AUTHORS, COPYRIGHT HOLDERS, PACKAGERS, OR DISTRIBUTORS BE LIABLE FOR ANY CLAIM, DAMAGES, LOSS OF DATA, SYSTEM INSTABILITY, BLUE SCREEN OF DEATH (BSOD) ERRORS, HARDWARE OVERHEATING, FILESYSTEM CORRUPTION, REGISTRY ERRORS, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE RUNNING, FAILURE, OR MISUSE OF THIS INSTALLER OR THE UNINSTALLATION UTILITY.

---

## 8. Uninstallation

SlideForge AI can be fully uninstalled from your Windows system using standard Windows protocols:
1. Open the Windows **Settings** menu.
2. Navigate to **Apps > Installed Apps** (or **Add/Remove Programs** on older versions).
3. Select **SlideForge AI** and click **Uninstall**.
4. The uninstaller will remove all compiled binaries and shortcuts. Local cache files, custom templates, and downloaded model weights stored in `%AppData%` or `%LocalAppData%` may remain on disk to preserve user configurations. These can be manually deleted by deleting the respective `slideforge-ai` directories in your user profile.

---

## 9. Contact and Open Source Contributions

SlideForge AI is an open-source project founded by **Arpan Guria**. 

* **Founder Website / Connect:** [https://www.arpan-guria.in/](https://www.arpan-guria.in/)
* **Support & Installer Repository:** For technical support, installation trouble-shooting, bug reports, and to access the full source code of the Installer, please visit the official project repository or our community support channels.
