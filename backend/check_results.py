#!/usr/bin/env python
"""Check the detection results from the completed analysis"""

import requests
import json

session_id = '814a2916-c47b-48f4-89d7-4b2cc9bd7111'

# Try the session endpoint instead
response = requests.get(f'http://localhost:8000/api/session/{session_id}')
data = response.json()

# Handle list response
if isinstance(data, list):
    print(f"Response is a list with {len(data)} items")
    if data:
        data = data[0]
    else:
        print("Empty list!")
        exit(1)

print("=== SESSION DATA ===")
print(f"Session keys: {list(data.keys())}")
print()

# Check for agent results
if 'scorecard' in data:
    scorecard = data['scorecard']
    print(f"Scorecard keys: {list(scorecard.keys())}")
    if 'annotations' in scorecard:
        annotations = scorecard['annotations']
        print(f"Total annotations: {len(annotations)}")
        
        # Group by category
        by_category = {}
        for ann in annotations:
            cat = ann.get('category', 'unknown')
            by_category[cat] = by_category.get(cat, 0) + 1
        
        print("Annotations by category:")
        for cat, count in sorted(by_category.items()):
            print(f"  {cat}: {count}")

# Check for agent metadata
if 'agent_metadata' in data:
    agent_metadata = data['agent_metadata']
    print()
    print("Agent metadata:")
    for agent, metadata in agent_metadata.items():
        print(f"  {agent}:")
        if isinstance(metadata, dict):
            for key, value in list(metadata.items())[:3]:
                print(f"    {key}: {value}")

# Check deep analysis
if 'deep_analysis_by_slide' in data:
    deep_analysis = data['deep_analysis_by_slide']
    print()
    print(f"Deep analysis by slide: {len(deep_analysis)} slides")
    for slide_idx, analysis in list(deep_analysis.items())[:2]:
        print(f"  Slide {slide_idx}: {list(analysis.keys()) if isinstance(analysis, dict) else type(analysis)}")
