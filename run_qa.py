import os
import sys

# Ensure root directory is on python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qa_suite.run_qa import main

if __name__ == "__main__":
    main()
