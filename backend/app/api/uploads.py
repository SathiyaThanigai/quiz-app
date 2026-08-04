"""File upload endpoints for question images.

Images are uploaded to Cloudinary (cloud storage) instead of local disk,
because Render's local filesystem is ephemeral: every redeploy/restart wipes
locally saved files, causing previously-uploaded images to break with 404s.
Cloudinary keeps images available permanently and serves them over a CDN.
"""

import os
import uuid
from typing import List

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(prefix="/uploads", tags=["Uploads"])

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Configure Cloudinary from environment variables.
# Set these in Render -> your service -> Environment:
#   CLOUDINARY_CLOUD_NAME
#   CLOUDINARY_API_KEY
#   CLOUDINARY_API_SECRET
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)


@router.post("/images", response_model=dict)
async def upload_images(files: List[UploadFile] = File(...)):
    """Upload one or more images to Cloudinary. Returns list of full HTTPS URLs."""
    uploaded_urls = []

    for file in files:
        # Validate extension
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext}' not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}",
            )

        # Read and check size
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)")

        # Upload to Cloudinary with a unique public_id
        public_id = f"quiz-app/{uuid.uuid4().hex}"
        try:
            result = cloudinary.uploader.upload(
                content,
                public_id=public_id,
                resource_type="image",
                overwrite=False,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Image upload failed: {str(e)}")

        # secure_url is a full https:// URL - store it directly, no need to
        # prefix with API_URL on the frontend anymore.
        uploaded_urls.append(result["secure_url"])

    return {"urls": uploaded_urls}
