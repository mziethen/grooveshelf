"""Host entry point for portable collection archives."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app.archive_cli import main

if __name__=='__main__':main()
