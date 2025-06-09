#!/usr/bin/env python3
import requests
import base64
import json
import os
import sys
import unittest
from PIL import Image
import io
import time

# Get the backend URL from the frontend .env file
BACKEND_URL = None
try:
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BACKEND_URL = line.strip().split('=')[1].strip('"\'')
                break
except Exception as e:
    print(f"Error reading frontend/.env file: {e}")
    sys.exit(1)

if not BACKEND_URL:
    print("Error: REACT_APP_BACKEND_URL not found in frontend/.env")
    sys.exit(1)

# Ensure the URL ends with /api
API_URL = f"{BACKEND_URL}/api"
print(f"Using API URL: {API_URL}")

# Sample base64 image for testing (a simple white image with black text)
def generate_test_image():
    # Create a simple white image with dimensions 300x200
    img = Image.new('RGB', (300, 200), color='white')
    
    # Convert the image to bytes
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_byte_arr = img_byte_arr.getvalue()
    
    # Convert to base64
    base64_img = base64.b64encode(img_byte_arr).decode('utf-8')
    return f"data:image/png;base64,{base64_img}"

class TestMangaTTSBackend(unittest.TestCase):
    
    def test_01_api_health(self):
        """Test the basic API health check endpoint"""
        print("\n=== Testing API Health Check ===")
        response = requests.get(f"{API_URL}/")
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")
        
        self.assertEqual(response.status_code, 200)
        self.assertIn("message", response.json())
        self.assertEqual(response.json()["message"], "Manga TTS App API")
        print("✅ API Health Check test passed")
    
    def test_02_analyze_manga(self):
        """Test the manga analysis endpoint with a sample image"""
        print("\n=== Testing Manga Analysis Endpoint ===")
        
        # Generate a test image
        base64_img = generate_test_image()
        
        # Prepare the request payload
        payload = {
            "title": "Test Manga Page",
            "image_data": base64_img
        }
        
        # Send the request
        response = requests.post(f"{API_URL}/analyze-manga", json=payload)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {json.dumps(response.json(), indent=2)}")
        
        # Verify the response
        self.assertEqual(response.status_code, 200)
        self.assertIn("id", response.json())
        self.assertIn("speech_bubbles", response.json())
        self.assertIn("message", response.json())
        self.assertEqual(response.json()["message"], "Manga analyzed successfully")
        
        # Store the manga page ID for later tests
        self.manga_page_id = response.json()["id"]
        print("✅ Manga Analysis test passed")
    
    def test_03_generate_speech(self):
        """Test the speech generation endpoint"""
        print("\n=== Testing Speech Generation Endpoint ===")
        
        # Prepare the request payload
        payload = {
            "text": "This is a test for the text-to-speech API.",
            "voice": "alloy",
            "speed": 1.0
        }
        
        # Send the request
        response = requests.post(f"{API_URL}/generate-speech", json=payload)
        print(f"Response status: {response.status_code}")
        
        # Verify the response
        self.assertEqual(response.status_code, 200)
        response_json = response.json()
        self.assertIn("format", response_json)
        self.assertEqual(response_json["format"], "mp3")
        
        # Check if we got actual audio data or the fallback message
        if "audio_data" in response_json and response_json["audio_data"]:
            print("✅ Speech Generation test passed with actual audio data")
        elif "message" in response_json:
            print(f"ℹ️ Speech Generation test passed with fallback: {response_json['message']}")
        else:
            self.fail("Speech Generation response doesn't contain audio_data or fallback message")
    
    def test_04_get_manga_pages(self):
        """Test retrieving manga pages from the database"""
        print("\n=== Testing Get Manga Pages Endpoint ===")
        
        # Send the request
        response = requests.get(f"{API_URL}/manga-pages")
        print(f"Response status: {response.status_code}")
        
        # Verify the response
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)
        
        # Check if our test manga page is in the list
        if hasattr(self, 'manga_page_id'):
            found = False
            for page in response.json():
                if page.get("id") == self.manga_page_id:
                    found = True
                    break
            
            self.assertTrue(found, f"Manga page with ID {self.manga_page_id} not found in database")
            print(f"✅ Get Manga Pages test passed, found our test page with ID {self.manga_page_id}")
        else:
            print("ℹ️ Get Manga Pages test passed, but couldn't verify our test page (ID unknown)")
    
    def test_05_get_specific_manga_page(self):
        """Test retrieving a specific manga page by ID"""
        if not hasattr(self, 'manga_page_id'):
            print("\n=== Skipping Get Specific Manga Page Test (ID unknown) ===")
            return
        
        print(f"\n=== Testing Get Specific Manga Page Endpoint (ID: {self.manga_page_id}) ===")
        
        # Send the request
        response = requests.get(f"{API_URL}/manga-pages/{self.manga_page_id}")
        print(f"Response status: {response.status_code}")
        
        # Verify the response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], self.manga_page_id)
        self.assertEqual(response.json()["title"], "Test Manga Page")
        print("✅ Get Specific Manga Page test passed")
    
    def test_06_error_handling(self):
        """Test error handling with invalid data"""
        print("\n=== Testing Error Handling ===")
        
        # Test invalid manga analysis request
        print("Testing invalid manga analysis request...")
        response = requests.post(f"{API_URL}/analyze-manga", json={"title": "Invalid Request"})
        print(f"Response status: {response.status_code}")
        self.assertGreaterEqual(response.status_code, 400)
        
        # Test invalid speech generation request
        print("Testing invalid speech generation request...")
        response = requests.post(f"{API_URL}/generate-speech", json={})
        print(f"Response status: {response.status_code}")
        self.assertGreaterEqual(response.status_code, 400)
        
        # Test non-existent manga page
        print("Testing non-existent manga page...")
        response = requests.get(f"{API_URL}/manga-pages/nonexistent-id")
        print(f"Response status: {response.status_code}")
        self.assertEqual(response.status_code, 404)
        
        print("✅ Error Handling tests passed")

if __name__ == "__main__":
    # Run the tests
    unittest.main(argv=['first-arg-is-ignored'], exit=False)
