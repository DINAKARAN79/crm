import os
import sys
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET = os.getenv("JWT_SECRET")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:3001")

if not DATABASE_URL:
    print("FATAL: DATABASE_URL environment variable is required", file=sys.stderr)
    sys.exit(1)

if not JWT_SECRET:
    print("FATAL: JWT_SECRET environment variable is required", file=sys.stderr)
    sys.exit(1)
