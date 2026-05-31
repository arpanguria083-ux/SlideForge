"""
OpenCV-based fast object detection for slide layouts.
Provides lightweight alternative to OCR backends when they are unavailable.

Uses contour detection, edge detection, and color analysis to identify:
- Text blocks
- Images
- Tables (grid detection)
- Shapes (rectangles, circles)
"""

import logging
from pathlib import Path
from typing import list

logger = logging.getLogger("slideforge.opencv_detection")

# Try to import OpenCV, but don't fail if it's not available
try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False
    logger.debug("OpenCV not installed - using PPTX fallback only")

import numpy as np
from PIL import Image


class OpenCVLayoutDetector:
    """Fast layout detection using OpenCV without deep learning models."""
    
    def __init__(self):
        self.available = OPENCV_AVAILABLE
        if not self.available:
            logger.debug("OpenCV layout detector not available - will use fallback")
    
    def detect_elements(self, image_path: str | Path) -> list[dict]:
        """
        Detect layout elements in a slide image.
        
        Returns list of detected elements with format:
        {
            "label": "text|image|table|shape|chart",
            "bbox": [x1, y1, x2, y2],  # in pixels
            "confidence": 0.0-1.0,
            "area": int  # in pixels
        }
        """
        if not self.available:
            return []
        
        try:
            # Load image
            image = cv2.imread(str(image_path))
            if image is None:
                logger.warning(f"Failed to load image: {image_path}")
                return []
            
            height, width = image.shape[:2]
            logger.debug(f"Analyzing {width}x{height} image: {image_path}")
            
            elements = []
            
            # 1. Detect text blocks using edge detection
            text_blocks = self._detect_text_blocks(image)
            logger.debug(f"Found {len(text_blocks)} text blocks")
            elements.extend(text_blocks)
            
            # 2. Detect image/photo regions (high gradient areas)
            image_regions = self._detect_images(image)
            logger.debug(f"Found {len(image_regions)} image regions")
            elements.extend(image_regions)
            
            # 3. Detect tables (grid patterns)
            tables = self._detect_tables(image)
            logger.debug(f"Found {len(tables)} tables")
            elements.extend(tables)
            
            # 4. Detect shapes (rectangles, circles)
            shapes = self._detect_shapes(image)
            logger.debug(f"Found {len(shapes)} shapes")
            elements.extend(shapes)
            
            # Filter overlapping detections (keep highest confidence)
            elements = self._filter_overlaps(elements, overlap_threshold=0.5)
            
            logger.info(f"Total elements detected: {len(elements)}")
            return elements
            
        except Exception as e:
            logger.error(f"OpenCV detection failed: {e}", exc_info=True)
            return []
    
    def _detect_text_blocks(self, image) -> list[dict]:
        """Detect text blocks using morphological operations."""
        elements = []
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Apply edge detection
            edges = cv2.Canny(gray, 100, 200)
            
            # Dilate to connect nearby edges
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
            dilated = cv2.dilate(edges, kernel, iterations=2)
            
            # Find contours
            contours, _ = cv2.findContours(dilated, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            
            height, width = image.shape[:2]
            
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                
                # Filter by size (avoid tiny noise and huge areas)
                area = w * h
                if area < 100 or area > (width * height * 0.9):
                    continue
                
                # Aspect ratio filter: text blocks are typically wider than tall
                aspect_ratio = w / h if h > 0 else 0
                if aspect_ratio < 0.5 or aspect_ratio > 10:  # Skip very narrow/tall or very wide/short
                    continue
                
                # Estimate text density (edges in region / total area)
                region = dilated[y:y+h, x:x+w]
                edge_density = np.sum(region > 0) / area if area > 0 else 0
                
                if edge_density > 0.1:  # Likely text region
                    elements.append({
                        "label": "text",
                        "bbox": [x, y, x + w, y + h],
                        "confidence": min(0.95, 0.6 + edge_density * 0.35),
                        "area": area,
                    })
            
        except Exception as e:
            logger.debug(f"Text block detection error: {e}")
        
        return elements
    
    def _detect_images(self, image) -> list[dict]:
        """Detect image/photo regions with high gradient variation."""
        elements = []
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Compute Laplacian (variance of image) to find detailed regions
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            laplacian_var = np.var(laplacian)
            
            # If variance is high, entire image might be a complex image
            if laplacian_var > 1000:
                # Divide into regions and check each
                height, width = image.shape[:2]
                tile_h, tile_w = height // 2, width // 2
                
                for y_idx in range(2):
                    for x_idx in range(2):
                        y = y_idx * tile_h
                        x = x_idx * tile_w
                        end_y = min((y_idx + 1) * tile_h, height)
                        end_x = min((x_idx + 1) * tile_w, width)
                        
                        region = laplacian[y:end_y, x:end_x]
                        region_var = np.var(region)
                        
                        if region_var > 500:
                            elements.append({
                                "label": "image",
                                "bbox": [x, y, end_x, end_y],
                                "confidence": min(0.85, 0.5 + region_var / 2000),
                                "area": (end_x - x) * (end_y - y),
                            })
        
        except Exception as e:
            logger.debug(f"Image detection error: {e}")
        
        return elements
    
    def _detect_tables(self, image) -> list[dict]:
        """Detect table structures using line detection."""
        elements = []
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Detect horizontal and vertical lines
            kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
            kernel_v = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
            
            lines_h = cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel_h)
            lines_v = cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel_v)
            
            # Find grid intersections
            grid = cv2.bitwise_and(lines_h, lines_v)
            
            # Count intersections in regions
            height, width = image.shape[:2]
            tile_h, tile_w = height // 3, width // 3
            
            for y_idx in range(3):
                for x_idx in range(3):
                    y = y_idx * tile_h
                    x = x_idx * tile_w
                    end_y = min((y_idx + 1) * tile_h, height)
                    end_x = min((x_idx + 1) * tile_w, width)
                    
                    region = grid[y:end_y, x:end_x]
                    intersection_count = np.sum(region > 0)
                    
                    # If significant grid pattern detected
                    if intersection_count > 10:
                        elements.append({
                            "label": "table",
                            "bbox": [x, y, end_x, end_y],
                            "confidence": min(0.90, 0.5 + intersection_count / 100),
                            "area": (end_x - x) * (end_y - y),
                        })
        
        except Exception as e:
            logger.debug(f"Table detection error: {e}")
        
        return elements
    
    def _detect_shapes(self, image) -> list[dict]:
        """Detect geometric shapes (rectangles, circles)."""
        elements = []
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Threshold
            _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
            
            # Find contours
            contours, _ = cv2.findContours(binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                area = cv2.contourArea(contour)
                
                # Filter by size
                if area < 500 or area > 100000:
                    continue
                
                # Fit rectangle
                x, y, w, h = cv2.boundingRect(contour)
                
                # Check if it's a good rectangle
                rect_area = w * h
                fill_ratio = area / rect_area if rect_area > 0 else 0
                
                if fill_ratio > 0.7:  # Well-filled rectangle
                    elements.append({
                        "label": "shape",
                        "bbox": [x, y, x + w, y + h],
                        "confidence": fill_ratio,
                        "area": area,
                    })
        
        except Exception as e:
            logger.debug(f"Shape detection error: {e}")
        
        return elements
    
    def _filter_overlaps(self, elements: list[dict], overlap_threshold: float = 0.5) -> list[dict]:
        """Remove overlapping detections, keeping highest confidence."""
        if not elements:
            return []
        
        # Sort by confidence descending
        sorted_elems = sorted(elements, key=lambda e: e.get("confidence", 0), reverse=True)
        
        filtered = []
        for elem in sorted_elems:
            x1, y1, x2, y2 = elem["bbox"]
            
            # Check overlap with already kept elements
            overlaps = False
            for kept in filtered:
                kx1, ky1, kx2, ky2 = kept["bbox"]
                
                # Calculate intersection area
                inter_x1 = max(x1, kx1)
                inter_y1 = max(y1, ky1)
                inter_x2 = min(x2, kx2)
                inter_y2 = min(y2, ky2)
                
                if inter_x2 > inter_x1 and inter_y2 > inter_y1:
                    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
                    elem_area = (x2 - x1) * (y2 - y1)
                    
                    overlap_ratio = inter_area / elem_area if elem_area > 0 else 0
                    if overlap_ratio > overlap_threshold:
                        overlaps = True
                        break
            
            if not overlaps:
                filtered.append(elem)
        
        return filtered
