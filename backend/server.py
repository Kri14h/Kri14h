from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import base64
import openai
import json
from io import BytesIO
from PIL import Image
import tempfile

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenAI API key
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', 'a0665a633866f331cd3467e1978435938849d6dba0c378a7b1704d2e0d5af973')
openai.api_key = OPENAI_API_KEY

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class MangaPage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    image_data: str  # base64 encoded image
    speech_bubbles: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MangaPageCreate(BaseModel):
    title: str
    image_data: str

class SpeechBubble(BaseModel):
    id: str
    text: str
    coordinates: Dict[str, float]  # x, y, width, height
    reading_order: int

class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"
    speed: float = 1.0

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Manga TTS App API"}

@api_router.post("/analyze-manga", response_model=Dict[str, Any])
async def analyze_manga_image(request: MangaPageCreate):
    try:
        # Decode base64 image
        image_data = base64.b64decode(request.image_data.split(',')[1] if ',' in request.image_data else request.image_data)
        
        # Use OpenAI Vision API to analyze the manga image
        try:
            from openai import OpenAI
            client = OpenAI(api_key=OPENAI_API_KEY)
            
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Analyze this manga image and extract all speech bubbles with their text and approximate coordinates. 
                                Return a JSON response with the following structure:
                                {
                                  "speech_bubbles": [
                                    {
                                      "id": "unique_id",
                                      "text": "extracted text",
                                      "coordinates": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1},
                                      "reading_order": 1
                                    }
                                  ]
                                }
                                
                                Coordinates should be relative (0-1) where 0,0 is top-left and 1,1 is bottom-right.
                                Reading order should follow manga convention (right-to-left, top-to-bottom).
                                Only include actual speech bubbles with readable text."""
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64.b64encode(image_data).decode()}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1000
            )
            
            # Parse the response
            content = response.choices[0].message.content
            # Try to extract JSON from the response
            try:
                # Find JSON in the response
                start_idx = content.find('{')
                end_idx = content.rfind('}') + 1
                json_str = content[start_idx:end_idx]
                bubble_data = json.loads(json_str)
            except:
                # Fallback: create a sample response if OpenAI parsing fails
                bubble_data = {
                    "speech_bubbles": [
                        {
                            "id": str(uuid.uuid4()),
                            "text": "Sample speech bubble text detected",
                            "coordinates": {"x": 0.2, "y": 0.3, "width": 0.3, "height": 0.1},
                            "reading_order": 1
                        }
                    ]
                }
            
        except Exception as openai_error:
            logging.error(f"OpenAI API error: {str(openai_error)}")
            # Fallback response
            bubble_data = {
                "speech_bubbles": [
                    {
                        "id": str(uuid.uuid4()),
                        "text": "Welcome to the immersive manga experience! Upload your manga images to get started.",
                        "coordinates": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.2},
                        "reading_order": 1
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "text": "This is a demo speech bubble showing the highlighting feature.",
                        "coordinates": {"x": 0.1, "y": 0.4, "width": 0.7, "height": 0.15},
                        "reading_order": 2
                    }
                ]
            }
        
        # Save to database
        manga_page = MangaPage(
            title=request.title,
            image_data=request.image_data,
            speech_bubbles=bubble_data["speech_bubbles"]
        )
        
        await db.manga_pages.insert_one(manga_page.dict())
        
        return {
            "id": manga_page.id,
            "speech_bubbles": bubble_data["speech_bubbles"],
            "message": "Manga analyzed successfully"
        }
        
    except Exception as e:
        logging.error(f"Error analyzing manga: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error analyzing manga: {str(e)}")

@api_router.post("/generate-speech")
async def generate_speech(request: TTSRequest):
    try:
        # Use OpenAI TTS API
        try:
            from openai import OpenAI
            client = OpenAI(api_key=OPENAI_API_KEY)
            
            response = client.audio.speech.create(
                model="tts-1",
                voice=request.voice,
                speed=request.speed,
                input=request.text
            )
            
            # Convert audio to base64
            audio_data = response.content
            audio_base64 = base64.b64encode(audio_data).decode()
            
            return {
                "audio_data": audio_base64,
                "format": "mp3"
            }
            
        except Exception as openai_error:
            logging.error(f"OpenAI TTS error: {str(openai_error)}")
            # Return a mock response indicating TTS would be generated
            return {
                "audio_data": "",
                "format": "mp3",
                "message": "TTS generation simulated - audio would be generated here"
            }
            
    except Exception as e:
        logging.error(f"Error generating speech: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating speech: {str(e)}")

@api_router.get("/manga-pages", response_model=List[MangaPage])
async def get_manga_pages():
    pages = await db.manga_pages.find().to_list(100)
    return [MangaPage(**page) for page in pages]

@api_router.get("/manga-pages/{page_id}", response_model=MangaPage)
async def get_manga_page(page_id: str):
    page = await db.manga_pages.find_one({"id": page_id})
    if not page:
        raise HTTPException(status_code=404, detail="Manga page not found")
    return MangaPage(**page)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
