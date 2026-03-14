"""
Pytest configuration. Ensures backend root is on Python path when running tests.
Run from backend directory: pytest tests/ -v
"""
import sys
from pathlib import Path

# backend/tests/conftest.py -> backend
_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))
