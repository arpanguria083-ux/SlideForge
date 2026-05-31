"""
ocr_detectors.py

Provides unified layout detection interfaces for multiple OCR backends:
- PaddleOCR (text + table detection)
- docTR (document text recognition)
- GOT-OCR 2.0 (via cached models if available)

Each returns layout boxes in the format:
  {
    "label": "text" | "table" | "figure" | "title" | etc.
    "bbox": [x1, y1, x2, y2]  (0-1 normalized coordinates)
    "confidence": float
  }
"""
import logging
import os
os.environ["FLAGS_use_onednn"] = "0"
os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
from pathlib import Path
from typing import Optional

logger = logging.getLogger("slideforge.ocr_detectors")


def _should_use_gpu() -> bool:
    """Check if GPU should be used for models."""
    try:
        from .gpu_manager import get_gpu_manager
        manager = get_gpu_manager()
        return manager.should_use_gpu()
    except Exception as e:
        logger.debug(f"Could not check GPU status: {e}")
        return False


def _get_device_string() -> str:
    """Get device string (cuda, mps, or cpu)."""
    if _should_use_gpu():
        try:
            from .gpu_manager import get_gpu_manager
            manager = get_gpu_manager()
            info = manager.get_gpu_info()
            if info.gpu_type == "cuda":
                return "cuda"
            elif info.gpu_type == "mps":
                return "mps"
            elif info.gpu_type == "rocm":
                return "cuda"
        except:
            pass
    return "cpu"


class PaddleOCRDetector:
    """Text & table detection using PaddleOCR with layout analysis."""
    
    _instance = None
    
    def __init__(self):
        self.detector = None
        self.layout_model = None
        self.use_gpu = _should_use_gpu()
    
    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def release(self):
        """Release PaddleOCR detector resources."""
        self.detector = None
        self.layout_model = None
        logger.info("PaddleOCRDetector resources released")
    
    def detect_layout(self, image_pil) -> list[dict]:
        """
        Detect layout blocks (text, table, figure) using PaddleOCR.
        
        Args:
            image_pil: PIL Image object
        
        Returns:
            List of dicts with 'label', 'bbox' (normalized [x1,y1,x2,y2]), 'confidence'
        """
        if self.detector is None:
            try:
                from paddleocr import PaddleOCR
                device = _get_device_string()
                use_gpu = _should_use_gpu()
                logger.info(f"Initializing PaddleOCR detector (device={device}, use_gpu={use_gpu})...")
                # Check for locally downloaded models to support full offline execution
                from app.services.ocr_asset_manager import OcrAssetManager
                mgr = OcrAssetManager.get()
                det_dir = mgr.cache_dir / "paddleocr" / "det"
                rec_dir = mgr.cache_dir / "paddleocr" / "rec"
                cls_dir = mgr.cache_dir / "paddleocr" / "cls"
                
                device = "gpu" if use_gpu else "cpu"
                kwargs = {
                    "use_angle_cls": True,
                    "lang": "en",
                    "device": device,
                }
                if device == "cpu":
                    kwargs["enable_mkldnn"] = False
                
                if (det_dir / "inference.pdmodel").exists() and \
                   (rec_dir / "inference.pdmodel").exists() and \
                   (cls_dir / "inference.pdmodel").exists():
                    kwargs["det_model_dir"] = str(det_dir)
                    kwargs["rec_model_dir"] = str(rec_dir)
                    kwargs["cls_model_dir"] = str(cls_dir)
                    logger.info("Initializing PaddleOCR with local model directories for offline usage")
                
                self.detector = PaddleOCR(**kwargs)
                logger.info(f"PaddleOCR detector ready (GPU: {use_gpu})")
            except Exception as e:
                logger.error(f"Failed to initialize PaddleOCR: {e}")
                return []
        
        if self.detector is None:
            return []
        
        try:
            import numpy as np
            from PIL import Image
            import os
            
            # Convert PIL to numpy array
            img_array = np.array(image_pil)
            height, width = img_array.shape[:2]
            
            # Set flags_use_onednn to 0 to prevent the Windows CPU mkldnn crash
            os.environ["FLAGS_use_onednn"] = "0"
            
            # Run OCR with layout detection
            try:
                result = self.detector.ocr(img_array, use_textline_orientation=True)
            except TypeError:
                result = self.detector.ocr(img_array, cls=True)
            
            blocks = []
            if result:
                items = []
                if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
                    # New format: [{'dt_polys': [...], 'rec_texts': [...], 'rec_scores': [...]}]
                    for res_dict in result:
                        dt_polys = res_dict.get("dt_polys", [])
                        rec_texts = res_dict.get("rec_texts", [])
                        rec_scores = res_dict.get("rec_scores", [])
                        for i in range(len(dt_polys)):
                            bbox = dt_polys[i]
                            if hasattr(bbox, "tolist"):
                                bbox = bbox.tolist()
                            text = rec_texts[i] if i < len(rec_texts) else ""
                            conf = rec_scores[i] if i < len(rec_scores) else 0.5
                            items.append([bbox, (text, conf)])
                else:
                    # Old format
                    for line in result:
                        if line is None:
                            continue
                        for item in line:
                            items.append(item)

                for item in items:
                    if len(item) >= 2:
                        bbox = item[0]  # [[x1,y1], [x2,y1], [x2,y2], [x1,y2]]
                        if isinstance(item[1], (tuple, list)):
                            conf = float(item[1][1]) if len(item[1]) > 1 else 0.5
                        else:
                            conf = float(item[1])
                            
                        # Convert to normalized coordinates
                        if bbox:
                            xs = [p[0] for p in bbox]
                            ys = [p[1] for p in bbox]
                            x1, x2 = min(xs), max(xs)
                            y1, y2 = min(ys), max(ys)
                            
                            # Normalize to 0-1
                            x1_norm = x1 / width if width > 0 else 0
                            y1_norm = y1 / height if height > 0 else 0
                            x2_norm = x2 / width if width > 0 else 1
                            y2_norm = y2 / height if height > 0 else 1
                            
                            blocks.append({
                                "label": "text",  # PaddleOCR doesn't classify block types
                                "bbox": [x1_norm, y1_norm, x2_norm, y2_norm],
                                "confidence": conf,
                            })
            
            return blocks
        except Exception as e:
            logger.error(f"PaddleOCR detection failed: {e}")
            return []


class DocTRDetector:
    """Document text recognition and layout using docTR."""
    
    _instance = None
    
    def __init__(self):
        self.predictor = None
        self.use_gpu = _should_use_gpu()
    
    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def release(self):
        """Release docTR predictor resources."""
        self.predictor = None
        logger.info("DocTRDetector resources released")
    
    def detect_layout(self, image_pil) -> list[dict]:
        """
        Detect layout blocks using docTR (document text recognition).
        
        Args:
            image_pil: PIL Image object
        
        Returns:
            List of dicts with 'label', 'bbox' (normalized [x1,y1,x2,y2]), 'confidence'
        """
        if self.predictor is None:
            try:
                from doctr.io import DocumentFile
                from doctr.models import ocr_predictor
                
                from app.services.ocr_asset_manager import OcrAssetManager
                import os
                mgr = OcrAssetManager.get()
                os.environ["DOCTR_CACHE_DIR"] = str(mgr.cache_dir / "doctr")
                
                device = _get_device_string()
                logger.info(f"Initializing docTR predictor (device={device})...")
                self.predictor = ocr_predictor(pretrained=True)
                
                # Move to GPU if available
                if _should_use_gpu():
                    try:
                        self.predictor = self.predictor.to(_get_device_string())
                        logger.info(f"docTR predictor moved to {_get_device_string()}")
                    except Exception as e:
                        logger.warning(f"Could not move docTR to GPU: {e}")
                
                logger.info("docTR predictor ready")
            except Exception as e:
                logger.error(f"Failed to initialize docTR: {e}")
                return []
        
        if self.predictor is None:
            return []
        
        try:
            import numpy as np
            
            # Convert PIL to numpy array
            img_array = np.array(image_pil)
            
            # Run docTR OCR
            doc = self.predictor([img_array])
            
            blocks = []
            for page in doc.pages:
                for block in page.blocks:
                    for line in block.lines:
                        for word in line.words:
                            # Get bounding box (normalized coordinates)
                            (x1, y1), (x2, y2) = word.geometry
                            
                            blocks.append({
                                "label": "text",
                                "bbox": [x1, y1, x2, y2],
                                "confidence": word.confidence if hasattr(word, 'confidence') else 0.8,
                            })
            
            return blocks
        except Exception as e:
            logger.error(f"docTR detection failed: {e}")
            return []


class GOTOCRDetector:
    """GOT-OCR 2.0 detection using cached models."""
    
    _instance = None
    
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.processor = None
    
    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def release(self):
        """Release GOT-OCR resources."""
        self.model = None
        self.tokenizer = None
        self.processor = None
        logger.info("GOTOCRDetector resources released")
    
    def detect_layout(self, image_pil) -> list[dict]:
        """
        Attempt to use GOT-OCR 2.0 from cached models.
        Falls back gracefully if not available.
        
        Args:
            image_pil: PIL Image object
        
        Returns:
            List of dicts with 'label', 'bbox' (normalized [x1,y1,x2,y2]), 'confidence'
        """
        if self.model is None or self.tokenizer is None:
            try:
                from transformers import AutoModel, AutoTokenizer
                from app.services.ocr_asset_manager import OcrAssetManager
                
                mgr = OcrAssetManager.get()
                model_dir = mgr.cache_dir / "got_ocr2"
                
                logger.info(f"Loading GOT-OCR 2.0 from {model_dir}...")
                self.tokenizer = AutoTokenizer.from_pretrained(str(model_dir), trust_remote_code=True)
                
                device = _get_device_string()
                
                self.model = AutoModel.from_pretrained(
                    str(model_dir),
                    trust_remote_code=True,
                    low_cpu_mem_usage=True,
                    use_safetensors=True,
                    pad_token_id=self.tokenizer.eos_token_id
                )
                
                if device == "cuda":
                    self.model = self.model.eval().cuda()
                    logger.info("GOT-OCR 2.0 model loaded on CUDA GPU")
                elif device == "mps":
                    self.model = self.model.eval().to("mps")
                    logger.info("GOT-OCR 2.0 model loaded on Apple Silicon MPS GPU")
                else:
                    self.model = self.model.eval()
                    logger.info("GOT-OCR 2.0 model loaded on CPU")
            except Exception as e:
                logger.error(f"Failed to initialize GOT-OCR 2.0 model: {e}")
                return []

        try:
            import tempfile
            from PIL import Image
            import numpy as np
            from app.services.opencv_detector import OpenCVLayoutDetector
            
            # 1. Run OpenCVLayoutDetector first to detect block bboxes
            opencv_detector = OpenCVLayoutDetector()
            cv_elements = []
            if opencv_detector.available:
                # Save image to temp file for OpenCV
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                    temp_path = f.name
                image_pil.save(temp_path)
                try:
                    cv_elements = opencv_detector.detect_elements(temp_path)
                finally:
                    if os.path.exists(temp_path):
                        try:
                            os.remove(temp_path)
                        except:
                            pass
            
            # If no elements detected by OpenCV, treat the entire slide as one block
            width, height = image_pil.size
            if not cv_elements:
                cv_elements = [{
                    "bbox": [0, 0, width, height],
                    "label": "text",
                    "confidence": 0.5
                }]
                
            # 2. Run GOT-OCR 2.0 to extract high-fidelity regional text
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                full_image_path = f.name
            image_pil.save(full_image_path)
            
            try:
                # Let's extract full text first
                logger.info("Running GOT-OCR 2.0 plain OCR on full slide image...")
                full_text = self.model.chat(self.tokenizer, full_image_path, ocr_type='ocr')
                logger.info(f"Full text extracted: {len(full_text)} chars")
                
                blocks = []
                for idx, cv_elem in enumerate(cv_elements):
                    x1, y1, x2, y2 = cv_elem["bbox"]
                    x1_norm = x1 / width
                    y1_norm = y1 / height
                    x2_norm = x2 / width
                    y2_norm = y2 / height
                    
                    # For fine-grained regional OCR of this specific block:
                    box_str = f"[{int(x1)},{int(y1)},{int(x2)},{int(y2)}]"
                    try:
                        logger.info(f"Running GOT-OCR 2.0 regional OCR for block {idx} at {box_str}...")
                        block_text = self.model.chat(
                            self.tokenizer, 
                            full_image_path, 
                            ocr_type='ocr', 
                            ocr_box=box_str
                        )
                    except Exception as reg_err:
                        logger.debug(f"GOT-OCR 2.0 regional OCR failed: {reg_err}")
                        block_text = ""
                        
                    blocks.append({
                        "label": cv_elem["label"],
                        "bbox": [x1_norm, y1_norm, x2_norm, y2_norm],
                        "confidence": cv_elem.get("confidence", 0.7),
                        "text": block_text.strip()
                    })
                return blocks
            finally:
                if os.path.exists(full_image_path):
                    try:
                        os.remove(full_image_path)
                    except:
                        pass
                    
        except Exception as e:
            logger.error(f"GOT-OCR 2.0 detect_layout failed: {e}")
            return []


def get_detector_for_backend(backend_name: str) -> Optional[object]:
    """
    Get appropriate detector instance for the backend name.
    
    Args:
        backend_name: 'paddleocr' | 'doctr' | 'got_ocr2'
    
    Returns:
        Detector instance or None if backend unavailable
    """
    if backend_name == "paddleocr":
        return PaddleOCRDetector.get()
    elif backend_name == "doctr":
        return DocTRDetector.get()
    elif backend_name == "got_ocr2":
        return GOTOCRDetector.get()
    else:
        return None


def detect_layout_blocks(image_pil, backend_name: str) -> list[dict]:
    """
    Unified interface to detect layout blocks using specified backend.
    
    Args:
        image_pil: PIL Image object
        backend_name: 'paddleocr' | 'doctr' | 'got_ocr2'
    
    Returns:
        List of layout blocks with normalized coordinates
    """
    detector = get_detector_for_backend(backend_name)
    if detector is None:
        logger.warning(f"Detector not available for backend: {backend_name}")
        return []
    
    try:
        return detector.detect_layout(image_pil)
    except Exception as e:
        logger.error(f"Layout detection failed for {backend_name}: {e}")
        return []


def ocr_image(image_pil, backend_name: str) -> dict:
    """
    Unified OCR interface returning text content and detailed line bounding boxes in pixels.
    
    Args:
        image_pil: PIL Image object
        backend_name: 'paddleocr' | 'doctr' | 'got_ocr2'
        
    Returns:
        {
            "text": str,
            "lines": list[dict] where dict = {
                "text": str,
                "bbox": {"x0": float, "y0": float, "x1": float, "y1": float},
                "confidence": float
            }
        }
    """
    detector = get_detector_for_backend(backend_name)
    if detector is None:
        logger.warning(f"OCR detector not available for backend: {backend_name}")
        return {"text": "", "lines": []}

    try:
        import numpy as np
        img_array = np.array(image_pil)
        img_h, img_w = img_array.shape[:2]
    except Exception as e:
        logger.error(f"Failed to load image array in ocr_image: {e}")
        return {"text": "", "lines": []}

    lines = []
    full_text_parts = []

    if backend_name == "paddleocr":
        if detector.detector is None:
            # Trigger lazy loading
            detector.detect_layout(image_pil)
        if detector.detector:
            try:
                # Set flags_use_onednn to 0 to prevent the Windows CPU mkldnn crash
                import os
                os.environ["FLAGS_use_onednn"] = "0"
                try:
                    result = detector.detector.ocr(img_array, use_textline_orientation=True)
                except TypeError:
                    result = detector.detector.ocr(img_array, cls=True)
                
                if result:
                    items = []
                    if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
                        # New format: [{'dt_polys': [...], 'rec_texts': [...], 'rec_scores': [...]}]
                        for res_dict in result:
                            dt_polys = res_dict.get("dt_polys", [])
                            rec_texts = res_dict.get("rec_texts", [])
                            rec_scores = res_dict.get("rec_scores", [])
                            for i in range(len(dt_polys)):
                                bbox = dt_polys[i]
                                if hasattr(bbox, "tolist"):
                                    bbox = bbox.tolist()
                                text = rec_texts[i] if i < len(rec_texts) else ""
                                conf = rec_scores[i] if i < len(rec_scores) else 0.5
                                items.append([bbox, (text, conf)])
                    else:
                        # Old format
                        for line in result:
                            if not line:
                                continue
                            for item in line:
                                items.append(item)

                    for item in items:
                        if len(item) >= 2:
                            bbox = item[0]  # [[x0,y0], [x1,y0], [x1,y1], [x0,y1]]
                            text = item[1][0] if isinstance(item[1], (tuple, list)) else ""
                            conf = float(item[1][1]) if isinstance(item[1], (tuple, list)) and len(item[1]) > 1 else 0.5
                            if bbox:
                                xs = [p[0] for p in bbox]
                                ys = [p[1] for p in bbox]
                                x0, x1 = min(xs), max(xs)
                                y0, y1 = min(ys), max(ys)
                                lines.append({
                                    "text": text,
                                    "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
                                    "confidence": conf
                                })
                                full_text_parts.append(text)
            except Exception as e:
                logger.error(f"PaddleOCR OCR failed: {e}")
    elif backend_name == "doctr":
        if detector.predictor is None:
            # Trigger lazy loading
            detector.detect_layout(image_pil)
        if detector.predictor:
            try:
                doc = detector.predictor([img_array])
                for page in doc.pages:
                    for block in page.blocks:
                        for line in block.lines:
                            line_text = " ".join([w.value for w in line.words])
                            xs, ys = [], []
                            for w in line.words:
                                (wx1, wy1), (wx2, wy2) = w.geometry
                                xs.extend([wx1, wx2])
                                ys.extend([wy1, wy2])
                            if xs and ys:
                                x0_norm, x1_norm = min(xs), max(xs)
                                y0_norm, y1_norm = min(ys), max(ys)
                                lines.append({
                                    "text": line_text,
                                    "bbox": {
                                        "x0": x0_norm * img_w,
                                        "y0": y0_norm * img_h,
                                        "x1": x1_norm * img_w,
                                        "y1": y1_norm * img_h
                                    },
                                    "confidence": 0.8
                                })
                                full_text_parts.append(line_text)
            except Exception as e:
                logger.error(f"docTR OCR failed: {e}")
    elif backend_name == "got_ocr2":
        if detector.model is None or not hasattr(detector, "tokenizer") or detector.tokenizer is None:
            # Trigger lazy loading
            detector.detect_layout(image_pil)
        if detector.model and hasattr(detector, "tokenizer") and detector.tokenizer is not None:
            try:
                import tempfile
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                    temp_path = f.name
                image_pil.save(temp_path)
                try:
                    logger.info("Running GOT-OCR 2.0 OCR on full image...")
                    full_text = detector.model.chat(detector.tokenizer, temp_path, ocr_type='ocr')
                    full_text_parts.append(full_text)
                    
                    # We can use the OpenCV-assisted sub-elements structure to create detail lines
                    from app.services.opencv_detector import OpenCVLayoutDetector
                    opencv_detector = OpenCVLayoutDetector()
                    if opencv_detector.available:
                        cv_elements = opencv_detector.detect_elements(temp_path)
                        for idx, cv_elem in enumerate(cv_elements):
                            if cv_elem["label"] == "text":
                                cx1, cy1, cx2, cy2 = cv_elem["bbox"]
                                box_str = f"[{int(cx1)},{int(cy1)},{int(cx2)},{int(cy2)}]"
                                try:
                                    line_text = detector.model.chat(
                                        detector.tokenizer, 
                                        temp_path, 
                                        ocr_type='ocr', 
                                        ocr_box=box_str
                                    )
                                except:
                                    line_text = ""
                                if line_text.strip():
                                    lines.append({
                                        "text": line_text.strip(),
                                        "bbox": {"x0": cx1, "y0": cy1, "x1": cx2, "y1": cy2},
                                        "confidence": cv_elem.get("confidence", 0.8)
                                    })
                    
                    # If lines is empty, make a single full line
                    if not lines and full_text.strip():
                        lines.append({
                            "text": full_text.strip(),
                            "bbox": {"x0": 0, "y0": 0, "x1": img_w, "y1": img_h},
                            "confidence": 0.9
                        })
                finally:
                    if os.path.exists(temp_path):
                        try:
                            os.remove(temp_path)
                        except:
                            pass
            except Exception as e:
                logger.error(f"GOT-OCR 2.0 OCR failed: {e}")

    return {
        "text": "\n".join(full_text_parts),
        "lines": lines
    }

