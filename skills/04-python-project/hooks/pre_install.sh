#!/bin/bash
echo "Checking Python..."
command -v python3 || { echo "Python 3 required"; exit 1; }
python3 --version
