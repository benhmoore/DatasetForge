#!/usr/bin/env python3
"""
Setup script for installing spaCy and downloading the required language model.
Run this script after installing the application dependencies.
"""
import subprocess
import sys


def main():
    print("Setting up spaCy for grammar checking...")

    # Install spaCy if not already installed
    try:
        import spacy

        print(f"spaCy is already installed (version {spacy.__version__})")
    except ImportError:
        print("Installing spaCy...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "spacy>=3.6.0"])

    # Download the English model
    print("Downloading spaCy English language model...")
    subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])

    print("spaCy setup complete!")


if __name__ == "__main__":
    main()
